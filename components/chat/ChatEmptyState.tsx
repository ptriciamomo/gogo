import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { responsive, rf } from '../../utils/responsive';

interface ChatEmptyStateProps {
  isDateFiltered: boolean;
  selectedDate: string | null;
  formatDateForDisplay: (dateString: string | null) => string;
  onClearFilter: () => void;
}

export default function ChatEmptyState({
  isDateFiltered,
  selectedDate,
  formatDateForDisplay,
  onClearFilter,
}: ChatEmptyStateProps) {
  if (isDateFiltered) {
    return (
      <View style={styles.emptyState as ViewStyle}>
        <Ionicons name="calendar-outline" size={48} color="#8B2323" style={{ marginBottom: 16 }} />
        <Text style={styles.emptyStateText as TextStyle}>No invoices found</Text>
        <Text style={styles.emptyStateSubtext as TextStyle}>
          No invoices were found for {formatDateForDisplay(selectedDate)}. Try selecting a different date.
        </Text>
        <TouchableOpacity 
          onPress={onClearFilter}
          style={styles.clearFilterActionButton as ViewStyle}
        >
          <Ionicons name="refresh" size={16} color="white" />
          <Text style={styles.clearFilterActionButtonText as TextStyle}>Clear Filter</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.emptyState as ViewStyle}>
      <Text style={styles.emptyStateText as TextStyle}>No messages yet</Text>
      <Text style={styles.emptyStateSubtext as TextStyle}>Start a conversation with your runner</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: rf(18),
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: rf(14),
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  clearFilterActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B2323',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  clearFilterActionButtonText: {
    color: 'white',
    fontSize: rf(14),
    fontWeight: '600',
    marginLeft: 8,
  },
});

