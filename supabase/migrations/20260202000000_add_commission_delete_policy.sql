-- ============================================================================
-- COMMISSION DELETE RLS POLICY
-- ============================================================================
-- 
-- Purpose: Allow commission owners to delete their own commissions
--          when status is 'pending' or 'cancelled'
-- 
-- Security: Only the commission owner (buddycaller_id) can delete,
--          and only when the commission is in a deletable state
-- ============================================================================

-- Drop existing DELETE policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Owners can delete pending or cancelled commissions" ON commission;

-- Create policy: Allow DELETE on commission table if:
-- 1. User is the commission owner (buddycaller_id = auth.uid())
-- 2. Commission status is 'pending' OR 'cancelled'
CREATE POLICY "Owners can delete pending or cancelled commissions"
ON commission
FOR DELETE
TO authenticated
USING (
  buddycaller_id = auth.uid()
  AND status IN ('pending', 'cancelled')
);

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- This policy allows:
-- - Commission owners to delete their own commissions
-- - Only when status is 'pending' or 'cancelled'
--
-- This policy blocks:
-- - Deleting commissions owned by other users
-- - Deleting commissions with other statuses (accepted, in_progress, completed, etc.)
-- - Unauthenticated users from deleting commissions
--
-- ============================================================================
