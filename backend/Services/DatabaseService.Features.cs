using ChatApi.Models;
using Npgsql;

namespace ChatApi.Services;

public partial class DatabaseService
{
    private static readonly Guid GlobalChannelId = Guid.Empty;

    public async Task EnsureFeatureSchemaAsync()
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(@"
            CREATE EXTENSION IF NOT EXISTS ""uuid-ossp"";
            CREATE TABLE IF NOT EXISTS chat_groups (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name TEXT NOT NULL,
                created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS group_members (
                group_id UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
                joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                left_at TIMESTAMPTZ,
                PRIMARY KEY (group_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS conversation_mutes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                channel_type TEXT NOT NULL CHECK (channel_type IN ('global', 'dm', 'group')),
                channel_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
                muted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (user_id, channel_type, channel_id)
            );
            CREATE TABLE IF NOT EXISTS notifications (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                channel_type TEXT NOT NULL,
                channel_id UUID,
                message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ALTER TABLE messages
                ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
                ADD COLUMN IF NOT EXISTS forwarded_from_id UUID REFERENCES messages(id) ON DELETE SET NULL;
        ", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<ChatGroup> CreateGroupAsync(Guid creatorId, string name, IEnumerable<Guid> memberIds)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        var groupId = Guid.NewGuid();
        await using (var cmd = new NpgsqlCommand(
            @"INSERT INTO chat_groups (id, name, created_by) VALUES (@id, @name, @createdBy)", conn, tx))
        {
            cmd.Parameters.AddWithValue("id", groupId);
            cmd.Parameters.AddWithValue("name", name);
            cmd.Parameters.AddWithValue("createdBy", creatorId);
            await cmd.ExecuteNonQueryAsync();
        }

        var allMembers = memberIds.Append(creatorId).Distinct();
        foreach (var memberId in allMembers)
        {
            var role = memberId == creatorId ? "owner" : "member";
            await using var cmd = new NpgsqlCommand(
                @"INSERT INTO group_members (group_id, user_id, role) VALUES (@gid, @uid, @role)
                  ON CONFLICT (group_id, user_id) DO UPDATE SET left_at = NULL", conn, tx);
            cmd.Parameters.AddWithValue("gid", groupId);
            cmd.Parameters.AddWithValue("uid", memberId);
            cmd.Parameters.AddWithValue("role", role);
            await cmd.ExecuteNonQueryAsync();
        }

        await tx.CommitAsync();
        return new ChatGroup { Id = groupId, Name = name, CreatedBy = creatorId, CreatedAt = DateTime.UtcNow, MemberCount = allMembers.Count() };
    }

    public async Task<List<ChatGroup>> GetUserGroupsAsync(Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT g.id, g.name, g.created_by, g.created_at,
                     (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.left_at IS NULL) AS member_count,
                     EXISTS(SELECT 1 FROM conversation_mutes cm
                            WHERE cm.user_id = @userId AND cm.channel_type = 'group' AND cm.channel_id = g.id) AS is_muted
              FROM chat_groups g
              JOIN group_members m ON m.group_id = g.id AND m.user_id = @userId AND m.left_at IS NULL
              ORDER BY g.created_at DESC", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        var groups = new List<ChatGroup>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            groups.Add(new ChatGroup
            {
                Id = reader.GetGuid(0),
                Name = reader.GetString(1),
                CreatedBy = reader.GetGuid(2),
                CreatedAt = reader.GetDateTime(3),
                MemberCount = reader.GetInt32(4),
                IsMuted = reader.GetBoolean(5)
            });
        }
        return groups;
    }

    public async Task<ChatGroup?> GetGroupForMemberAsync(Guid groupId, Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT g.id, g.name, g.created_by, g.created_at,
                     (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.left_at IS NULL) AS member_count,
                     EXISTS(SELECT 1 FROM conversation_mutes cm
                            WHERE cm.user_id = @userId AND cm.channel_type = 'group' AND cm.channel_id = g.id) AS is_muted
              FROM chat_groups g
              JOIN group_members m ON m.group_id = g.id AND m.user_id = @userId AND m.left_at IS NULL
              WHERE g.id = @groupId", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("groupId", groupId);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return new ChatGroup
        {
            Id = reader.GetGuid(0),
            Name = reader.GetString(1),
            CreatedBy = reader.GetGuid(2),
            CreatedAt = reader.GetDateTime(3),
            MemberCount = reader.GetInt32(4),
            IsMuted = reader.GetBoolean(5)
        };
    }

    public async Task<bool> IsGroupMemberAsync(Guid groupId, Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT 1 FROM group_members WHERE group_id = @gid AND user_id = @uid AND left_at IS NULL", conn);
        cmd.Parameters.AddWithValue("gid", groupId);
        cmd.Parameters.AddWithValue("uid", userId);
        return await cmd.ExecuteScalarAsync() != null;
    }

    public async Task AddGroupMembersAsync(Guid groupId, IEnumerable<Guid> memberIds)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        foreach (var memberId in memberIds.Distinct())
        {
            await using var cmd = new NpgsqlCommand(
                @"INSERT INTO group_members (group_id, user_id, role) VALUES (@gid, @uid, 'member')
                  ON CONFLICT (group_id, user_id) DO UPDATE SET left_at = NULL", conn);
            cmd.Parameters.AddWithValue("gid", groupId);
            cmd.Parameters.AddWithValue("uid", memberId);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    public async Task<List<Guid>> GetGroupMemberIdsAsync(Guid groupId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT user_id FROM group_members WHERE group_id = @gid AND left_at IS NULL", conn);
        cmd.Parameters.AddWithValue("gid", groupId);
        var ids = new List<Guid>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) ids.Add(reader.GetGuid(0));
        return ids;
    }

    public async Task<List<(Guid UserId, string Username, string? ProfilePictureUrl, bool IsGuest, string Role)>> GetGroupMembersAsync(Guid groupId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT gm.user_id, u.username, u.profile_picture_url, u.is_guest, gm.role
              FROM group_members gm
              JOIN users u ON u.id = gm.user_id
              WHERE gm.group_id = @gid AND gm.left_at IS NULL
              ORDER BY CASE WHEN gm.role = 'owner' THEN 0 ELSE 1 END, u.username", conn);
        cmd.Parameters.AddWithValue("gid", groupId);
        var list = new List<(Guid, string, string?, bool, string)>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add((
                reader.GetGuid(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.GetBoolean(3),
                reader.GetString(4)
            ));
        }
        return list;
    }

    public async Task<bool> IsGroupOwnerAsync(Guid groupId, Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT 1 FROM group_members WHERE group_id = @gid AND user_id = @uid AND role = 'owner' AND left_at IS NULL", conn);
        cmd.Parameters.AddWithValue("gid", groupId);
        cmd.Parameters.AddWithValue("uid", userId);
        return await cmd.ExecuteScalarAsync() != null;
    }

    public async Task<bool> RemoveGroupMemberAsync(Guid groupId, Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"UPDATE group_members SET left_at = NOW()
              WHERE group_id = @gid AND user_id = @uid AND role <> 'owner' AND left_at IS NULL", conn);
        cmd.Parameters.AddWithValue("gid", groupId);
        cmd.Parameters.AddWithValue("uid", userId);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    public async Task LeaveGroupAsync(Guid groupId, Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"UPDATE group_members SET left_at = NOW() WHERE group_id = @gid AND user_id = @uid", conn);
        cmd.Parameters.AddWithValue("gid", groupId);
        cmd.Parameters.AddWithValue("uid", userId);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<List<Guid>> GetUserGroupIdsAsync(Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT group_id FROM group_members WHERE user_id = @uid AND left_at IS NULL", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        var ids = new List<Guid>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) ids.Add(reader.GetGuid(0));
        return ids;
    }

    public async Task SetMuteAsync(Guid userId, string channelType, Guid? channelId, bool muted)
    {
        var cid = channelId ?? GlobalChannelId;
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        if (muted)
        {
            await using var cmd = new NpgsqlCommand(
                @"INSERT INTO conversation_mutes (user_id, channel_type, channel_id)
                  VALUES (@uid, @type, @cid)
                  ON CONFLICT (user_id, channel_type, channel_id) DO NOTHING", conn);
            cmd.Parameters.AddWithValue("uid", userId);
            cmd.Parameters.AddWithValue("type", channelType);
            cmd.Parameters.AddWithValue("cid", cid);
            await cmd.ExecuteNonQueryAsync();
        }
        else
        {
            await using var cmd = new NpgsqlCommand(
                @"DELETE FROM conversation_mutes WHERE user_id = @uid AND channel_type = @type AND channel_id = @cid", conn);
            cmd.Parameters.AddWithValue("uid", userId);
            cmd.Parameters.AddWithValue("type", channelType);
            cmd.Parameters.AddWithValue("cid", cid);
            await cmd.ExecuteNonQueryAsync();
        }
    }

    public async Task<bool> IsMutedAsync(Guid userId, string channelType, Guid? channelId)
    {
        var cid = channelId ?? GlobalChannelId;
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT 1 FROM conversation_mutes WHERE user_id = @uid AND channel_type = @type AND channel_id = @cid", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("type", channelType);
        cmd.Parameters.AddWithValue("cid", cid);
        return await cmd.ExecuteScalarAsync() != null;
    }

    public async Task<bool> IsNotificationMutedAsync(Guid userId, string channelType, Guid? channelId)
    {
        if (await IsMutedAsync(userId, "global", null)) return true;
        return await IsMutedAsync(userId, channelType, channelId);
    }

    public async Task<List<(string ChannelType, Guid? ChannelId)>> GetConversationMutesAsync(Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT channel_type, channel_id FROM conversation_mutes WHERE user_id = @uid", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        var list = new List<(string, Guid?)>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var type = reader.GetString(0);
            var cid = reader.GetGuid(1);
            list.Add((type, cid == GlobalChannelId ? null : cid));
        }
        return list;
    }

    public async Task<AppNotification> CreateNotificationAsync(Guid userId, string title, string body, string channelType, Guid? channelId, Guid? messageId)
    {
        var id = Guid.NewGuid();
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"INSERT INTO notifications (id, user_id, title, body, channel_type, channel_id, message_id)
              VALUES (@id, @uid, @title, @body, @type, @cid, @mid)
              RETURNING created_at", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("title", title);
        cmd.Parameters.AddWithValue("body", body);
        cmd.Parameters.AddWithValue("type", channelType);
        cmd.Parameters.AddWithValue("cid", (object?)channelId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("mid", (object?)messageId ?? DBNull.Value);
        var createdAt = (DateTime)(await cmd.ExecuteScalarAsync())!;
        return new AppNotification
        {
            Id = id, UserId = userId, Title = title, Body = body,
            ChannelType = channelType, ChannelId = channelId, MessageId = messageId,
            IsRead = false, CreatedAt = createdAt
        };
    }

    public async Task<List<AppNotification>> GetNotificationsAsync(Guid userId, int limit = 50)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT id, user_id, title, body, channel_type, channel_id, message_id, is_read, created_at
              FROM notifications WHERE user_id = @uid ORDER BY created_at DESC LIMIT @limit", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("limit", limit);
        var list = new List<AppNotification>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new AppNotification
            {
                Id = reader.GetGuid(0),
                UserId = reader.GetGuid(1),
                Title = reader.GetString(2),
                Body = reader.GetString(3),
                ChannelType = reader.GetString(4),
                ChannelId = reader.IsDBNull(5) ? null : reader.GetGuid(5),
                MessageId = reader.IsDBNull(6) ? null : reader.GetGuid(6),
                IsRead = reader.GetBoolean(7),
                CreatedAt = reader.GetDateTime(8)
            });
        }
        return list;
    }

    public async Task MarkNotificationsReadAsync(Guid userId, IEnumerable<Guid>? ids = null)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        var sql = ids?.Any() == true
            ? "UPDATE notifications SET is_read = TRUE WHERE user_id = @uid AND id = ANY(@ids)"
            : "UPDATE notifications SET is_read = TRUE WHERE user_id = @uid AND is_read = FALSE";
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("uid", userId);
        if (ids?.Any() == true) cmd.Parameters.AddWithValue("ids", ids.ToArray());
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<bool> DeleteNotificationAsync(Guid userId, Guid notificationId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "DELETE FROM notifications WHERE id = @id AND user_id = @uid", conn);
        cmd.Parameters.AddWithValue("id", notificationId);
        cmd.Parameters.AddWithValue("uid", userId);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    public async Task<int> GetUnreadNotificationCountAsync(Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT COUNT(*) FROM notifications WHERE user_id = @uid AND is_read = FALSE", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    public async Task SavePushSubscriptionAsync(Guid userId, string endpoint, string p256dh, string auth)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
              VALUES (@uid, @endpoint, @p256dh, @auth)
              ON CONFLICT (endpoint) DO UPDATE SET user_id = @uid, p256dh = @p256dh, auth = @auth", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("endpoint", endpoint);
        cmd.Parameters.AddWithValue("p256dh", p256dh);
        cmd.Parameters.AddWithValue("auth", auth);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<List<(string Endpoint, string P256dh, string Auth)>> GetPushSubscriptionsAsync(Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = @uid", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        var list = new List<(string, string, string)>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            list.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        return list;
    }

    public async Task<List<Message>> GetCustomGroupMessagesAsync(Guid viewerId, Guid groupId, int limit = 100)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            $@"SELECT m.id, m.sender_id, m.recipient_id, m.content, m.message_type,
                     m.attachment_url, m.attachment_name, m.created_at,
                     m.link_url, m.link_title, m.link_description, m.link_image,
                     u.username, u.profile_picture_url, m.group_id, m.forwarded_from_id
              FROM messages m
              JOIN users u ON u.id = m.sender_id
              WHERE m.group_id = @groupId
              {HiddenFilter}
              ORDER BY m.created_at DESC
              LIMIT @limit", conn);
        cmd.Parameters.AddWithValue("viewerId", viewerId);
        cmd.Parameters.AddWithValue("groupId", groupId);
        cmd.Parameters.AddWithValue("limit", limit);
        return await ReadMessagesExtendedAsync(cmd);
    }

    private static async Task<List<Message>> ReadMessagesExtendedAsync(NpgsqlCommand cmd)
    {
        var messages = new List<Message>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            messages.Add(new Message
            {
                Id = reader.GetGuid(0),
                SenderId = reader.GetGuid(1),
                RecipientId = reader.IsDBNull(2) ? null : reader.GetGuid(2),
                Content = reader.IsDBNull(3) ? null : reader.GetString(3),
                MessageType = reader.GetString(4),
                AttachmentUrl = reader.IsDBNull(5) ? null : reader.GetString(5),
                AttachmentName = reader.IsDBNull(6) ? null : reader.GetString(6),
                CreatedAt = reader.GetDateTime(7),
                LinkUrl = reader.IsDBNull(8) ? null : reader.GetString(8),
                LinkTitle = reader.IsDBNull(9) ? null : reader.GetString(9),
                LinkDescription = reader.IsDBNull(10) ? null : reader.GetString(10),
                LinkImage = reader.IsDBNull(11) ? null : reader.GetString(11),
                SenderUsername = reader.GetString(12),
                SenderProfilePicture = reader.IsDBNull(13) ? null : reader.GetString(13),
                GroupId = reader.IsDBNull(14) ? null : reader.GetGuid(14),
                ForwardedFromId = reader.IsDBNull(15) ? null : reader.GetGuid(15)
            });
        }
        messages.Reverse();
        return messages;
    }
}
