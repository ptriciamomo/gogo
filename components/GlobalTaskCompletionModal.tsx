import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { globalNotificationService, TaskCompletionNotification } from '../services/GlobalNotificationService';
import { useRouter } from 'expo-router';

const GlobalTaskCompletionModal: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [notification, setNotification] = useState<TaskCompletionNotification | null>(null);
  const router = useRouter();

  useEffect(() => {
    console.log('GlobalTaskCompletionModal: Setting up subscription');
    const unsubscribe = globalNotificationService.subscribe((newNotification) => {
      console.log('GlobalTaskCompletionModal: Received notification:', newNotification);
      if (newNotification) {
        setNotification(newNotification);
        setVisible(true);
        console.log('GlobalTaskCompletionModal: Modal should be visible now');
      } else {
        setVisible(false);
        setNotification(null);
        console.log('GlobalTaskCompletionModal: Modal hidden');
      }
    });

    return unsubscribe;
  }, []);

  const handleClose = () => {
    setVisible(false);
    setNotification(null);
    globalNotificationService.clearNotification();
  };

  const handleRate = () => {
    if (!notification) return;
    
    setVisible(false);
    setNotification(null);
    globalNotificationService.clearNotification();
    
    // Navigate to rating page or show rating form
    // For now, show an alert - this can be replaced with actual rating functionality
    Alert.alert(
      'Rate BuddyCaller',
      `Rate ${notification.callerName} for their task clarity and communication?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rate Now', onPress: () => {
          // TODO: Implement actual rating functionality
          Alert.alert('Rating', 'Rating functionality will be implemented soon!');
        }}
      ]
    );
  };

  const handleSkip = () => {
    setVisible(false);
    setNotification(null);
    globalNotificationService.clearNotification();
  };

  if (!notification) return null;

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
            <Ionicons 
              name="checkmark-circle" 
              size={48} 
              color="#22c55e" 
            />
            <Text style={styles.title}>Task Approved!</Text>
          </View>

          <View style={styles.content}>
            <Text style={styles.message}>
              Rate {notification.callerName} for their task clarity and communication?
            </Text>
            <Text style={styles.subMessage}>
              Your feedback helps improve the platform for everyone.
            </Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.rateButton]} 
              onPress={handleRate}
            >
              <Ionicons name="star" size={20} color="#fff" />
              <Text style={styles.rateButtonText}>Rate BuddyCaller</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.skipButton]} 
              onPress={handleSkip}
            >
              <Text style={styles.skipButtonText}>Skip for Now</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={handleClose}
          >
            <Ionicons name="close" size={24} color="#6b7280" />
          </TouchableOpacity>
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
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 12,
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
    marginBottom: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    minHeight: 48,
  },
  rateButton: {
    backgroundColor: '#8B0000',
  },
  rateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  skipButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  skipButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '500',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
});

export default GlobalTaskCompletionModal;
