import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { approvalModalService } from '../services/ApprovalModalService';
import { TaskApprovalNotification } from '../services/GlobalNotificationService';
import { supabase } from '../lib/supabase';
import RateAndFeedbackModal from './RateAndFeedbackModal';

const SimpleTaskApprovalModal: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [notification, setNotification] = useState<TaskApprovalNotification | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showRateAndFeedback, setShowRateAndFeedback] = useState(false);

  if (__DEV__) {
  console.log('SimpleTaskApprovalModal: Component rendering - visible:', visible, 'notification:', notification);
  console.log('SimpleTaskApprovalModal: Platform check - should render on mobile');
  }

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
          if (__DEV__) console.log('SimpleTaskApprovalModal: Current user ID:', user.id);
        }
      } catch (error) {
        console.error('SimpleTaskApprovalModal: Error getting current user:', error);
      }
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (__DEV__) {
    console.log('SimpleTaskApprovalModal: Component mounted and setting up subscription');
    console.log('SimpleTaskApprovalModal: Current listener count:', approvalModalService.getListenerCount());
    }
    
    const unsubscribe = approvalModalService.subscribe((newNotification) => {
      if (__DEV__) {
      console.log('SimpleTaskApprovalModal: Received notification:', newNotification);
      console.log('SimpleTaskApprovalModal: Current visible state before processing:', visible);
      console.log('SimpleTaskApprovalModal: Current user ID:', currentUserId);
      }
      
      if (newNotification) {
        // Only show modal if the notification is for the current user
        if (currentUserId && newNotification.runnerId === currentUserId) {
          if (__DEV__) console.log('SimpleTaskApprovalModal: Notification is for current user, showing modal');
          setNotification(newNotification);
          setVisible(true);
          if (__DEV__) console.log('SimpleTaskApprovalModal: Modal should now be visible');
        } else {
          if (__DEV__) {
          console.log('SimpleTaskApprovalModal: Notification is not for current user, ignoring');
          console.log('SimpleTaskApprovalModal: Notification runnerId:', newNotification.runnerId);
          console.log('SimpleTaskApprovalModal: Current userId:', currentUserId);
          }
        }
      } else {
        if (__DEV__) console.log('SimpleTaskApprovalModal: Hiding modal');
        setVisible(false);
        setNotification(null);
      }
    });

    if (__DEV__) {
    console.log('SimpleTaskApprovalModal: Subscription set up');
    console.log('SimpleTaskApprovalModal: New listener count after subscription:', approvalModalService.getListenerCount());
    }
    return unsubscribe;
  }, [currentUserId]);

  const handleClose = () => {
    if (__DEV__) console.log('SimpleTaskApprovalModal: Closing modal');
    setVisible(false);
    setNotification(null);
    setShowRateAndFeedback(false);
    approvalModalService.clearNotification();
  };

  const handleOkPress = () => {
    if (__DEV__) console.log('SimpleTaskApprovalModal: OK button pressed, showing rate and feedback modal');
    setVisible(false);
    setShowRateAndFeedback(true);
  };

  const handleRateAndFeedbackSubmit = (rating: number, feedback: string) => {
    if (__DEV__) console.log('SimpleTaskApprovalModal: Rate and feedback submitted:', { rating, feedback });
    // Here you can add logic to save the rating and feedback to your database
    // For now, we'll just log it and close the modal
    setShowRateAndFeedback(false);
    setNotification(null);
    approvalModalService.clearNotification();
  };

  const handleRateAndFeedbackClose = () => {
    if (__DEV__) console.log('SimpleTaskApprovalModal: Rate and feedback modal closed');
    setShowRateAndFeedback(false);
    setNotification(null);
    approvalModalService.clearNotification();
  };

  if (!visible && !showRateAndFeedback) {
    if (__DEV__) console.log('SimpleTaskApprovalModal: Not visible, returning null');
    return null;
  }

  if (__DEV__) console.log('SimpleTaskApprovalModal: Rendering modal with notification:', notification);

  return (
    <>
      {visible && (
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="checkmark-circle" size={60} color="#22c55e" />
              </View>
              <Text style={styles.title}>Task Approved!</Text>
            </View>
            
            <View style={styles.content}>
              <Text style={styles.message}>
                Great news! {notification?.callerName} has approved your work for &quot;{notification?.commissionTitle}&quot;.
              </Text>
              <Text style={styles.subMessage}>
                Your task has been completed successfully.
              </Text>
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={styles.okButton} 
                onPress={handleOkPress}
                activeOpacity={0.8}
              >
                <Text style={styles.okButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <RateAndFeedbackModal
        visible={showRateAndFeedback}
        onClose={handleRateAndFeedbackClose}
        onSubmit={handleRateAndFeedbackSubmit}
        taskTitle={notification?.commissionTitle}
        callerName={notification?.callerName}
        commissionId={notification?.commissionId}
        buddycallerId={notification?.callerId}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 99999,
    elevation: 99999,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    marginBottom: 24,
  },
  message: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 12,
  },
  subMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonContainer: {
    width: '100%',
  },
  okButton: {
    backgroundColor: '#8B0000',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  okButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});

export default SimpleTaskApprovalModal;
