using ChatApi.DTOs;
using ChatApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ChatApi.Hubs;

[Authorize]
public class CallHub : Hub
{
    private readonly PresenceService _presence;
    private readonly AuthService _auth;
    private readonly DatabaseService _db;

    public CallHub(PresenceService presence, AuthService auth, DatabaseService db)
    {
        _presence = presence;
        _auth = auth;
        _db = db;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = GetUserId();
        if (userId == null)
        {
            Context.Abort();
            return;
        }

        _presence.CallUserConnected(userId.Value, Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _presence.CallUserDisconnected(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    public async Task SendCallSignal(CallSignalDto signal)
    {
        var userId = GetUserId();
        if (userId == null) return;

        if (signal.ToUserId.HasValue)
        {
            var conn = _presence.GetCallConnectionId(signal.ToUserId.Value);
            if (conn != null)
                await Clients.Client(conn).SendAsync("CallSignal", signal);
            return;
        }

        if (signal.GroupId.HasValue)
        {
            var members = await _db.GetGroupMemberIdsAsync(signal.GroupId.Value);
            foreach (var memberId in members.Where(id => id != userId.Value))
            {
                var conn = _presence.GetCallConnectionId(memberId);
                if (conn != null)
                    await Clients.Client(conn).SendAsync("CallSignal", signal);
            }
        }
    }

    private Guid? GetUserId() => _auth.GetUserIdFromClaims(Context.User!);
}
