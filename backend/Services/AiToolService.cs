using System.Text.Json;
using ChatApi.DTOs;
using ChatApi.Hubs;
using ChatApi.Models;
using Microsoft.AspNetCore.SignalR;

namespace ChatApi.Services;

public class AiToolService
{
    private readonly DatabaseService _db;
    private readonly PresenceService _presence;
    private readonly MessageSendService _messages;
    private readonly WebSearchService _webSearch;
    private readonly IHubContext<ChatHub> _hub;

    public AiToolService(
        DatabaseService db,
        PresenceService presence,
        MessageSendService messages,
        WebSearchService webSearch,
        IHubContext<ChatHub> hub)
    {
        _db = db;
        _presence = presence;
        _messages = messages;
        _webSearch = webSearch;
        _hub = hub;
    }

    public async Task<(string Result, List<AiClientAction> Actions)> ExecuteAsync(
        string toolName,
        JsonElement args,
        Guid userId,
        string username)
    {
        var actions = new List<AiClientAction>();

        switch (toolName)
        {
            case "search_users":
                return (JsonSerializer.Serialize(await SearchUsersAsync(args)), actions);
            case "list_my_groups":
                return (JsonSerializer.Serialize(await ListGroupsAsync(userId)), actions);
            case "list_recent_chats":
                return (JsonSerializer.Serialize(await ListRecentChatsAsync(userId)), actions);
            case "create_group":
                return await CreateGroupAsync(args, userId, actions);
            case "open_user_chat":
                return OpenUserChat(args, actions);
            case "open_group_chat":
                return OpenGroupChat(args, actions);
            case "open_global_chat":
                actions.Add(new AiClientAction("open_global", null));
                return ("{\"success\":true,\"message\":\"Opening global group chat\"}", actions);
            case "send_direct_message":
                return await SendDirectMessageAsync(args, userId, actions);
            case "send_group_message":
                return await SendGroupMessageAsync(args, userId, actions);
            case "send_global_message":
                return await SendGlobalMessageAsync(args, userId, actions);
            case "get_group_members":
                return (JsonSerializer.Serialize(await GetGroupMembersAsync(args, userId)), actions);
            case "add_group_members":
                return await AddGroupMembersAsync(args, userId, actions);
            case "remove_group_member":
                return await RemoveGroupMemberAsync(args, userId, actions);
            case "mute_conversation":
                return await MuteConversationAsync(args, userId, actions);
            case "get_notifications":
                return (JsonSerializer.Serialize(await GetNotificationsAsync(userId)), actions);
            case "get_current_context":
                return (JsonSerializer.Serialize(new
                {
                    userId,
                    username,
                    features = new[]
                    {
                        "Direct messages with any user",
                        "Global public room (resets every 24h)",
                        "Custom groups with admin controls",
                        "Voice messages, file attachments, calls",
                        "Mute notifications per chat",
                        "Forward and delete messages",
                        "Web research about companies and general topics"
                    }
                }), actions);
            case "web_search":
                return await WebSearchAsync(args);
            default:
                return ($"{{\"error\":\"Unknown tool: {toolName}\"}}", actions);
        }
    }

    private async Task<(string, List<AiClientAction>)> SendDirectMessageAsync(
        JsonElement args,
        Guid userId,
        List<AiClientAction> actions)
    {
        var content = args.TryGetProperty("content", out var c) ? c.GetString()?.Trim() : null;
        if (string.IsNullOrWhiteSpace(content))
            return ("{\"error\":\"Message content is required\"}", actions);

        var recipientId = await ResolveUserIdAsync(args, userId);
        if (recipientId == null)
            return ("{\"error\":\"Recipient not found. Use search_users to find the exact username.\"}", actions);

        if (recipientId == userId)
            return ("{\"error\":\"Cannot send a direct message to yourself\"}", actions);

        var dto = await _messages.SendAsync(userId, new SendMessageRequest(
            content, "text", recipientId, null, null, null, null));

        if (dto == null)
            return ("{\"error\":\"Failed to send message\"}", actions);

        actions.Add(new AiClientAction("open_user", JsonSerializer.SerializeToElement(new { userId = recipientId })));
        actions.Add(new AiClientAction("dm_sent", JsonSerializer.SerializeToElement(new
        {
            recipientId,
            messageId = dto.Id,
            content
        })));

        return (JsonSerializer.Serialize(new
        {
            success = true,
            messageId = dto.Id,
            sentTo = dto.RecipientId,
            content
        }), actions);
    }

