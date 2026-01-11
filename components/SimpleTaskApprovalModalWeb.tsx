import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { approvalModalService } from '../services/ApprovalModalService';
import { TaskApprovalNotification } from '../services/GlobalNotificationService';
import { supabase } from '../lib/supabase';
import RateAndFeedbackModalWeb from './RateAndFeedbackModalWeb';

const SimpleTaskApprovalModalWeb: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [notification, setNotification] = useState<TaskApprovalNotification | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showRateAndFeedback, setShowRateAndFeedback] = useState(false);

  console.log('SimpleTaskApprovalModalWeb: Component rendering - visible:', visible, 'notification:', notification);
  console.log('SimpleTaskApprovalModalWeb: Platform check - should render on web');

  // Get current user ID
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
          console.log('SimpleTaskApprovalModalWeb: Current user ID:', user.id);
        }
      } catch (error) {
        console.error('SimpleTaskApprovalModalWeb: Error getting current user:', error);
      }
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    console.log('SimpleTaskApprovalModalWeb: Component mounted and setting up subscription');
    console.log('SimpleTaskApprovalModalWeb: Current listener count:', approvalModalService.getListenerCount());
    
    const unsubscribe = approvalModalService.subscribe((newNotification) => {
      console.log('SimpleTaskApprovalModalWeb: Received notification:', newNotification);
      console.log('SimpleTaskApprovalModalWeb: Current visible state before processing:', visible);
      console.log('SimpleTaskApprovalModalWeb: Current user ID:', currentUserId);
      
      if (newNotification) {
        // Only show modal if the notification is for the current user
        if (currentUserId && newNotification.runnerId === currentUserId) {
          console.log('SimpleTaskApprovalModalWeb: Notification is for current user, showing modal');
          setNotification(newNotification);
          setVisible(true);
          console.log('SimpleTaskApprovalModalWeb: Modal should now be visible');
        } else {
          console.log('SimpleTaskApprovalModalWeb: Notification is not for current user, ignoring');
          console.log('SimpleTaskApprovalModalWeb: Notification runnerId:', newNotification.runnerId);
          console.log('SimpleTaskApprovalModalWeb: Current userId:', currentUserId);
        }
      } else {
        console.log('SimpleTaskApprovalModalWeb: Hiding modal');
        setVisible(false);
        setNotification(null);
      }
    });

    console.log('SimpleTaskApprovalModalWeb: Subscription set up');
    console.log('SimpleTaskApprovalModalWeb: New listener count after subscription:', approvalModalService.getListenerCount());
    return unsubscribe;
  }, [currentUserId]);

  const handleClose = () => {
    console.log('SimpleTaskApprovalModalWeb: Closing modal');
    setVisible(false);
    setNotification(null);
    setShowRateAndFeedback(false);
    approvalModalService.clearNotification();
  };

  const handleOkPress = () => {
    console.log('SimpleTaskApprovalModalWeb: OK button pressed, showing rate and feedback modal');
    setVisible(false);
    setShowRateAndFeedback(true);
  };

  const handleRateAndFeedbackSubmit = (rating: number, feedback: string) => {
    console.log('SimpleTaskApprovalModalWeb: Rate and feedback submitted:', { rating, feedback });
    // Here you can add logic to save the rating and feedback to your database
    // For now, we'll just log it and close the modal
    setShowRateAndFeedback(false);
    setNotification(null);
    approvalModalService.clearNotification();
  };

  const handleRateAndFeedbackClose = () => {
    console.log('SimpleTaskApprovalModalWeb: Rate and feedback modal closed');
    setShowRateAndFeedback(false);
    setNotification(null);
    approvalModalService.clearNotification();
  };

  if (!visible && !showRateAndFeedback) {
    console.log('SimpleTaskApprovalModalWeb: Not visible, returning null');
    return null;
  }

  console.log('SimpleTaskApprovalModalWeb: Rendering modal with notification:', notification);
  return (
    <>
      {visible && (
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={handleClose}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>
          
          <TouchableWithoutFeedback onPress={() => {
            // Prevent modal from closing when clicking inside
          }}>
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
          </TouchableWithoutFeedback>
        </View>
      )}

      <RateAndFeedbackModalWeb
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
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
    width: '100%',
    height: '100%',
    pointerEvents: 'auto',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    position: 'absolute',
    zIndex: 10000,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    pointerEvents: 'auto',
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

export default SimpleTaskApprovalModalWeb;
