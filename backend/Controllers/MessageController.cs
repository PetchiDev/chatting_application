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

    [HttpGet("users")]
    public async Task<ActionResult<List<UserDto>>> GetUsers([FromServices] PresenceService presence)
    {
        var onlineIds = presence.GetOnlineUserIds();
        var users = await _db.GetAllUsersAsync();
        var currentUserId = _auth.GetUserIdFromClaims(User);

        return Ok(users
            .Where(u => u.Id != currentUserId)
            .Select(u => new UserDto(u.Id, u.Username, u.ProfilePictureUrl, u.IsGuest, onlineIds.Contains(u.Id)))
            .ToList());
    }

    private static MessageDto MapToDto(Models.Message m) =>
        MessageMapper.ToDto(m, m.SenderUsername ?? "", m.SenderProfilePicture);
}