    private async Task<(string, List<AiClientAction>)> SendGroupMessageAsync(
        JsonElement args,
        Guid userId,
        List<AiClientAction> actions)
    {
        var content = args.TryGetProperty("content", out var c) ? c.GetString()?.Trim() : null;
        if (string.IsNullOrWhiteSpace(content))
            return ("{\"error\":\"Message content is required\"}", actions);

        var groupId = await ResolveGroupIdAsync(args, userId);
        if (groupId == null)
            return ("{\"error\":\"Group not found\"}", actions);

        if (!await _db.IsGroupMemberAsync(groupId.Value, userId))
            return ("{\"error\":\"You are not a member of this group\"}", actions);

        var dto = await _messages.SendAsync(userId, new SendMessageRequest(
            content, "text", null, groupId, null, null, null));

        if (dto == null)
            return ("{\"error\":\"Failed to send message\"}", actions);

        actions.Add(new AiClientAction("open_group", JsonSerializer.SerializeToElement(new { groupId })));

        return (JsonSerializer.Serialize(new { success = true, groupId, content }), actions);
    }

    private async Task<(string, List<AiClientAction>)> SendGlobalMessageAsync(
        JsonElement args,
        Guid userId,
        List<AiClientAction> actions)
    {
        var content = args.TryGetProperty("content", out var c) ? c.GetString()?.Trim() : null;
        if (string.IsNullOrWhiteSpace(content))
            return ("{\"error\":\"Message content is required\"}", actions);

        var dto = await _messages.SendAsync(userId, new SendMessageRequest(
            content, "text", null, null, null, null, null));

        if (dto == null)
            return ("{\"error\":\"Failed to send message\"}", actions);

        actions.Add(new AiClientAction("open_global", null));

        return (JsonSerializer.Serialize(new { success = true, content }), actions);
    }

    private async Task<Guid?> ResolveUserIdAsync(JsonElement args, Guid currentUserId)
    {
        if (args.TryGetProperty("recipient_id", out var idEl) && Guid.TryParse(idEl.GetString(), out var userId))
            return userId;

        if (args.TryGetProperty("username", out var nameEl))
        {
            var un = nameEl.GetString()?.Trim();
            if (string.IsNullOrWhiteSpace(un)) return null;
            var users = await _db.GetAllUsersAsync();
            var match = users.FirstOrDefault(u =>
                u.Username.Equals(un, StringComparison.OrdinalIgnoreCase));
            return match?.Id;
        }

        return null;
    }

    private async Task<(string, List<AiClientAction>)> WebSearchAsync(JsonElement args)
    {
        var query = args.TryGetProperty("query", out var q) ? q.GetString()?.Trim() : null;
        if (string.IsNullOrWhiteSpace(query))
            return ("{\"error\":\"Search query is required\"}", []);

        var results = await _webSearch.SearchAsync(query);
        return (JsonSerializer.Serialize(new { query, results }), []);
    }

    private async Task<List<object>> SearchUsersAsync(JsonElement args)
    {
        var query = args.TryGetProperty("query", out var q) ? q.GetString()?.Trim().ToLower() : null;
        var users = await _db.GetAllUsersAsync();
        var filtered = users.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(query))
        {
            filtered = filtered.Where(u =>
                u.Username.Contains(query, StringComparison.OrdinalIgnoreCase));
        }

