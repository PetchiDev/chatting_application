-- Per-user hidden messages (delete for me)
CREATE TABLE IF NOT EXISTS user_hidden_messages (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_hidden_messages_user ON user_hidden_messages (user_id);
