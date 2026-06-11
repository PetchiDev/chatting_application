using ChatApi.DTOs;
using ChatApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GroupController : ControllerBase
{
    private readonly DatabaseService _db;
    private readonly AuthService _auth;

    public GroupController(DatabaseService db, AuthService auth)
    {
        _db = db;
        _auth = auth;
    }

    [HttpGet]
    public async Task<ActionResult<List<GroupDto>>> GetMyGroups()
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        var groups = await _db.GetUserGroupsAsync(userId.Value);
        return Ok(groups.Select(g => new GroupDto(g.Id, g.Name, g.CreatedBy, g.CreatedAt, g.MemberCount, g.IsMuted)).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<GroupDto>> CreateGroup([FromBody] CreateGroupRequest request)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Name)) return BadRequest(new { error = "Group name required" });

        var group = await _db.CreateGroupAsync(userId.Value, request.Name.Trim(), request.MemberIds ?? []);
        return Ok(new GroupDto(group.Id, group.Name, group.CreatedBy, group.CreatedAt, group.MemberCount, false));
    }

    [HttpPost("{groupId:guid}/members")]
    public async Task<IActionResult> AddMembers(Guid groupId, [FromBody] AddMembersRequest request)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        if (!await _db.IsGroupMemberAsync(groupId, userId.Value)) return Forbid();

        await _db.AddGroupMembersAsync(groupId, request.MemberIds ?? []);
        return Ok();
    }

    [HttpPost("{groupId:guid}/leave")]
    public async Task<IActionResult> LeaveGroup(Guid groupId)
    {
        var userId = _auth.GetUserIdFromClaims(User);
        if (userId == null) return Unauthorized();
        await _db.LeaveGroupAsync(groupId, userId.Value);
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
}
