import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { invoiceAcceptanceService } from '../services/InvoiceAcceptanceService';

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

interface InvoiceAcceptanceNotification {
  conversationId: string;
  callerName: string;
  commissionId?: string;
}

export default function GlobalInvoiceAcceptanceModal() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [callerName, setCallerName] = useState<string>('The caller');
  const [conversationId, setConversationId] = useState<string>('');
  const [commissionId, setCommissionId] = useState<string>('');

  useEffect(() => {
    console.log('GlobalInvoiceAcceptanceModal: Setting up subscription');
    
    const unsubscribe = invoiceAcceptanceService.subscribe((notification: InvoiceAcceptanceNotification) => {
      console.log('GlobalInvoiceAcceptanceModal: ✅ Received notification:', notification);
      console.log('GlobalInvoiceAcceptanceModal: Setting modal visible to true');
      setCallerName(notification.callerName);
      setConversationId(notification.conversationId);
      setCommissionId(notification.commissionId || '');
      setVisible(true);
    });

    return () => {
      console.log('GlobalInvoiceAcceptanceModal: Cleaning up subscription');
      unsubscribe();
    };
  }, []);

  // Debug: Log modal state changes
  useEffect(() => {
    console.log('GlobalInvoiceAcceptanceModal: Modal state changed:', {
      visible,
      callerName,
      conversationId
    });
  }, [visible, callerName, conversationId]);

  const handleClose = () => {
    console.log('GlobalInvoiceAcceptanceModal: Closing modal');
    setVisible(false);
    
    // Navigate to Task Progress page (platform-specific)
    console.log('GlobalInvoiceAcceptanceModal: Navigating to Task Progress page');
    console.log('GlobalInvoiceAcceptanceModal: Commission ID:', commissionId);
    console.log('GlobalInvoiceAcceptanceModal: Platform:', Platform.OS);
    
    if (commissionId) {
      const taskProgressPath = Platform.OS === 'web' 
        ? '/buddyrunner/task_progress_web' 
        : '/buddyrunner/task_progress';
      
      console.log('GlobalInvoiceAcceptanceModal: Navigating to:', taskProgressPath);
      
      router.push({
        pathname: taskProgressPath,
        params: {
          id: commissionId
        }
      });
    } else {
      console.warn('GlobalInvoiceAcceptanceModal: No commission ID available for navigation');
    }
  };

  if (Platform.OS === 'web') {
    if (!visible) return null;
    
    return (
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark-circle" size={44} color={colors.maroon} />
          </View>
          <Text style={styles.title}>Invoice Accepted</Text>
          <Text style={styles.msg}>{callerName} has accepted your invoice. Redirecting...</Text>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.okBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.okText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Modal 
      transparent 
      animationType="fade" 
      visible={visible} 
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark-circle" size={44} color={colors.maroon} />
          </View>
          <Text style={styles.title}>Invoice Accepted</Text>
          <Text style={styles.msg}>{callerName} has accepted your invoice. Redirecting...</Text>
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
}

const styles = StyleSheet.create({
  backdrop: {
    position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 99999,
  },
  card: { 
    width: 400, 
    maxWidth: "100%", 
    backgroundColor: "#fff", 
    borderRadius: 14, 
    padding: 18, 
    alignItems: "center" 
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: colors.faint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: { 
    color: colors.text, 
    fontSize: 16, 
    fontWeight: "900", 
    marginBottom: 4, 
    textAlign: "center" 
  },
  msg: { 
    color: colors.text, 
    fontSize: 13, 
    opacity: 0.9, 
    marginBottom: 14, 
    textAlign: "center" 
  },
  okBtn: { 
    backgroundColor: colors.maroon, 
    paddingVertical: 14, 
    borderRadius: 12, 
    width: "70%", 
    alignItems: "center", 
    justifyContent: "center" 
  },
  okText: { 
    color: "#fff", 
    fontWeight: "700" 
  },
});
