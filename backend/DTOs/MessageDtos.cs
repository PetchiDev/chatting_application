namespace ChatApi.DTOs;

public record SendMessageRequest(
    string? Content,
    string MessageType,
    Guid? RecipientId,
    string? AttachmentUrl,
    string? AttachmentName
);

public record MessageDto(
    Guid Id,
    Guid SenderId,
    string SenderUsername,
    string? SenderProfilePicture,
    Guid? RecipientId,
    string? Content,
    string MessageType,
    string? AttachmentUrl,
    string? AttachmentName,
    string? LinkUrl,
    string? LinkTitle,
    string? LinkDescription,
    string? LinkImage,
    DateTime CreatedAt
);

public record UpdateProfileRequest(string Username);

public record DeleteMessageRequest(bool ForEveryone);

public record MessageDeletedDto(Guid MessageId, Guid? RecipientId, bool ForEveryone);

public record RecentChatDto(
    Guid UserId,
    string Username,
    string? ProfilePictureUrl,
    bool IsGuest,
    bool IsOnline,
    DateTime LastMessageAt,
    string? LastMessagePreview
);
