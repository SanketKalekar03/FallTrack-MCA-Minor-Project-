-- ============================================================================
-- FallTrack Production Dummy Data Seed for Current Month (October 2026)
-- ============================================================================
-- Starting: 1st October 2026
-- Cadence: Strictly 1-day gap between each production entry
-- Dates: Oct 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21
-- Quantities: Exact multiples of 12 (clean dozen equivalents)
-- Multi-Tenant Safe: Targets specified user email or active user
-- ============================================================================

DO $$
DECLARE
    target_user_id UUID;
    target_email TEXT := 'sohammohite001@gmail.com';
    
    -- Color UUIDs
    c_rani UUID;
    c_lal UUID;
    c_pandhra UUID;
    c_keshari UUID;
    c_nila UUID;
    c_hirva UUID;
    c_pivla UUID;
    c_gulabi UUID;
    c_kala UUID;
    c_rajwadi UUID;
    c_morpankhi UUID;
    c_jambhla UUID;
    
    ins_count INT := 0;
BEGIN
    -- 1. Locate the target user ID from Supabase auth.users
    SELECT id INTO target_user_id 
    FROM auth.users 
    WHERE lower(email) = lower(target_email);

    -- Fallback: If specific email not found, use the latest active user
    IF target_user_id IS NULL THEN
        SELECT id INTO target_user_id 
        FROM auth.users 
        ORDER BY created_at DESC 
        LIMIT 1;
    END IF;

    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'No user found in auth.users. Please log in or register first.';
    END IF;

    -- 2. Lookup Color IDs from colors table
    SELECT id INTO c_rani FROM colors WHERE name = 'राणी' LIMIT 1;
    SELECT id INTO c_lal FROM colors WHERE name = 'लाल' LIMIT 1;
    SELECT id INTO c_pandhra FROM colors WHERE name = 'पांढरा' LIMIT 1;
    SELECT id INTO c_keshari FROM colors WHERE name = 'केशरी' LIMIT 1;
    SELECT id INTO c_nila FROM colors WHERE name = 'निळा' LIMIT 1;
    SELECT id INTO c_hirva FROM colors WHERE name = 'हिरवा' LIMIT 1;
    SELECT id INTO c_pivla FROM colors WHERE name = 'पिवळा' LIMIT 1;
    SELECT id INTO c_gulabi FROM colors WHERE name = 'गुलाबी' LIMIT 1;
    SELECT id INTO c_kala FROM colors WHERE name = 'काळा' LIMIT 1;
    SELECT id INTO c_rajwadi FROM colors WHERE name = 'राजवाडी' LIMIT 1;
    SELECT id INTO c_morpankhi FROM colors WHERE name = 'मोरपंखी' LIMIT 1;
    SELECT id INTO c_jambhla FROM colors WHERE name = 'जांभळा' LIMIT 1;

    -- 3. Clear any existing entries for October 2026 for this user to prevent duplicate stacking
    DELETE FROM production_entries 
    WHERE user_id = target_user_id 
      AND entry_date >= '2026-10-01' 
      AND entry_date <= '2026-10-31';

    -- 4. Insert Production Entries with strict 1-day gaps
    -- 2026-10-01 (Day 1)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_rani, 240, '2026-10-01'),
    (target_user_id, c_lal, 180, '2026-10-01');

    -- 2026-10-03 (Day 3 - 1 day gap after Oct 1)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_pandhra, 300, '2026-10-03'),
    (target_user_id, c_keshari, 180, '2026-10-03');

    -- 2026-10-05 (Day 5 - 1 day gap after Oct 3)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_nila, 240, '2026-10-05'),
    (target_user_id, c_hirva, 240, '2026-10-05');

    -- 2026-10-07 (Day 7 - 1 day gap after Oct 5)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_pivla, 300, '2026-10-07'),
    (target_user_id, c_gulabi, 120, '2026-10-07');

    -- 2026-10-09 (Day 9 - 1 day gap after Oct 7)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_rajwadi, 360, '2026-10-09'),
    (target_user_id, c_morpankhi, 240, '2026-10-09');

    -- 2026-10-11 (Day 11 - 1 day gap after Oct 9)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_jambhla, 240, '2026-10-11'),
    (target_user_id, c_rani, 180, '2026-10-11');

    -- 2026-10-13 (Day 13 - 1 day gap after Oct 11)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_lal, 300, '2026-10-13'),
    (target_user_id, c_pandhra, 240, '2026-10-13');

    -- 2026-10-15 (Day 15 - 1 day gap after Oct 13)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_keshari, 180, '2026-10-15'),
    (target_user_id, c_nila, 300, '2026-10-15');

    -- 2026-10-17 (Day 17 - 1 day gap after Oct 15)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_hirva, 360, '2026-10-17'),
    (target_user_id, c_kala, 120, '2026-10-17');

    -- 2026-10-19 (Day 19 - 1 day gap after Oct 17)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_morpankhi, 300, '2026-10-19'),
    (target_user_id, c_pivla, 180, '2026-10-19');

    -- 2026-10-21 (Day 21 - 1 day gap after Oct 19 - Today)
    INSERT INTO production_entries (user_id, color_id, quantity, entry_date) VALUES
    (target_user_id, c_rani, 240, '2026-10-21'),
    (target_user_id, c_rajwadi, 180, '2026-10-21');

    GET DIAGNOSTICS ins_count = ROW_COUNT;
    RAISE NOTICE 'Finished seeding dummy production data for user ID: %', target_user_id;
    RAISE NOTICE 'Dates: Oct 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21 (1-day gap).';
END $$;
