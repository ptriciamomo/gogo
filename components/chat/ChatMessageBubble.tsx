import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Platform, Alert, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SharedMessage } from '../SharedMessagingService';
import { responsive, rp, rf } from '../../utils/responsive';

interface ChatMessage extends SharedMessage {
  isTyping?: boolean;
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  contactProfile: any;
  getUserInitialsFromProfile: (profile: any) => string;
  getFileTypeLabel: (fileName: string) => string;
  getFileSize: (fileSizeBytes: number) => string;
  onImagePress: (uri: string) => void;
  onFileDownload: (fileUrl: string, fileName: string) => void;
  onInvoiceAccept: (messageId: string) => void;
  onInvoiceDecline: (messageId: string) => void;
}

export default function ChatMessageBubble({
  message,
  contactProfile,
  getUserInitialsFromProfile,
  getFileTypeLabel,
  getFileSize,
  onImagePress,
  onFileDownload,
  onInvoiceAccept,
  onInvoiceDecline,
}: ChatMessageBubbleProps) {
  // Skip empty messages (no text/attachment/invoice)
  if (!message.text && !message.attachment && !message.invoice) {
    return null;
  }

  // Render system status messages (accepted/declined/commission acceptance) outside bubbles
  if (!message.invoice && !message.attachment && message.text && (
    message.text === 'Invoice accepted by caller' ||
    message.text === 'Invoice declined by caller' ||
    message.text === 'The caller has decided to find another runner. This commission has been released.' ||
    message.text.includes('Commission') && message.text.includes('accepted by')
  )) {
    return (
      <View 
        key={message.id} 
        style={styles.systemMessageContainer as ViewStyle}
      >
        <Text style={styles.systemMessageText as TextStyle}>{message.text}</Text>
      </View>
    );
  }

  if (message.isTyping) {
    return (
      <View key={message.id} style={styles.messageContainer as ViewStyle}>
        <View style={styles.contactProfileContainer as ViewStyle}>
          <View style={styles.contactProfilePicture as ViewStyle}>
            <Text style={styles.profileInitials as TextStyle}>YJ</Text>
          </View>
        </View>
        <View style={[styles.messageBubble as ViewStyle, styles.incomingMessage as ViewStyle]}>
          <View style={styles.typingIndicator as ViewStyle}>
            <View style={styles.typingDot as ViewStyle} />
            <View style={styles.typingDot as ViewStyle} />
            <View style={styles.typingDot as ViewStyle} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View 
      key={message.id} 
      style={[
        styles.messageContainer as ViewStyle,
        message.invoice ? styles.messageContainerInvoice as ViewStyle : null
      ]}
      {...(Platform.OS === 'web' && { 
        'data-message-id': message.id,
        'data-testid': `message-${message.id}`
      })}
    >
      {!message.isFromUser && (
        <View style={styles.contactProfileContainer as ViewStyle}>
          <View style={styles.contactProfilePicture as ViewStyle}>
            {contactProfile?.profile_picture_url ? (
              <Image
                source={{ uri: contactProfile.profile_picture_url }}
                style={styles.profileImage as ImageStyle}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.profileInitials as TextStyle}>
                {getUserInitialsFromProfile(contactProfile)}
              </Text>
            )}
          </View>
        </View>
      )}
      {/* Render invoice outside message bubble if present */}
      {message.invoice && (
        <View style={[
          styles.invoiceWrapper as ViewStyle,
          message.isFromUser ? styles.invoiceWrapperOutgoing as ViewStyle : styles.invoiceWrapperIncoming as ViewStyle
        ]}>
          <View style={styles.invoiceContainer as ViewStyle}>
            <View style={styles.invoiceHeader as ViewStyle}>
              <Ionicons name="receipt" size={16} color="#8B2323" />
              <Text style={styles.invoiceTitle as TextStyle}>
                Invoice
              </Text>
            </View>

            <View style={styles.invoiceContent as ViewStyle}>
              <Text style={styles.invoiceDescription as TextStyle}>
                {message.invoice.description}
              </Text>

              <View style={styles.invoiceAmountRow as ViewStyle}>
                <Text style={styles.invoiceAmount as TextStyle}>
                  {message.invoice.currency} {(() => {
                    const invoiceAmount = typeof message.invoice.amount === 'number' ? message.invoice.amount : parseFloat(message.invoice.amount || '0');
                    return invoiceAmount.toFixed(2);
                  })()}
                </Text>
              </View>

              {/* Invoice creation date */}
              <View style={styles.invoiceDateRow as ViewStyle}>
                <Ionicons name="calendar-outline" size={12} color="#666" />
                <Text style={styles.invoiceDateText as TextStyle}>
                  Created: {message.timestamp.toLocaleDateString()} at {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              {/* Show status indicator when not pending */}
              {message.invoice.status !== 'pending' && (
                <View style={styles.invoiceStatusRow as ViewStyle}>
                  <Text style={[
                    styles.invoiceStatusText as TextStyle,
                    { color: message.invoice.status === 'accepted' ? '#4CAF50' : '#F44336' }
                  ]}>
                    {message.invoice.status === 'accepted' ? '✓ Accepted' : '✗ Declined'}
                  </Text>
                </View>
              )}
            </View>

            {/* Invoice action buttons for caller */}
            <View style={styles.invoiceActionButtons as ViewStyle} pointerEvents={Platform.OS === 'web' ? 'auto' : undefined}>
              {message.invoice.status !== 'pending' ? (
                // Show View Details button when accepted or declined
                <TouchableOpacity
                  style={styles.viewDetailsButton as ViewStyle}
                  onPress={() => {
                    if (message.invoice) {
                      const statusText = message.invoice.status === 'accepted' ? 'Accepted' : 'Declined';
                      const invoiceAmount = typeof message.invoice.amount === 'number' ? message.invoice.amount : parseFloat(message.invoice.amount || '0');
                      const amount = invoiceAmount.toFixed(2);
                      Alert.alert('Invoice Details', `Amount: ₱${amount}\nDescription: ${message.invoice.description}\nStatus: ${statusText}`);
                    }
                  }}
                >
                  <Ionicons name="eye-outline" size={16} color="#8B2323" />
                  <Text style={styles.viewDetailsButtonText as TextStyle}>View Details</Text>
                </TouchableOpacity>
              ) : (
                // Show Accept/Decline buttons when pending
                <>
                  <TouchableOpacity
                    style={styles.acceptButton as ViewStyle}
                    onPress={() => {
                      console.log('ChatScreenCaller: ✅ ACCEPT BUTTON CLICKED!');
                      console.log('ChatScreenCaller: Message ID:', message.id);
                      console.log('ChatScreenCaller: Platform:', Platform.OS);
                      onInvoiceAccept(message.id);
                    }}
                    hitSlop={Platform.OS === 'web' ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                  >
                    <Text style={styles.acceptButtonText as TextStyle} numberOfLines={Platform.OS !== 'web' ? 1 : undefined}>Accept</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.declineButton as ViewStyle}
                    onPress={() => onInvoiceDecline(message.id)}
                    hitSlop={Platform.OS === 'web' ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
                  >
                    <Text style={styles.declineButtonText as TextStyle} numberOfLines={Platform.OS !== 'web' ? 1 : undefined}>Decline</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Render message bubble for text and attachments only (not for invoices) */}
      {(message.text || message.attachment) && !message.invoice && (
        <View style={[
          styles.messageBubble as ViewStyle,
          message.isFromUser ? styles.outgoingMessage : styles.incomingMessage as ViewStyle
        ]}>
          {/* Render attachment if present */}
          {message.attachment && (
            <View style={styles.attachmentContainer as ViewStyle}>
              {message.attachment.type === 'image' ? (
                <TouchableOpacity
                  onPress={() => onImagePress(message.attachment!.uri)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: message.attachment.uri }}
                    style={styles.attachmentImage as ImageStyle}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.fileAttachment as ViewStyle}>
                  <View style={[
                    styles.fileIconContainer as ViewStyle,
                    { backgroundColor: message.isFromUser ? '#8B2323' : '#8B2323' }
                  ]}>
                    <Ionicons name="document" size={22} color="white" />
                  </View>
                  <View style={styles.fileInfo as ViewStyle}>
                    <Text style={[
                      styles.fileName as TextStyle,
                      message.isFromUser ? styles.outgoingMessageText as TextStyle : styles.incomingMessageText as TextStyle
                    ]} numberOfLines={1}>
                      {message.attachment.name}
                    </Text>
                    <Text style={[
                      styles.fileType as TextStyle,
                      message.isFromUser ? styles.outgoingMessageText as TextStyle : styles.incomingMessageText as TextStyle
                    ]}>
                      {getFileTypeLabel(message.attachment.name)}
                    </Text>
                    <Text style={[
                      styles.fileSize as TextStyle,
                      message.isFromUser ? styles.outgoingMessageText as TextStyle : styles.incomingMessageText as TextStyle
                    ]}>
                      {getFileSize(message.attachment.size ?? 0)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.downloadButton as ViewStyle}
                    onPress={() => message.attachment && onFileDownload(message.attachment.uri, message.attachment.name)}
                  >
                    <Ionicons name="download" size={16} color="white" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Render text message if present */}
          {message.text && (
            <Text style={[
              styles.messageText as TextStyle,
              message.isFromUser ? styles.outgoingMessageText as TextStyle : styles.incomingMessageText as TextStyle
            ]}>
              {message.text}
            </Text>
          )}

          {/* Add timestamp inside the message bubble */}
          <View style={styles.timestampInsideContainer as ViewStyle}>
            <Text style={[
              styles.timestampText as TextStyle,
              message.isFromUser ? styles.outgoingMessageText as TextStyle : styles.incomingMessageText as TextStyle
            ]}>
              {message.timestamp ? message.timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              }) : ''}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  systemMessageContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: rp(8),
  },
  systemMessageText: {
    color: '#666',
    fontSize: Platform.OS === 'web' ? 13 : rf(12),
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: rp(12),
    alignItems: 'flex-end',
  },
  messageContainerInvoice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  contactProfileContainer: {
    marginRight: 8,
    marginBottom: 2,
  },
  contactProfilePicture: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#C8C8C8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitials: {
    color: 'white',
    fontSize: rf(11),
    fontWeight: '600',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    marginBottom: 2,
  },
  incomingMessage: {
    backgroundColor: '#F0F0F0',
    borderBottomLeftRadius: 4,
  },
  outgoingMessage: {
    backgroundColor: '#8B2323',
    borderBottomRightRadius: 4,
    marginLeft: 'auto',
  },
  messageText: {
    fontSize: Platform.OS === 'web' ? 13 : rf(14),
    lineHeight: Platform.OS === 'web' ? 17 : rf(18),
  },
  incomingMessageText: {
    color: '#333',
  },
  outgoingMessageText: {
    color: 'white',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#999',
    marginHorizontal: 2,
  },
  attachmentContainer: {
    marginBottom: 12,
  },
  attachmentImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
    maxWidth: '100%',
    alignSelf: 'center',
  },
  fileAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    maxWidth: 180,
    minWidth: 160,
  },
  fileIconContainer: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  fileName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    flex: 1,
  },
  fileType: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  fileSize: {
    fontSize: 10,
    opacity: 0.7,
  },
  downloadButton: {
    backgroundColor: '#8B2323',
    borderRadius: 16,
    padding: 8,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timestampInsideContainer: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  timestampText: {
    fontSize: Platform.OS === 'web' ? 9 : 10,
    opacity: 0.7,
  },
  invoiceWrapper: {
    marginBottom: 8,
  },
  invoiceWrapperOutgoing: {
    alignSelf: 'flex-end',
  },
  invoiceWrapperIncoming: {
    alignSelf: 'flex-start',
  },
  invoiceContainer: {
    backgroundColor: 'white',
    borderRadius: Platform.OS === 'web' ? 10 : 12,
    padding: Platform.OS === 'web' ? 8 : 8,
    marginBottom: 8,
    maxWidth: Platform.OS === 'web' ? 220 : 200,
    borderWidth: 2,
    borderColor: '#8B2323',
    alignSelf: 'flex-start',
  },
  invoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Platform.OS === 'web' ? 5 : 8,
  },
  invoiceTitle: {
    fontSize: Platform.OS === 'web' ? 13 : rf(14),
    fontWeight: '600',
    marginLeft: rp(6),
    color: '#8B2323',
  },
  invoiceContent: {
    gap: Platform.OS === 'web' ? 4 : 6,
  },
  invoiceDescription: {
    fontSize: Platform.OS === 'web' ? 12 : rf(12),
    marginBottom: rp(4),
    color: '#333',
  },
  invoiceAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  invoiceAmount: {
    fontSize: Platform.OS === 'web' ? 13 : rf(14),
    fontWeight: '700',
    color: '#8B2323',
  },
  invoiceDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 2,
  },
  invoiceDateText: {
    fontSize: Platform.OS === 'web' ? 10 : rf(11),
    color: '#666',
    marginLeft: 4,
    fontStyle: 'italic',
  },
  invoiceStatusRow: {
    marginTop: 4,
    alignItems: 'center',
  },
  invoiceStatusText: {
    fontSize: Platform.OS === 'web' ? 12 : rf(12),
    fontWeight: '600',
  },
  invoiceActionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Platform.OS === 'web' ? 10 : 8,
    paddingTop: Platform.OS === 'web' ? 10 : 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 8,
    width: '100%',
    ...(Platform.OS === 'web' ? { pointerEvents: 'auto' } : {}),
  },
  acceptButton: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#8B2323',
    borderRadius: 6,
    paddingVertical: Platform.OS === 'web' ? 7 : 8,
    paddingHorizontal: Platform.OS === 'web' ? 10 : 6,
    alignItems: 'center',
    minHeight: Platform.OS === 'web' ? 30 : 36,
    justifyContent: 'center',
    marginRight: 4,
  },
  acceptButtonText: {
    color: '#8B2323',
    fontSize: Platform.OS === 'web' ? 12 : rf(12),
    fontWeight: '600',
    textAlign: 'center',
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#8B2323',
    borderRadius: 6,
    paddingVertical: Platform.OS === 'web' ? 7 : 8,
    paddingHorizontal: Platform.OS === 'web' ? 10 : 6,
    alignItems: 'center',
    minHeight: Platform.OS === 'web' ? 30 : 36,
    justifyContent: 'center',
    marginLeft: 4,
  },
  declineButtonText: {
    color: 'white',
    fontSize: Platform.OS === 'web' ? 12 : rf(12),
    fontWeight: '600',
    textAlign: 'center',
  },
  viewDetailsButton: {
    width: '100%',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#8B2323',
    borderRadius: 6,
    paddingVertical: Platform.OS === 'web' ? 7 : 8,
    paddingHorizontal: Platform.OS === 'web' ? 14 : 12,
    minHeight: Platform.OS === 'web' ? 30 : 36,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  viewDetailsButtonText: {
    color: '#8B2323',
    fontSize: Platform.OS === 'web' ? 12 : 12,
    fontWeight: '600',
    textAlign: 'center',
    marginLeft: 6,
  },
});

