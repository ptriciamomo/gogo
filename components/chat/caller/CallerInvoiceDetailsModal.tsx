import React from 'react';
import { View, Text, TouchableOpacity, Modal, Platform, type ViewStyle, type TextStyle } from 'react-native';

interface InvoiceDetails {
  amount: number;
  description: string;
  status: string;
}

interface CallerInvoiceDetailsModalProps {
  styles: any;
  visible: boolean;
  invoice: InvoiceDetails | null;
  commissionId: string | number | null;
  commissionTitle: string | null;
  onClose: () => void;
}

export function CallerInvoiceDetailsModal({
  styles,
  visible,
  invoice,
  commissionId,
  commissionTitle,
  onClose,
}: CallerInvoiceDetailsModalProps) {
  if (!visible || !invoice) return null;

  // Reverse calculate subtotal from total
  // Total = Subtotal + (5 + 0.12 × Subtotal) = Subtotal × 1.12 + 5
  // Subtotal = (Total - 5) / 1.12
  const total = invoice.amount;
  const subtotal = total > 5 ? (total - 5) / 1.12 : 0;
  let totalServiceFee = 0;
  if (subtotal > 0) {
    const baseFee = 5;
    const vatAmount = subtotal * 0.12;
    totalServiceFee = baseFee + vatAmount;
  }

  const statusText = invoice.status === 'accepted' ? 'Accepted by Caller' : invoice.status === 'declined' ? 'Declined by Caller' : invoice.status;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.invoiceModalBackground as ViewStyle}
        activeOpacity={1}
        onPress={onClose}
        {...(Platform.OS === 'web' ? { onClick: onClose } as any : {})}
      >
        <TouchableOpacity
          style={styles.invoiceDetailsModal as ViewStyle}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          {...(Platform.OS === 'web' ? { onClick: (e: any) => e.stopPropagation() } as any : {})}
        >
          <View style={styles.invoiceDetailsHeader as ViewStyle}>
            <Text style={styles.invoiceDetailsTitle as TextStyle}>Invoice Details</Text>
          </View>

          <View style={styles.invoiceDetailsContent as ViewStyle}>
            {commissionId && (
              <>
                <View style={styles.invoiceDetailsRow as ViewStyle}>
                  <Text style={styles.invoiceDetailsLabel as TextStyle}>Commission ID:</Text>
                  <Text style={styles.invoiceDetailsValue as TextStyle}>{commissionId}</Text>
                </View>
                {commissionTitle && (
                  <View style={styles.invoiceDetailsRow as ViewStyle}>
                    <Text style={styles.invoiceDetailsLabel as TextStyle}>Commission Title:</Text>
                    <Text style={styles.invoiceDetailsValue as TextStyle}>{commissionTitle}</Text>
                  </View>
                )}
              </>
            )}

            <View style={styles.invoiceDetailsRow as ViewStyle}>
              <Text style={styles.invoiceDetailsLabel as TextStyle}>Subtotal:</Text>
              <Text style={styles.invoiceDetailsValue as TextStyle}>₱{subtotal.toFixed(2)}</Text>
            </View>

            <View style={styles.invoiceDetailsRow as ViewStyle}>
              <Text style={styles.invoiceDetailsLabel as TextStyle}>System Fee (incl. VAT):</Text>
              <Text style={styles.invoiceDetailsValue as TextStyle}>₱{totalServiceFee.toFixed(2)}</Text>
            </View>

            <View style={styles.invoiceDetailsRow as ViewStyle}>
              <Text style={styles.invoiceDetailsLabel as TextStyle}>Total:</Text>
              <Text style={styles.invoiceDetailsValue as TextStyle}>₱{total.toFixed(2)}</Text>
            </View>

            <View style={styles.invoiceDetailsRow as ViewStyle}>
              <Text style={styles.invoiceDetailsLabel as TextStyle}>Description:</Text>
              <Text style={styles.invoiceDetailsValue as TextStyle}>{invoice.description}</Text>
            </View>

            <View style={styles.invoiceDetailsRow as ViewStyle}>
              <Text style={styles.invoiceDetailsLabel as TextStyle}>Status:</Text>
              <Text style={styles.invoiceDetailsValue as TextStyle}>{statusText}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.invoiceDetailsOkButton as ViewStyle}
            onPress={onClose}
            {...(Platform.OS === 'web' ? { onClick: onClose } as any : {})}
          >
            <Text style={styles.invoiceDetailsOkText as TextStyle}>OK</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
