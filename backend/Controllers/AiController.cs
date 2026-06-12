using ChatApi.DTOs;
using ChatApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AiController : ControllerBase
{
    private readonly GroqAiService _ai;
    private readonly AuthService _auth;

    public AiController(GroqAiService ai, AuthService auth)
    {
        _ai = ai;
        _auth = auth;
    }

    [HttpPost("chat")]
    public async Task<ActionResult<AiChatResponse>> Chat([FromBody] AiChatRequest request)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        var username = User.Identity?.Name ?? "User";
        if (request.Messages == null || request.Messages.Count == 0)
            return BadRequest(new { error = "Messages required" });

        try
        {
            var response = await _ai.ChatAsync(userId.Value, username, request.Messages);
            return Ok(response);
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(503, new { error = SanitizeAiError(ex.Message) });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = SanitizeAiError(ex.Message) });
        }
    }

    private static string SanitizeAiError(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return "AI is temporarily unavailable. Please try again.";

        if (message.Contains("Groq API key", StringComparison.OrdinalIgnoreCase))
            return message;

        if (message.Contains("node already has a parent", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("JsonNode", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("System.", StringComparison.OrdinalIgnoreCase))
        {
            return "Something went wrong on my side. Please try your message again.";
        }

        return message.Length > 200 ? "AI is temporarily unavailable. Please try again." : message;
    }
}
