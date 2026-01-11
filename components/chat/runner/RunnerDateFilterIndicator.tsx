import React from 'react';
import { View, Text, TouchableOpacity, Platform, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RunnerDateFilterIndicatorProps {
  styles: any;
  isDateFiltered: boolean;
  selectedDate: string | null;
  formatDateForDisplay: (dateString: string | null) => string;
  onClearFilter: () => void;
}

export function RunnerDateFilterIndicator({
  styles,
  isDateFiltered,
  selectedDate,
  formatDateForDisplay,
  onClearFilter,
}: RunnerDateFilterIndicatorProps) {
  if (!isDateFiltered) return null;

  return (
    <View style={styles.dateFilterIndicator as ViewStyle}>
      <Ionicons name="calendar" size={16} color="#8B2323" />
      <Text style={styles.dateFilterText as TextStyle}>
        Showing invoices for {formatDateForDisplay(selectedDate)}
      </Text>
      <TouchableOpacity 
        onPress={onClearFilter}
        style={styles.dateFilterClearButton as ViewStyle}
        {...(Platform.OS === 'web' ? { onClick: onClearFilter } as any : {})}
      >
        <Ionicons name="close-circle" size={16} color="#8B2323" />
      </TouchableOpacity>
    </View>
  );
}

