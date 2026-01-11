import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, type ViewStyle, type TextStyle } from 'react-native';
import { responsive, rf, rp } from '../../utils/responsive';

interface ChatDeclineConfirmModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ChatDeclineConfirmModal({
  visible,
  onCancel,
  onConfirm,
}: ChatDeclineConfirmModalProps) {
  if (!visible) return null;

  return (
    <View 
      style={styles.confirmModalOverlay as ViewStyle}
      {...(Platform.OS === 'web' && {
        onClick: onCancel
      })}
    >
      <View 
        style={styles.confirmModalContainer as ViewStyle}
        {...(Platform.OS === 'web' && {
          onClick: (e: any) => e.stopPropagation()
        })}
      >
        <View style={styles.confirmModalContent as ViewStyle}>
          <View style={styles.confirmModalHeader as ViewStyle}>
            <Text style={styles.confirmModalTitle as TextStyle}>Find Another Runner?</Text>
            <TouchableOpacity
              style={styles.confirmModalCloseButton as ViewStyle}
              onPress={onCancel}
            >
              <Text style={styles.confirmModalCloseButtonText as TextStyle}>×</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.confirmModalMessage as TextStyle}>
            Are you sure you want to find another runner? This will release the current runner and make the commission available to other runners.
          </Text>
          <View style={styles.confirmModalButtons as ViewStyle}>
            <TouchableOpacity
              style={styles.confirmModalCancelButton as ViewStyle}
              onPress={onCancel}
            >
              <Text style={styles.confirmModalCancelButtonText as TextStyle}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmModalConfirmButton as ViewStyle}
              onPress={onConfirm}
            >
              <Text style={styles.confirmModalConfirmButtonText as TextStyle}>Yes, Find Another Runner</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  confirmModalOverlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    width: '100vw' as any,
    height: '100vh' as any,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    display: 'flex' as any,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '100vw' as any,
    maxHeight: '100vh' as any,
    overflow: 'hidden',
  } as ViewStyle,
  confirmModalContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    minWidth: 320,
    maxWidth: 400,
    maxHeight: '80vh' as any,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    overflow: 'hidden',
  } as ViewStyle,
  confirmModalContent: {
    alignItems: 'center',
  },
  confirmModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  confirmModalTitle: {
    fontSize: Platform.OS === 'web' ? 18 : rf(18),
    fontWeight: '700',
    color: '#8B2323',
    textAlign: 'center',
    flex: 1,
  },
  confirmModalCloseButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  confirmModalCloseButtonText: {
    fontSize: Platform.OS === 'web' ? 16 : rf(16),
    fontWeight: '600',
    color: '#666',
    lineHeight: Platform.OS === 'web' ? 16 : rf(16),
  },
  confirmModalMessage: {
    fontSize: Platform.OS === 'web' ? 14 : rf(14),
    color: '#666',
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? 20 : rf(20),
    marginBottom: 24,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'space-between',
  },
  confirmModalCancelButton: {
    flex: 0.8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: Platform.OS === 'web' ? 12 : 12,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Platform.OS === 'web' ? 44 : 44,
  },
  confirmModalCancelButtonText: {
    fontSize: Platform.OS === 'web' ? 14 : rf(14),
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  confirmModalConfirmButton: {
    flex: 1.2,
    backgroundColor: '#8B2323',
    borderRadius: 8,
    paddingVertical: Platform.OS === 'web' ? 12 : 12,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Platform.OS === 'web' ? 44 : 44,
  },
  confirmModalConfirmButtonText: {
    fontSize: Platform.OS === 'web' ? 14 : rf(14),
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? 18 : rf(18),
  },
});

