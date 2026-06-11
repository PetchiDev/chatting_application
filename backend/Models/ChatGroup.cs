namespace ChatApi.Models;

public class ChatGroup
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public int MemberCount { get; set; }
    public bool IsMuted { get; set; }
}

public class AppNotification
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Title { get; set; } = "";
    public string Body { get; set; } = "";
    public string ChannelType { get; set; } = "";
    public Guid? ChannelId { get; set; }
    public Guid? MessageId { get; set; }
    public bool IsRead { get; set; }
    public DateTime CreatedAt { get; set; }
}
