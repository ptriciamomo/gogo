import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DateOption {
  year: number;
  month: number;
  day: number;
  formatted: string;
  display: string;
}

interface RunnerDatePickerModalProps {
  styles: any;
  visible: boolean;
  dateOptions: DateOption[];
  onClose: () => void;
  onSelectDate: (year: number, month: number, day: number) => void;
}

export function RunnerDatePickerModal({
  styles,
  visible,
  dateOptions,
  onClose,
  onSelectDate,
}: RunnerDatePickerModalProps) {
  if (!visible) return null;

  return (
    <View style={styles.datePickerModal as ViewStyle}>
      <View style={styles.datePickerContainer as ViewStyle}>
        <View style={styles.datePickerHeader as ViewStyle}>
          <Text style={styles.datePickerTitle as TextStyle}>Select Due Date</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#8B2323" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.datePickerList as ViewStyle}>
          {dateOptions.map((dateOption, index) => (
            <TouchableOpacity
              key={index}
              style={styles.dateOption as ViewStyle}
              onPress={() => onSelectDate(dateOption.year, dateOption.month, dateOption.day)}
            >
              <Text style={styles.dateOptionText as TextStyle}>{dateOption.display}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

