import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';

interface CommissionSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  commissionId?: string;
  onCommissionReleased?: () => void;
  onDateFiltered?: (filteredInvoices: any[]) => void;
  userRole?: 'BuddyCaller' | 'BuddyRunner'; // Add userRole prop
}

const CommissionSettingsModal: React.FC<CommissionSettingsModalProps> = ({
  visible,
  onClose,
  conversationId,
  commissionId,
  onCommissionReleased,
  onDateFiltered,
  userRole = 'BuddyCaller', // Default to BuddyCaller for backward compatibility
}) => {
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const handleFindNewRunner = async () => {
    if (!commissionId) {
      Alert.alert('Error', 'No commission ID found');
      return;
    }

    Alert.alert(
      'Find New Runner',
      'Are you sure you want to release this commission and find a new runner? This will remove the current runner from this commission.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release Commission',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              // First, get the current runner_id before updating
              const { data: currentCommission, error: fetchError } = await supabase
                .from('commission')
                .select('runner_id')
                .eq('id', commissionId)
                .single();

              if (fetchError) throw fetchError;

              // When caller finds new runner, reset commission to pending and track declined runner
              // BUT ONLY if the commission is in a resettable status (not completed, cancelled, or delivered)
              const { error } = await supabase
                .from('commission')
                .update({ 
                  status: 'pending',
                  runner_id: null,
                  declined_runner_id: currentCommission?.runner_id || null, // Track the declined runner
                  updated_at: new Date().toISOString()
                })
                .eq('id', commissionId)
                .in('status', ['pending', 'accepted', 'in_progress']);

              if (error) throw error;

              // Update rejected_at timestamp in invoices table for this commission
              if (currentCommission?.runner_id) {
                try {
                  await supabase
                    .from('invoices')
                    .update({ 
                      rejected_at: new Date().toISOString()
                    })
                    .eq('commission_id', commissionId);
                  console.log('Updated rejected_at timestamp for commission:', commissionId);
                } catch (invoiceError) {
                  console.warn('Failed to update rejected_at timestamp:', invoiceError);
                  // Don't fail the entire operation if invoice update fails
                }
              }

              // Also update any related task_progress records to reset their status
              try {
                await supabase
                  .from('task_progress')
                  .update({
                    status: 'pending',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('commission_id', commissionId);
              } catch (taskError) {
                console.warn('Failed to update task_progress:', taskError);
                // Don't fail the entire operation if task_progress update fails
              }

              // Send system message about commission release
              await supabase
                .from('messages')
                .insert({
                  conversation_id: conversationId,
                  sender_id: (await supabase.auth.getUser()).data.user?.id,
                  message_text: 'Commission released. Looking for a new runner.',
                  message_type: 'system',
                });

              Alert.alert('Success', 'Commission has been released. Other runners can now accept it.');
              onCommissionReleased?.();
              onClose();
            } catch (error) {
              console.error('Error releasing commission:', error);
              Alert.alert('Error', 'Failed to release commission. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleFilterByDate = () => {
    setShowDatePicker(true);
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setSelectedDate(selectedDate);
      filterInvoicesByDate(selectedDate);
    }
  };

  const handleCustomDateSelect = (day: number) => {
    const newDate = new Date(currentYear, currentMonth, day);
    setSelectedDate(newDate);
    setShowDatePicker(false);
    filterInvoicesByDate(newDate);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear(currentYear - 1);
      } else {
        setCurrentMonth(currentMonth - 1);
      }
    } else {
      if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear(currentYear + 1);
      } else {
        setCurrentMonth(currentMonth + 1);
      }
    }
  };

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Generate year options (current year ± 5 years)
  const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
      years.push(i);
    }
    return years;
  };

  const yearOptions = generateYearOptions();

  const filterInvoicesByDate = async (date: Date) => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        console.error('No current user found');
        Alert.alert('Error', 'User not authenticated.');
        return;
      }
      
      // Format date to YYYY-MM-DD for database query using local timezone
      // Use local date components to avoid timezone offset issues
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      console.log('=== DATE FILTERING DEBUG ===');
      console.log('Original date object:', date);
      console.log('Date components:', { year, month, day });
      console.log('Formatted date string:', dateString);
      console.log('Date string for query:', dateString);
      console.log('Query time range:', `${dateString}T00:00:00` + ' to ' + `${dateString}T23:59:59`);
      console.log('=== END DATE FILTERING DEBUG ===');
      
      // First, get all invoices for this conversation and date
      const { data: invoices, error: invoicesError } = await supabase
        .from('invoices')
        .select('*')
        .eq('conversation_id', conversationId)
        .gte('created_at', `${dateString}T00:00:00`)
        .lte('created_at', `${dateString}T23:59:59`);

      console.log('Invoice query details:', {
        conversationId,
        dateString,
        startTime: `${dateString}T00:00:00`,
        endTime: `${dateString}T23:59:59`,
        queryResult: invoices,
        error: invoicesError
      });

      if (invoicesError) {
        console.error('Error fetching invoices by date:', invoicesError);
        Alert.alert('Error', 'Failed to fetch invoices for the selected date.');
        return;
      }

      console.log('Found invoices:', invoices);

      // Get all messages from the selected date
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .gte('created_at', `${dateString}T00:00:00`)
        .lte('created_at', `${dateString}T23:59:59`)
        .order('created_at', { ascending: true });

      console.log('Message query details:', {
        conversationId,
        dateString,
        startTime: `${dateString}T00:00:00`,
        endTime: `${dateString}T23:59:59`,
        queryResult: messages,
        error: messagesError
      });

      if (messagesError) {
        console.error('Error fetching messages by date:', messagesError);
        Alert.alert('Error', 'Failed to fetch messages for the selected date.');
        return;
      }

      console.log('Found messages for date:', messages);

      if (!messages || messages.length === 0) {
        console.log('No messages found for this date');
        const filteredData = {
          invoices: invoices || [],
          messages: [],
          selectedDate: dateString,
          oldestInvoiceMessageId: null
        };
        onDateFiltered?.(filteredData);
        onClose();
        return;
      }

      // Create a map of message_id to invoice
      const invoiceMap = new Map();
      invoices?.forEach(invoice => {
        if (invoice.message_id) {
          invoiceMap.set(invoice.message_id, invoice);
        }
      });

      // Find the oldest invoice by message created_at timestamp (when invoice was sent)
      // We need to find the message with invoice that has the earliest timestamp
      let oldestInvoiceMessage = null;
      let oldestTime = Infinity;
      
      if (messages && messages.length > 0) {
        messages.forEach(message => {
          const invoice = invoiceMap.get(message.id);
          if (invoice) {
            const messageTime = new Date(message.created_at).getTime();
            if (messageTime < oldestTime) {
              oldestTime = messageTime;
              oldestInvoiceMessage = message;
            }
          }
        });
      }

      console.log('Oldest invoice message:', oldestInvoiceMessage);
      console.log('Oldest invoice message time:', oldestInvoiceMessage ? new Date(oldestInvoiceMessage.created_at) : 'N/A');

      // Process all messages with their invoice data
      const processedMessages = messages?.map(message => {
        const invoice = invoiceMap.get(message.id);
        
        // Convert to ChatMessage format
        const isImage = message.message_type === 'image';
        const isFile = message.message_type === 'file';
        const isSystem = message.message_type === 'system';
        let invoiceData: any = undefined;
        let text = message.message_text || '';

        // If invoice data is provided, use it
        if (invoice) {
          const normalizedStatus = invoice.status === 'rejected' ? 'declined' : (invoice.status || 'pending');
          invoiceData = {
            id: invoice.id,
            amount: parseFloat(invoice.amount),
            currency: invoice.currency || 'PHP',
            description: invoice.description || '',
            dueDate: invoice.due_date || '',
            status: normalizedStatus,
          };
          text = ''; // Clear text when invoice is present
        }

        return {
          id: message.id,
          text,
          isFromUser: isSystem ? false : message.sender_id === currentUser.id,
          attachment: (isImage || isFile) && message.file_url ? {
            type: isImage ? 'image' : 'document',
            uri: message.file_url,
            name: message.file_name || 'file',
            size: message.file_size || 0,
          } : undefined,
          invoice: invoiceData,
          timestamp: message.created_at ? new Date(message.created_at) : new Date(),
        };
      }) || [];

      console.log('Processed messages:', processedMessages);
      console.log('Processed messages count:', processedMessages.length);
      console.log('Oldest invoice message ID:', oldestInvoiceMessage?.id);

      // Return data with all messages and oldest invoice message ID
      const filteredData = {
        invoices: invoices || [],
        messages: processedMessages,
        selectedDate: dateString,
        oldestInvoiceMessageId: oldestInvoiceMessage?.id || null,
        hasInvoices: (invoices && invoices.length > 0) || false
      };

      console.log('Sending filtered data to callback:', filteredData);
      console.log('Filtered data summary:', {
        invoiceCount: filteredData.invoices.length,
        messageCount: filteredData.messages.length,
        oldestInvoiceMessageId: filteredData.oldestInvoiceMessageId,
        oldestInvoiceMessageTime: oldestInvoiceMessage ? new Date(oldestInvoiceMessage.created_at).toLocaleString() : 'N/A',
        selectedDate: filteredData.selectedDate,
        hasInvoices: filteredData.hasInvoices
      });
      
      // Call the callback with filtered data
      onDateFiltered?.(filteredData);
      
      // Close the modal immediately after applying filter
      onClose();
      
    } catch (error) {
      console.error('Error filtering invoices by date:', error);
      Alert.alert('Error', 'Failed to filter invoices by date.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Commission Settings</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#8B2323" />
            </TouchableOpacity>
          </View>

          <View style={styles.options}>
            {/* Find New Runner - Only show for BuddyCaller */}
            {userRole === 'BuddyCaller' && (
              <TouchableOpacity
                style={styles.option}
                onPress={handleFindNewRunner}
                disabled={loading}
              >
                <View style={styles.optionIcon}>
                  <Ionicons name="people" size={24} color="#8B2323" />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Find New Runner</Text>
                  <Text style={styles.optionDescription}>
                    Release this commission and find a different runner
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#B04A4A" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.option}
              onPress={handleFilterByDate}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="calendar" size={24} color="#8B2323" />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Filter by Date</Text>
                <Text style={styles.optionDescription}>
                  Filter invoices by specific dates
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#B04A4A" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Custom Date Picker Modal */}
      {showDatePicker && (
        <View style={styles.datePickerOverlay}>
          <View style={styles.datePickerModal}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>Select Date</Text>
              <TouchableOpacity 
                onPress={() => setShowDatePicker(false)}
                style={styles.datePickerCloseButton}
              >
                <Ionicons name="close" size={24} color="#8B2323" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.datePickerContent}>
              {/* Month/Year Dropdowns */}
              <View style={styles.dropdownContainer}>
                <View style={styles.dropdownRow}>
                  <View style={styles.dropdownItem}>
                    <Text style={styles.dropdownLabel}>Month:</Text>
                    <TouchableOpacity
                      style={styles.dropdown}
                      onPress={() => {
                        Alert.alert(
                          'Select Month',
                          '',
                          monthNames.map((month, index) => ({
                            text: month,
                            onPress: () => setCurrentMonth(index)
                          }))
                        );
                      }}
                    >
                      <Text style={styles.dropdownText}>{monthNames[currentMonth]}</Text>
                      <Ionicons name="chevron-down" size={16} color="#8B2323" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dropdownItem}>
                    <Text style={styles.dropdownLabel}>Year:</Text>
                    <TouchableOpacity
                      style={styles.dropdown}
                      onPress={() => {
                        Alert.alert(
                          'Select Year',
                          '',
                          yearOptions.map((year) => ({
                            text: year.toString(),
                            onPress: () => setCurrentYear(year)
                          }))
                        );
                      }}
                    >
                      <Text style={styles.dropdownText}>{currentYear}</Text>
                      <Ionicons name="chevron-down" size={16} color="#8B2323" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Month/Year Navigation */}
              <View style={styles.monthNavigation}>
                <TouchableOpacity 
                  onPress={() => navigateMonth('prev')}
                  style={styles.navButton}
                >
                  <Ionicons name="chevron-back" size={20} color="#8B2323" />
                </TouchableOpacity>
                
                <Text style={styles.monthYearText}>
                  {monthNames[currentMonth]} {currentYear}
                </Text>
                
                <TouchableOpacity 
                  onPress={() => navigateMonth('next')}
                  style={styles.navButton}
                >
                  <Ionicons name="chevron-forward" size={20} color="#8B2323" />
                </TouchableOpacity>
              </View>

              {/* Day Names Header */}
              <View style={styles.dayNamesRow}>
                {dayNames.map((day) => (
                  <Text key={day} style={styles.dayName}>{day}</Text>
                ))}
              </View>

              {/* Calendar Grid */}
              <View style={styles.calendarGrid}>
                {Array.from({ length: getFirstDayOfMonth(currentMonth, currentYear) }, (_, i) => (
                  <View key={`empty-${i}`} style={styles.dayCell} />
                ))}
                
                {Array.from({ length: getDaysInMonth(currentMonth, currentYear) }, (_, i) => {
                  const day = i + 1;
                  const isSelected = selectedDate.getDate() === day && 
                                   selectedDate.getMonth() === currentMonth && 
                                   selectedDate.getFullYear() === currentYear;
                  const isToday = new Date().getDate() === day && 
                                new Date().getMonth() === currentMonth && 
                                new Date().getFullYear() === currentYear;
                  
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayCell,
                        isSelected && styles.selectedDay,
                        isToday && styles.todayDay
                      ]}
                      onPress={() => handleCustomDateSelect(day)}
                    >
                      <Text style={[
                        styles.dayText,
                        isSelected && styles.selectedDayText,
                        isToday && !isSelected && styles.todayDayText
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9E8',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B2323',
  },
  closeButton: {
    padding: 4,
  },
  options: {
    padding: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#F9F9F9',
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B2323',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },

  // Custom Date Picker Styles
  datePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  datePickerModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxWidth: 350,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9E8',
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B2323',
  },
  datePickerCloseButton: {
    padding: 4,
  },
  datePickerContent: {
    padding: 20,
  },
  dropdownContainer: {
    marginBottom: 15,
  },
  dropdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dropdownItem: {
    flex: 1,
    marginHorizontal: 5,
  },
  dropdownLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B2323',
    marginBottom: 8,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#EDE9E8',
  },
  dropdownText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  monthNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  navButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#FFF5F5',
  },
  monthYearText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8B2323',
  },
  dayNamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  dayName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    width: 40,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  dayCell: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderRadius: 20,
  },
  selectedDay: {
    backgroundColor: '#8B2323',
  },
  todayDay: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#8B2323',
  },
  dayText: {
    fontSize: 16,
    color: '#333',
  },
  selectedDayText: {
    color: 'white',
    fontWeight: '600',
  },
  todayDayText: {
    color: '#8B2323',
    fontWeight: '600',
  },
});

export default CommissionSettingsModal;
