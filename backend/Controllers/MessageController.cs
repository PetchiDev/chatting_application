using ChatApi.DTOs;
using ChatApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MessageController : ControllerBase
{
    private readonly DatabaseService _db;
    private readonly AuthService _auth;

    public MessageController(DatabaseService db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    [HttpGet("group")]
    public async Task<ActionResult<List<MessageDto>>> GetGroupMessages()
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        var messages = await _db.GetGroupMessagesAsync(userId.Value);
        return Ok(messages.Select(MapToDto));
    }

    [HttpGet("direct/{otherUserId:guid}")]
    public async Task<ActionResult<List<MessageDto>>> GetDirectMessages(Guid otherUserId)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        var messages = await _db.GetDirectMessagesAsync(userId.Value, otherUserId);
        return Ok(messages.Select(MapToDto));
    }

    [HttpGet("recent")]
    public async Task<ActionResult<List<RecentChatDto>>> GetRecentChats([FromServices] PresenceService presence)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        var recent = await _db.GetRecentDirectChatsAsync(userId.Value);

        return Ok(recent.Select(r => new RecentChatDto(
            r.UserId,
            r.Username,
            r.ProfilePictureUrl,
            r.IsGuest,
            presence.IsUserOnline(r.UserId),
            r.LastMessageAt,
            PreviewMessage(r.Content, r.MessageType)
        )).ToList());
    }

    [HttpGet("users")]
    public async Task<ActionResult<List<UserDto>>> GetUsers([FromServices] PresenceService presence)
    {
        var users = await _db.GetAllUsersAsync();
        var currentUserId = _auth.GetUserIdFromClaims(User);

        return Ok(users
            .Where(u => u.Id != currentUserId)
            .Select(u => new UserDto(
                u.Id,
                u.Username,
                u.ProfilePictureUrl,
                u.IsGuest,
                presence.IsUserOnline(u.Id)))
            .ToList());
    }

    private static MessageDto MapToDto(Models.Message m) =>
        MessageMapper.ToDto(m, m.SenderUsername ?? "", m.SenderProfilePicture);

    private static string? PreviewMessage(string? content, string messageType) =>
        messageType switch
        {
            "image" => "Photo",
            "audio" => "Voice message",
            "file" => string.IsNullOrWhiteSpace(content) ? "Attachment" : content,
            _ => content
        };
}
