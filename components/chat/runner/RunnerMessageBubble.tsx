import React from 'react';
import { View, Text, TouchableOpacity, Image, Platform, Alert, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SharedMessage } from '../../SharedMessagingService';

interface ChatMessage extends SharedMessage {
  isTyping?: boolean;
}

interface RunnerMessageBubbleProps {
  styles: any;
  message: ChatMessage;
  contactProfile: any;
  getUserInitialsFromProfile: (profile: any) => string;
  getFileTypeLabel: (fileName: string) => string;
  getFileSize: (fileSizeBytes: number) => string;
  onImagePress: (uri: string) => void;
  onFileDownload: (fileUrl: string, fileName: string) => void;
  onInvoiceEdit: (messageId: string) => void;
  onInvoiceDelete: (messageId: string) => void;
  onInvoiceViewDetails?: (invoice: { amount: number; description: string; status: string; messageId?: string }) => void;
}

export function RunnerMessageBubble({
  styles,
  message,
  contactProfile,
  getUserInitialsFromProfile,
  getFileTypeLabel,
  getFileSize,
  onImagePress,
  onFileDownload,
  onInvoiceEdit,
  onInvoiceDelete,
  onInvoiceViewDetails,
}: RunnerMessageBubbleProps) {
  // Render system status messages (accepted/declined/commission acceptance) outside bubbles
  if (!message.invoice && !message.attachment && message.text && (
    message.text === 'Invoice accepted by caller' ||
    message.text === 'Invoice declined by caller' ||
    message.text.includes('Commission') && message.text.includes('accepted by')
  )) {
    return (
      <View key={message.id} style={styles.systemMessageContainer as ViewStyle}>
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
    <View key={message.id} style={[
      styles.messageContainer as ViewStyle,
      message.invoice ? styles.messageContainerInvoice as ViewStyle : null
    ]}>
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

            {/* Invoice action buttons for user's invoices */}
            {message.isFromUser && (
              <View style={styles.invoiceActions as ViewStyle}>
                {message.invoice.status !== 'pending' ? (
                  // Show View Details button when accepted or declined
                  <TouchableOpacity
                    style={styles.viewDetailsButton as ViewStyle}
                    onPress={() => {
                      if (message.invoice && onInvoiceViewDetails) {
                        const invoiceAmount = typeof message.invoice.amount === 'number' ? message.invoice.amount : parseFloat(message.invoice.amount || '0');
                        onInvoiceViewDetails({
                          amount: invoiceAmount,
                          description: message.invoice.description || '',
                          status: message.invoice.status || 'pending',
                          messageId: message.id,
                        });
                      }
                    }}
                    {...(Platform.OS === 'web' ? {
                      onClick: () => {
                        if (message.invoice && onInvoiceViewDetails) {
                          const invoiceAmount = typeof message.invoice.amount === 'number' ? message.invoice.amount : parseFloat(message.invoice.amount || '0');
                          onInvoiceViewDetails({
                            amount: invoiceAmount,
                            description: message.invoice.description || '',
                            status: message.invoice.status || 'pending',
                            messageId: message.id,
                          });
                        }
                      }
                    } as any : {})}
                  >
                    <Ionicons name="eye-outline" size={16} color="#8B2323" />
                    <Text style={styles.viewDetailsButtonText as TextStyle}>View Details</Text>
                  </TouchableOpacity>
                ) : (
                  // Show Edit/Delete buttons when pending
                  <>
                    <TouchableOpacity
                      style={styles.invoiceActionButton as ViewStyle}
                      onPress={() => onInvoiceEdit(message.id)}
                    >
                      <Text style={styles.invoiceActionText as TextStyle}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.invoiceActionButton as ViewStyle, styles.invoiceDeleteButton as ViewStyle]}
                      onPress={() => onInvoiceDelete(message.id)}
                      {...(Platform.OS === 'web' ? { onClick: () => onInvoiceDelete(message.id) } as any : {})}
                    >
                      <Text style={[styles.invoiceActionText as TextStyle, styles.invoiceDeleteText as TextStyle]}>Delete</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Render message bubble for text and attachments only */}
      {(message.text || message.attachment) && (
        <View style={[
          styles.messageBubble as ViewStyle,
          message.isFromUser ? styles.outgoingMessage as ViewStyle : styles.incomingMessage as ViewStyle
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
                    ]} numberOfLines={2}>
                      {message.attachment.name}
                    </Text>
                    <View style={styles.fileTypeContainer as ViewStyle}>
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

