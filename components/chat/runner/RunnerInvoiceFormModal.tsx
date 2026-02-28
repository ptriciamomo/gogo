import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Keyboard, Platform, type ViewStyle, type TextStyle } from 'react-native';

interface InvoiceData {
  amount: string;
  currency: string;
  description: string;
}

interface RunnerInvoiceFormModalProps {
  styles: any;
  visible: boolean;
  editingInvoice: string | null;
  invoiceData: InvoiceData;
  onAmountChange: (text: string) => void;
  onDescriptionChange: (text: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  commissionId?: string | number | null;
  commissionTitle?: string | null;
}

export function RunnerInvoiceFormModal({
  styles,
  visible,
  editingInvoice,
  invoiceData,
  onAmountChange,
  onDescriptionChange,
  onCancel,
  onSubmit,
  commissionId,
  commissionTitle,
}: RunnerInvoiceFormModalProps) {
  if (!visible) return null;

  // Calculate breakdown values
  const calculateBreakdown = () => {
    const subtotal = invoiceData.amount ? parseFloat(invoiceData.amount || '0') : 0;
    let totalServiceFee = 0;
    if (subtotal > 0) {
      const baseFee = 5;
      const vatAmount = subtotal * 0.12;
      totalServiceFee = baseFee + vatAmount;
    }
    const total = subtotal + totalServiceFee;
    return {
      subtotal: subtotal.toFixed(2),
      serviceFee: totalServiceFee.toFixed(2),
      total: total.toFixed(2),
    };
  };

  const breakdown = calculateBreakdown();

  return (
    <View style={styles.invoiceModal as ViewStyle}>
      <TouchableOpacity
        style={styles.invoiceModalBackground as ViewStyle}
        activeOpacity={1}
        onPress={() => Keyboard.dismiss()}
      >
        <TouchableOpacity
          style={styles.invoiceForm as ViewStyle}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.invoiceFormHeader as ViewStyle}>
            <Text style={styles.invoiceFormTitle as TextStyle}>
              {editingInvoice ? 'Edit Invoice' : 'Create Invoice'}
            </Text>
            <TouchableOpacity onPress={onCancel}>
              <Text style={{ fontSize: 24, color: '#8B2323' }}>×</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.invoiceFormContent as ViewStyle}
            activeOpacity={1}
            onPress={() => Keyboard.dismiss()}
          >
            {/* Commission ID and Title */}
            {commissionId && (
              <View style={styles.invoiceFormField as ViewStyle}>
                <View style={styles.invoiceBreakdownRow as ViewStyle}>
                  <Text style={styles.invoiceBreakdownLabel as TextStyle}>Commission ID:</Text>
                  <Text style={styles.invoiceBreakdownValue as TextStyle}>{commissionId}</Text>
                </View>
                {commissionTitle && (
                  <View style={styles.invoiceBreakdownRow as ViewStyle}>
                    <Text style={styles.invoiceBreakdownLabel as TextStyle}>Commission Title:</Text>
                    <Text style={styles.invoiceBreakdownValue as TextStyle}>{commissionTitle}</Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={styles.invoiceFormField as ViewStyle}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.invoiceFormLabel as TextStyle}>Amount *</Text>
              <View style={styles.amountInputContainer as ViewStyle}>
                <Text style={styles.currencySymbol as TextStyle}>₱</Text>
                <TextInput
                  style={styles.amountInput as TextStyle}
                  value={invoiceData.amount}
                  onChangeText={onAmountChange}
                  placeholder="0.00"
                  keyboardType="numeric"
                  {...(Platform.OS === 'web' ? ({ inputMode: 'decimal' } as any) : {})}
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.invoiceFormField as ViewStyle}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.invoiceFormLabel as TextStyle}>Description *</Text>
              <TextInput
                style={[styles.invoiceFormInput as TextStyle, styles.invoiceFormTextArea as TextStyle]}
                value={invoiceData.description}
                onChangeText={onDescriptionChange}
                placeholder="Enter invoice description"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                }}
              />
            </TouchableOpacity>

            {/* Subtotal and Service Fee Fields */}
            <View style={styles.invoiceBreakdownContainer as ViewStyle}>
              <View style={styles.invoiceBreakdownRow as ViewStyle}>
                <Text style={styles.invoiceBreakdownLabel as TextStyle}>Subtotal</Text>
                <Text style={styles.invoiceBreakdownValue as TextStyle}>
                  ₱{breakdown.subtotal}
                </Text>
              </View>
              <View style={styles.invoiceBreakdownRow as ViewStyle}>
                <Text style={styles.invoiceBreakdownLabel as TextStyle}>System Fee (incl. VAT)</Text>
                <Text style={styles.invoiceBreakdownValue as TextStyle}>
                  ₱{breakdown.serviceFee}
                </Text>
              </View>
              <View style={[styles.invoiceBreakdownRow as ViewStyle, styles.invoiceTotalRow as ViewStyle]}>
                <Text style={styles.invoiceTotalLabel as TextStyle}>Total</Text>
                <Text style={styles.invoiceTotalValue as TextStyle}>
                  ₱{breakdown.total}
                </Text>
              </View>
            </View>

          </TouchableOpacity>

          <View style={styles.invoiceFormButtons as ViewStyle}>
            <TouchableOpacity
              style={styles.invoiceFormCancelButton as ViewStyle}
              onPress={onCancel}
            >
              <Text style={styles.invoiceFormCancelText as TextStyle}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.invoiceFormSubmitButton as ViewStyle}
              onPress={onSubmit}
            >
              <Text style={styles.invoiceFormSubmitText as TextStyle}>
                {editingInvoice ? 'Update Invoice' : 'Send Invoice'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

