import React, { useState, useEffect } from 'react';
import { noRunnersAvailableService, NoRunnersAvailableNotification } from '../services/NoRunnersAvailableService';
import { supabase } from '../lib/supabase';

const NoRunnersAvailableModalWeb: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [notification, setNotification] = useState<NoRunnersAvailableNotification | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errandStatus, setErrandStatus] = useState<string | null>(null);
  const [commissionStatus, setCommissionStatus] = useState<string | null>(null);

  useEffect(() => {
    console.log('NoRunnersAvailableModalWeb: Setting up subscription');
    const unsubscribe = noRunnersAvailableService.subscribe(async (newNotification) => {
      console.log('NoRunnersAvailableModalWeb: Received notification:', newNotification);
      if (newNotification) {
        setNotification(newNotification);
        setVisible(true);
        
        // Fetch errand status and timeout_runner_ids to determine if it's Situation 1 (cancelled immediately) or Situation 2 (cancelled due to timeout)
        if (newNotification.type === 'errand' && newNotification.errandId) {
          try {
            const numericId = typeof newNotification.errandId === 'string' 
              ? parseInt(newNotification.errandId, 10) 
              : newNotification.errandId;
            
            if (!isNaN(numericId)) {
              const { data: errandData } = await supabase
                .from('errand')
                .select('status, timeout_runner_ids')
                .eq('id', numericId)
                .single();
              
              if (errandData) {
                setErrandStatus(errandData.status);
                // Situation 1: cancelled immediately (no timeout_runner_ids)
                // Situation 2: cancelled due to timeout (has timeout_runner_ids) OR pending
                // The modal will use status to determine behavior, but we need to distinguish
                // cancelled without timeout (Situation 1) vs cancelled with timeout (Situation 2)
                // For Situation 2, status can be 'pending' or 'cancelled' with timeout_runner_ids
              }
            }
          } catch (error) {
            console.error('NoRunnersAvailableModalWeb: Error fetching errand status:', error);
          }
        }
        
        // Fetch commission status to determine if it's Situation 1 (cancelled) or Scenario 2 (pending)
        if (newNotification.type === 'commission' && newNotification.commissionId) {
          try {
            const numericId = typeof newNotification.commissionId === 'string' 
              ? parseInt(newNotification.commissionId, 10) 
              : newNotification.commissionId;
            
            if (!isNaN(numericId)) {
              const { data: commissionData } = await supabase
                .from('commission')
                .select('status')
                .eq('id', numericId)
                .single();
              
              if (commissionData) {
                setCommissionStatus(commissionData.status);
              }
            }
          } catch (error) {
            console.error('NoRunnersAvailableModalWeb: Error fetching commission status:', error);
          }
        }
      } else {
        setVisible(false);
        setNotification(null);
        setErrandStatus(null);
        setCommissionStatus(null);
      }
    });

    return unsubscribe;
  }, []);

  const handleClose = async () => {
    if (deleting || !notification) return;
    
    const isErrand = notification.type === 'errand';
    const isCommission = notification.type === 'commission';
    
    // For errands: Always just close modal (both Situation 1 and Situation 2)
    // Do NOT delete errands anymore
    if (isErrand) {
      console.log('[NoRunnersAvailableModalWeb] Errand modal closed - errand remains in database');
      setVisible(false);
      setNotification(null);
      setErrandStatus(null);
      setCommissionStatus(null);
      setDeleting(false);
      noRunnersAvailableService.clearNotification();
      return;
    }
    
    // Commission logic remains unchanged
    const isCommissionSituation1 = isCommission && commissionStatus === 'cancelled';
    
    if (isCommissionSituation1) {
      console.log('[NoRunnersAvailableModalWeb] Commission Situation 1 detected - skipping deletion, commission remains cancelled');
      setVisible(false);
      setNotification(null);
      setErrandStatus(null);
      setCommissionStatus(null);
      setDeleting(false);
      noRunnersAvailableService.clearNotification();
      return;
    }
    
    // Commission Scenario 2 (Timeout): Proceed with deletion
    setDeleting(true);
    let shouldClose = true;
    
    try {
      const itemId = notification.commissionId;
      const tableName = 'commission';
      const itemType = 'commission';
      
      console.log(`[NoRunnersAvailableModalWeb] Attempting to delete ${itemType}:`, itemId, typeof itemId);
      
      // Ensure itemId is a number
      if (itemId === undefined) {
        console.error(`[NoRunnersAvailableModalWeb] ${itemType} ID is undefined`);
        alert(`Invalid ${itemType} ID. Please try again.`);
        shouldClose = false;
        return;
      }
      
      const numericId = typeof itemId === 'string' ? parseInt(itemId, 10) : itemId;
      
      if (isNaN(numericId)) {
        console.error(`[NoRunnersAvailableModalWeb] Invalid ${itemType} ID:`, itemId);
        alert(`Invalid ${itemType} ID. Please try again.`);
        shouldClose = false;
      } else {
        // Get current user to verify permissions
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          console.error('[NoRunnersAvailableModalWeb] Auth error:', authError);
          alert('Authentication error. Please try again.');
          shouldClose = false;
        } else {
          // Verify the item belongs to the current user and is in pending status before deleting
          const { data: itemCheck, error: checkError } = await supabase
            .from(tableName)
            .select('id, buddycaller_id, status')
            .eq('id', numericId)
            .single();

          if (checkError) {
            // Check if it's a "not found" error - item might already be deleted
            if (checkError.code === 'PGRST116') {
              console.log(`[NoRunnersAvailableModalWeb] ${itemType} not found - may already be deleted`);
              // Item already deleted, proceed to close
            } else {
              console.error(`[NoRunnersAvailableModalWeb] Error checking ${itemType}:`, checkError);
              alert(`Error: ${checkError.message || `Unable to verify ${itemType}`}`);
              shouldClose = false;
            }
          } else if (!itemCheck) {
            console.log(`[NoRunnersAvailableModalWeb] ${itemType} not found - may already be deleted`);
            // Item already deleted, proceed to close
          } else if (itemCheck.buddycaller_id !== user.id) {
            console.error(`[NoRunnersAvailableModalWeb] Permission denied: ${itemType} does not belong to user`);
            alert(`Permission denied. This ${itemType} does not belong to you.`);
            shouldClose = false;
          } else {
            // Verify item is in pending status (should be, since all runners timed out)
            if (itemCheck.status !== 'pending') {
              console.warn(`[NoRunnersAvailableModalWeb] ${itemType} status is not pending:`, itemCheck.status);
              // Still allow deletion, but log the warning
            }

            // Proceed with deletion - delete only if it belongs to the user
            // Allow deletion of both 'pending' and 'cancelled' status (cancelled when no runners available)
            console.log(`[NoRunnersAvailableModalWeb] Deleting ${itemType} with ID:`, numericId);
            const { data: deletedData, error: deleteError } = await supabase
              .from(tableName)
              .delete()
              .eq('id', numericId)
              .eq('buddycaller_id', user.id)
              .in('status', ['pending', 'cancelled'])
              .select();

            if (deleteError) {
              console.error(`[NoRunnersAvailableModalWeb] Delete error:`, deleteError);
              console.error(`[NoRunnersAvailableModalWeb] Delete error details:`, JSON.stringify(deleteError, null, 2));
              alert(`Failed to delete ${itemType}: ${deleteError.message || 'Unknown error'}`);
              shouldClose = false;
            } else if (!deletedData || deletedData.length === 0) {
              // No rows were deleted - this means either:
              // 1. Item doesn't exist (already deleted)
              // 2. Item doesn't belong to user (RLS policy blocked it)
              // 3. RLS policy is preventing deletion
              console.warn(`[NoRunnersAvailableModalWeb] No rows deleted - verifying ${itemType} still exists...`);
              
              // Verify if item still exists
              const { data: verifyData, error: verifyError } = await supabase
                .from(tableName)
                .select('id')
                .eq('id', numericId)
                .single();
              
              if (!verifyError && verifyData) {
                // Item still exists - deletion failed
                console.error(`[NoRunnersAvailableModalWeb] ${itemType} still exists after delete attempt - deletion failed`);
                alert(`Failed to delete ${itemType}. It may be protected or you may not have permission.`);
                shouldClose = false;
              } else {
                // Item doesn't exist - either already deleted or deletion succeeded
                console.log(`[NoRunnersAvailableModalWeb] ${itemType} no longer exists - deletion succeeded or was already deleted`);
              }
            } else {
              console.log(`[NoRunnersAvailableModalWeb] ✅ ${itemType} deleted successfully:`, numericId);
              console.log(`[NoRunnersAvailableModalWeb] Deleted data:`, deletedData);
              
              // Give the database a moment to propagate the change
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Verify deletion one more time
              const { data: verifyData, error: verifyError } = await supabase
                .from(tableName)
                .select('id')
                .eq('id', numericId)
                .single();
              
              if (!verifyError && verifyData) {
                console.error(`[NoRunnersAvailableModalWeb] ${itemType} still exists after deletion - this should not happen`);
                alert(`${itemType} deletion may have failed. Please refresh the page.`);
                shouldClose = false;
              } else {
                console.log(`[NoRunnersAvailableModalWeb] ✅ Verified: ${itemType} successfully deleted`);
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[NoRunnersAvailableModalWeb] Unexpected error:', error);
      console.error('[NoRunnersAvailableModalWeb] Error stack:', error?.stack);
      const itemType = 'commission';
      alert(`Failed to delete ${itemType}: ${error?.message || 'Unknown error'}`);
      shouldClose = false;
    } finally {
      if (shouldClose) {
        setVisible(false);
        setNotification(null);
        setErrandStatus(null);
        setCommissionStatus(null);
        setDeleting(false);
        noRunnersAvailableService.clearNotification();
      } else {
        setDeleting(false);
      }
    }
  };

  if (!visible || !notification) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        padding: '20px',
      }}
      onClick={handleClose}
    >
      <div 
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Icon */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          {/* Icon Container */}
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '40px',
            backgroundColor: '#fef3c7',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '16px',
          }}>
            <svg 
              style={{ width: '48px', height: '48px' }}
              fill="none"
              stroke="#f59e0b"
              viewBox="0 0 24 24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>

          {/* Title */}
          <h2 style={{
            fontSize: '22px',
            fontWeight: '700',
            color: '#531010',
            textAlign: 'center',
            margin: 0,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}>
            No Runners Available
          </h2>
          {notification.type === 'errand' && notification.errandTitle && (
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              marginTop: '8px',
              marginBottom: 0,
              lineHeight: '20px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            }}>
              Errand: <strong style={{ fontWeight: '600', color: '#531010' }}>{notification.errandTitle}</strong>
            </p>
          )}
          {notification.type === 'commission' && notification.commissionTitle && (
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              marginTop: '8px',
              marginBottom: 0,
              lineHeight: '20px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            }}>
              Commission: <strong style={{ fontWeight: '600', color: '#531010' }}>{notification.commissionTitle}</strong>
            </p>
          )}
        </div>

        {/* Content */}
        <div style={{
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: '16px',
            color: '#531010',
            textAlign: 'center',
            marginBottom: '12px',
            fontWeight: '600',
            margin: '0 0 12px 0',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}>
            There are no runners available at the moment.
          </p>
          {(notification.type === 'errand' && errandStatus === 'cancelled') || (notification.type === 'commission' && commissionStatus === 'cancelled') ? (
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              lineHeight: '20px',
              margin: 0,
              fontWeight: '400',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            }}>
              You may try posting your {notification.type === 'errand' ? 'errand' : 'commission'} again later.
            </p>
          ) : (
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              lineHeight: '20px',
              margin: 0,
              fontWeight: '400',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            }}>
              Your {notification.type === 'errand' ? 'errand' : 'commission'} &quot;{notification.type === 'errand' ? notification.errandTitle : notification.commissionTitle}&quot; will be removed from your requests.
            </p>
          )}
        </div>

        {/* Button */}
        <button
          onClick={handleClose}
          disabled={deleting}
          style={{
            width: '100%',
            backgroundColor: deleting ? '#6b0000' : '#8B0000',
            color: '#fff',
            fontSize: '16px',
            fontWeight: '700',
            padding: '14px 24px',
            borderRadius: '12px',
            border: 'none',
            cursor: deleting ? 'not-allowed' : 'pointer',
            opacity: deleting ? 0.7 : 1,
            transition: 'background-color 0.2s',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
          onMouseEnter={(e) => {
            if (!deleting) {
              e.currentTarget.style.backgroundColor = '#6B0000';
            }
          }}
          onMouseLeave={(e) => {
            if (!deleting) {
              e.currentTarget.style.backgroundColor = '#8B0000';
            }
          }}
        >
          {deleting ? 'Removing...' : 'OK'}
        </button>
      </div>
    </div>
  );
};

export default NoRunnersAvailableModalWeb;
