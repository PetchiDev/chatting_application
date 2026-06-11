using ChatApi.DTOs;
using ChatApi.Models;

namespace ChatApi.Services;

public static class MessageMapper
{
    public static MessageDto ToDto(Message m, string username, string? profilePicture) => new(
        m.Id,
        m.SenderId,
        username,
        profilePicture,
        m.RecipientId,
        m.GroupId,
        m.ForwardedFromId,
        m.Content,
        m.MessageType,
        m.AttachmentUrl,
        m.AttachmentName,
        m.LinkUrl,
        m.LinkTitle,
        m.LinkDescription,
        m.LinkImage,
        m.CreatedAt
    );
}
