import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RunnerInvoiceAcceptedModalProps {
  visible: boolean;
  callerName: string;
  onOk: () => void;
}

export function RunnerInvoiceAcceptedModal({
  visible,
  callerName,
  onOk,
}: RunnerInvoiceAcceptedModalProps) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      {(() => {
        console.log('ChatScreenRunner: 🎭 MODAL JSX RENDERING!');
        return null;
      })()}
      <View style={invoiceAcceptedStyles.backdrop}>
        <View style={invoiceAcceptedStyles.card}>
          <View style={invoiceAcceptedStyles.iconWrap}>
            <Ionicons name="checkmark-circle" size={44} color="#8B2323" />
          </View>
          <Text style={invoiceAcceptedStyles.title}>Invoice Accepted</Text>
          <Text style={invoiceAcceptedStyles.msg}>{callerName} has accepted your invoice. Redirecting...</Text>
          <TouchableOpacity
            onPress={onOk}
            style={invoiceAcceptedStyles.okBtn}
            activeOpacity={0.9}
          >
            <Text style={invoiceAcceptedStyles.okText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Styles for Invoice Accepted Modal (copied from Accepted Successfully modal)
const invoiceAcceptedStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
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
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: { 
    color: "#333", 
    fontSize: 16, 
    fontWeight: "900", 
    marginBottom: 4, 
    textAlign: "center" 
  },
  msg: { 
    color: "#333", 
    fontSize: 13, 
    opacity: 0.9, 
    marginBottom: 14, 
    textAlign: "center" 
  },
  okBtn: { 
    backgroundColor: "#8B2323", 
    paddingVertical: 14, 
    borderRadius: 12, 
    width: "70%", 
    alignItems: "center", 
    justifyContent: "center" 
  },
  okText: { 
    color: "#fff", 
    fontSize: 14, 
    fontWeight: "600" 
  },
});

