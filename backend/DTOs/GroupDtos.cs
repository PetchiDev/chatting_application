namespace ChatApi.DTOs;

public record CreateGroupRequest(string Name, List<Guid> MemberIds);

public record AddMembersRequest(List<Guid> MemberIds);

public record GroupDto(Guid Id, string Name, Guid CreatedBy, DateTime CreatedAt, int MemberCount, bool IsMuted);

public record MuteRequest(string ChannelType, Guid? ChannelId, bool Muted);

public record MuteEntryDto(string ChannelType, Guid? ChannelId);

public record ForwardMessageRequest(Guid MessageId, Guid? RecipientId, Guid? GroupId);

public record PushSubscribeRequest(string Endpoint, string P256dh, string Auth);

public record NotificationDto(
    Guid Id,
    string Title,
    string Body,
    string ChannelType,
    Guid? ChannelId,
    Guid? MessageId,
    bool IsRead,
    DateTime CreatedAt
);
