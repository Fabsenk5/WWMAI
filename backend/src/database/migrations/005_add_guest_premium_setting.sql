INSERT INTO system_settings (key, value) VALUES ('global_guest_premium_unlocked', 'false') ON CONFLICT (key) DO NOTHING;
