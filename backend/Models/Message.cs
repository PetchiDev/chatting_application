namespace ChatApi.Models;

public class Message
{
    public Guid Id { get; set; }
    public Guid SenderId { get; set; }
    public Guid? RecipientId { get; set; }
    public string? Content { get; set; }
    public string MessageType { get; set; } = "text";
    public string? AttachmentUrl { get; set; }
    public string? AttachmentName { get; set; }
    public string? LinkUrl { get; set; }
    public string? LinkTitle { get; set; }
    public string? LinkDescription { get; set; }
    public string? LinkImage { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? SenderUsername { get; set; }
    public string? SenderProfilePicture { get; set; }
}
