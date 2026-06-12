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

    private const string Model = "llama-3.3-70b-versatile";
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

        var messages = new JsonArray
        {
            new JsonObject
            {
                ["role"] = "system",
                ["content"] = BuildSystemPrompt(username)
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

        var allActions = new List<AiClientAction>();
        JsonElement? a2ui = null;

        for (var round = 0; round < MaxToolRounds; round++)
        {
            var body = new JsonObject
            {
                ["model"] = Model,
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
        You are Kryptos AI — a friendly, interactive assistant inside the Kryptos Info Sys team chat app.
        The logged-in user is "{username}".

        ## How to chat
        - Be warm, natural, and conversational — like a helpful colleague, not a robot.
        - ALWAYS reply in the same language the user uses (English, Tamil, or Tanglish mix).
        - For greetings (hi, hello, vanakkam), small talk, jokes, Tamil/English questions, or general knowledge: answer directly yourself. Do NOT call any tools.
        - Example: "do you know tamil?" → reply warmly in Tamil and English that you can chat in Tamil.
        - Example: "hi" → greet them by name and ask how you can help today.

        ## When to use tools (app actions only)
        Use tools ONLY when the user wants something done in THIS chat app or asks about live data here:
        - Find users, groups, recent chats, notifications
        - Create a group, add/remove members, open a DM/group/global chat, mute notifications
        - For app data: use tools first, then explain results in plain friendly language
        - NEVER paste raw JSON, error codes, or tool output verbatim to the user
        - Never invent usernames — search_users before naming people

        ## Company context
        - App: Kryptos Info Sys internal chat (DMs, groups, global room, calls, files, voice notes)
        - If asked about Kryptos office location/contact and you are not sure: say you do not have verified address data in the app, suggest admin or company website — do not fabricate addresses.

        ## Actions
        - create_group → use tool with name + member_usernames
        - open chat only → open_user_chat / open_group_chat / open_global_chat
        - SEND a message → send_direct_message / send_group_message / send_global_message with exact content text
        - If user says "send hi to Kishore" or "message Kishore saying ..." → call send_direct_message (NOT just open_user_chat)
        - After sending, confirm naturally: "Sent your message to Kishore!"

        ## A2UI (optional)
        Only when offering clickable choices (user pick list). Append a fenced ```a2ui JSON block.
        Types: Column, Text, Button, List, Card. Actions: open_user, open_group, create_group_confirm.
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
        ("get_current_context", "Get info about the app and current user", """{"type":"object","properties":{}}""")
    ];
}
