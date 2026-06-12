using ChatApi.DTOs;
using ChatApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotificationController : ControllerBase
{
    private readonly DatabaseService _db;
    private readonly AuthService _auth;

    public NotificationController(DatabaseService db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    [HttpGet]
    public async Task<ActionResult<object>> GetNotifications()
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        var items = await _db.GetNotificationsAsync(userId.Value);
        var unread = await _db.GetUnreadNotificationCountAsync(userId.Value);
        return Ok(new
        {
            unread,
            items = items.Select(NotificationService.ToDto).ToList()
        });
    }

    [HttpPost("read")]
    public async Task<IActionResult> MarkRead([FromBody] Guid[]? ids)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        await _db.MarkNotificationsReadAsync(userId.Value, ids);
        return Ok();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        var deleted = await _db.DeleteNotificationAsync(userId.Value, id);
        if (!deleted) return NotFound();
        return Ok();
    }

    [HttpPost("push/subscribe")]
    public async Task<IActionResult> SubscribePush([FromBody] PushSubscribeRequest request)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        await _db.SavePushSubscriptionAsync(userId.Value, request.Endpoint, request.P256dh, request.Auth);
        return Ok();
    }

    [HttpGet("push/vapid-public-key")]
    [AllowAnonymous]
    public IActionResult GetVapidPublicKey([FromServices] IConfiguration config)
    {
        var key = config["WebPush:PublicKey"];
        if (string.IsNullOrWhiteSpace(key)) return NotFound();
        return Ok(new { publicKey = key });
    }
}
