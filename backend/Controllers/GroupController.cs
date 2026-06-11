using ChatApi.DTOs;
using ChatApi.Hubs;
using ChatApi.Models;
using ChatApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace ChatApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GroupController : ControllerBase
{
    private readonly DatabaseService _db;
    private readonly AuthService _auth;
    private readonly PresenceService _presence;
    private readonly IHubContext<ChatHub> _hub;

    public GroupController(
        DatabaseService db,
        AuthService auth,
        PresenceService presence,
        IHubContext<ChatHub> hub)
    {
        _db = db;
        _auth = auth;
        _presence = presence;
        _hub = hub;
    }

    [HttpGet]
    public async Task<ActionResult<List<GroupDto>>> GetMyGroups()
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        var groups = await _db.GetUserGroupsAsync(userId.Value);
        return Ok(groups.Select(ToDto).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<GroupDto>> CreateGroup([FromBody] CreateGroupRequest request)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Name)) return BadRequest(new { error = "Group name required" });

        var group = await _db.CreateGroupAsync(userId.Value, request.Name.Trim(), request.MemberIds ?? []);
        var dto = ToDto(group);

        var memberIds = (request.MemberIds ?? [])
            .Append(userId.Value)
            .Distinct();
        await SyncGroupMembershipAsync(group, memberIds, userId.Value);

        return Ok(dto);
    }

    [HttpPost("{groupId:guid}/members")]
    public async Task<IActionResult> AddMembers(Guid groupId, [FromBody] AddMembersRequest request)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        if (!await _db.IsGroupMemberAsync(groupId, userId.Value)) return Forbid();

        var newMemberIds = (request.MemberIds ?? []).Distinct().ToList();
        await _db.AddGroupMembersAsync(groupId, newMemberIds);

        var group = await _db.GetGroupForMemberAsync(groupId, userId.Value);
        if (group != null && newMemberIds.Count > 0)
            await SyncGroupMembershipAsync(group, newMemberIds, null);

        return Ok();
    }

    [HttpGet("{groupId:guid}/members")]
    public async Task<ActionResult<List<GroupMemberDto>>> GetMembers(Guid groupId)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        if (!await _db.IsGroupMemberAsync(groupId, userId.Value)) return Forbid();

        var members = await _db.GetGroupMembersAsync(groupId);
        return Ok(members.Select(m => new GroupMemberDto(
            m.UserId,
            m.Username,
            m.ProfilePictureUrl,
            m.IsGuest,
            m.Role,
            _presence.IsUserOnline(m.UserId)
        )).ToList());
    }

    [HttpDelete("{groupId:guid}/members/{memberId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid groupId, Guid memberId)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        if (!await _db.IsGroupOwnerAsync(groupId, userId.Value)) return Forbid();
        if (memberId == userId.Value) return BadRequest(new { error = "Use leave to remove yourself" });
        if (!await _db.IsGroupMemberAsync(groupId, memberId)) return NotFound();

        if (!await _db.RemoveGroupMemberAsync(groupId, memberId))
            return BadRequest(new { error = "Cannot remove this member" });

        var conn = _presence.GetConnectionId(memberId);
        if (conn != null)
        {
            await _hub.Groups.RemoveFromGroupAsync(conn, ChatHub.GroupChannel(groupId));
            await _hub.Clients.Client(conn).SendAsync("GroupRemoved", groupId);
        }

        var group = await _db.GetGroupForMemberAsync(groupId, userId.Value);
        if (group != null)
        {
            var memberIds = await _db.GetGroupMemberIdsAsync(groupId);
            foreach (var id in memberIds)
            {
                var memberConn = _presence.GetConnectionId(id);
                if (memberConn == null) continue;
                await _hub.Clients.Client(memberConn).SendAsync("GroupUpdated", ToDto(group));
            }
        }

        return Ok();
    }

    [HttpPost("{groupId:guid}/leave")]
    public async Task<IActionResult> LeaveGroup(Guid groupId)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        await _db.LeaveGroupAsync(groupId, userId.Value);

        var conn = _presence.GetConnectionId(userId.Value);
        if (conn != null)
        {
            await _hub.Groups.RemoveFromGroupAsync(conn, ChatHub.GroupChannel(groupId));
            await _hub.Clients.Client(conn).SendAsync("GroupRemoved", groupId);
        }

        return Ok();
    }

    [HttpGet("{groupId:guid}/messages")]
    public async Task<ActionResult<List<MessageDto>>> GetMessages(Guid groupId)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        if (!await _db.IsGroupMemberAsync(groupId, userId.Value)) return Forbid();

        var messages = await _db.GetCustomGroupMessagesAsync(userId.Value, groupId);
        return Ok(messages.Select(m => MessageMapper.ToDto(m, m.SenderUsername ?? "", m.SenderProfilePicture)).ToList());
    }

    [HttpGet("mutes")]
    public async Task<ActionResult<List<MuteEntryDto>>> GetMutes()
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        var mutes = await _db.GetConversationMutesAsync(userId.Value);
        return Ok(mutes.Select(m => new MuteEntryDto(m.ChannelType, m.ChannelId)).ToList());
    }

    [HttpPut("mute")]
    public async Task<IActionResult> SetMute([FromBody] MuteRequest request)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(request.ChannelType) ||
            request.ChannelType is not ("global" or "dm" or "group"))
        {
            return BadRequest(new { error = "Invalid channel type" });
        }

        if (request.ChannelType is "dm" or "group" && !request.ChannelId.HasValue)
        {
            return BadRequest(new { error = "Channel id required" });
        }

        try
        {
            await _db.SetMuteAsync(userId.Value, request.ChannelType, request.ChannelId, request.Muted);
            return Ok();
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Failed to update mute setting", detail = ex.Message });
        }
    }

    private async Task SyncGroupMembershipAsync(ChatGroup group, IEnumerable<Guid> memberIds, Guid? skipGroupAddedForUserId)
    {
        foreach (var memberId in memberIds)
        {
            var conn = _presence.GetConnectionId(memberId);
            if (conn == null) continue;

            await _hub.Groups.AddToGroupAsync(conn, ChatHub.GroupChannel(group.Id));

            if (skipGroupAddedForUserId.HasValue && memberId == skipGroupAddedForUserId.Value)
                continue;

            var memberGroup = await _db.GetGroupForMemberAsync(group.Id, memberId) ?? group;
            await _hub.Clients.Client(conn).SendAsync("GroupAdded", ToDto(memberGroup));
        }
    }

    private static GroupDto ToDto(ChatGroup g) =>
        new(g.Id, g.Name, g.CreatedBy, g.CreatedAt, g.MemberCount, g.IsMuted);
}
