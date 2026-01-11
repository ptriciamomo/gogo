import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RunnerChatInputBarProps {
  styles: any;
  currentMessage: string;
  invoiceExists: boolean;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttachment: () => void;
  onAttachmentWeb: () => void;
  onCamera?: () => void;
  onCreateInvoice: () => void;
}

export function RunnerChatInputBar({
  styles,
  currentMessage,
  invoiceExists,
  onChangeText,
  onSend,
  onAttachment,
  onAttachmentWeb,
  onCamera,
  onCreateInvoice,
}: RunnerChatInputBarProps) {
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
          onPress={() => (Platform.OS === 'web' ? onAttachmentWeb() : onAttachment())}
          style={[
            styles.inputIcon as ViewStyle,
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
          ]}
          {...(Platform.OS === 'web' ? ({ onClick: onAttachmentWeb } as any) : {})}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onCreateInvoice}
          style={[
            styles.inputIcon as ViewStyle,
            invoiceExists ? (styles.inputIconDisabled as ViewStyle) : null,
          ]}
          {...(Platform.OS === 'web' ? ({ onClick: onCreateInvoice } as any) : {})}
        >
          <Ionicons
            name="receipt"
            size={24}
            color={invoiceExists ? '#999' : 'white'}
          />
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
            color={currentMessage.trim() ? 'white' : '#666'}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}


