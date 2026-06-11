using ChatApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UploadController : ControllerBase
{
    private readonly StorageService _storage;
    private readonly AuthService _auth;

    public UploadController(StorageService storage, AuthService auth)
    {
        _storage = storage;
        _auth = auth;
    }

    [HttpPost]
    [RequestSizeLimit(25 * 1024 * 1024)]
    public async Task<ActionResult> Upload(IFormFile file)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided" });

        var url = await _storage.UploadAsync(file, userId.Value);
        return Ok(new { url, name = file.FileName, contentType = file.ContentType });
    }
}
