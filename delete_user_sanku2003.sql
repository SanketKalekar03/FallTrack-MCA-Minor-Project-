-- ============================================================================
-- Permanently Delete User: sanku2003@gmail.com
-- ============================================================================
-- Run this script in the Supabase SQL Editor to permanently delete the account
-- and clean up all associated data without foreign key constraint errors.
-- ============================================================================

DO $$
DECLARE
    target_user_id UUID;
    target_email TEXT := 'sanku2003@gmail.com';
    del_entries INT := 0;
    del_rates INT := 0;
    del_periods INT := 0;
    del_profile INT := 0;
    del_colors INT := 0;
BEGIN
    -- 1. Locate the user's auth ID
    SELECT id INTO target_user_id 
    FROM auth.users 
    WHERE lower(email) = lower(target_email);

    IF target_user_id IS NOT NULL THEN
        -- 2. Delete production entries
        DELETE FROM production_entries WHERE user_id = target_user_id;
        GET DIAGNOSTICS del_entries = ROW_COUNT;

        -- 3. Delete rates
        DELETE FROM rates WHERE user_id = target_user_id;
        GET DIAGNOSTICS del_rates = ROW_COUNT;

        -- 4. Delete income periods
        DELETE FROM income_periods WHERE user_id = target_user_id;
        GET DIAGNOSTICS del_periods = ROW_COUNT;

        -- 5. Delete profile record
        DELETE FROM profile WHERE user_id = target_user_id;
        GET DIAGNOSTICS del_profile = ROW_COUNT;

        -- 6. Delete custom colors created by this user
        DELETE FROM colors WHERE user_id = target_user_id;
        GET DIAGNOSTICS del_colors = ROW_COUNT;

        -- 7. Permanently delete the user from Supabase Auth
        DELETE FROM auth.users WHERE id = target_user_id;

        RAISE NOTICE 'Deleted user: % (ID: %)', target_email, target_user_id;
        RAISE NOTICE 'Cleaned up: % production entries, % rates, % income periods, % profiles, % custom colors.',
            del_entries, del_rates, del_periods, del_profile, del_colors;
    ELSE
        RAISE NOTICE 'User % was not found in auth.users. The account may already be deleted.', target_email;
    END IF;
END $$;

-- Verification: Ensure user is completely gone
SELECT id, email, created_at 
FROM auth.users 
WHERE lower(email) = lower('sanku2003@gmail.com');
