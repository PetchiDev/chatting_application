using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ChatApi.DTOs;

namespace ChatApi.Services;

public class GroqAiService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;
    private readonly AiToolService _tools;
    private readonly ILogger<GroqAiService> _logger;

    private const string ToolsModel = "llama-3.3-70b-versatile";
    private const string ResearchModel = "groq/compound-mini";
    private const int MaxToolRounds = 8;

    public GroqAiService(
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        AiToolService tools,
        ILogger<GroqAiService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _config = config;
        _tools = tools;
        _logger = logger;
    }

    public async Task<AiChatResponse> ChatAsync(
        Guid userId,
        string username,
        List<AiChatMessage> history,
        CancellationToken ct = default)
    {
        var apiKey = _config["Groq:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("Groq API key is not configured. Set Groq:ApiKey in appsettings or Groq__ApiKey env var.");

        var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        if (ShouldUseWebResearch(history))
        {
            try
            {
                return await ChatWithCompoundAsync(client, username, history, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Compound research failed, falling back to tools + web_search");
            }
        }

        return await ChatWithToolsAsync(client, userId, username, history, ct);
    }

    private async Task<AiChatResponse> ChatWithCompoundAsync(
        HttpClient client,
        string username,
        List<AiChatMessage> history,
        CancellationToken ct)
    {
        var messages = BuildMessageArray(BuildResearchSystemPrompt(username), history);

        var body = new JsonObject
        {
            ["model"] = ResearchModel,
            ["messages"] = messages.DeepClone(),
            ["temperature"] = 0.6,
            ["max_tokens"] = 4096,
            ["compound_custom"] = new JsonObject
            {
                ["tools"] = new JsonObject
                {
                    ["enabled_tools"] = new JsonArray { "web_search", "visit_website" }
                }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions")
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json")
        };

        using var response = await client.SendAsync(request, ct);
        var responseText = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("Groq Compound error {Status}: {Body}", response.StatusCode, responseText);
            var detail = TryExtractGroqError(responseText);
            throw new InvalidOperationException(detail ?? "Web research temporarily unavailable.");
        }

        using var doc = JsonDocument.Parse(responseText);
        var content = doc.RootElement.GetProperty("choices")[0].GetProperty("message")
            .TryGetProperty("content", out var c) ? c.GetString() ?? "" : "";

        var (reply, a2ui) = ParseReply(content);
        if (string.IsNullOrWhiteSpace(reply))
            reply = "I couldn't find enough information. Try asking with a more specific name or topic.";

        return new AiChatResponse(reply, [], a2ui);
    }

    private async Task<AiChatResponse> ChatWithToolsAsync(
        HttpClient client,
        Guid userId,
        string username,
        List<AiChatMessage> history,
        CancellationToken ct)
    {
        var messages = BuildMessageArray(BuildSystemPrompt(username), history);

        var allActions = new List<AiClientAction>();
        JsonElement? a2ui = null;

        for (var round = 0; round < MaxToolRounds; round++)
        {
            var body = new JsonObject
            {
                ["model"] = ToolsModel,
                ["messages"] = messages.DeepClone(),
                ["tools"] = BuildTools(),
                ["tool_choice"] = "auto",
                ["temperature"] = 0.7,
                ["max_tokens"] = 2048
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions")
            {
                Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json")
            };

            using var response = await client.SendAsync(request, ct);
            var responseText = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Groq API error {Status}: {Body}", response.StatusCode, responseText);
                var detail = TryExtractGroqError(responseText);
                throw new InvalidOperationException(detail ?? "AI service temporarily unavailable. Please try again.");
            }

            using var doc = JsonDocument.Parse(responseText);
            var choice = doc.RootElement.GetProperty("choices")[0].GetProperty("message");

            if (choice.TryGetProperty("tool_calls", out var toolCalls) && toolCalls.GetArrayLength() > 0)
            {
                messages.Add(JsonNode.Parse(choice.GetRawText())!.DeepClone().AsObject());

                foreach (var call in toolCalls.EnumerateArray())
                {
                    var fn = call.GetProperty("function");
                    var toolName = fn.GetProperty("name").GetString()!;
                    var argsJson = fn.GetProperty("arguments").GetString() ?? "{}";
                    using var argsDoc = JsonDocument.Parse(argsJson);

                    var (result, actions) = await _tools.ExecuteAsync(toolName, argsDoc.RootElement, userId, username);
                    allActions.AddRange(actions);

                    messages.Add(new JsonObject
                    {
                        ["role"] = "tool",
                        ["tool_call_id"] = call.GetProperty("id").GetString(),
                        ["content"] = result
                    });
                }

                continue;
            }

            var content = choice.TryGetProperty("content", out var c) ? c.GetString() ?? "" : "";
            var (reply, parsedA2ui) = ParseReply(content);
            if (parsedA2ui != null) a2ui = parsedA2ui;

            if (string.IsNullOrWhiteSpace(reply))
                reply = allActions.Count > 0
                    ? "Done! I've taken care of that for you. Anything else I can help with?"
                    : "I'm here to help — feel free to ask me anything!";

            return new AiChatResponse(reply, DeduplicateActions(allActions), a2ui);
        }

        return new AiChatResponse(
            "I need a bit more time to finish that. Could you try a simpler request?",
            DeduplicateActions(allActions),
            a2ui);
    }

    private static JsonArray BuildMessageArray(string systemPrompt, List<AiChatMessage> history)
    {
        var messages = new JsonArray
        {
            new JsonObject
            {
                ["role"] = "system",
                ["content"] = systemPrompt
            }
        };

        foreach (var msg in history.TakeLast(20))
        {
            messages.Add(new JsonObject
            {
                ["role"] = msg.Role,
                ["content"] = msg.Content
            });
        }

        return messages;
    }

    private static bool ShouldUseWebResearch(List<AiChatMessage> history)
    {
        var lastUser = history.LastOrDefault(m => m.Role == "user")?.Content?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(lastUser)) return false;
        if (HasAppActionIntent(lastUser)) return false;
        if (HasResearchIntent(lastUser)) return true;

        if (IsResearchFollowUp(lastUser))
        {
            return history.TakeLast(8).Any(m =>
                m.Role == "user" && HasResearchIntent(m.Content));
        }

        return false;
    }

    private static bool HasAppActionIntent(string text)
    {
        var lower = text.ToLowerInvariant();
        string[] keywords =
        [
            "send message", "send a message", "send hi", "message to", "create group", "new group",
            "open chat", "open dm", "mute", "unmute", "remove member", "add member", "leave group",
            "list my groups", "my notifications", "find user", "search user", "who is online"
        ];
        return keywords.Any(k => lower.Contains(k, StringComparison.OrdinalIgnoreCase));
    }

    private static bool HasResearchIntent(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        var lower = text.ToLowerInvariant();
        string[] patterns =
        [
            "tell me about", "what is", "what are", "who is", "who are", "explain", "describe",
            "company", "technologies", "technology", "located", "location", "headquarter",
            "history of", "compare", "difference between", "latest news", "news about",
            "research", "explore", "find out about", "learn about", "overview of",
            "kryptos tech", "kryptos info"
        ];
        return patterns.Any(p => lower.Contains(p, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsResearchFollowUp(string text)
    {
        var lower = text.ToLowerInvariant().Trim();
        return lower is "yes" or "yeah" or "yep" or "sure" or "ok" or "okay" or "tell me more"
            or "continue" or "go on" or "please" or "yes please";
    }

    private static string BuildResearchSystemPrompt(string username) =>
        $"""
        You are Kryptos AI — a ChatGPT-style research assistant built into the Kryptos Info Sys chat app.
        The user "{username}" is asking you to explore and explain topics using live web search.

        Instructions:
        - Search the web and give clear, well-structured answers like ChatGPT (intro, key points, summary).
        - For companies (e.g. Kryptos Technologies, Microsoft, Tesla): cover what they do, industry, location if known, and notable facts.
        - Use the user's language (English, Tamil, or Tanglish). If they write in Tamil, reply in Tamil.
        - Be informative but concise. Use bullet points for lists.
        - If search results are limited, say so honestly and share what you found.
        - Do NOT list internal chat app features unless the user asks about the chat app itself.
        - Mention sources briefly when helpful.
        """;

    private static List<AiClientAction> DeduplicateActions(List<AiClientAction> actions)
    {
        var seen = new HashSet<string>();
        var result = new List<AiClientAction>();
        foreach (var action in actions)
        {
            var key = action.Type + (action.Payload?.GetRawText() ?? "");
            if (seen.Add(key)) result.Add(action);
        }
        return result;
    }

    private static string? TryExtractGroqError(string responseText)
    {
        try
        {
            using var doc = JsonDocument.Parse(responseText);
            if (doc.RootElement.TryGetProperty("error", out var err) &&
                err.TryGetProperty("message", out var msg))
            {
                return msg.GetString();
            }
        }
        catch
        {
            /* ignore parse errors */
        }

        return null;
    }

    private static (string Reply, JsonElement? A2ui) ParseReply(string content)
    {
        var match = Regex.Match(content, @"```a2ui\s*([\s\S]*?)```", RegexOptions.IgnoreCase);
        if (!match.Success)
            return (content.Trim(), null);

        var reply = content[..match.Index].Trim();
        try
        {
            using var doc = JsonDocument.Parse(match.Groups[1].Value.Trim());
            return (string.IsNullOrWhiteSpace(reply) ? "Here's what I found:" : reply, doc.RootElement.Clone());
        }
        catch
        {
            return (content.Trim(), null);
        }
    }

    private static string BuildSystemPrompt(string username) =>
        $"""
        You are Kryptos AI — a friendly, all-in-one assistant inside the Kryptos Info Sys team chat app.
        The logged-in user is "{username}".
        You work like ChatGPT for general questions AND can control this chat app.

        ## ChatGPT mode (general knowledge & research)
        - Answer general questions, explain concepts, help with writing, ideas, coding tips, etc.
        - For companies, products, people, news, locations: call web_search first, then summarize clearly
        - Example: "tell me about Kryptos Technologies" → web_search then structured answer
        - Never dump raw search results — write a natural, helpful reply

        ## How to chat
        - Be warm, natural, and conversational — like a helpful colleague, not a robot.
        - ALWAYS reply in the same language the user uses (English, Tamil, or Tanglish mix).
        - For greetings (hi, hello, vanakkam): greet warmly. Do NOT call tools for simple hi/hello.

        ## Chat app actions (use tools)
        - Find users, groups, recent chats, notifications
        - Create groups, add/remove members, open chats, mute notifications
        - SEND messages: send_direct_message / send_group_message / send_global_message
        - If user says "send hi to Kishore" → send_direct_message (NOT just open_user_chat)
        - Never invent usernames — search_users first

        ## A2UI (optional)
        Only for clickable user/group pick lists. Append fenced ```a2ui JSON block.
        """;

    private static JsonArray BuildTools()
    {
        var tools = new JsonArray();
        foreach (var (name, description, schema) in ToolDefs)
        {
            tools.Add(new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"] = name,
                    ["description"] = description,
                    ["parameters"] = JsonNode.Parse(schema)!.AsObject()
                }
            });
        }
        return tools;
    }

    private static readonly (string Name, string Description, string Schema)[] ToolDefs =
    [
        ("search_users", "Search all users by username", """{"type":"object","properties":{"query":{"type":"string","description":"Optional search text"}}}"""),
        ("list_my_groups", "List groups the current user belongs to", """{"type":"object","properties":{}}"""),
        ("list_recent_chats", "List recent direct message conversations", """{"type":"object","properties":{}}"""),
        ("create_group", "Create a new group and add members", """{"type":"object","properties":{"name":{"type":"string","description":"Group name"},"member_usernames":{"type":"array","items":{"type":"string"},"description":"Usernames to add"}},"required":["name"]}"""),
        ("open_user_chat", "Navigate to a direct message chat", """{"type":"object","properties":{"user_id":{"type":"string"},"username":{"type":"string"}}}"""),
        ("open_group_chat", "Navigate to a group chat", """{"type":"object","properties":{"group_id":{"type":"string"},"group_name":{"type":"string"}}}"""),
        ("open_global_chat", "Navigate to the global public chat room", """{"type":"object","properties":{}}"""),
        ("send_direct_message", "Send a text direct message to a user on behalf of the current user", """{"type":"object","properties":{"username":{"type":"string","description":"Recipient username"},"recipient_id":{"type":"string"},"content":{"type":"string","description":"Exact message text to send"}},"required":["content"]}"""),
        ("send_group_message", "Send a text message to a custom group chat", """{"type":"object","properties":{"group_name":{"type":"string"},"group_id":{"type":"string"},"content":{"type":"string"}},"required":["content"]}"""),
        ("send_global_message", "Send a text message to the global public chat room", """{"type":"object","properties":{"content":{"type":"string"}},"required":["content"]}"""),
        ("get_group_members", "List members of a group", """{"type":"object","properties":{"group_id":{"type":"string"},"group_name":{"type":"string"}}}"""),
        ("add_group_members", "Add users to an existing group", """{"type":"object","properties":{"group_id":{"type":"string"},"group_name":{"type":"string"},"member_usernames":{"type":"array","items":{"type":"string"}}},"required":["member_usernames"]}"""),
        ("remove_group_member", "Remove a member from a group (admin only)", """{"type":"object","properties":{"group_id":{"type":"string"},"group_name":{"type":"string"},"user_id":{"type":"string"},"username":{"type":"string"}}}"""),
        ("mute_conversation", "Mute or unmute notifications", """{"type":"object","properties":{"channel_type":{"type":"string","description":"global, dm, or group"},"channel_id":{"type":"string"},"username":{"type":"string"},"group_name":{"type":"string"},"muted":{"type":"boolean"}},"required":["channel_type"]}"""),
        ("get_notifications", "Get recent notifications and unread count", """{"type":"object","properties":{}}"""),
        ("get_current_context", "Get info about the app and current user", """{"type":"object","properties":{}}"""),
        ("web_search", "Search the web for information about companies, people, products, news, or any general topic", """{"type":"object","properties":{"query":{"type":"string","description":"Search query e.g. Kryptos Technologies company"}},"required":["query"]}""")
    ];
}
