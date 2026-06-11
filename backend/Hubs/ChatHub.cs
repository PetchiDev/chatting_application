using ChatApi.DTOs;
using ChatApi.Models;
using ChatApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ChatApi.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private readonly DatabaseService _db;
    private readonly PresenceService _presence;
    private readonly AuthService _auth;
    private readonly LinkPreviewService _linkPreview;
    private readonly StorageService _storage;
    private readonly NotificationService _notifications;
    private readonly ILogger<ChatHub> _logger;

    public ChatHub(
        DatabaseService db,
        PresenceService presence,
        AuthService auth,
        LinkPreviewService linkPreview,
        StorageService storage,
        NotificationService notifications,
        ILogger<ChatHub> logger)
    {
        _db = db;
        _presence = presence;
        _auth = auth;
        _linkPreview = linkPreview;
        _storage = storage;
        _notifications = notifications;
        _logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = GetUserId();
        if (userId == null)
        {
            Context.Abort();
            return;
        }

        var user = await _db.GetUserByIdAsync(userId.Value);
        if (user == null || (user.IsGuest && user.ExpiresAt < DateTime.UtcNow))
        {
            if (user != null) await _db.DeleteUserAsync(user.Id);
            Context.Abort();
            return;
        }

        _presence.UserConnected(userId.Value, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, "global");

        var groupIds = await _db.GetUserGroupIdsAsync(userId.Value);
        foreach (var groupId in groupIds)
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupChannel(groupId));

        var onlineUsers = await GetOnlineUsersAsync();
        await Clients.All.SendAsync("OnlineUsers", onlineUsers);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = _presence.UserDisconnected(Context.ConnectionId);
        if (userId.HasValue)
        {
            var onlineUsers = await GetOnlineUsersAsync();
            await Clients.All.SendAsync("OnlineUsers", onlineUsers);
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task SendMessage(SendMessageRequest request)
    {
        var userId = GetUserId();
        if (userId == null) return;

        var user = await _db.GetUserByIdAsync(userId.Value);
        if (user == null) return;

        if (request.GroupId.HasValue && !await _db.IsGroupMemberAsync(request.GroupId.Value, userId.Value))
            return;

        var message = new Message
        {
            Id = Guid.NewGuid(),
            SenderId = userId.Value,
            RecipientId = request.RecipientId,
            GroupId = request.GroupId,
            ForwardedFromId = request.ForwardedFromId,
            Content = request.Content,
            MessageType = request.MessageType ?? "text",
            AttachmentUrl = request.AttachmentUrl,
            AttachmentName = request.AttachmentName
        };

        if (message.MessageType == "text" && !string.IsNullOrWhiteSpace(message.Content))
        {
            var preview = await _linkPreview.FetchFromContentAsync(message.Content);
            if (preview != null)
            {
                message.LinkUrl = preview.Url;
                message.LinkTitle = preview.Title;
                message.LinkDescription = preview.Description;
                message.LinkImage = preview.Image;
            }
        }

        await _db.InsertMessageAsync(message);

        var dto = MessageMapper.ToDto(message, user.Username, user.ProfilePictureUrl);
        var previewText = GetMessagePreview(message);

        if (request.GroupId.HasValue)
        {
            await Clients.Group(GroupChannel(request.GroupId.Value)).SendAsync("ReceiveGroupMessage", dto);
            var members = await _db.GetGroupMemberIdsAsync(request.GroupId.Value);
            try
            {
                await _notifications.NotifyGroupMembersAsync(
                    request.GroupId.Value, userId.Value, user.Username, previewText, message.Id, members);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send group notifications for message {MessageId}", message.Id);
            }
        }
        else if (request.RecipientId.HasValue)
        {
            var recipientConn = _presence.GetConnectionId(request.RecipientId.Value);
            if (recipientConn != null)
                await Clients.Client(recipientConn).SendAsync("ReceiveDirectMessage", dto);
            await Clients.Caller.SendAsync("ReceiveDirectMessage", dto);

            try
            {
                await _notifications.NotifyMessageAsync(
                    request.RecipientId.Value, user.Username, previewText, "dm", userId.Value, message.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send DM notification for message {MessageId}", message.Id);
            }
        }
        else
        {
            await Clients.Group("global").SendAsync("ReceiveMessage", dto);

            var allUsers = await _db.GetAllUsersAsync();
            foreach (var u in allUsers.Where(u => u.Id != userId.Value))
            {
                try
                {
                    await _notifications.NotifyMessageAsync(
                        u.Id, user.Username, previewText, "global", null, message.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to send global notification for message {MessageId}", message.Id);
                }
            }
        }
    }

    public async Task ForwardMessage(ForwardMessageRequest request)
    {
        var userId = GetUserId();
        if (userId == null) return;

        var source = await _db.GetMessageByIdAsync(request.MessageId);
        if (source == null) return;

        await SendMessage(new SendMessageRequest(
            source.Content,
            source.MessageType,
            request.RecipientId,
            request.GroupId,
            source.AttachmentUrl,
            source.AttachmentName,
            source.Id));
    }

    public async Task SendTyping(Guid? recipientId, Guid? groupId, bool isTyping)
    {
        var userId = GetUserId();
        if (userId == null) return;

        var user = await _db.GetUserByIdAsync(userId.Value);
        if (user == null) return;

        if (groupId.HasValue)
        {
            await Clients.OthersInGroup(GroupChannel(groupId.Value))
                .SendAsync("UserTyping", user.Username, isTyping, groupId);
        }
        else if (recipientId.HasValue)
        {
            var conn = _presence.GetConnectionId(recipientId.Value);
            if (conn != null)
                await Clients.Client(conn).SendAsync("UserTyping", user.Username, isTyping, null);
        }
        else
        {
            await Clients.Others.SendAsync("UserTyping", user.Username, isTyping, null);
        }
    }

    public async Task RequestOnlineUsers()
    {
        await Clients.Caller.SendAsync("OnlineUsers", await GetOnlineUsersAsync());
    }

    public async Task DeleteMessage(Guid messageId, bool forEveryone)
    {
        var userId = GetUserId();
        if (userId == null) return;

        var message = await _db.GetMessageByIdAsync(messageId);
        if (message == null) return;

        if (forEveryone)
        {
            if (message.SenderId != userId.Value) return;

            if (!string.IsNullOrEmpty(message.AttachmentUrl))
            {
                try { await _storage.DeleteByUrlAsync(message.AttachmentUrl); }
                catch { /* attachment may already be gone */ }
            }

            await _db.DeleteMessageAsync(messageId);

            var deleted = new MessageDeletedDto(messageId, message.RecipientId, message.GroupId, true);
            await BroadcastMessageDeletedAsync(message, deleted);
        }
        else
        {
            await _db.HideMessageForUserAsync(userId.Value, messageId);
            var deleted = new MessageDeletedDto(messageId, message.RecipientId, message.GroupId, false);
            await Clients.Caller.SendAsync("MessageDeleted", deleted);
        }
    }

    private async Task BroadcastMessageDeletedAsync(Message message, MessageDeletedDto deleted)
    {
        if (message.GroupId.HasValue)
        {
            await Clients.Group(GroupChannel(message.GroupId.Value)).SendAsync("MessageDeleted", deleted);
        }
        else if (message.RecipientId.HasValue)
        {
            var recipientConn = _presence.GetConnectionId(message.RecipientId.Value);
            if (recipientConn != null)
                await Clients.Client(recipientConn).SendAsync("MessageDeleted", deleted);
            await Clients.Caller.SendAsync("MessageDeleted", deleted);
        }
        else
        {
            await Clients.Group("global").SendAsync("MessageDeleted", deleted);
        }
    }

    public static string GroupChannel(Guid groupId) => $"chat-group-{groupId}";

    private static string GetMessagePreview(Message message)
    {
        if (!string.IsNullOrWhiteSpace(message.Content))
            return message.Content.Length > 120 ? message.Content[..120] + "…" : message.Content;
        return message.MessageType switch
        {
            "image" => "📷 Image",
            "file" => $"📎 {message.AttachmentName ?? "File"}",
            "audio" => "🎤 Voice message",
            _ => "New message"
        };
    }

    private Guid? GetUserId() => _auth.GetUserIdFromClaims(Context.User!);

    private async Task<List<UserDto>> GetOnlineUsersAsync()
    {
        var allUsers = await _db.GetAllUsersAsync();
        return allUsers
            .Select(u => new UserDto(
                u.Id,
                u.Username,
                u.ProfilePictureUrl,
                u.IsGuest,
                _presence.IsUserOnline(u.Id)))
            .ToList();
    }
}
