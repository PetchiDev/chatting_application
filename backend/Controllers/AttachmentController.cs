using ChatApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AttachmentController : ControllerBase
{
    private readonly DatabaseService _db;
    private readonly AuthService _auth;
    private readonly IHttpClientFactory _httpFactory;

    public AttachmentController(DatabaseService db, AuthService auth, IHttpClientFactory httpFactory)
    {
        _db = db;
        _auth = auth;
        _httpFactory = httpFactory;
    }

    [HttpGet("{messageId:guid}/download")]
    public async Task<IActionResult> Download(Guid messageId)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        var message = await _db.GetMessageByIdAsync(messageId);
        if (message == null || string.IsNullOrEmpty(message.AttachmentUrl))
            return NotFound();

        if (!await CanAccessMessage(userId.Value, message))
            return Forbid();

        var client = _httpFactory.CreateClient();
        var bytes = await client.GetByteArrayAsync(message.AttachmentUrl);
        var fileName = message.AttachmentName ?? "attachment";
        return File(bytes, "application/octet-stream", fileName);
    }

    private async Task<bool> CanAccessMessage(Guid userId, Models.Message message)
    {
        if (message.SenderId == userId) return true;
        if (message.RecipientId.HasValue)
            return message.RecipientId == userId || message.SenderId == userId;
        if (message.GroupId.HasValue)
            return await _db.IsGroupMemberAsync(message.GroupId.Value, userId);
        return true;
    }
}
