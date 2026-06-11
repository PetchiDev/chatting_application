namespace ChatApi.DTOs;

public record CallSignalDto(
    string CallId,
    Guid FromUserId,
    string FromUsername,
    Guid? ToUserId,
    Guid? GroupId,
    string CallType,
    string SignalType,
    object? Payload
);
