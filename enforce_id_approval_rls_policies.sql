-- ============================================================================
-- ENFORCE STUDENT ID APPROVAL - ROW LEVEL SECURITY POLICIES
-- ============================================================================
-- 
-- Purpose: Prevent students with Pending or Disapproved ID status from
--          inserting errands or commissions at the database level.
-- 
-- Security: This provides backend protection even if frontend checks are bypassed.
--
-- Admin Exemption: Admin users are always allowed (role = 'admin')
-- Approved Students: Students with id_image_approved = true are allowed
-- Pending/Disapproved: Students with id_image_approved = NULL or false are blocked
-- ============================================================================

-- Enable RLS on errand table (if not already enabled)
ALTER TABLE errand ENABLE ROW LEVEL SECURITY;

-- Enable RLS on commission table (if not already enabled)
ALTER TABLE commission ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ERRAND TABLE POLICIES
-- ============================================================================

-- Drop existing INSERT policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Only approved users can post errands" ON errand;

-- Create policy: Only allow INSERTs into errand table if:
-- 1. User is an admin (role = 'admin'), OR
-- 2. User has uploaded an ID (id_image_path IS NOT NULL) AND ID is approved (id_image_approved = true)
CREATE POLICY "Only approved users can post errands"
ON errand
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND (
            -- Admin users are always allowed
            users.role = 'admin'
            OR (
                -- Students must have uploaded ID and have it approved
                users.id_image_path IS NOT NULL
                AND users.id_image_approved = true
            )
        )
    )
);

-- ============================================================================
-- COMMISSION TABLE POLICIES
-- ============================================================================

-- Drop existing INSERT policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Only approved users can post commissions" ON commission;

-- Create policy: Only allow INSERTs into commission table if:
-- 1. User is an admin (role = 'admin'), OR
-- 2. User has uploaded an ID (id_image_path IS NOT NULL) AND ID is approved (id_image_approved = true)
CREATE POLICY "Only approved users can post commissions"
ON commission
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND (
            -- Admin users are always allowed
            users.role = 'admin'
            OR (
                -- Students must have uploaded ID and have it approved
                users.id_image_path IS NOT NULL
                AND users.id_image_approved = true
            )
        )
    )
);

-- ============================================================================
-- VERIFICATION QUERIES (Optional - for testing)
-- ============================================================================
-- 
-- To verify the policies are working:
--
-- 1. Test as approved student:
--    INSERT INTO errand (buddycaller_id, title, description, category, status)
--    VALUES ('<approved_student_id>', 'Test', 'Test', 'Other', 'pending');
--    -- Should succeed
--
-- 2. Test as pending student:
--    INSERT INTO errand (buddycaller_id, title, description, category, status)
--    VALUES ('<pending_student_id>', 'Test', 'Test', 'Other', 'pending');
--    -- Should fail with: "new row violates row-level security policy"
--
-- 3. Test as disapproved student:
--    INSERT INTO errand (buddycaller_id, title, description, category, status)
--    VALUES ('<disapproved_student_id>', 'Test', 'Test', 'Other', 'pending');
--    -- Should fail with: "new row violates row-level security policy"
--
-- 4. Test as admin:
--    INSERT INTO errand (buddycaller_id, title, description, category, status)
--    VALUES ('<admin_id>', 'Test', 'Test', 'Other', 'pending');
--    -- Should succeed (admin exemption)
-- ============================================================================

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- 1. These policies only affect INSERT operations. SELECT, UPDATE, DELETE
--    operations are controlled by other RLS policies (if any).
--
-- 2. The policies use auth.uid() which is automatically provided by Supabase
--    for authenticated requests.
--
-- 3. If you need to modify these policies later, use:
--    DROP POLICY "policy_name" ON table_name;
--    Then recreate with new conditions.
--
-- 4. To disable RLS (not recommended for production):
--    ALTER TABLE errand DISABLE ROW LEVEL SECURITY;
--    ALTER TABLE commission DISABLE ROW LEVEL SECURITY;
--
-- ============================================================================
