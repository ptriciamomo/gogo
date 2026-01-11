import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import CommissionSummary from '../../components/CommissionSummary';
import { supabase } from '../../lib/supabase';
import { responsive, rw, rh, rf, rp, rb } from '../../utils/responsive';

/* ───────── helpers ───────── */
function toDueAtISO(completionDate?: string, completionTime?: string) {
  if (!completionDate || !completionTime) return null;
  const [mm, dd, yy] = completionDate.split('/');
  const [time, period] = completionTime.split(' ');
  if (!mm || !dd || !yy || !time || !period) return null;

  let [h, m] = time.split(':').map((v) => parseInt(v, 10));
  if (Number.isNaN(h)) return null;
  if (Number.isNaN(m)) m = 0;

  const up = (period || '').toUpperCase();
  if (up === 'PM' && h !== 12) h += 1;
  if (up === 'AM' && h === 12) h = 0;

  const fullYear = 2000 + parseInt(yy, 10);
  const d = new Date(fullYear, parseInt(mm, 10) - 1, parseInt(dd, 10), h, m, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function createCommission(input: {
  title: string;
  description: string;
  selectedTypes: string[];
  completionDate: string;
  completionTime: string;
  isMeetup: boolean;
  meetupLocation: string;
}) {
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) throw new Error(authErr?.message || 'Not authenticated');

  const due_at = toDueAtISO(input.completionDate, input.completionTime);

  const { data, error } = await supabase
    .from('commission')
    .insert({
      title: input.title?.trim(),
      description: input.description?.trim() || null,
      commission_type: input.selectedTypes && input.selectedTypes.length > 0 ? input.selectedTypes.join(',') : null,
      buddycaller_id: auth.user.id,
      status: 'pending',
      due_at,
      scheduled_meetup: !!input.isMeetup,
      meetup_location: input.isMeetup ? (input.meetupLocation?.trim() || null) : null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* ───────────────────────── Types ───────────────────────── */
type CommissionType = { id: string; label: string; value: string };
type Category = { id: string; title: string; isExpanded: boolean; types: CommissionType[] };
type FormData = {
  title: string;
  description: string;
  selectedTypes: string[];
  completionDate: string;
  completionTime: string;
  isMeetup: boolean;
  meetupLocation: string;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/* ─────────────────────── Component ─────────────────────── */
const PostCommission: React.FC = () => {
  const router = useRouter();

  const now = useMemo(() => new Date(), []);

  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    selectedTypes: [],
    completionDate: '', // Default to blank
    completionTime: '', // Default to blank
    isMeetup: false,
    meetupLocation: '',
  });

  const [showSummary, setShowSummary] = useState(false);
  const [showCommissionTypes, setShowCommissionTypes] = useState(false);

  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[now.getMonth()]);
  const [selectedDay, setSelectedDay] = useState(now.getDate());

  // Function to check if a selected date/time is in the past
  const isDateInPast = (year: string, month: string, day: number, hour?: number, minute?: number, period?: 'AM' | 'PM') => {
    const selectedDate = new Date();
    selectedDate.setFullYear(parseInt(year));
    selectedDate.setMonth(getMonthNumber(month));
    selectedDate.setDate(day);
    
    if (hour !== undefined && minute !== undefined && period !== undefined) {
      let adjustedHour = hour;
      if (period === 'PM' && hour !== 12) adjustedHour += 12;
      if (period === 'AM' && hour === 12) adjustedHour = 0;
      selectedDate.setHours(adjustedHour, minute, 0, 0);
    } else {
      selectedDate.setHours(23, 59, 59, 999); // End of day if no time specified
    }
    
    return selectedDate < now;
  };

  // Function to reset time field whenever date changes
  const resetTimeOnDateChange = () => {
    // Clear the time field and reset time picker to default values
    setFormData(prev => ({ ...prev, completionTime: '' }));
    setHour(12);
    setMinute(0);
    setPeriod('PM');
  };

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerPhase, setPickerPhase] = useState<'time' | 'date'>('time');
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('PM');

  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const [categories, setCategories] = useState<Category[]>([
    {
      id: 'visual-media',
      title: 'Visual Media Services',
      isExpanded: true,
      types: [
        { id: 'photography', label: 'Photography', value: 'photography' },
        { id: 'videography', label: 'Videography', value: 'videography' },
      ],
    },
    {
      id: 'graphic-design',
      title: 'Graphic Design',
      isExpanded: true,
      types: [
        { id: 'posters', label: 'Posters', value: 'posters' },
        { id: 'logos', label: 'Logos', value: 'logos' },
      ],
    },
    {
      id: 'editing',
      title: 'Editing',
      isExpanded: true,
      types: [
        { id: 'photo-editing', label: 'Photo Editing', value: 'photo-editing' },
        { id: 'video-editing', label: 'Video Editing', value: 'video-editing' },
      ],
    },
  ]);

  const getMonthNumber = (m: string) => MONTHS.indexOf(m) + 1;
  const daysInMonth = (m: string, y: string) => new Date(parseInt(y), getMonthNumber(m), 0).getDate();

  const calendarCells = useMemo(() => {
    const total = daysInMonth(selectedMonth, selectedYear);
    const first = new Date(parseInt(selectedYear), getMonthNumber(selectedMonth) - 1, 1).getDay();
    const cells: (number | null)[] = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [selectedMonth, selectedYear]);

  const toggleCategory = (id: string) =>
    setCategories(prev => prev.map(c => (c.id === id ? { ...c, isExpanded: !c.isExpanded } : c)));

  const toggleType = (val: string) =>
    setFormData(prev => ({
      ...prev,
      selectedTypes: prev.selectedTypes.includes(val)
        ? prev.selectedTypes.filter(v => v !== val)
        : [...prev.selectedTypes, val],
    }));

  // Date-aware time validation: only block past time if selected date is today
  const isSelectedDateToday = () => {
    try {
      const [mm, dd, yy] = formData.completionDate.split('/');
      const fullYear = 2000 + parseInt(yy, 10);
      const d = new Date(fullYear, parseInt(mm, 10) - 1, parseInt(dd, 10));
      const n = new Date();
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
    } catch {
      return false;
    }
  };
  const isTimeInPast = (h: number, m: number, p: 'AM' | 'PM') => {
    if (!isSelectedDateToday()) return false; // only enforce for today
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    // Convert 12-hour to 24-hour
    let hour24 = h;
    if (p === 'AM' && h === 12) hour24 = 0;
    else if (p === 'PM' && h !== 12) hour24 = h + 12;
    if (hour24 < currentHour) return true;
    if (hour24 === currentHour && m <= currentMinute) return true;
    return false;
  };

  const applyTime = (h: number, m: number, p: 'AM' | 'PM') => {
    if (isTimeInPast(h, m, p)) {
      Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
      return;
    }
    setFormData(prev => ({ ...prev, completionTime: `${h}:${String(m).padStart(2, '0')} ${p}` }));
  };
  
  const selectHour = (h: number) => { 
    if (isTimeInPast(h, minute, period)) {
      Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
      return;
    }
    setHour(h); 
    applyTime(h, minute, period); 
  };
  
  const selectMinute = (m: number) => { 
    if (isTimeInPast(hour, m, period)) {
      Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
      return;
    }
    setMinute(m); 
    applyTime(hour, m, period); 
  };
  
  const selectPeriod = (p: 'AM' | 'PM') => { 
    if (isTimeInPast(hour, minute, p)) {
      Alert.alert("Invalid Time", "Please select a time that hasn't passed yet.");
      return;
    }
    setPeriod(p); 
    applyTime(hour, minute, p); 
  };

  const selectMonth = (m: string) => {
    // Check if this month/day/year combination is in the past
    if (isDateInPast(selectedYear, m, selectedDay)) {
      Alert.alert('Invalid Date', 'Please select a future date and time.');
      return;
    }
    
    setSelectedMonth(m);
    const mm = String(getMonthNumber(m)).padStart(2, '0');
    const dd = String(selectedDay).padStart(2, '0');
    const yy = selectedYear.slice(-2);
    const newDate = `${mm}/${dd}/${yy}`;
    setFormData(prev => ({ ...prev, completionDate: newDate }));
    
    // Don't reset time - preserve user's time selection
    setShowMonthPicker(false);
  };
  const selectYear = (y: string) => {
    // Check if this year/month/day combination is in the past
    if (isDateInPast(y, selectedMonth, selectedDay)) {
      Alert.alert('Invalid Date', 'Please select a future date and time.');
      return;
    }
    
    setSelectedYear(y);
    const mm = String(getMonthNumber(selectedMonth)).padStart(2, '0');
    const dd = String(selectedDay).padStart(2, '0');
    const newDate = `${mm}/${dd}/${y.slice(-2)}`;
    setFormData(prev => ({ ...prev, completionDate: newDate }));
    
    // Don't reset time - preserve user's time selection
    setShowYearPicker(false);
  };
  const selectDay = (d: number) => {
    // Check if this day/month/year combination is in the past
    if (isDateInPast(selectedYear, selectedMonth, d)) {
      Alert.alert('Invalid Date', 'Please select a future date and time.');
      return;
    }
    
    setSelectedDay(d);
    const mm = String(getMonthNumber(selectedMonth)).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const yy = selectedYear.slice(-2);
    const newDate = `${mm}/${dd}/${yy}`;
    setFormData(prev => ({ ...prev, completionDate: newDate }));
    
    // Validate existing time only if the new date is today and time is in the past
    if (formData.completionTime) {
      try {
        const [timeStr] = formData.completionTime.split(' ');
        const [hStr, mStr] = timeStr.split(':');
        const h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        const p = formData.completionTime.includes('AM') ? 'AM' : 'PM';
        
        // Check if new date is today
        const fullYear = 2000 + parseInt(yy, 10);
        const selectedDate = new Date(fullYear, parseInt(mm, 10) - 1, d);
        const now = new Date();
        const isToday = selectedDate.getFullYear() === now.getFullYear() && 
                       selectedDate.getMonth() === now.getMonth() && 
                       selectedDate.getDate() === now.getDate();
        
        // Only reset if date is today and time is in the past
        if (isToday && isTimeInPast(h, m, p)) {
          resetTimeOnDateChange();
          Alert.alert('Invalid Time', 'The selected time has passed. Please select a future time.');
        }
      } catch {
        // If time parsing fails, don't reset - let validation handle it later
      }
    }
    
    // If time is already selected, close the picker; otherwise switch to time picker
    // Note: The picker is also closed inline in the onPress handler, but this ensures consistency
    if (formData.completionTime) {
      setShowDatePicker(false);
    } else {
      setPickerPhase('time');
    }
  };

  const validate = () => {
    if (!formData.title.trim()) { Alert.alert('Error', 'Please enter a commission title.'); return false; }
    if (!formData.description.trim()) { Alert.alert('Error', 'Please enter a commission description.'); return false; }
    if (formData.selectedTypes.length === 0) { Alert.alert('Error', 'Please select at least one commission type.'); return false; }
    if (!formData.completionDate.trim()) { Alert.alert('Error', 'Please select a completion date.'); return false; }
    if (!formData.completionTime.trim()) { Alert.alert('Error', 'Please select a completion time.'); return false; }
    if (formData.isMeetup && !formData.meetupLocation.trim()) { Alert.alert('Error', 'Please enter a meetup location.'); return false; }
    return true;
  };

  const submit = () => { if (!validate()) return; setShowSummary(true); };

  const handleConfirm = async () => {
    try {
      await createCommission(formData);
      // Success modal will be shown by CommissionSummary component
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? 'Could not post commission.');
    }
  };

  if (showSummary) {
    // UI unchanged — just pass onConfirm so summary’s Confirm triggers the insert + success alert
    return <CommissionSummary formData={formData} onGoBack={() => setShowSummary(false)} {...({ onConfirm: handleConfirm } as any)} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post a Commission</Text>
        </View>
        <View style={styles.divider} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollViewContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Commission Title:</Text>
            <TextInput
              style={styles.textInput}
              value={formData.title}
              onChangeText={v => setFormData(prev => ({ ...prev, title: v }))}
              placeholder="Enter commission title"
              placeholderTextColor="#B8860B"
            />
          </View>

          {/* Description */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Commission Description:</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={formData.description}
              onChangeText={v => setFormData(prev => ({ ...prev, description: v }))}
              placeholder="Enter commission description"
              placeholderTextColor="#B8860B"
              multiline numberOfLines={4} textAlignVertical="top"
            />
          </View>

          {/* Types */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Commission Type:</Text>
            <TouchableOpacity
              style={styles.commissionTypeDropdown}
              onPress={() => setShowCommissionTypes(v => !v)}
            >
              <Text style={formData.selectedTypes.length ? styles.dropdownText : styles.dropdownPlaceholderText}>
                {formData.selectedTypes.length ? formData.selectedTypes.join(', ') : 'Select Commission'}
              </Text>
              <Ionicons name={showCommissionTypes ? 'chevron-up' : 'chevron-down'} size={16} color="#8B2323" />
            </TouchableOpacity>

            {showCommissionTypes && (
              <View style={styles.commissionTypeContainer}>
                {categories.map(cat => (
                  <View key={cat.id} style={styles.categorySection}>
                    <TouchableOpacity style={styles.categoryHeader} onPress={() => toggleCategory(cat.id)}>
                      <Ionicons name={cat.isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} color="#8B2323" />
                      <Text style={styles.categoryTitle}>{cat.title}</Text>
                    </TouchableOpacity>
                    {cat.isExpanded && (
                      <View style={styles.categoryContent}>
                        {cat.types.map(t => {
                          const selected = formData.selectedTypes.includes(t.value);
                          return (
                            <TouchableOpacity
                              key={t.id}
                              style={styles.checkboxContainer}
                              onPress={() => toggleType(t.value)}
                            >
                              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                                {selected && <Ionicons name="checkmark" size={12} color="white" />}
                              </View>
                              <Text style={styles.checkboxLabel}>{t.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Completion Date & Time */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Completion Date:</Text>

            <View style={styles.dtOuterFrame}>
              <TouchableOpacity
                style={styles.dtField}
                onPress={() => { setShowDatePicker(true); setPickerPhase('date'); }}
              >
                <Text style={[styles.dtFieldText, !formData.completionDate && styles.placeholderText]}>
                  {formData.completionDate || 'Select Date'}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#8B2323" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dtField,
                  !formData.completionDate && [
                    styles.disabledInput,
                    { borderColor: '#ccc' }
                  ]
                ]}
                onPress={() => {
                  if (!formData.completionDate) {
                    Alert.alert('Error', 'Please select a date first.');
                    return;
                  }
                  setShowDatePicker(true);
                  setPickerPhase('time');
                }}
                disabled={!formData.completionDate}
              >
                <Text style={[
                  styles.dtFieldText, 
                  !formData.completionTime && styles.placeholderText,
                  !formData.completionDate && { color: '#999' }
                ]}>
                  {formData.completionTime || 'Select Time'}
                </Text>
                <Ionicons 
                  name="chevron-down" 
                  size={16} 
                  color={!formData.completionDate ? '#999' : '#8B2323'} 
                />
              </TouchableOpacity>
            </View>

            {showDatePicker && pickerPhase === 'time' && (
              <View style={styles.timePickerContainer}>
                <Text style={styles.pickerTitle}>Select Time:</Text>
                <View style={styles.timeHeadersContainer}>
                  <Text style={styles.timeHeader}>Hour</Text>
                  <Text style={styles.timeColon}>:</Text>
                  <Text style={styles.timeHeader}>Minute</Text>
                  <Text style={styles.timeHeader}>Period</Text>
                </View>
                <View style={styles.timeWheelsContainer}>
                  <View style={styles.timeWheel}>
                    <View style={styles.wheelContainer}>
                      <ScrollView style={styles.wheelScrollView} showsVerticalScrollIndicator={false}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                          <TouchableOpacity
                            key={h}
                            style={[styles.wheelOption, hour === h && styles.selectedWheelOption]}
                            onPress={() => selectHour(h)}
                          >
                            <Text style={[styles.wheelOptionText, hour === h && styles.selectedWheelOptionText]}>
                              {h}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                  <View style={styles.timeWheel}>
                    <View style={styles.wheelContainer}>
                      <ScrollView style={styles.wheelScrollView} showsVerticalScrollIndicator={false}>
                        {Array.from({ length: 60 }, (_, i) => i).map(m => (
                          <TouchableOpacity
                            key={m}
                            style={[styles.wheelOption, minute === m && styles.selectedWheelOption]}
                            onPress={() => selectMinute(m)}
                          >
                            <Text style={[styles.wheelOptionText, minute === m && styles.selectedWheelOptionText]}>
                              {String(m).padStart(2, '0')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                  <View style={styles.timeWheel}>
                    <View style={styles.wheelContainer}>
                      <ScrollView style={styles.wheelScrollView} showsVerticalScrollIndicator={false}>
                        {(['AM', 'PM'] as const).map(p => (
                          <TouchableOpacity
                            key={p}
                            style={[styles.wheelOption, period === p && styles.selectedWheelOption]}
                            onPress={() => selectPeriod(p)}
                          >
                            <Text style={[styles.wheelOptionText, period === p && styles.selectedWheelOptionText]}>
                              {p}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={styles.timeSaveButton} onPress={() => {
                  // If date is already selected, close the picker; otherwise switch to date picker
                  if (formData.completionDate) {
                    setShowDatePicker(false);
                  } else {
                    setPickerPhase('date');
                  }
                }}>
                  <Text style={styles.timeSaveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}

            {showDatePicker && pickerPhase === 'date' && (
              <View style={styles.calendarHeader}>
                <TouchableOpacity
                  style={styles.monthYearSelector}
                  onPress={() => { setShowMonthPicker(v => !v); setShowYearPicker(false); }}
                >
                  <Text style={styles.monthYearText}>{selectedMonth}</Text>
                  <Ionicons name="chevron-down" size={12} color="#8B2323" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.monthYearSelector}
                  onPress={() => { setShowYearPicker(v => !v); setShowMonthPicker(false); }}
                >
                  <Text style={styles.monthYearText}>{selectedYear}</Text>
                  <Ionicons name="chevron-down" size={12} color="#8B2323" />
                </TouchableOpacity>
              </View>
            )}

            {showDatePicker && pickerPhase === 'date' && showMonthPicker && (
              <View style={styles.pickerContainer}>
                <Text style={styles.pickerTitle}>Select Month:</Text>
                <View style={styles.pickerOptions}>
                  {(() => {
                    const currentYear = now.getFullYear();
                    const currentMonthIdx = now.getMonth();
                    const monthsToShow = parseInt(selectedYear) === currentYear
                      ? MONTHS.slice(currentMonthIdx)
                      : MONTHS;
                    return monthsToShow.map(m => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.pickerOption, selectedMonth === m && styles.selectedPickerOption]}
                        onPress={() => selectMonth(m)}
                      >
                        <Text
                          style={[styles.pickerOptionText, selectedMonth === m && styles.selectedPickerOptionText]}
                        >
                          {m}
                        </Text>
                      </TouchableOpacity>
                    ));
                  })()}
                </View>
              </View>
            )}

            {showDatePicker && pickerPhase === 'date' && showYearPicker && (
              <View style={styles.pickerContainer}>
                <Text style={styles.pickerTitle}>Select Year:</Text>
                <View style={styles.pickerOptions}>
                  {Array.from({ length: 6 }, (_, i) => String(now.getFullYear() + i)).map(y => (
                    <TouchableOpacity
                      key={y}
                      style={[styles.pickerOption, selectedYear === y && styles.selectedPickerOption]}
                      onPress={() => selectYear(y)}
                    >
                      <Text style={[styles.pickerOptionText, selectedYear === y && styles.selectedPickerOptionText]}>
                        {y}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {showDatePicker && pickerPhase === 'date' && (
              <View style={styles.daysOfWeek}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <Text key={d} style={styles.dayText}>{d}</Text>
                ))}
              </View>
            )}

            {showDatePicker && pickerPhase === 'date' && (
              <View style={styles.calendarGrid}>
                {calendarCells.map((d, i) => {
                  if (d === null) return <View key={i} style={[styles.calendarDay, styles.disabledDay]} />;
                  const sel = d === selectedDay;
                  const isCurrentYear = parseInt(selectedYear) === now.getFullYear();
                  const isCurrentMonth = MONTHS.indexOf(selectedMonth) === now.getMonth();
                  const isPastDay = isCurrentYear && isCurrentMonth && d < now.getDate();
                  if (isPastDay) {
                    return (
                      <View key={i} style={[styles.calendarDay, styles.disabledDay]}>
                        <Text style={styles.calendarDayText}>{d}</Text>
                      </View>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.calendarDay, sel && styles.selectedDay]}
                      onPress={() => selectDay(d)}
                    >
                      <Text style={[styles.calendarDayText, sel && styles.selectedDayText]}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Meet-up */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Scheduled Meet-up</Text>
            <View style={styles.meetupContainer}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() =>
                  setFormData(p => ({
                    ...p,
                    isMeetup: !p.isMeetup,
                    meetupLocation: !p.isMeetup ? p.meetupLocation : '',
                  }))
                }
              >
                <View style={[styles.checkbox, formData.isMeetup && styles.checkboxSelected]}>
                  {formData.isMeetup && <Ionicons name="checkmark" size={12} color="white" />}
                </View>
                <Text style={styles.checkboxLabel}>Meet-up</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.textInput, !formData.isMeetup && styles.disabledInput]}
                value={formData.meetupLocation}
                onChangeText={v => setFormData(prev => ({ ...prev, meetupLocation: v }))}
                placeholder="Specific Location within the campus"
                placeholderTextColor="#B8860B"
                editable={formData.isMeetup}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.buttonSection}>
        <TouchableOpacity style={styles.confirmButton} onPress={submit}>
          <Text style={styles.confirmButtonText}>Confirm Commission</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

/* ───────────────────────── Mobile styles ───────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white', width: '100%', height: '100%' },
  header: { backgroundColor: 'white', paddingHorizontal: rp(16), paddingTop: rp(16), paddingBottom: rp(12) },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: rp(12) },
  headerTitle: { fontSize: rf(16), fontWeight: '600', color: '#333' },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginTop: rp(12) },
  keyboardAvoidingView: { flex: 1 },
  scrollView: { flex: 1, backgroundColor: 'white' },
  scrollViewContent: { paddingBottom: rp(20) },

  formGroup: { paddingHorizontal: rp(16), paddingVertical: rp(8), gap: rp(6) },
  label: { fontSize: rf(14), fontWeight: '500', color: '#333', marginBottom: rp(4) },
  textInput: {
    paddingHorizontal: rp(12), paddingVertical: rp(10),
    borderWidth: 1, borderColor: '#8B2323', borderRadius: rb(4),
    fontSize: rf(14), color: '#333', backgroundColor: 'white', height: rh(5.5),
  },
  textArea: { minHeight: rh(10), textAlignVertical: 'top', height: rh(10) },
  disabledInput: { backgroundColor: '#f9f9f9', color: '#999' },

  commissionTypeDropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: rp(12), paddingVertical: rp(10), borderWidth: 1, borderColor: '#8B2323',
    borderRadius: rb(4), backgroundColor: 'white', height: rh(5.5),
  },
  dropdownText: { fontSize: rf(14), color: '#333', flex: 1 },
  dropdownPlaceholderText: { fontSize: rf(14), color: '#999', flex: 1 },

  commissionTypeContainer: {
    borderWidth: 1, borderColor: '#8B2323', borderRadius: rb(4),
    backgroundColor: 'white', padding: rp(12), marginTop: rp(8),
  },
  categorySection: { marginBottom: rp(12) },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: rp(6), paddingVertical: rp(4) },
  categoryTitle: { fontSize: rf(13), fontWeight: '600', color: '#333' },
  categoryContent: { marginLeft: rp(16), marginTop: rp(8), gap: rp(6) },

  checkboxContainer: { flexDirection: 'row', alignItems: 'center', gap: rp(8) },
  checkbox: {
    width: rw(4), height: rw(4), borderWidth: 1, borderColor: '#8B2323',
    borderRadius: rb(2), backgroundColor: 'white', justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: '#8B2323' },
  checkboxLabel: { fontSize: rf(13), color: '#333' },

  /* Date/time */
  dtOuterFrame: {
    flexDirection: 'row', gap: rp(10), borderWidth: 1, borderColor: '#8B2323',
    borderRadius: rb(8), padding: rp(8), backgroundColor: 'white',
  },
  dtField: {
    flex: 1, height: rh(5.5), borderWidth: 1, borderColor: '#8B2323',
    borderRadius: rb(6), backgroundColor: 'white', paddingHorizontal: rp(12),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dtFieldText: { fontSize: rf(14), color: '#333', fontWeight: '500' },
  placeholderText: { color: '#999', fontStyle: 'italic' },

  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: rp(10), marginBottom: rp(8) },
  monthYearSelector: { flexDirection: 'row', alignItems: 'center', gap: rp(4) },
  monthYearText: { fontSize: rf(14), color: '#8B2323', fontWeight: '500' },

  pickerContainer: { backgroundColor: '#f9f9f9', borderRadius: rb(4), padding: rp(8), marginBottom: rp(8), marginTop: rp(8) },
  pickerTitle: { fontSize: rf(12), color: '#8B2323', fontWeight: '600', marginBottom: rp(8) },
  pickerOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: rp(4) },
  pickerOption: {
    paddingHorizontal: rp(8), paddingVertical: rp(4), borderRadius: rb(4),
    backgroundColor: 'white', borderWidth: 1, borderColor: '#8B2323',
  },
  selectedPickerOption: { backgroundColor: '#8B2323' },
  pickerOptionText: { fontSize: rf(12), color: '#8B2323' },
  selectedPickerOptionText: { color: 'white' },

  daysOfWeek: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: rp(8) },
  dayText: { fontSize: rf(12), color: '#8B2323', fontWeight: '500', textAlign: 'center', flex: 1 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  calendarDay: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginBottom: rp(4) },
  selectedDay: { backgroundColor: '#8B2323', borderRadius: rb(4) },
  calendarDayText: { fontSize: rf(12), color: '#8B2323', textAlign: 'center' },
  selectedDayText: { color: 'white', fontWeight: '600' },
  disabledDay: { backgroundColor: '#f5f5f5', opacity: 0.3 },

  timePickerContainer: {
    backgroundColor: 'white', borderRadius: rb(8), padding: rp(16), marginTop: rp(8),
    borderWidth: 2, borderColor: '#8B2323',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  timeHeadersContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: rp(12), paddingHorizontal: rp(20) },
  timeHeader: { fontSize: rf(14), color: '#8B2323', fontWeight: '600' },
  timeColon: { fontSize: rf(14), color: '#8B2323', fontWeight: '600' },
  timeWheelsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: rp(8) },
  timeWheel: { flex: 1, alignItems: 'center', marginHorizontal: rp(4) },
  wheelContainer: { height: rh(15), width: rw(17.5) },
  wheelScrollView: {
    height: rh(15), width: rw(17.5), borderWidth: 1, borderColor: '#8B2323',
    borderRadius: rb(8), backgroundColor: '#f9f9f9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  wheelOption: { height: rh(4.5), justifyContent: 'center', alignItems: 'center', marginVertical: rp(2), borderRadius: rb(4), backgroundColor: 'transparent' },
  selectedWheelOption: { backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#8B2323' },
  wheelOptionText: { fontSize: rf(16), color: '#8B2323', fontWeight: '500' },
  selectedWheelOptionText: { color: '#8B2323', fontWeight: '600' },
  timeSaveButton: { backgroundColor: 'transparent', alignItems: 'center', marginTop: rp(16), paddingVertical: rp(8) },
  timeSaveButtonText: { color: '#8B2323', fontSize: rf(16), fontWeight: '600' },

  meetupContainer: { borderWidth: 1, borderColor: '#8B2323', borderRadius: rb(4), backgroundColor: 'white', padding: rp(12), gap: rp(12) },

  buttonSection: { backgroundColor: '#8B2323', padding: rp(16) },
  confirmButton: {
    backgroundColor: 'white', paddingVertical: rp(12), borderRadius: rb(6),
    alignItems: 'center', height: rh(6), justifyContent: 'center',
    borderWidth: 1, borderColor: '#8B2323',
  },
  confirmButtonText: { color: '#8B2323', fontSize: rf(15), fontWeight: '600' },
});

export default PostCommission;
