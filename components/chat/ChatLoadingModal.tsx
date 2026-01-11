import React from 'react';
import { View, Text, StyleSheet, Platform, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { responsive, rf, rp } from '../../utils/responsive';

interface ChatLoadingModalProps {
  visible: boolean;
  title?: string;
  message?: string;
}

export default function ChatLoadingModal({
  visible,
  title = 'Redirecting...',
  message = "You're being redirected to the Task Progress page.",
}: ChatLoadingModalProps) {
  if (!visible) return null;

  return (
    <View style={styles.loadingModal as ViewStyle}>
      <View style={styles.loadingModalBackground as ViewStyle}>
        <View style={styles.loadingModalContainer as ViewStyle}>
          <View style={styles.loadingSpinner as ViewStyle}>
            <Ionicons name="refresh" size={24} color="#8B2323" />
          </View>
          <Text style={styles.loadingModalTitle as TextStyle}>{title}</Text>
          <Text style={styles.loadingModalMessage as TextStyle}>{message}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingModal: {
    position: Platform.OS === 'web' ? 'fixed' as any : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3000,
  },
  loadingModalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingModalContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    minWidth: 280,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  loadingSpinner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingModalTitle: {
    fontSize: Platform.OS === 'web' ? 18 : rf(18),
    fontWeight: '700',
    color: '#8B2323',
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingModalMessage: {
    fontSize: Platform.OS === 'web' ? 14 : rf(14),
    color: '#666',
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? 20 : rf(20),
  },
});

