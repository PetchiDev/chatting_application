using ChatApi.DTOs;
using ChatApi.Hubs;
using ChatApi.Models;
using Microsoft.AspNetCore.SignalR;

namespace ChatApi.Services;

public class MessageSendService
{
    private readonly DatabaseService _db;
    private readonly PresenceService _presence;
    private readonly LinkPreviewService _linkPreview;
    private readonly NotificationService _notifications;
    private readonly IHubContext<ChatHub> _hub;
    private readonly ILogger<MessageSendService> _logger;

    public MessageSendService(
        DatabaseService db,
        PresenceService presence,
        LinkPreviewService linkPreview,
        NotificationService notifications,
        IHubContext<ChatHub> hub,
        ILogger<MessageSendService> logger)
    {
        _db = db;
        _presence = presence;
        _linkPreview = linkPreview;
        _notifications = notifications;
        _hub = hub;
        _logger = logger;
    }

    public async Task<MessageDto?> SendAsync(Guid senderId, SendMessageRequest request)
    {
        var user = await _db.GetUserByIdAsync(senderId);
        if (user == null) return null;

        if (request.GroupId.HasValue && !await _db.IsGroupMemberAsync(request.GroupId.Value, senderId))
            return null;

        var message = new Message
        {
            Id = Guid.NewGuid(),
            SenderId = senderId,
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
        var senderConn = _presence.GetConnectionId(senderId);

        if (request.GroupId.HasValue)
        {
            await _hub.Clients.Group(ChatHub.GroupChannel(request.GroupId.Value))
                .SendAsync("ReceiveGroupMessage", dto);
            var members = await _db.GetGroupMemberIdsAsync(request.GroupId.Value);
            try
            {
                await _notifications.NotifyGroupMembersAsync(
                    request.GroupId.Value, senderId, user.Username, previewText, message.Id, members);
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
                await _hub.Clients.Client(recipientConn).SendAsync("ReceiveDirectMessage", dto);
            if (senderConn != null)
                await _hub.Clients.Client(senderConn).SendAsync("ReceiveDirectMessage", dto);

            try
            {
                await _notifications.NotifyMessageAsync(
                    request.RecipientId.Value, user.Username, previewText, "dm", senderId, message.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send DM notification for message {MessageId}", message.Id);
            }
        }
        else
        {
            await _hub.Clients.Group("global").SendAsync("ReceiveMessage", dto);
            if (senderConn != null)
                await _hub.Clients.Client(senderConn).SendAsync("ReceiveMessage", dto);

            var allUsers = await _db.GetAllUsersAsync();
            foreach (var u in allUsers.Where(u => u.Id != senderId))
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

        return dto;
    }

    private static string GetMessagePreview(Message message)
    {
        if (!string.IsNullOrWhiteSpace(message.Content))
            return message.Content.Length > 120 ? message.Content[..120] + "…" : message.Content;
        return message.MessageType switch
        {
            "image" => "Photo",
            "file" => message.AttachmentName ?? "Attachment",
            "audio" => "Voice message",
            _ => "New message"
        };
    }
}
