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
import { errandCompletionService, ErrandCompletionNotification } from '../services/ErrandCompletionService';
import { callerErrandRatingService } from '../services/CallerErrandRatingService';
import { supabase } from '../lib/supabase';

const colors = {
  maroon: "#8B0000",
  text: "#531010",
  white: "#FFFFFF",
  border: "#E5C8C5",
};

const GlobalErrandCompletionModal: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [notification, setNotification] = useState<ErrandCompletionNotification | null>(null);

  useEffect(() => {
    console.log('GlobalErrandCompletionModal: Setting up subscription');
    const unsubscribe = errandCompletionService.subscribe((newNotification) => {
      console.log('GlobalErrandCompletionModal: Received notification:', newNotification);
      if (newNotification) {
        setNotification(newNotification);
        setVisible(true);
        console.log('GlobalErrandCompletionModal: Modal should be visible now');
      } else {
        setVisible(false);
        setNotification(null);
        console.log('GlobalErrandCompletionModal: Modal hidden');
      }
    });

    return () => {
      console.log('GlobalErrandCompletionModal: Cleaning up subscription');
      unsubscribe();
    };
  }, []);

  const handleClose = async () => {
    if (!notification) return;
    
    setVisible(false);
    setNotification(null);
    errandCompletionService.clearNotification();
    
    // Fetch errand details and show rating modal
    try {
      const { data: errandData, error: errandError } = await supabase
        .from('errand')
        .select('id, title, runner_id')
        .eq('id', notification.errandId)
        .single();
      
      if (errandError || !errandData || !errandData.runner_id) {
        console.error('Error fetching errand details for rating:', errandError);
        return;
      }
      
      // Get runner name
      const { data: runnerData } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', errandData.runner_id)
        .single();
      
      const runnerName = runnerData 
        ? `${runnerData.first_name || ''} ${runnerData.last_name || ''}`.trim() || 'BuddyRunner'
        : 'BuddyRunner';
      
      // Trigger rating modal
      callerErrandRatingService.notifyRating({
        errandId: notification.errandId,
        runnerName: runnerName,
        runnerId: errandData.runner_id,
        errandTitle: errandData.title || 'Errand',
      });
    } catch (error) {
      console.error('Error setting up rating modal:', error);
    }
  };

  if (!visible || !notification) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark" size={44} color={colors.white} />
          </View>
          <Text style={styles.title}>Task Completed</Text>
          <Text style={styles.msg}>Your errand task has been completed by the runner.</Text>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.okBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.okText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: Platform.OS === 'web' ? 400 : 360,
    maxWidth: "90%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    ...(Platform.OS === 'web' ? { boxShadow: "0 4px 20px rgba(0,0,0,0.15)" } : {}),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.maroon,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center"
  },
  msg: {
    color: colors.text,
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 20
  },
  okBtn: {
    backgroundColor: colors.maroon,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  okText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15
  }
});

export default GlobalErrandCompletionModal;