        return filtered
            .Take(20)
            .Select(u => new
            {
                u.Id,
                u.Username,
                u.IsGuest,
                isOnline = _presence.IsUserOnline(u.Id)
            })
            .Cast<object>()
            .ToList();
    }

    private async Task<List<object>> ListGroupsAsync(Guid userId)
    {
        var groups = await _db.GetUserGroupsAsync(userId);
        return groups.Select(g => new
        {
            g.Id,
            g.Name,
            g.MemberCount,
            g.CreatedBy,
            isAdmin = g.CreatedBy == userId
        }).Cast<object>().ToList();
    }

    private async Task<List<object>> ListRecentChatsAsync(Guid userId)
    {
        var recent = await _db.GetRecentDirectChatsAsync(userId);
        return recent.Select(r => new
        {
            r.UserId,
            r.Username,
            isOnline = _presence.IsUserOnline(r.UserId),
            r.LastMessageAt,
            preview = PreviewMessage(r.Content, r.MessageType)
        }).Cast<object>().ToList();
    }

    private async Task<(string, List<AiClientAction>)> CreateGroupAsync(
        JsonElement args,
        Guid userId,
        List<AiClientAction> actions)
    {
        var name = args.TryGetProperty("name", out var n) ? n.GetString()?.Trim() : null;
        if (string.IsNullOrWhiteSpace(name))
            return ("{\"error\":\"Group name is required\"}", actions);

        var memberUsernames = new List<string>();
        if (args.TryGetProperty("member_usernames", out var membersEl) && membersEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in membersEl.EnumerateArray())
            {
                var un = item.GetString()?.Trim();
                if (!string.IsNullOrWhiteSpace(un)) memberUsernames.Add(un);
            }
        }

        var allUsers = await _db.GetAllUsersAsync();
        var memberIds = new List<Guid>();
        var notFound = new List<string>();

        foreach (var un in memberUsernames.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var match = allUsers.FirstOrDefault(u =>
                u.Username.Equals(un, StringComparison.OrdinalIgnoreCase) && u.Id != userId);
            if (match != null) memberIds.Add(match.Id);
            else notFound.Add(un);
        }

        if (notFound.Count > 0)
        {
            return (JsonSerializer.Serialize(new
            {
                error = "Some users were not found",
                notFound,
                hint = "Use search_users to find exact usernames"
            }), actions);
        }

        var group = await _db.CreateGroupAsync(userId, name!, memberIds);
        var dto = new GroupDto(group.Id, group.Name, group.CreatedBy, group.CreatedAt, group.MemberCount, group.IsMuted);

        var allMemberIds = memberIds.Append(userId).Distinct();
        await SyncGroupMembershipAsync(group, allMemberIds, userId);

        actions.Add(new AiClientAction("group_created", JsonSerializer.SerializeToElement(new
        {
            groupId = group.Id,
            groupName = group.Name
        })));

        return (JsonSerializer.Serialize(new
        {
            success = true,
            group = dto,
            addedMembers = memberUsernames
        }), actions);
    }

    private static (string, List<AiClientAction>) OpenUserChat(JsonElement args, List<AiClientAction> actions)
    {
        if (args.TryGetProperty("user_id", out var idEl) && Guid.TryParse(idEl.GetString(), out var userId))
        {
            actions.Add(new AiClientAction("open_user", JsonSerializer.SerializeToElement(new { userId })));
            return ("{\"success\":true}", actions);
        }

        if (args.TryGetProperty("username", out var nameEl))
        {
            var username = nameEl.GetString()?.Trim();
            if (!string.IsNullOrWhiteSpace(username))
            {
                actions.Add(new AiClientAction("open_user_by_name", JsonSerializer.SerializeToElement(new { username })));
                return ("{\"success\":true}", actions);
            }
        }

        return ("{\"error\":\"user_id or username required\"}", actions);
    }

    private static (string, List<AiClientAction>) OpenGroupChat(JsonElement args, List<AiClientAction> actions)
    {
        if (args.TryGetProperty("group_id", out var idEl) && Guid.TryParse(idEl.GetString(), out var groupId))
        {
            actions.Add(new AiClientAction("open_group", JsonSerializer.SerializeToElement(new { groupId })));
            return ("{\"success\":true}", actions);
        }

        if (args.TryGetProperty("group_name", out var nameEl))
        {
            var groupName = nameEl.GetString()?.Trim();
            if (!string.IsNullOrWhiteSpace(groupName))
            {
                actions.Add(new AiClientAction("open_group_by_name", JsonSerializer.SerializeToElement(new { groupName })));
                return ("{\"success\":true}", actions);
            }
        }

        return ("{\"error\":\"group_id or group_name required\"}", actions);
    }

    private async Task<List<object>> GetGroupMembersAsync(JsonElement args, Guid userId)
    {
        var groupId = await ResolveGroupIdAsync(args, userId);
        if (groupId == null) return [new { error = "Group not found" }];
        if (!await _db.IsGroupMemberAsync(groupId.Value, userId))
            return [new { error = "You are not a member of this group" }];

        var members = await _db.GetGroupMembersAsync(groupId.Value);
        return members.Select(m => new
        {
            m.UserId,
            m.Username,
            m.Role,
            m.IsGuest,
            isOnline = _presence.IsUserOnline(m.UserId)
        }).Cast<object>().ToList();
    }

    private async Task<(string, List<AiClientAction>)> AddGroupMembersAsync(
        JsonElement args,
        Guid userId,
        List<AiClientAction> actions)
    {
        var groupId = await ResolveGroupIdAsync(args, userId);
        if (groupId == null) return ("{\"error\":\"Group not found\"}", actions);
        if (!await _db.IsGroupMemberAsync(groupId.Value, userId))
            return ("{\"error\":\"You are not a member of this group\"}", actions);

        var memberUsernames = new List<string>();
        if (args.TryGetProperty("member_usernames", out var membersEl) && membersEl.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in membersEl.EnumerateArray())
            {
                var un = item.GetString()?.Trim();
                if (!string.IsNullOrWhiteSpace(un)) memberUsernames.Add(un);
            }
        }

        var allUsers = await _db.GetAllUsersAsync();
        var memberIds = new List<Guid>();
        foreach (var un in memberUsernames.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var match = allUsers.FirstOrDefault(u =>
                u.Username.Equals(un, StringComparison.OrdinalIgnoreCase));
            if (match != null) memberIds.Add(match.Id);
        }

        if (memberIds.Count == 0)
            return ("{\"error\":\"No valid members to add\"}", actions);

        await _db.AddGroupMembersAsync(groupId.Value, memberIds);
        var group = await _db.GetGroupForMemberAsync(groupId.Value, userId);
        if (group != null)
            await SyncGroupMembershipAsync(group, memberIds, null);

        actions.Add(new AiClientAction("groups_refresh", null));
        return (JsonSerializer.Serialize(new { success = true, added = memberUsernames }), actions);
    }

    private async Task<(string, List<AiClientAction>)> RemoveGroupMemberAsync(
        JsonElement args,
        Guid userId,
        List<AiClientAction> actions)
    {
        var groupId = await ResolveGroupIdAsync(args, userId);
        if (groupId == null) return ("{\"error\":\"Group not found\"}", actions);
        if (!await _db.IsGroupOwnerAsync(groupId.Value, userId))
            return ("{\"error\":\"Only the group admin can remove members\"}", actions);

        Guid? memberId = null;
        if (args.TryGetProperty("user_id", out var idEl) && Guid.TryParse(idEl.GetString(), out var uid))
            memberId = uid;
        else if (args.TryGetProperty("username", out var nameEl))
        {
            var un = nameEl.GetString()?.Trim();
            var members = await _db.GetGroupMembersAsync(groupId.Value);
            memberId = members.FirstOrDefault(m =>
                m.Username.Equals(un, StringComparison.OrdinalIgnoreCase)).UserId;
        }

        if (memberId == null || memberId == Guid.Empty)
            return ("{\"error\":\"Member not found\"}", actions);

        if (!await _db.RemoveGroupMemberAsync(groupId.Value, memberId.Value))
            return ("{\"error\":\"Cannot remove this member\"}", actions);

        var conn = _presence.GetConnectionId(memberId.Value);
        if (conn != null)
        {
            await _hub.Groups.RemoveFromGroupAsync(conn, ChatHub.GroupChannel(groupId.Value));
            await _hub.Clients.Client(conn).SendAsync("GroupRemoved", groupId.Value);
        }

        actions.Add(new AiClientAction("groups_refresh", null));
        return (JsonSerializer.Serialize(new { success = true, removedUserId = memberId }), actions);
    }

    private async Task<(string, List<AiClientAction>)> MuteConversationAsync(
        JsonElement args,
        Guid userId,
        List<AiClientAction> actions)
    {
        var channelType = args.TryGetProperty("channel_type", out var ct) ? ct.GetString() : null;
        var muted = !args.TryGetProperty("muted", out var m) || m.GetBoolean();

        if (channelType is not ("global" or "dm" or "group"))
            return ("{\"error\":\"channel_type must be global, dm, or group\"}", actions);

        Guid? channelId = null;
        if (channelType is "dm" or "group")
        {
            if (args.TryGetProperty("channel_id", out var cid) && Guid.TryParse(cid.GetString(), out var parsed))
                channelId = parsed;
            else if (channelType == "dm" && args.TryGetProperty("username", out var un))
            {
                var users = await _db.GetAllUsersAsync();
                var match = users.FirstOrDefault(u =>
                    u.Username.Equals(un.GetString(), StringComparison.OrdinalIgnoreCase));
                if (match != null) channelId = match.Id;
            }
            else if (channelType == "group" && args.TryGetProperty("group_name", out var gn))
            {
                channelId = await ResolveGroupIdAsync(args, userId);
            }

            if (channelId == null)
                return ("{\"error\":\"channel_id or name required\"}", actions);
        }

        await _db.SetMuteAsync(userId, channelType, channelId, muted);
        actions.Add(new AiClientAction("mutes_refresh", null));
        return (JsonSerializer.Serialize(new { success = true, channelType, muted }), actions);
    }

    private async Task<object> GetNotificationsAsync(Guid userId)
    {
        var items = await _db.GetNotificationsAsync(userId, 10);
        var unread = await _db.GetUnreadNotificationCountAsync(userId);
        return new
        {
            unread,
            items = items.Select(n => new
            {
                n.Id,
                n.Title,
                n.Body,
                n.ChannelType,
                n.ChannelId,
                n.CreatedAt,
                n.IsRead
            })
        };
    }

    private async Task<Guid?> ResolveGroupIdAsync(JsonElement args, Guid userId)
    {
        if (args.TryGetProperty("group_id", out var idEl) && Guid.TryParse(idEl.GetString(), out var groupId))
            return groupId;

        if (args.TryGetProperty("group_name", out var nameEl))
        {
            var name = nameEl.GetString()?.Trim();
            if (string.IsNullOrWhiteSpace(name)) return null;
            var groups = await _db.GetUserGroupsAsync(userId);
            var match = groups.FirstOrDefault(g =>
                g.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
            return match?.Id;
        }

        return null;
    }

    private async Task SyncGroupMembershipAsync(ChatGroup group, IEnumerable<Guid> memberIds, Guid? skipGroupAddedForUserId)
    {
        foreach (var memberId in memberIds)
        {
            var conn = _presence.GetConnectionId(memberId);
            if (conn == null) continue;

            await _hub.Groups.AddToGroupAsync(conn, ChatHub.GroupChannel(group.Id));

            if (skipGroupAddedForUserId.HasValue && memberId == skipGroupAddedForUserId.Value)
                continue;

            var memberGroup = await _db.GetGroupForMemberAsync(group.Id, memberId) ?? group;
            var dto = new GroupDto(
                memberGroup.Id,
                memberGroup.Name,
                memberGroup.CreatedBy,
                memberGroup.CreatedAt,
                memberGroup.MemberCount,
                memberGroup.IsMuted);
            await _hub.Clients.Client(conn).SendAsync("GroupAdded", dto);
        }
    }

    private static string PreviewMessage(string? content, string? messageType) =>
        messageType switch
        {
            "image" => "Photo",
            "audio" => "Voice message",
            "file" => "Attachment",
            _ => content?.Length > 60 ? content[..60] + "…" : content ?? "Message"
        };
}
