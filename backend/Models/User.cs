namespace ChatApi.Models;

public class User
{
    public Guid Id { get; set; }
    public string? Email { get; set; }
    public string Username { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public bool IsGuest { get; set; }
    public string? ProfilePictureUrl { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastLoginAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
}
