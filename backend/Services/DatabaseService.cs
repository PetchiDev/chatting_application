using ChatApi.Models;
using Npgsql;

namespace ChatApi.Services;

public partial class DatabaseService
{
    private readonly string _connectionString;

    public DatabaseService(IConfiguration config)
    {
        _connectionString = config.GetConnectionString("Supabase")
            ?? throw new InvalidOperationException("Supabase connection string not configured");
    }

    public NpgsqlConnection CreateConnection() => new(_connectionString);

    public async Task<User?> GetUserByIdAsync(Guid id)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT id, email, username, password_hash, is_guest, profile_picture_url,
                     created_at, last_login_at, expires_at
              FROM users WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", id);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapUser(reader) : null;
    }

    public async Task<User?> GetUserByEmailAsync(string email)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT id, email, username, password_hash, is_guest, profile_picture_url,
                     created_at, last_login_at, expires_at
              FROM users WHERE LOWER(email) = LOWER(@email)", conn);
        cmd.Parameters.AddWithValue("email", email);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapUser(reader) : null;
    }

    public async Task<User?> GetUserByUsernameAsync(string username)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT id, email, username, password_hash, is_guest, profile_picture_url,
                     created_at, last_login_at, expires_at
              FROM users WHERE LOWER(username) = LOWER(@username)", conn);
        cmd.Parameters.AddWithValue("username", username);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? MapUser(reader) : null;
    }

    public async Task<User> CreateUserAsync(User user)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"INSERT INTO users (id, email, username, password_hash, is_guest, profile_picture_url, expires_at)
              VALUES (@id, @email, @username, @password_hash, @is_guest, @profile_picture_url, @expires_at)
              RETURNING created_at, last_login_at", conn);
        cmd.Parameters.AddWithValue("id", user.Id);
        cmd.Parameters.AddWithValue("email", (object?)user.Email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("username", user.Username);
        cmd.Parameters.AddWithValue("password_hash", (object?)user.PasswordHash ?? DBNull.Value);
        cmd.Parameters.AddWithValue("is_guest", user.IsGuest);
        cmd.Parameters.AddWithValue("profile_picture_url", (object?)user.ProfilePictureUrl ?? DBNull.Value);
        cmd.Parameters.AddWithValue("expires_at", (object?)user.ExpiresAt ?? DBNull.Value);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        user.CreatedAt = reader.GetDateTime(0);
        user.LastLoginAt = reader.GetDateTime(1);
        return user;
    }

    public async Task UpdateLastLoginAsync(Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "UPDATE users SET last_login_at = NOW() WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", userId);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task UpdateProfileAsync(Guid userId, string username, string? profilePictureUrl)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"UPDATE users SET username = @username,
              profile_picture_url = COALESCE(@picture, profile_picture_url)
              WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", userId);
        cmd.Parameters.AddWithValue("username", username);
        cmd.Parameters.AddWithValue("picture", (object?)profilePictureUrl ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DeleteUserAsync(Guid userId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("DELETE FROM users WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", userId);
        await cmd.ExecuteNonQueryAsync();
    }

    private const string HiddenFilter = @"
              AND NOT EXISTS (
                SELECT 1 FROM user_hidden_messages h
                WHERE h.message_id = m.id AND h.user_id = @viewerId
              )";

    public async Task<List<Message>> GetGroupMessagesAsync(Guid viewerId, int limit = 100)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            $@"SELECT m.id, m.sender_id, m.recipient_id, m.content, m.message_type,
                     m.attachment_url, m.attachment_name, m.created_at,
                     m.link_url, m.link_title, m.link_description, m.link_image,
                     u.username, u.profile_picture_url
              FROM messages m
              JOIN users u ON u.id = m.sender_id
              WHERE m.recipient_id IS NULL AND m.group_id IS NULL
              {HiddenFilter}
              ORDER BY m.created_at DESC
              LIMIT @limit", conn);
        cmd.Parameters.AddWithValue("viewerId", viewerId);
        cmd.Parameters.AddWithValue("limit", limit);
        return await ReadMessagesAsync(cmd);
    }

    public async Task<List<Message>> GetDirectMessagesAsync(Guid viewerId, Guid otherUserId, int limit = 100)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            $@"SELECT m.id, m.sender_id, m.recipient_id, m.content, m.message_type,
                     m.attachment_url, m.attachment_name, m.created_at,
                     m.link_url, m.link_title, m.link_description, m.link_image,
                     u.username, u.profile_picture_url
              FROM messages m
              JOIN users u ON u.id = m.sender_id
              WHERE m.recipient_id IS NOT NULL
                AND ((m.sender_id = @userId AND m.recipient_id = @otherId)
                  OR (m.sender_id = @otherId AND m.recipient_id = @userId))
              {HiddenFilter}
              ORDER BY m.created_at DESC
              LIMIT @limit", conn);
        cmd.Parameters.AddWithValue("viewerId", viewerId);
        cmd.Parameters.AddWithValue("userId", viewerId);
        cmd.Parameters.AddWithValue("otherId", otherUserId);
        cmd.Parameters.AddWithValue("limit", limit);
        return await ReadMessagesAsync(cmd);
    }

    public async Task<Message?> GetMessageByIdAsync(Guid messageId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT id, sender_id, recipient_id, group_id, forwarded_from_id, content, message_type,
                     attachment_url, attachment_name, created_at,
                     link_url, link_title, link_description, link_image
              FROM messages WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", messageId);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;

        return new Message
        {
            Id = reader.GetGuid(0),
            SenderId = reader.GetGuid(1),
            RecipientId = reader.IsDBNull(2) ? null : reader.GetGuid(2),
            GroupId = reader.IsDBNull(3) ? null : reader.GetGuid(3),
            ForwardedFromId = reader.IsDBNull(4) ? null : reader.GetGuid(4),
            Content = reader.IsDBNull(5) ? null : reader.GetString(5),
            MessageType = reader.GetString(6),
            AttachmentUrl = reader.IsDBNull(7) ? null : reader.GetString(7),
            AttachmentName = reader.IsDBNull(8) ? null : reader.GetString(8),
            CreatedAt = reader.GetDateTime(9),
            LinkUrl = reader.IsDBNull(10) ? null : reader.GetString(10),
            LinkTitle = reader.IsDBNull(11) ? null : reader.GetString(11),
            LinkDescription = reader.IsDBNull(12) ? null : reader.GetString(12),
            LinkImage = reader.IsDBNull(13) ? null : reader.GetString(13)
        };
    }

    public async Task DeleteMessageAsync(Guid messageId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("DELETE FROM messages WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", messageId);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task HideMessageForUserAsync(Guid userId, Guid messageId)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"INSERT INTO user_hidden_messages (user_id, message_id)
              VALUES (@userId, @messageId)
              ON CONFLICT DO NOTHING", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("messageId", messageId);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<Message> InsertMessageAsync(Message message)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"INSERT INTO messages (id, sender_id, recipient_id, group_id, forwarded_from_id, content, message_type,
                                   attachment_url, attachment_name, link_url, link_title, link_description, link_image)
              VALUES (@id, @sender_id, @recipient_id, @group_id, @forwarded_from_id, @content, @message_type,
                      @attachment_url, @attachment_name, @link_url, @link_title, @link_description, @link_image)
              RETURNING created_at", conn);
        cmd.Parameters.AddWithValue("id", message.Id);
        cmd.Parameters.AddWithValue("sender_id", message.SenderId);
        cmd.Parameters.AddWithValue("recipient_id", (object?)message.RecipientId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("group_id", (object?)message.GroupId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("forwarded_from_id", (object?)message.ForwardedFromId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("content", (object?)message.Content ?? DBNull.Value);
        cmd.Parameters.AddWithValue("message_type", message.MessageType);
        cmd.Parameters.AddWithValue("attachment_url", (object?)message.AttachmentUrl ?? DBNull.Value);
        cmd.Parameters.AddWithValue("attachment_name", (object?)message.AttachmentName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("link_url", (object?)message.LinkUrl ?? DBNull.Value);
        cmd.Parameters.AddWithValue("link_title", (object?)message.LinkTitle ?? DBNull.Value);
        cmd.Parameters.AddWithValue("link_description", (object?)message.LinkDescription ?? DBNull.Value);
        cmd.Parameters.AddWithValue("link_image", (object?)message.LinkImage ?? DBNull.Value);
        message.CreatedAt = (DateTime)(await cmd.ExecuteScalarAsync())!;
        return message;
    }

    public async Task<List<string>> GetOldAttachmentUrlsAsync()
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT attachment_url FROM messages
              WHERE attachment_url IS NOT NULL AND created_at < NOW() - INTERVAL '24 hours'", conn);
        var urls = new List<string>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            urls.Add(reader.GetString(0));
        return urls;
    }

    public async Task<int> DeleteOldMessagesAsync()
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "DELETE FROM messages WHERE created_at < NOW() - INTERVAL '24 hours'", conn);
        return await cmd.ExecuteNonQueryAsync();
    }

    public async Task<List<Guid>> GetExpiredGuestIdsAsync()
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT id FROM users WHERE is_guest = TRUE AND expires_at < NOW()", conn);
        var ids = new List<Guid>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            ids.Add(reader.GetGuid(0));
        return ids;
    }

    public async Task<List<(Guid UserId, string Username, string? ProfilePictureUrl, bool IsGuest, DateTime LastMessageAt, string? Content, string MessageType)>> GetRecentDirectChatsAsync(Guid userId, int limit = 20)
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT other_user_id, username, profile_picture_url, is_guest, created_at, content, message_type
              FROM (
                SELECT
                  CASE WHEN m.sender_id = @userId THEN m.recipient_id ELSE m.sender_id END AS other_user_id,
                  u.username,
                  u.profile_picture_url,
                  u.is_guest,
                  m.created_at,
                  m.content,
                  m.message_type,
                  ROW_NUMBER() OVER (
                    PARTITION BY CASE WHEN m.sender_id = @userId THEN m.recipient_id ELSE m.sender_id END
                    ORDER BY m.created_at DESC
                  ) AS rn
                FROM messages m
                JOIN users u ON u.id = CASE WHEN m.sender_id = @userId THEN m.recipient_id ELSE m.sender_id END
                WHERE m.recipient_id IS NOT NULL
                  AND (m.sender_id = @userId OR m.recipient_id = @userId)
                  AND NOT EXISTS (
                    SELECT 1 FROM user_hidden_messages h
                    WHERE h.message_id = m.id AND h.user_id = @userId
                  )
              ) recent
              WHERE rn = 1
              ORDER BY created_at DESC
              LIMIT @limit", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("limit", limit);

        var results = new List<(Guid, string, string?, bool, DateTime, string?, string)>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add((
                reader.GetGuid(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.GetBoolean(3),
                reader.GetDateTime(4),
                reader.IsDBNull(5) ? null : reader.GetString(5),
                reader.GetString(6)
            ));
        }
        return results;
    }

    public async Task<List<User>> GetAllUsersAsync()
    {
        await using var conn = CreateConnection();
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            @"SELECT id, email, username, password_hash, is_guest, profile_picture_url,
                     created_at, last_login_at, expires_at
              FROM users
              WHERE is_guest = FALSE OR expires_at > NOW()
              ORDER BY username", conn);
        var users = new List<User>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            users.Add(MapUser(reader));
        return users;
    }

    private static User MapUser(NpgsqlDataReader reader) => new()
    {
        Id = reader.GetGuid(0),
        Email = reader.IsDBNull(1) ? null : reader.GetString(1),
        Username = reader.GetString(2),
        PasswordHash = reader.IsDBNull(3) ? null : reader.GetString(3),
        IsGuest = reader.GetBoolean(4),
        ProfilePictureUrl = reader.IsDBNull(5) ? null : reader.GetString(5),
        CreatedAt = reader.GetDateTime(6),
        LastLoginAt = reader.GetDateTime(7),
        ExpiresAt = reader.IsDBNull(8) ? null : reader.GetDateTime(8)
    };

    private static async Task<List<Message>> ReadMessagesAsync(NpgsqlCommand cmd)
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
                SenderProfilePicture = reader.IsDBNull(13) ? null : reader.GetString(13)
            });
        }
        messages.Reverse();
        return messages;
    }
}
