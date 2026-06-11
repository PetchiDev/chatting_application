using ChatApi.DTOs;
using ChatApi.Hubs;
using ChatApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace ChatApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProfileController : ControllerBase
{
    private readonly DatabaseService _db;
    private readonly AuthService _auth;
    private readonly StorageService _storage;
    private readonly IHubContext<ChatHub> _hub;

    public ProfileController(DatabaseService db, AuthService auth, StorageService storage, IHubContext<ChatHub> hub)
    {
        _db = db;
        _auth = auth;
        _storage = storage;
        _hub = hub;
    }

    [HttpPut]
    public async Task<ActionResult<AuthResponse>> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Username))
            return BadRequest(new { error = "Username is required" });

        var existing = await _db.GetUserByUsernameAsync(request.Username.Trim());
        if (existing != null && existing.Id != userId.Value)
            return Conflict(new { error = "Username already taken" });

        var user = await _db.GetUserByIdAsync(userId.Value);
        if (user == null) return NotFound();

        await _db.UpdateProfileAsync(userId.Value, request.Username.Trim(), null);
        user.Username = request.Username.Trim();

        await _hub.Clients.All.SendAsync("ProfileUpdated", new UserDto(user.Id, user.Username, user.ProfilePictureUrl, user.IsGuest, true));
        return Ok(_auth.CreateAuthResponse(user));
    }

    [HttpPost("picture")]
    public async Task<ActionResult<AuthResponse>> UpdatePicture(IFormFile file)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided" });

        if (!file.ContentType.StartsWith("image/"))
            return BadRequest(new { error = "Only image files are allowed" });

        var user = await _db.GetUserByIdAsync(userId.Value);
        if (user == null) return NotFound();

        var url = await _storage.UploadAsync(file, userId.Value);
        await _db.UpdateProfileAsync(userId.Value, user.Username, url);
        user.ProfilePictureUrl = url;

        await _hub.Clients.All.SendAsync("ProfileUpdated", new UserDto(user.Id, user.Username, user.ProfilePictureUrl, user.IsGuest, true));
        return Ok(_auth.CreateAuthResponse(user));
    }
}
