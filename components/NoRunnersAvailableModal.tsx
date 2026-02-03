import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { noRunnersAvailableService, NoRunnersAvailableNotification } from '../services/NoRunnersAvailableService';
import { supabase } from '../lib/supabase';

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    pillText: "#FFFFFF",
    pillTextActive: "#1e293b",
    faint: "#F7F1F0",
};

const NoRunnersAvailableModal: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [notification, setNotification] = useState<NoRunnersAvailableNotification | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    console.log('NoRunnersAvailableModal: Setting up subscription');
    const unsubscribe = noRunnersAvailableService.subscribe((newNotification) => {
      console.log('NoRunnersAvailableModal: Received notification:', newNotification);
      if (newNotification) {
        setNotification(newNotification);
        setVisible(true);
      } else {
        setVisible(false);
        setNotification(null);
      }
    });

    return unsubscribe;
  }, []);

  const handleClose = async () => {
    if (deleting || !notification) return;
    
    setDeleting(true);
    let shouldClose = true;
    
    try {
      const isErrand = notification.type === 'errand';
      const itemId = isErrand ? notification.errandId : notification.commissionId;
      const tableName = isErrand ? 'errand' : 'commission';
      const itemType = isErrand ? 'errand' : 'commission';
      
      console.log(`[NoRunnersAvailableModal] Attempting to delete ${itemType}:`, itemId, typeof itemId);
      
      // Ensure itemId is a number
      if (itemId === undefined) {
        console.error(`[NoRunnersAvailableModal] ${itemType} ID is undefined`);
        alert(`Invalid ${itemType} ID. Please try again.`);
        shouldClose = false;
        return;
      }
      
      const numericId = typeof itemId === 'string' ? parseInt(itemId, 10) : itemId;
      
      if (isNaN(numericId)) {
        console.error(`[NoRunnersAvailableModal] Invalid ${itemType} ID:`, itemId);
        alert(`Invalid ${itemType} ID. Please try again.`);
        shouldClose = false;
      } else {
        // Get current user to verify permissions
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          console.error('[NoRunnersAvailableModal] Auth error:', authError);
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
              console.log(`[NoRunnersAvailableModal] ${itemType} not found - may already be deleted`);
              // Item already deleted, proceed to close
            } else {
              console.error(`[NoRunnersAvailableModal] Error checking ${itemType}:`, checkError);
              alert(`Error: ${checkError.message || `Unable to verify ${itemType}`}`);
              shouldClose = false;
            }
          } else if (!itemCheck) {
            console.log(`[NoRunnersAvailableModal] ${itemType} not found - may already be deleted`);
            // Item already deleted, proceed to close
          } else if (itemCheck.buddycaller_id !== user.id) {
            console.error(`[NoRunnersAvailableModal] Permission denied: ${itemType} does not belong to user`);
            alert(`Permission denied. This ${itemType} does not belong to you.`);
            shouldClose = false;
          } else {
            // Verify item is in pending status (should be, since all runners timed out)
            if (itemCheck.status !== 'pending') {
              console.warn(`[NoRunnersAvailableModal] ${itemType} status is not pending:`, itemCheck.status);
              // Still allow deletion, but log the warning
            }

            // Proceed with deletion - delete only if it belongs to the user
            // Allow deletion of both 'pending' and 'cancelled' status (cancelled when no runners available)
            console.log(`[NoRunnersAvailableModal] Deleting ${itemType} with ID:`, numericId);
            const { data: deletedData, error: deleteError } = await supabase
              .from(tableName)
              .delete()
              .eq('id', numericId)
              .eq('buddycaller_id', user.id)
              .in('status', ['pending', 'cancelled'])
              .select();

            if (deleteError) {
              console.error(`[NoRunnersAvailableModal] Delete error:`, deleteError);
              console.error(`[NoRunnersAvailableModal] Delete error details:`, JSON.stringify(deleteError, null, 2));
              alert(`Failed to delete ${itemType}: ${deleteError.message || 'Unknown error'}`);
              shouldClose = false;
            } else if (!deletedData || deletedData.length === 0) {
              // No rows were deleted - this means either:
              // 1. Item doesn't exist (already deleted)
              // 2. Item doesn't belong to user (RLS policy blocked it)
              // 3. RLS policy is preventing deletion
              console.warn(`[NoRunnersAvailableModal] No rows deleted - verifying ${itemType} still exists...`);
              
              // Verify if item still exists
              const { data: verifyData, error: verifyError } = await supabase
                .from(tableName)
                .select('id')
                .eq('id', numericId)
                .single();
              
              if (!verifyError && verifyData) {
                // Item still exists - deletion failed
                console.error(`[NoRunnersAvailableModal] ${itemType} still exists after delete attempt - deletion failed`);
                alert(`Failed to delete ${itemType}. It may be protected or you may not have permission.`);
                shouldClose = false;
              } else {
                // Item doesn't exist - either already deleted or deletion succeeded
                console.log(`[NoRunnersAvailableModal] ${itemType} no longer exists - deletion succeeded or was already deleted`);
              }
            } else {
              console.log(`[NoRunnersAvailableModal] ✅ ${itemType} deleted successfully:`, numericId);
              console.log(`[NoRunnersAvailableModal] Deleted data:`, deletedData);
              
              // Give the database a moment to propagate the change
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Verify deletion one more time
              const { data: verifyData, error: verifyError } = await supabase
                .from(tableName)
                .select('id')
                .eq('id', numericId)
                .single();
              
              if (!verifyError && verifyData) {
                console.error(`[NoRunnersAvailableModal] ${itemType} still exists after deletion - this should not happen`);
                alert(`${itemType} deletion may have failed. Please refresh the page.`);
                shouldClose = false;
              } else {
                console.log(`[NoRunnersAvailableModal] ✅ Verified: ${itemType} successfully deleted`);
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[NoRunnersAvailableModal] Unexpected error:', error);
      console.error('[NoRunnersAvailableModal] Error stack:', error?.stack);
      const itemType = notification?.type === 'errand' ? 'errand' : 'commission';
      alert(`Failed to delete ${itemType}: ${error?.message || 'Unknown error'}`);
      shouldClose = false;
    } finally {
      if (shouldClose) {
        setVisible(false);
        setNotification(null);
        setDeleting(false);
        noRunnersAvailableService.clearNotification();
      } else {
        setDeleting(false);
      }
    }
  };

  if (!visible || !notification) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="alert-circle" size={48} color="#f59e0b" />
            </View>
            <Text style={styles.title}>No Runners Available</Text>
          </View>

          <View style={styles.content}>
            <Text style={styles.message}>
              There are no runners available at the moment.
            </Text>
            <Text style={styles.subMessage}>
              Your {notification.type === 'errand' ? 'errand' : 'commission'} "{notification.type === 'errand' ? notification.errandTitle : notification.commissionTitle}" will be removed from your requests.
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.okButton]} 
              onPress={handleClose}
              disabled={deleting}
            >
              <Text style={styles.okButtonText}>
                {deleting ? 'Removing...' : 'OK'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  content: {
    marginBottom: 24,
    alignItems: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  subMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okButton: {
    backgroundColor: colors.maroon,
  },
  okButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default NoRunnersAvailableModal;
