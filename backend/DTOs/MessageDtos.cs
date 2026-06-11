namespace ChatApi.DTOs;

public record SendMessageRequest(
    string? Content,
    string MessageType,
    Guid? RecipientId,
    Guid? GroupId,
    string? AttachmentUrl,
    string? AttachmentName,
    Guid? ForwardedFromId
);

public record MessageDto(
    Guid Id,
    Guid SenderId,
    string SenderUsername,
    string? SenderProfilePicture,
    Guid? RecipientId,
    Guid? GroupId,
    Guid? ForwardedFromId,
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

public record MessageDeletedDto(Guid MessageId, Guid? RecipientId, Guid? GroupId, bool ForEveryone);

public record RecentChatDto(
    Guid UserId,
    string Username,
    string? ProfilePictureUrl,
    bool IsGuest,
    bool IsOnline,
    DateTime LastMessageAt,
    string? LastMessagePreview
);
