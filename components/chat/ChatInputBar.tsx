import React from 'react';
import { View, TextInput, TouchableOpacity, KeyboardAvoidingView, StyleSheet, Platform, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { responsive, rp, rf, rb } from '../../utils/responsive';

interface ChatInputBarProps {
  currentMessage: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttachment: () => void;
  onCamera?: () => void;
}

export default function ChatInputBar({
  currentMessage,
  onChangeText,
  onSend,
  onAttachment,
  onCamera,
}: ChatInputBarProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={styles.inputBar as ViewStyle}>
        {Platform.OS !== 'web' && onCamera && (
          <TouchableOpacity onPress={onCamera} style={styles.inputIcon as ViewStyle}>
            <Ionicons name="camera" size={24} color="white" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={onAttachment}
          style={styles.inputIcon as ViewStyle}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>

        <TextInput
          style={styles.messageInput as TextStyle}
          value={currentMessage}
          onChangeText={onChangeText}
          placeholder="Type a message..."
          placeholderTextColor="#999"
          multiline
          maxLength={500}
        />

        <TouchableOpacity
          onPress={onSend}
          style={styles.sendButton as ViewStyle}
          disabled={!currentMessage.trim()}
        >
          <Ionicons
            name="send"
            size={20}
            color={currentMessage.trim() ? "white" : "#666"}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  inputBar: {
    backgroundColor: '#8B2323',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Platform.OS === 'web' ? 24 : rp(12),
    paddingVertical: Platform.OS === 'web' ? 10 : rp(8),
    paddingBottom: Platform.OS === 'web' ? 10 : rp(16),
    minHeight: Platform.OS === 'web' ? 42 : 56,
    marginBottom: Platform.OS === 'web' ? 12 : 0,
  },
  inputIcon: {
    padding: Platform.OS === 'web' ? 6 : rp(8),
    marginRight: Platform.OS === 'web' ? 2 : rp(4),
  },
  messageInput: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: Platform.OS === 'web' ? 16 : rb(20),
    paddingHorizontal: Platform.OS === 'web' ? 12 : rp(16),
    paddingVertical: Platform.OS === 'web' ? 4 : rp(10),
    marginHorizontal: Platform.OS === 'web' ? 16 : rp(8),
    maxHeight: Platform.OS === 'web' ? 80 : 100,
    fontSize: Platform.OS === 'web' ? 12 : rf(14),
    color: '#333',
  },
  sendButton: {
    padding: Platform.OS === 'web' ? 6 : rp(8),
    marginLeft: Platform.OS === 'web' ? 2 : rp(4),
  },
});

