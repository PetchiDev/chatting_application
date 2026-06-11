-- Link preview columns for WhatsApp-style URL cards
ALTER TABLE messages ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS link_title TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS link_description TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS link_image TEXT;
