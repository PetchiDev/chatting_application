using System.Collections.Concurrent;

namespace ChatApi.Services;

public class PresenceService
{
    private readonly ConcurrentDictionary<Guid, string> _connections = new();
    private readonly ConcurrentDictionary<string, Guid> _connectionToUser = new();

    public void UserConnected(Guid userId, string connectionId)
    {
        _connections[userId] = connectionId;
        _connectionToUser[connectionId] = userId;
    }

    public Guid? UserDisconnected(string connectionId)
    {
        if (_connectionToUser.TryRemove(connectionId, out var userId))
        {
            if (_connections.TryGetValue(userId, out var conn) && conn == connectionId)
                _connections.TryRemove(userId, out _);
            return userId;
        }
        return null;
    }

    public string? GetConnectionId(Guid userId) =>
        _connections.TryGetValue(userId, out var conn) ? conn : null;

    public IReadOnlyCollection<Guid> GetOnlineUserIds() => _connections.Keys.ToList();
}
