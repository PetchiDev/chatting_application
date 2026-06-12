using ChatApi.DTOs;
using ChatApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace ChatApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;
    private readonly DatabaseService _db;

    public AuthController(AuthService auth, DatabaseService db)
    {
        _auth = auth;
        _db = db;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request)
    {
        try
        {
            return Ok(await _auth.RegisterAsync(request));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        try
        {
            return Ok(await _auth.LoginAsync(request));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
    }

    [HttpPost("guest")]
    public async Task<ActionResult<AuthResponse>> GuestLogin([FromBody] GuestLoginRequest request)
    {
        try
        {
            return Ok(await _auth.GuestLoginAsync(request));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { error = ex.Message });
        }
    }

    [HttpGet("me")]
    [Microsoft.AspNetCore.Authorization.Authorize]
    public async Task<ActionResult<AuthResponse>> Me()
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        var user = await _db.GetUserByIdAsync(userId.Value);
        if (user == null) return Unauthorized();

        if (user.IsGuest && user.ExpiresAt.HasValue && user.ExpiresAt.Value < DateTime.UtcNow)
        {
            await _db.DeleteUserAsync(user.Id);
            return Unauthorized(new { error = "Guest session expired" });
        }

        return Ok(_auth.CreateAuthResponse(user));
    }
}
