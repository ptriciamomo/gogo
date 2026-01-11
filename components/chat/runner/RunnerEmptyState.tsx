import React from 'react';
import { View, Text, TouchableOpacity, Platform, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RunnerEmptyStateProps {
  styles: any;
  isDateFiltered: boolean;
  onClearFilter: () => void;
}

export function RunnerEmptyState({
  styles,
  isDateFiltered,
  onClearFilter,
}: RunnerEmptyStateProps) {
  return (
    <View style={styles.emptyState as ViewStyle}>
      <Text style={styles.emptyStateText as TextStyle}>
        {isDateFiltered ? 'No invoices found for this date' : 'No messages yet'}
      </Text>
      <Text style={styles.emptyStateSubtext as TextStyle}>
        {isDateFiltered
          ? 'Try selecting a different date'
          : 'Start a conversation by sending a message below'}
      </Text>
      {isDateFiltered && (
        <TouchableOpacity
          style={styles.clearFilterActionButton as ViewStyle}
          onPress={onClearFilter}
          {...(Platform.OS === 'web' ? ({ onClick: onClearFilter } as any) : {})}
        >
          <Ionicons name="close-circle" size={16} color="white" />
          <Text style={styles.clearFilterActionButtonText as TextStyle}>Clear Filter</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}


