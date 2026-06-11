using ChatApi.DTOs;
using ChatApi.Hubs;
using Microsoft.AspNetCore.SignalR;
using WebPush;

namespace ChatApi.Services;

public class NotificationService
{
    private readonly DatabaseService _db;
    private readonly PresenceService _presence;
    private readonly IHubContext<ChatHub> _hub;
    private readonly IConfiguration _config;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(
        DatabaseService db,
        PresenceService presence,
        IHubContext<ChatHub> hub,
        IConfiguration config,
        ILogger<NotificationService> logger)
    {
        _db = db;
        _presence = presence;
        _hub = hub;
        _config = config;
        _logger = logger;
    }

    public async Task NotifyMessageAsync(
        Guid recipientUserId,
        string senderName,
        string preview,
        string channelType,
        Guid? channelId,
        Guid messageId)
    {
        if (await _db.IsMutedAsync(recipientUserId, channelType, channelId))
            return;

        var title = channelType switch
        {
            "dm" => senderName,
            "group" => $"Group · {senderName}",
            _ => $"Group Chat · {senderName}"
        };

        var notification = await _db.CreateNotificationAsync(
            recipientUserId, title, preview, channelType, channelId, messageId);

        var dto = ToDto(notification);
        var conn = _presence.GetConnectionId(recipientUserId);
        if (conn != null)
            await _hub.Clients.Client(conn).SendAsync("NewNotification", dto);

        await TrySendPushAsync(recipientUserId, title, preview);
    }

    public async Task NotifyGroupMembersAsync(
        Guid groupId,
        Guid senderId,
        string senderName,
        string preview,
        Guid messageId,
        IEnumerable<Guid> memberIds)
    {
        foreach (var memberId in memberIds.Where(id => id != senderId))
            await NotifyMessageAsync(memberId, senderName, preview, "group", groupId, messageId);
    }

    private async Task TrySendPushAsync(Guid userId, string title, string body)
    {
        var publicKey = _config["WebPush:PublicKey"];
        var privateKey = _config["WebPush:PrivateKey"];
        var subject = _config["WebPush:Subject"] ?? "mailto:support@kryptos.chat";
        if (string.IsNullOrWhiteSpace(publicKey) || string.IsNullOrWhiteSpace(privateKey))
            return;

        var subs = await _db.GetPushSubscriptionsAsync(userId);
        if (subs.Count == 0) return;

        var client = new WebPushClient();
        var vapid = new VapidDetails(subject, publicKey, privateKey);
        var payload = System.Text.Json.JsonSerializer.Serialize(new { title, body });

        foreach (var (endpoint, p256dh, auth) in subs)
        {
            try
            {
                var sub = new PushSubscription(endpoint, p256dh, auth);
                await client.SendNotificationAsync(sub, payload, vapid);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Push failed for user {UserId}", userId);
            }
        }
    }

    public static NotificationDto ToDto(Models.AppNotification n) => new(
        n.Id, n.Title, n.Body, n.ChannelType, n.ChannelId, n.MessageId, n.IsRead, n.CreatedAt
    );
}
