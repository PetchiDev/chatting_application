using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ChatApi.DTOs;
using ChatApi.Models;
using Microsoft.IdentityModel.Tokens;

namespace ChatApi.Services;

public class AuthService
{
    private readonly DatabaseService _db;
    private readonly IConfiguration _config;

    public AuthService(DatabaseService db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            throw new ArgumentException("Email, username, and password are required");

        if (request.Password.Length < 6)
            throw new ArgumentException("Password must be at least 6 characters");

        if (await _db.GetUserByEmailAsync(request.Email) != null)
            throw new InvalidOperationException("Email already registered");

        if (await _db.GetUserByUsernameAsync(request.Username) != null)
            throw new InvalidOperationException("Username already taken");

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = request.Email.Trim().ToLowerInvariant(),
            Username = request.Username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            IsGuest = false
        };

        await _db.CreateUserAsync(user);
        return CreateAuthResponse(user);
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Identifier) || string.IsNullOrWhiteSpace(request.Password))
            throw new ArgumentException("Identifier and password are required");

        var identifier = request.Identifier.Trim();
        User? user = identifier.Contains('@')
            ? await _db.GetUserByEmailAsync(identifier)
            : await _db.GetUserByUsernameAsync(identifier);

        if (user == null || user.IsGuest)
            throw new UnauthorizedAccessException("Invalid credentials");

        if (user.PasswordHash == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            await _db.DeleteUserAsync(user.Id);
            throw new UnauthorizedAccessException("Invalid credentials. Account has been removed.");
        }

        await _db.UpdateLastLoginAsync(user.Id);
        user.LastLoginAt = DateTime.UtcNow;
        return CreateAuthResponse(user);
    }

    public async Task<AuthResponse> GuestLoginAsync(GuestLoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username))
            throw new ArgumentException("Username is required");

        var username = request.Username.Trim();
        var existing = await _db.GetUserByUsernameAsync(username);

        if (existing != null)
        {
            if (!existing.IsGuest)
                throw new InvalidOperationException("Username belongs to a registered account. Please login with password.");

            if (existing.ExpiresAt.HasValue && existing.ExpiresAt.Value < DateTime.UtcNow)
            {
                await _db.DeleteUserAsync(existing.Id);
                throw new UnauthorizedAccessException("Guest session expired. Please choose a new username.");
            }

            await _db.UpdateLastLoginAsync(existing.Id);
            return CreateAuthResponse(existing);
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            IsGuest = true,
            ExpiresAt = DateTime.UtcNow.AddHours(24)
        };

        await _db.CreateUserAsync(user);
        return CreateAuthResponse(user);
    }

    public AuthResponse CreateAuthResponse(User user)
    {
        var token = GenerateToken(user);
        return new AuthResponse(
            token,
            user.Id,
            user.Username,
            user.Email,
            user.IsGuest,
            user.ProfilePictureUrl,
            user.ExpiresAt
        );
    }

    public string GenerateToken(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Secret"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiryHours = user.IsGuest
            ? int.Parse(_config["Jwt:ExpiryHours"] ?? "24")
            : int.Parse(_config["Jwt:RegisteredExpiryHours"] ?? "87600");

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim("is_guest", user.IsGuest.ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(expiryHours),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public Guid? GetUserIdFromClaims(ClaimsPrincipal user)
    {
        var id = user.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(id, out var guid) ? guid : null;
    }
}
