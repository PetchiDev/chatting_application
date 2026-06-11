using System.Security.Claims;
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

    public ChatHub(DatabaseService db, PresenceService presence, AuthService auth, LinkPreviewService linkPreview, StorageService storage)
    {
        _db = db;
        _presence = presence;
        _auth = auth;
        _linkPreview = linkPreview;
        _storage = storage;
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

        var message = new Message
        {
            Id = Guid.NewGuid(),
            SenderId = userId.Value,
            RecipientId = request.RecipientId,
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

        if (request.RecipientId.HasValue)
        {
            var recipientConn = _presence.GetConnectionId(request.RecipientId.Value);
            if (recipientConn != null)
                await Clients.Client(recipientConn).SendAsync("ReceiveDirectMessage", dto);
            await Clients.Caller.SendAsync("ReceiveDirectMessage", dto);
        }
        else
        {
            await Clients.Group("global").SendAsync("ReceiveMessage", dto);
        }
    }

    public async Task SendTyping(Guid? recipientId, bool isTyping)
    {
        var userId = GetUserId();
        if (userId == null) return;

        var user = await _db.GetUserByIdAsync(userId.Value);
        if (user == null) return;

        if (recipientId.HasValue)
        {
            var conn = _presence.GetConnectionId(recipientId.Value);
            if (conn != null)
                await Clients.Client(conn).SendAsync("UserTyping", user.Username, isTyping);
        }
        else
        {
            await Clients.Others.SendAsync("UserTyping", user.Username, isTyping);
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

            var deleted = new MessageDeletedDto(messageId, message.RecipientId, true);
            await BroadcastMessageDeletedAsync(message, deleted);
        }
        else
        {
            await _db.HideMessageForUserAsync(userId.Value, messageId);
            var deleted = new MessageDeletedDto(messageId, message.RecipientId, false);
            await Clients.Caller.SendAsync("MessageDeleted", deleted);
        }
    }

    private async Task BroadcastMessageDeletedAsync(Message message, MessageDeletedDto deleted)
    {
        if (message.RecipientId.HasValue)
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

    private Guid? GetUserId() => _auth.GetUserIdFromClaims(Context.User!);

    private async Task<List<UserDto>> GetOnlineUsersAsync()
    {
        var onlineIds = _presence.GetOnlineUserIds();
        var allUsers = await _db.GetAllUsersAsync();
        return allUsers
            .Select(u => new UserDto(u.Id, u.Username, u.ProfilePictureUrl, u.IsGuest, onlineIds.Contains(u.Id)))
            .ToList();
    }
}
