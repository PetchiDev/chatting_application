namespace ChatApi.DTOs;

public record RegisterRequest(string Email, string Username, string Password);

public record LoginRequest(string Identifier, string Password);

public record GuestLoginRequest(string Username);

public record AuthResponse(
    string Token,
    Guid UserId,
    string Username,
    string? Email,
    bool IsGuest,
    string? ProfilePictureUrl,
    DateTime? ExpiresAt
);

public record UserDto(
    Guid Id,
    string Username,
    string? ProfilePictureUrl,
    bool IsGuest,
    bool IsOnline
);
