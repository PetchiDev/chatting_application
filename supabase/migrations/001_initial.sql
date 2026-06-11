-- Ephemeral Chat App - Supabase Schema
-- Run this in Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    is_guest BOOLEAN NOT NULL DEFAULT FALSE,
    profile_picture_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    CONSTRAINT email_or_guest CHECK (
        is_guest = TRUE OR email IS NOT NULL
    )
);

CREATE INDEX idx_users_username ON users (LOWER(username));
CREATE INDEX idx_users_email ON users (LOWER(email));
CREATE INDEX idx_users_expires_at ON users (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'audio')),
    attachment_url TEXT,
    attachment_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_group ON messages (created_at DESC) WHERE recipient_id IS NULL;
CREATE INDEX idx_messages_dm ON messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_messages_created_at ON messages (created_at);

-- Storage bucket (run in Supabase Dashboard > Storage or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true);

-- Optional: pg_cron cleanup (enable pg_cron extension in Supabase first)
-- SELECT cron.schedule('cleanup-old-messages', '0 * * * *', $$
--   DELETE FROM messages WHERE created_at < NOW() - INTERVAL '24 hours';
-- $$);

-- SELECT cron.schedule('cleanup-expired-guests', '*/15 * * * *', $$
--   DELETE FROM users WHERE is_guest = TRUE AND expires_at < NOW();
-- $$);
