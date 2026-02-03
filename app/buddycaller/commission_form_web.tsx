import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import LocationService from '../../components/LocationService';
import LocationPromptModalWeb from '../../components/LocationPromptModalWeb';

/* ───────── helpers ───────── */
const notify = (title: string, message: string, onOK?: () => void) => {
    if (Platform.OS === 'web') {
        window.alert(`${title}\n\n${message}`);
        onOK?.();
    } else {
        Alert.alert(title, message, [{ text: 'OK', onPress: onOK }]);
    }
};

function toDueAtISO(completionDate?: string, completionTime?: string) {
    if (!completionDate || !completionTime) return null;
    const [mm, dd, yy] = completionDate.split('/');
    const [time, period] = completionTime.split(' ');
    if (!mm || !dd || !yy || !time || !period) return null;

    let [h, m] = time.split(':').map((v) => parseInt(v, 10));
    if (Number.isNaN(h)) return null;
    if (Number.isNaN(m)) m = 0;

    const up = period.toUpperCase();
    if (up === 'PM' && h !== 12) h += 1;
    if (up === 'AM' && h === 12) h = 0;

    const fullYear = 2000 + parseInt(yy, 10);
    const d = new Date(fullYear, parseInt(mm, 10) - 1, parseInt(dd, 10), h, m, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatCompletion(d: string, t: string) {
    if (!d || !t) return 'Not specified';
    try {
        const [mm, dd, yy] = d.split('/');
        const full = 2000 + parseInt(yy, 10);
        const date = new Date(full, parseInt(mm, 10) - 1, parseInt(dd, 10));
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} - ${t}`;
    } catch {
        return `${d} - ${t}`;
    }
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

    // SECURITY: Check ID approval status before allowing commission posting
    const { data: userProfile, error: profileErr } = await supabase
        .from('users')
        .select('id_image_approved, id_image_path, role')
        .eq('id', auth.user.id)
        .single();

    if (!profileErr && userProfile) {
        // Admin users are exempt
        if (userProfile.role !== 'admin') {
            if (userProfile.id_image_path) {
                if (userProfile.id_image_approved !== true) {
                    throw new Error(
                        userProfile.id_image_approved === false
                            ? 'Your student ID has been disapproved. You cannot post commissions until your ID is approved.'
                            : 'Your student ID is pending approval. You cannot post commissions until your ID is approved.'
                    );
                }
            } else {
                throw new Error('Please upload your student ID before posting commissions.');
            }
        }
    }

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

        // Call Edge Function to assign top runner and notify
        if (data?.id) {
            let assignmentSuccess = false;
            let lastError: any = null;
            let cancelledStatus: string | null = null;

            // First attempt
            try {
                const { data: assignData, error: assignError } = await supabase.functions.invoke('assign-and-notify-commission', {
                    body: { commission_id: data.id },
                });

                if (assignError) {
                    lastError = assignError;
                    console.error('[Commission] First assignment attempt failed:', assignError);
                } else if (assignData) {
                    // Check if assignment was successful
                    if (assignData.status === 'assigned' || assignData.status === 'already_assigned') {
                        assignmentSuccess = true;
                    } else if (assignData.status === 'no_eligible_runners' || assignData.status === 'no_runners_within_distance' || assignData.status === 'no_runner_to_assign') {
                        // Commission was cancelled due to no runners - store status to show modal
                        cancelledStatus = assignData.status;
                        assignmentSuccess = true;
                    } else {
                        lastError = new Error(`Assignment returned unexpected status: ${assignData.status}`);
                    }
                }
            } catch (edgeError) {
                lastError = edgeError;
                console.error('[Commission] First assignment attempt exception:', edgeError);
            }

            // Retry once if first attempt failed
            if (!assignmentSuccess) {
                console.log('[Commission] Retrying assignment...');
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry

                try {
                    const { data: assignData, error: assignError } = await supabase.functions.invoke('assign-and-notify-commission', {
                        body: { commission_id: data.id },
                    });

                    if (assignError) {
                        lastError = assignError;
                        console.error('[Commission] Retry assignment attempt failed:', assignError);
                    } else if (assignData) {
                        if (assignData.status === 'assigned' || assignData.status === 'already_assigned') {
                            assignmentSuccess = true;
                        } else if (assignData.status === 'no_eligible_runners' || assignData.status === 'no_runners_within_distance' || assignData.status === 'no_runner_to_assign') {
                            cancelledStatus = assignData.status;
                            assignmentSuccess = true;
                        } else {
                            lastError = new Error(`Retry assignment returned unexpected status: ${assignData.status}`);
                        }
                    }
                } catch (edgeError) {
                    lastError = edgeError;
                    console.error('[Commission] Retry assignment attempt exception:', edgeError);
                }
            }

            // Verify assignment succeeded by checking database
            if (assignmentSuccess) {
                // Re-fetch commission to verify notified_runner_id was set (or commission was cancelled)
                const { data: verifyData, error: verifyError } = await supabase
                    .from('commission')
                    .select('id, status, notified_runner_id')
                    .eq('id', data.id)
                    .single();

                if (verifyError) {
                    console.error('[Commission] Verification fetch failed:', verifyError);
                    throw new Error('Commission was created but assignment verification failed. Please check if a runner was notified.');
                }

                // If commission is still pending, notified_runner_id must be set
                if (verifyData?.status === 'pending' && verifyData.notified_runner_id === null) {
                    console.error('[Commission] Assignment verification failed: notified_runner_id is still NULL');
                    throw new Error('Commission was created but no runner was assigned. Please try posting again or contact support.');
                }

                // If commission was cancelled (no eligible runners), return cancellation info
                // Don't throw error - let success modal show, then trigger "No Runners Available" modal after OK
                if (verifyData?.status === 'cancelled' || cancelledStatus) {
                    console.log('[Commission] Commission cancelled due to no eligible runners');
                    // Return cancellation info attached to data object
                    return {
                        ...data,
                        _cancelled: true,
                        _cancelledStatus: cancelledStatus || 'no_eligible_runners'
                    };
                }
            } else {
                // Assignment failed after retry
                console.error('[Commission] Assignment failed after retry:', lastError);
                throw new Error('Commission was created but failed to assign a runner. Please try posting again or contact support.');
            }
        }

        return data;
}

/* ───────── types ───────── */
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

/* ───────── page ───────── */
const PostCommission: React.FC = () => {
    const router = useRouter();
    const { width } = useWindowDimensions();
    
    // Responsive breakpoints
    const isSmallScreen = width < 600;
    const isMediumScreen = width >= 600 && width < 900;

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
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [pendingNoRunnerModal, setPendingNoRunnerModal] = useState<null | { commissionId: number; title: string }>(null);

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

    const [showTerms, setShowTerms] = useState(false);
    const [agree, setAgree] = useState(false);

    // Location prompt modal state
    const [locationPromptVisible, setLocationPromptVisible] = useState(false);
    const [locationPromptLoading, setLocationPromptLoading] = useState(false);

    const [categories, setCategories] = useState<Category[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);

    // Fetch commission categories and types from database
    useEffect(() => {
        const fetchCommissionCategories = async () => {
            try {
                setCategoriesLoading(true);

                // Fetch active commission categories
                const { data: categoriesData, error: categoriesError } = await supabase
                    .from('commission_categories')
                    .select('id, name, sort_order')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true });

                if (categoriesError) throw categoriesError;

                if (!categoriesData || categoriesData.length === 0) {
                    setCategories([]);
                    setCategoriesLoading(false);
                    return;
                }

                // Fetch active commission types for each category
                const { data: typesData, error: typesError } = await supabase
                    .from('commission_types')
                    .select('id, category_id, name, value, sort_order')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true, nullsFirst: false })
                    .order('name', { ascending: true });

                if (typesError) throw typesError;

                // Transform data to match Category structure
                const transformedCategories: Category[] = categoriesData.map(cat => {
                    const categoryTypes = (typesData || [])
                        .filter(t => t.category_id === cat.id)
                        .map(t => ({
                            id: t.id,
                            label: t.name,
                            value: t.value,
                        }));

                    return {
                        id: cat.id,
                        title: cat.name,
                        isExpanded: true,
                        types: categoryTypes,
                    };
                });

                setCategories(transformedCategories);
            } catch (err) {
                console.error('Error fetching commission categories:', err);
                setCategories([]);
            } finally {
                setCategoriesLoading(false);
            }
        };

        fetchCommissionCategories();
    }, []);

    /* utils */
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

    /* handlers */
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
        } catch { return false; }
    };
    const isTimeInPast = (h: number, m: number, p: 'AM' | 'PM') => {
        if (!isSelectedDateToday()) return false; // only enforce for today
        const n = new Date();
        const curH = n.getHours();
        const curM = n.getMinutes();
        let h24 = h;
        if (p === 'AM' && h === 12) h24 = 0; else if (p === 'PM' && h !== 12) h24 = h + 12;
        if (h24 < curH) return true;
        if (h24 === curH && m <= curM) return true;
        return false;
    };
    // Disabled states for wheels (hour-level and minute-level)
    const isHourDisabled = (h: number, p: 'AM' | 'PM') => {
        if (!isSelectedDateToday()) return false;
        const n = new Date();
        const latestMinuteOfHour = 59;
        return isTimeInPast(h, latestMinuteOfHour, p);
    };
    const isMinuteDisabled = (h: number, m: number, p: 'AM' | 'PM') => {
        if (!isSelectedDateToday()) return false;
        return isTimeInPast(h, m, p);
    };
    const applyTime = (h: number, m: number, p: 'AM' | 'PM') => {
        if (isTimeInPast(h, m, p)) { notify('Invalid Time', 'Please select a future time for today.'); return; }
        setFormData(prev => ({ ...prev, completionTime: `${h}:${String(m).padStart(2, '0')} ${p}` }));
    };
    const selectHour = (h: number) => { if (isTimeInPast(h, minute, period)) { notify('Invalid Time', 'Please select a future time for today.'); return; } setHour(h); applyTime(h, minute, period); };
    const selectMinute = (m: number) => { if (isTimeInPast(hour, m, period)) { notify('Invalid Time', 'Please select a future time for today.'); return; } setMinute(m); applyTime(hour, m, period); };
    const selectPeriod = (p: 'AM' | 'PM') => { if (isTimeInPast(hour, minute, p)) { notify('Invalid Time', 'Please select a future time for today.'); return; } setPeriod(p); applyTime(hour, minute, p); };

    const selectMonth = (m: string) => {
        // Check if this month/day/year combination is in the past
        if (isDateInPast(selectedYear, m, selectedDay)) {
            notify('Invalid Date', 'Please select a future date and time.');
            return;
        }
        
        setSelectedMonth(m);
        setShowMonthPicker(false);
        const mm = String(getMonthNumber(m)).padStart(2, '0');
        const dd = String(selectedDay).padStart(2, '0');
        const yy = selectedYear.slice(-2);
        const newDate = `${mm}/${dd}/${yy}`;
        setFormData(prev => ({ ...prev, completionDate: newDate }));
        
        // Don't reset time - preserve user's time selection
    };
    const selectYear = (y: string) => {
        // Check if this year/month/day combination is in the past
        if (isDateInPast(y, selectedMonth, selectedDay)) {
            notify('Invalid Date', 'Please select a future date and time.');
            return;
        }
        
        setSelectedYear(y);
        setShowYearPicker(false);
        const mm = String(getMonthNumber(selectedMonth)).padStart(2, '0');
        const dd = String(selectedDay).padStart(2, '0');
        const newDate = `${mm}/${dd}/${y.slice(-2)}`;
        setFormData(prev => ({ ...prev, completionDate: newDate }));
        
        // Don't reset time - preserve user's time selection
    };
    const selectDay = (d: number) => {
        // Check if this day/month/year combination is in the past
        if (isDateInPast(selectedYear, selectedMonth, d)) {
            notify('Invalid Date', 'Please select a future date and time.');
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
                    notify('Invalid Time', 'The selected time has passed. Please select a future time.');
                }
            } catch {
                // If time parsing fails, don't reset - let validation handle it later
            }
        }
        
        // If time is already selected, close the picker; otherwise switch to time picker
        if (formData.completionTime) {
            setShowDatePicker(false);
        } else {
            setPickerPhase('time');
        }
    };

    const validate = () => {
        if (!formData.title.trim()) { notify('Error', 'Please enter a commission title.'); return false; }
        if (!formData.description.trim()) { notify('Error', 'Please enter a commission description.'); return false; }
        if (formData.selectedTypes.length === 0) { notify('Error', 'Please select at least one commission type.'); return false; }
        if (!formData.completionDate.trim()) { notify('Error', 'Please select a completion date.'); return false; }
        if (!formData.completionTime.trim()) { notify('Error', 'Please select a completion time.'); return false; }
        if (formData.isMeetup && !formData.meetupLocation.trim()) { notify('Error', 'Please enter a meetup location.'); return false; }
        return true;
    };

    const submit = () => { if (!validate()) return; setShowSummary(true); };

    const confirmCommission = async () => {
        if (!agree) { notify('Error', 'Please agree to Terms and Conditions.'); return; }
        
        // Check and update location before confirming
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                notify('Error', 'User not authenticated.');
                return;
            }

            console.log('🔍 [Web Caller] Checking location status for user:', user.id);
            const locationStatus = await LocationService.checkLocationStatus(user.id);

            console.log('📍 [Web Caller] Location status:', locationStatus);

            // Show modal if location permission is not granted
            if (!locationStatus.hasPermission) {
                console.log('⚠️ [Web Caller] Location permission not granted, showing prompt modal');
                setLocationPromptVisible(true);
                return; // Don't proceed with confirmation
            }

            // Always refresh location with current GPS before posting to ensure it's up-to-date
            console.log('🔄 [Web Caller] Refreshing location with current GPS before posting...');
            const locationResult = await LocationService.requestAndSaveLocation(user.id);
            
            if (!locationResult.success) {
                console.error('❌ [Web Caller] Failed to refresh location:', locationResult.error);
                notify('Location Error', locationResult.error || 'Failed to get current location. Please try again.');
                return;
            }

            console.log('✅ [Web Caller] Location refreshed successfully, proceeding with commission posting');
            
            // Location is updated, proceed with confirmation
            const result = await createCommission(formData);
            // Store cancellation state to show modal after Success modal
            if (result && (result as any)._cancelled === true) {
                console.log('[CALLER] No eligible runners — will show modal after Success modal');
                setPendingNoRunnerModal({
                    commissionId: result.id,
                    title: result.title || 'Untitled Commission'
                });
            }
            // Keep summary modal visible behind success modal
            setShowSuccessModal(true); // Show custom success modal
        } catch (e: any) {
            notify('Failed', e?.message ?? 'Could not post commission.');
        }
    };

    // Location prompt handlers
    const handleEnableLocation = async () => {
        setLocationPromptLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('[Web Caller] No user found');
                setLocationPromptLoading(false);
                return;
            }

            console.log('🔄 [Web Caller] Requesting location permission and saving to database...');
            const result = await LocationService.requestAndSaveLocation(user.id);

            if (result.success) {
                console.log('✅ [Web Caller] Location enabled and saved successfully');
                setLocationPromptVisible(false);
                notify('Success', 'Location enabled successfully! Please click "Confirm" again to proceed.');
            } else {
                console.error('❌ [Web Caller] Failed to enable location:', result.error);
                notify(
                    'Location Error',
                    result.error || 'Failed to enable location. Please check your browser settings and try again.'
                );
            }
        } catch (error) {
            console.error('[Web Caller] Error enabling location:', error);
            notify('Error', 'An unexpected error occurred. Please try again.');
        } finally {
            setLocationPromptLoading(false);
        }
    };

    const handleCancelLocationPrompt = () => {
        setLocationPromptVisible(false);
    };

    /* ───────── render ───────── */
    if (showSummary) {
        // Calculate responsive modal width for summary
        const summaryModalWidth = isSmallScreen 
            ? Math.min(width - 32, 400) 
            : isMediumScreen 
            ? Math.min(width * 0.85, 430) 
            : 430;
        
        return (
            <View style={w.webOverlay}>
                <View style={[
                    w.webCard, 
                    { 
                    width: summaryModalWidth, 
                    maxWidth: '95%',
                    maxHeight: '90vh' as any,
                    }
                ]}>
                    <View style={[w.cardBody, { padding: isSmallScreen ? 12 : 16 }]}>
                        <View style={w.headerRow}>
                            <Text style={[w.headerText, { fontSize: isSmallScreen ? 14 : 16 }]}>Commission Request Summary</Text>
                            <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
                                <Text style={[w.closeX, { fontSize: isSmallScreen ? 16 : 18 }]}>X</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
                            <View style={w.summaryCard}>
                                <View style={w.summaryList}>
                                    <Text style={w.summaryLine}><Text style={w.summaryLabel}>Commission Title:</Text> {formData.title || ''}</Text>
                                    <Text style={w.summaryLine}><Text style={w.summaryLabel}>Commission Description:</Text> {formData.description || ''}</Text>
                                    <Text style={w.summaryLine}><Text style={w.summaryLabel}>Commission Type:</Text> {formData.selectedTypes && formData.selectedTypes.length ? formData.selectedTypes.join(', ') : ''}</Text>
                                    <Text style={w.summaryLine}>
                                        <Text style={w.summaryLabel}>Completion Date:</Text> {formatCompletion(formData.completionDate, formData.completionTime)}
                                    </Text>
                                    {formData.isMeetup && (
                                        <Text style={w.summaryLine}>
                                            <Text style={w.summaryLabel}>Scheduled Meet-up:</Text> {formData.meetupLocation || ''}
                                        </Text>
                                    )}
                                </View>

                                <TouchableOpacity style={w.termsRow} onPress={() => setShowTerms(true)}>
                                    <View style={[w.checkbox, agree && w.checkboxSelected]}>
                                        {agree && <Ionicons name="checkmark" size={12} color="white" />}
                                    </View>
                                    <Text style={w.termsText}>I agree to the Terms and Conditions</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={w.actionsRow}>
                                <TouchableOpacity style={w.goBackButton} onPress={() => setShowSummary(false)}>
                                    <Text style={w.goBackText}>Go Back</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={w.primaryBtn} onPress={confirmCommission}>
                                    <Text style={w.primaryBtnText}>Confirm</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>

                {showTerms && (() => {
                    // Calculate responsive modal width for Terms modal
                    const termsModalWidth = isSmallScreen 
                        ? Math.min(width - 32, 400) 
                        : isMediumScreen 
                        ? Math.min(width * 0.85, 430) 
                        : 430;
                    
                    return (
                        <View style={w.overlay}>
                            <View style={[
                                w.termsModalCard,
                                {
                                    width: termsModalWidth,
                                    maxWidth: '95%',
                                    // On small screens, use maxHeight instead of fixed height to prevent empty space
                                    height: isSmallScreen ? 'auto' as any : '90vh' as any,
                                    maxHeight: '90vh' as any,
                                }
                            ]}>
                                <View style={[w.termsCardBody, { padding: isSmallScreen ? 12 : 16 }]}>
                                    <View style={w.headerRow}>
                                        <Text style={[w.headerText, { fontSize: isSmallScreen ? 14 : 16 }]}>Terms and Conditions</Text>
                                        <TouchableOpacity 
                                            onPress={() => {
                                                setShowTerms(false);
                                                setShowSummary(false);
                                                router.replace('/buddycaller/home');
                                            }} 
                                            accessibilityRole="button"
                                        >
                                            <Text style={[w.closeX, { fontSize: isSmallScreen ? 16 : 18 }]}>X</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <ScrollView 
                                        style={{ flex: 1 }} 
                                        contentContainerStyle={{ 
                                            paddingHorizontal: isSmallScreen ? 8 : 4, 
                                            paddingBottom: isSmallScreen ? 10 : 12,
                                            flexGrow: isSmallScreen ? 0 : 1
                                        }} 
                                        showsVerticalScrollIndicator={false}
                                    >
                                        <Text style={[w.sectionTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>1. Acceptance of Terms</Text>
                                        <Text style={[w.bodyText, { fontSize: isSmallScreen ? 13 : 14 }]}>
                                            By using GoBuddy's services, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.
                                        </Text>
                                        
                                        <Text style={[w.sectionTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>2. Service Description</Text>
                                        <Text style={[w.bodyText, { fontSize: isSmallScreen ? 13 : 14 }]}>
                                            GoBuddy is a platform that connects users with service providers for various commission-based tasks. We facilitate the connection but are not responsible for the quality or completion of services provided by third parties.
                                        </Text>
                                        
                                        <Text style={[w.sectionTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>3. User Responsibilities</Text>
                                        <Text style={[w.bodyText, { fontSize: isSmallScreen ? 13 : 14 }]}>
                                            Users are responsible for:{'\n'}• Providing accurate and complete information{'\n'}• Communicating clearly with service providers{'\n'}• Paying for services as agreed{'\n'}• Following all applicable laws and regulations
                                        </Text>
                                        
                                        <Text style={[w.sectionTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>4. Payment Terms</Text>
                                        <Text style={[w.bodyText, { fontSize: isSmallScreen ? 13 : 14 }]}>
                                            All payments must be made through our secure payment system. GoBuddy reserves the right to hold funds until service completion. Refunds are subject to our refund policy.
                                        </Text>
                                        
                                        <Text style={[w.sectionTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>5. Service Provider Responsibilities</Text>
                                        <Text style={[w.bodyText, { fontSize: isSmallScreen ? 13 : 14 }]}>
                                            Service providers must:{'\n'}• Complete services as described{'\n'}• Maintain professional standards{'\n'}• Communicate promptly with clients{'\n'}• Comply with all applicable laws
                                        </Text>
                                        
                                        <Text style={[w.sectionTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>6. Limitation of Liability</Text>
                                        <Text style={[w.bodyText, { fontSize: isSmallScreen ? 13 : 14 }]}>
                                            GoBuddy shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of our services. Our total liability shall not exceed the amount paid for the specific service.
                                        </Text>
                                        
                                        <Text style={[w.sectionTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>7. Privacy Policy</Text>
                                        <Text style={[w.bodyText, { fontSize: isSmallScreen ? 13 : 14 }]}>
                                            We collect and use your personal information in accordance with our Privacy Policy. By using our services, you consent to the collection and use of your information as described in our Privacy Policy.
                                        </Text>
                                        
                                        <Text style={[w.sectionTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>8. Termination</Text>
                                        <Text style={[w.bodyText, { fontSize: isSmallScreen ? 13 : 14 }]}>
                                            We may terminate or suspend your account at any time for violation of these terms. You may also terminate your account at any time by contacting our support team.
                                        </Text>
                                        
                                        <Text style={[w.sectionTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>9. Changes to Terms</Text>
                                        <Text style={[w.bodyText, { fontSize: isSmallScreen ? 13 : 14 }]}>
                                            We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting. Continued use of our services constitutes acceptance of the modified terms.
                                        </Text>
                                        
                                        <Text style={[w.sectionTitle, { fontSize: isSmallScreen ? 14 : 16 }]}>10. Contact Information</Text>
                                        <Text style={[w.bodyText, { fontSize: isSmallScreen ? 13 : 14 }]}>
                                            If you have any questions about these Terms and Conditions, please contact us at support@gobuddy.com or call us at (555) 123-4567.
                                        </Text>
                                        
                                        <Text style={[w.lastUpdated, { fontSize: isSmallScreen ? 11 : 12 }]}>Last updated: January 2025</Text>
                                    </ScrollView>

                                    <View style={w.actionsRow}>
                                        <TouchableOpacity 
                                            style={[
                                                w.goBackButton,
                                                { height: isSmallScreen ? 44 : 48 }
                                            ]} 
                                            onPress={() => setShowTerms(false)}
                                        >
                                            <Text style={[w.goBackText, { fontSize: isSmallScreen ? 14 : 15 }]}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                w.primaryBtn,
                                                { height: isSmallScreen ? 44 : 48 }
                                            ]}
                                            onPress={() => { setAgree(true); setShowTerms(false); }}
                                        >
                                            <Text style={[w.primaryBtnText, { fontSize: isSmallScreen ? 14 : 15 }]}>Agree</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </View>
                    );
                })()}

                <LocationPromptModalWeb
                    visible={locationPromptVisible}
                    onEnableLocation={handleEnableLocation}
                    onCancel={handleCancelLocationPrompt}
                    isLoading={locationPromptLoading}
                />

                {/* Custom Success Modal - appears over summary modal */}
                {showSuccessModal && (
                    <View style={w.successModalOverlay}>
                        <View style={w.successModalContainer}>
                            <View style={w.successModalContent}>
                                <View style={w.successIconContainer}>
                                    <Ionicons name="checkmark-circle" size={64} color="#10B981" />
                                </View>
                                <Text style={w.successModalTitle}>Success</Text>
                                <Text style={w.successModalMessage}>Your commission has been posted.</Text>
                                <TouchableOpacity
                                    style={w.successModalButton}
                                    onPress={async () => {
                                        setShowSuccessModal(false);
                                        setShowSummary(false); // Close summary modal when success modal is closed
                                        router.back();
                                        
                                        // Show "No Runners Available" modal if cancellation was detected
                                        // This happens after navigation, so the home page will receive it
                                        if (pendingNoRunnerModal) {
                                            console.log('[CALLER] Showing No Runners Available modal after Success modal');
                                            // Small delay to ensure navigation completes
                                            setTimeout(async () => {
                                                const { noRunnersAvailableService } = await import('../../services/NoRunnersAvailableService');
                                                noRunnersAvailableService.notify({
                                                    type: 'commission',
                                                    commissionId: pendingNoRunnerModal.commissionId,
                                                    commissionTitle: pendingNoRunnerModal.title
                                                });
                                            }, 100);
                                        }
                                    }}
                                >
                                    <Text style={w.successModalButtonText}>OK</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </View>
        );
    }

    // web form
    // Calculate responsive modal width
    const modalWidth = isSmallScreen 
        ? Math.min(width - 32, 400) 
        : isMediumScreen 
        ? Math.min(width * 0.85, 430) 
        : 430;
    
    return (
        <View style={w.webOverlay}>
            <View style={[
                w.webCard, 
                { 
                    width: modalWidth, 
                    maxWidth: '95%',
                    // On small screens, use maxHeight instead of fixed height to prevent empty space
                    height: isSmallScreen ? 'auto' as any : '90vh' as any,
                    maxHeight: isSmallScreen ? '90vh' as any : '90vh' as any,
                }
            ]}>
                <View style={[w.cardBody, { padding: isSmallScreen ? 12 : 16 }]}>
                    <View style={w.headerRow}>
                        <Text style={[w.headerText, { fontSize: isSmallScreen ? 14 : 16 }]}>Post a Commission</Text>
                        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
                            <Text style={[w.closeX, { fontSize: isSmallScreen ? 16 : 18 }]}>X</Text>
                        </TouchableOpacity>
                    </View>

                    <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                    >
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ 
                                paddingBottom: isSmallScreen ? 12 : 16,
                                flexGrow: isSmallScreen ? 0 : 1
                            }}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Title */}
                            <View style={[styles.formGroup, { paddingHorizontal: isSmallScreen ? 12 : 16 }]}>
                                <Text style={[styles.label, { fontSize: isSmallScreen ? 12 : 14 }]}>Commission Title:</Text>
                                <TextInput
                                    style={[
                                        styles.textInput,
                                        {
                                            fontSize: isSmallScreen ? 13 : 14,
                                            height: isSmallScreen ? 40 : 44,
                                        }
                                    ]}
                                    value={formData.title}
                                    onChangeText={(v) => setFormData((p) => ({ ...p, title: v }))}
                                    placeholder="Enter commission title"
                                    placeholderTextColor="#B8860B"
                                    blurOnSubmit={false}
                                    autoCorrect={false}
                                    autoCapitalize="none"
                                />
                            </View>

                            {/* Description */}
                            <View style={[styles.formGroup, { paddingHorizontal: isSmallScreen ? 12 : 16 }]}>
                                <Text style={[styles.label, { fontSize: isSmallScreen ? 12 : 14 }]}>Commission Description:</Text>
                                <TextInput
                                    style={[
                                        styles.textInput, 
                                        styles.textArea,
                                        {
                                            fontSize: isSmallScreen ? 13 : 14,
                                            minHeight: isSmallScreen ? 70 : 80,
                                            height: isSmallScreen ? 70 : 80,
                                        }
                                    ]}
                                    value={formData.description}
                                    onChangeText={(v) => setFormData((p) => ({ ...p, description: v }))}
                                    placeholder="Enter commission description"
                                    placeholderTextColor="#B8860B"
                                    multiline numberOfLines={4} textAlignVertical="top"
                                    blurOnSubmit={false}
                                    autoCorrect={false}
                                    autoCapitalize="none"
                                />
                            </View>

                            {/* Types */}
                            <View style={[styles.formGroup, { paddingHorizontal: isSmallScreen ? 12 : 16 }]}>
                                <Text style={[styles.label, { fontSize: isSmallScreen ? 12 : 14 }]}>Commission Type:</Text>
                                <TouchableOpacity
                                    style={[
                                        styles.commissionTypeDropdown,
                                        { height: isSmallScreen ? 40 : 44 }
                                    ]}
                                    onPress={() => setShowCommissionTypes((v) => !v)}
                                >
                                    <Text style={[
                                        formData.selectedTypes.length ? styles.dropdownText : styles.dropdownPlaceholderText,
                                        { fontSize: isSmallScreen ? 13 : 14 }
                                    ]}>
                                        {formData.selectedTypes.length ? formData.selectedTypes.join(', ') : 'Select Commission'}
                                    </Text>
                                    <Ionicons name={showCommissionTypes ? 'chevron-up' : 'chevron-down'} size={isSmallScreen ? 14 : 16} color="#8B2323" />
                                </TouchableOpacity>

                                {showCommissionTypes && (
                                    <View style={styles.commissionTypeContainer}>
                                        {categoriesLoading ? (
                                            <View style={{ padding: 20, alignItems: 'center' }}>
                                                <Text style={{ color: '#666', fontSize: 14 }}>Loading commission types...</Text>
                                            </View>
                                        ) : categories.length === 0 ? (
                                            <View style={{ padding: 20, alignItems: 'center' }}>
                                                <Text style={{ color: '#666', fontSize: 14 }}>No commission types available</Text>
                                            </View>
                                        ) : (
                                            categories.map((cat) => (
                                            <View key={cat.id} style={styles.categorySection}>
                                                <TouchableOpacity style={styles.categoryHeader} onPress={() => toggleCategory(cat.id)}>
                                                    <Ionicons name={cat.isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} color="#8B2323" />
                                                    <Text style={styles.categoryTitle}>{cat.title}</Text>
                                                </TouchableOpacity>
                                                {cat.isExpanded && (
                                                    <View style={styles.categoryContent}>
                                                        {cat.types.map((t) => {
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
                                            ))
                                        )}
                                    </View>
                                )}
                            </View>

                            {/* Date/Time */}
                            <View style={[styles.formGroup, { paddingHorizontal: isSmallScreen ? 12 : 16 }]}>
                                <Text style={[styles.label, { fontSize: isSmallScreen ? 12 : 14 }]}>Completion Date:</Text>

                                <View style={styles.dtOuterFrame}>
                                    <TouchableOpacity
                                        style={[
                                            styles.dtField,
                                            { height: isSmallScreen ? 40 : 44 }
                                        ]}
                                        onPress={() => { setShowDatePicker(true); setPickerPhase('date'); }}
                                    >
                                        <Text style={[
                                            styles.dtFieldText, 
                                            !formData.completionDate && styles.placeholderText,
                                            { fontSize: isSmallScreen ? 13 : 14 }
                                        ]}>
                                            {formData.completionDate || 'Select Date'}
                                        </Text>
                                        <Ionicons name="chevron-down" size={isSmallScreen ? 14 : 16} color="#8B2323" />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[
                                            styles.dtField,
                                            { height: isSmallScreen ? 40 : 44 },
                                            !formData.completionDate && [
                                                styles.disabledInput,
                                                { borderColor: '#ccc' }
                                            ]
                                        ]}
                                        onPress={() => {
                                            if (!formData.completionDate) {
                                                notify('Error', 'Please select a date first.');
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
                                            { fontSize: isSmallScreen ? 13 : 14 },
                                            !formData.completionDate && { color: '#999' }
                                        ]}>
                                            {formData.completionTime || 'Select Time'}
                                        </Text>
                                        <Ionicons 
                                            name="chevron-down" 
                                            size={isSmallScreen ? 14 : 16} 
                                            color={!formData.completionDate ? '#999' : '#8B2323'} 
                                        />
                                    </TouchableOpacity>
                                </View>

                                {/* TIME PICKER */}
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
                                                        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                                                            <TouchableOpacity
                                                                key={h}
                                                                disabled={isHourDisabled(h, period)}
                                                                style={[
                                                                    styles.wheelOption,
                                                                    hour === h && styles.selectedWheelOption,
                                                                    isHourDisabled(h, period) && styles.wheelOptionDisabled,
                                                                ]}
                                                                onPress={() => setHour(h)}
                                                            >
                                                                <Text
                                                                    style={[
                                                                        styles.wheelOptionText,
                                                                        hour === h && styles.selectedWheelOptionText,
                                                                        isHourDisabled(h, period) && styles.wheelOptionTextDisabled,
                                                                    ]}
                                                                >
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
                                                        {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                                                            <TouchableOpacity
                                                                key={m}
                                                                disabled={isMinuteDisabled(hour, m, period)}
                                                                style={[
                                                                    styles.wheelOption,
                                                                    minute === m && styles.selectedWheelOption,
                                                                    isMinuteDisabled(hour, m, period) && styles.wheelOptionDisabled,
                                                                ]}
                                                                onPress={() => setMinute(m)}
                                                            >
                                                                <Text
                                                                    style={[
                                                                        styles.wheelOptionText,
                                                                        minute === m && styles.selectedWheelOptionText,
                                                                        isMinuteDisabled(hour, m, period) && styles.wheelOptionTextDisabled,
                                                                    ]}
                                                                >
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
                                                        {(['AM', 'PM'] as const).map((p) => (
                                                            <TouchableOpacity
                                                                key={p}
                                                                style={[styles.wheelOption, period === p && styles.selectedWheelOption]}
                                                                onPress={() => setPeriod(p)}
                                                            >
                                                                <Text style={[styles.wheelOptionText, period === p && styles.selectedWheelOptionText]}>{p}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </ScrollView>
                                                </View>
                                            </View>
                                        </View>
                                        <TouchableOpacity style={styles.timeSaveButton} onPress={() => {
                                            const display = `${hour}:${String(minute).padStart(2, '0')} ${period}`;
                                            const [hStr, mStr, per] = [String(hour), String(minute), period];
                                            if (isTimeInPast(parseInt(hStr, 10), parseInt(mStr, 10), per)) {
                                                notify('Invalid Time', 'Please select a future time for today.');
                                                return;
                                            }
                                            setFormData(p => ({ ...p, completionTime: display }));
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

                                {/* DATE HEADER */}
                                {showDatePicker && pickerPhase === 'date' && (
                                    <View style={styles.calendarHeader}>
                                        <TouchableOpacity
                                            style={styles.monthYearSelector}
                                            onPress={() => { setShowMonthPicker((v) => !v); setShowYearPicker(false); }}
                                        >
                                            <Text style={styles.monthYearText}>{selectedMonth}</Text>
                                            <Ionicons name="chevron-down" size={12} color="#8B2323" />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.monthYearSelector}
                                            onPress={() => { setShowYearPicker((v) => !v); setShowMonthPicker(false); }}
                                        >
                                            <Text style={styles.monthYearText}>{selectedYear}</Text>
                                            <Ionicons name="chevron-down" size={12} color="#8B2323" />
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {/* MONTH PICKER */}
                                {showDatePicker && pickerPhase === 'date' && showMonthPicker && (
                                    <View style={styles.pickerContainer}>
                                        <Text style={styles.pickerTitle}>Select Month:</Text>
                                        <View style={styles.pickerOptions}>
                                            {(() => {
                                                const currentYear = now.getFullYear();
                                                const currentMonthIdx = now.getMonth();
                                                const monthsToShow =
                                                    parseInt(selectedYear) === currentYear ? MONTHS.slice(currentMonthIdx) : MONTHS;
                                                return monthsToShow.map((m) => (
                                                    <TouchableOpacity
                                                        key={m}
                                                        style={[styles.pickerOption, selectedMonth === m && styles.selectedPickerOption]}
                                                        onPress={() => {
                                                            setSelectedMonth(m);
                                                            const mm = String(getMonthNumber(m)).padStart(2, '0');
                                                            const dd = String(selectedDay).padStart(2, '0');
                                                            const yy = selectedYear.slice(-2);
                                                            setFormData(p => ({ ...p, completionDate: `${mm}/${dd}/${yy}` }));
                                                            setShowMonthPicker(false);
                                                        }}
                                                    >
                                                        <Text style={[styles.pickerOptionText, selectedMonth === m && styles.selectedPickerOptionText]}>
                                                            {m}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ));
                                            })()}
                                        </View>
                                    </View>
                                )}

                                {/* YEAR PICKER */}
                                {showDatePicker && pickerPhase === 'date' && showYearPicker && (
                                    <View style={styles.pickerContainer}>
                                        <Text style={styles.pickerTitle}>Select Year:</Text>
                                        <View style={styles.pickerOptions}>
                                            {Array.from({ length: 6 }, (_, i) => String(now.getFullYear() + i)).map((y) => (
                                                <TouchableOpacity
                                                    key={y}
                                                    style={[styles.pickerOption, selectedYear === y && styles.selectedPickerOption]}
                                                    onPress={() => {
                                                        setSelectedYear(y);
                                                        const mm = String(getMonthNumber(selectedMonth)).padStart(2, '0');
                                                        const dd = String(selectedDay).padStart(2, '0');
                                                        setFormData(p => ({ ...p, completionDate: `${mm}/${dd}/${y.slice(-2)}` }));
                                                        setShowYearPicker(false);
                                                    }}
                                                >
                                                    <Text style={[styles.pickerOptionText, selectedYear === y && styles.selectedPickerOptionText]}>
                                                        {y}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                )}

                                {/* DAYS HEADER */}
                                {showDatePicker && pickerPhase === 'date' && (
                                    <View style={styles.daysOfWeek}>
                                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                                            <Text key={d} style={styles.dayText}>{d}</Text>
                                        ))}
                                    </View>
                                )}

                                {/* CALENDAR GRID */}
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

                            {/* Meetup */}
                            <View style={[styles.formGroup, { paddingHorizontal: isSmallScreen ? 12 : 16 }]}>
                                <Text style={[styles.label, { fontSize: isSmallScreen ? 12 : 14 }]}>Scheduled Meet-up</Text>
                                <View style={styles.meetupContainer}>
                                    <TouchableOpacity
                                        style={styles.checkboxContainer}
                                        onPress={() =>
                                            setFormData((p) => ({
                                                ...p,
                                                isMeetup: !p.isMeetup,
                                                meetupLocation: !p.isMeetup ? p.meetupLocation : '',
                                            }))
                                        }
                                    >
                                        <View style={[styles.checkbox, formData.isMeetup && styles.checkboxSelected]}>
                                            {formData.isMeetup && <Ionicons name="checkmark" size={12} color="white" />}
                                        </View>
                                        <Text style={[styles.checkboxLabel, { fontSize: isSmallScreen ? 12 : 13 }]}>Meet-up</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        style={[
                                            styles.textInput, 
                                            !formData.isMeetup && styles.disabledInput,
                                            {
                                                fontSize: isSmallScreen ? 13 : 14,
                                                height: isSmallScreen ? 40 : 44,
                                            }
                                        ]}
                                        value={formData.meetupLocation}
                                        onChangeText={(v) => setFormData((p) => ({ ...p, meetupLocation: v }))}
                                        placeholder="Specific Location within the campus"
                                        placeholderTextColor="#B8860B"
                                        editable={formData.isMeetup}
                                        blurOnSubmit={false}
                                        autoCorrect={false}
                                        autoCapitalize="none"
                                    />
                                </View>
                            </View>

                            <View style={{ 
                                paddingHorizontal: isSmallScreen ? 12 : 16,
                                marginTop: isSmallScreen ? 20 : 24
                            }}>
                                <TouchableOpacity 
                                    style={[
                                        w.primaryBtn,
                                        { height: isSmallScreen ? 44 : 48 }
                                    ]} 
                                    onPress={submit}
                                >
                                    <Text style={[
                                        w.primaryBtnText,
                                        { fontSize: isSmallScreen ? 14 : 15 }
                                    ]}>Post Commission</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </View>
            </View>
        </View>
    );
};

/* ───────── styles ───────── */
const styles = StyleSheet.create({
    formGroup: { paddingVertical: 8, gap: 6 },
    label: { fontWeight: '500', color: '#333', marginBottom: 4 },
    textInput: {
        paddingHorizontal: 12, paddingVertical: 10,
        borderWidth: 1, borderColor: '#8B2323', borderRadius: 4,
        color: '#333', backgroundColor: 'white',
    },
    textArea: { textAlignVertical: 'top' },
    disabledInput: { backgroundColor: '#f9f9f9', color: '#999' },

    calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 },
    monthYearSelector: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    monthYearText: { fontSize: 14, color: '#8B2323', fontWeight: '500' },

    commissionTypeDropdown: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#8B2323',
        borderRadius: 4, backgroundColor: 'white',
    },
    dropdownText: { fontSize: 14, color: '#333', flex: 1 },
    dropdownPlaceholderText: { fontSize: 14, color: '#999', flex: 1 },

    commissionTypeContainer: {
        borderWidth: 1, borderColor: '#8B2323', borderRadius: 4,
        backgroundColor: 'white', padding: 12, marginTop: 8,
    },
    categorySection: { marginBottom: 12 },
    categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
    categoryTitle: { fontSize: 13, fontWeight: '600', color: '#333' },
    categoryContent: { marginLeft: 16, marginTop: 8, gap: 6 },

    checkboxContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkbox: {
        width: 16, height: 16, borderWidth: 1, borderColor: '#8B2323',
        borderRadius: 2, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center',
    },
    checkboxSelected: { backgroundColor: '#8B2323' },
    checkboxLabel: { fontSize: 13, color: '#333' },

    dtOuterFrame: { flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: '#8B2323', borderRadius: 8, padding: 8, backgroundColor: 'white' },
    dtField: {
        flex: 1, borderWidth: 1, borderColor: '#8B2323',
        borderRadius: 6, backgroundColor: 'white', paddingHorizontal: 12,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    dtFieldText: { color: '#333', fontWeight: '500' },
    placeholderText: { color: '#999', fontStyle: 'italic' },

    pickerContainer: { backgroundColor: '#f9f9f9', borderRadius: 4, padding: 8, marginBottom: 8, marginTop: 8 },
    pickerTitle: { fontSize: 12, color: '#8B2323', fontWeight: '600', marginBottom: 8 },
    pickerOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    pickerOption: {
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
        backgroundColor: 'white', borderWidth: 1, borderColor: '#8B2323',
    },
    selectedPickerOption: { backgroundColor: '#8B2323' },
    pickerOptionText: { fontSize: 12, color: '#8B2323' },
    selectedPickerOptionText: { color: 'white' },

    daysOfWeek: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    dayText: { fontSize: 12, color: '#8B2323', fontWeight: '500', textAlign: 'center', flex: 1 },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    calendarDay: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    selectedDay: { backgroundColor: '#8B2323', borderRadius: 4 },
    calendarDayText: { fontSize: 12, color: '#8B2323', textAlign: 'center' },
    selectedDayText: { color: 'white', fontWeight: '600' },
    disabledDay: { backgroundColor: '#f5f5f5', opacity: 0.3 },

    timePickerContainer: {
        backgroundColor: 'white', borderRadius: 8, padding: 16, marginTop: 8,
        borderWidth: 2, borderColor: '#8B2323',
        ...(Platform.OS === 'web' ? { boxShadow: '0px 10px 28px rgba(0,0,0,0.12)' } : {}),
    },
    timeHeadersContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 12, paddingHorizontal: 20 },
    timeHeader: { fontSize: 14, color: '#8B2323', fontWeight: '600' },
    timeColon: { fontSize: 14, color: '#8B2323', fontWeight: '600' },
    timeWheelsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 8 },
    timeWheel: { flex: 1, alignItems: 'center', marginHorizontal: 4 },
    wheelContainer: { height: 120, width: 70 },
    wheelScrollView: { height: 120, width: 70, borderWidth: 1, borderColor: '#8B2323', borderRadius: 8, backgroundColor: '#f9f9f9' },
    wheelOption: { height: 35, justifyContent: 'center', alignItems: 'center', marginVertical: 2, borderRadius: 4, backgroundColor: 'transparent' },
    selectedWheelOption: { backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#8B2323' },
    wheelOptionText: { fontSize: 16, color: '#8B2323', fontWeight: '500' },
    selectedWheelOptionText: { color: '#8B2323', fontWeight: '600' },
    // disabled styles for past times (visual only; click disabled via TouchableOpacity.disabled)
    wheelOptionDisabled: { opacity: 0.35 },
    wheelOptionTextDisabled: { color: '#8B2323', opacity: 0.5 },
    timeSaveButton: { backgroundColor: 'transparent', alignItems: 'center', marginTop: 16, paddingVertical: 8 },
    timeSaveButtonText: { color: '#8B2323', fontSize: 16, fontWeight: '600' },

    meetupContainer: { borderWidth: 1, borderColor: '#8B2323', borderRadius: 4, backgroundColor: 'white', padding: 12, gap: 12 },
});

const w = StyleSheet.create({
    webOverlay: {
        position: 'fixed' as any, top: 0, right: 0, bottom: 0, left: 0,
        backgroundColor: 'rgba(0,0,0,0.40)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 12, zIndex: 99999,
    },
    overlay: {
        position: 'fixed' as any, top: 0, right: 0, bottom: 0, left: 0,
        backgroundColor: 'rgba(0,0,0,0.40)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 12, zIndex: 100000,
    },
    webCard: {
        backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#8B2323', overflow: 'hidden',
        ...(Platform.OS === 'web' ? { boxShadow: '0px 10px 28px rgba(0,0,0,0.12)' } : {}),
    },
    termsModalCard: {
        backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#8B2323', overflow: 'hidden',
        ...(Platform.OS === 'web' ? { boxShadow: '0px 10px 28px rgba(0,0,0,0.12)' } : {}),
    },
    cardBody: { flex: 1 },
    termsCardBody: { flex: 1 },

    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, marginBottom: 12, paddingHorizontal: 4 },
    headerText: { fontSize: 16, fontWeight: '600', color: '#333' },
    closeX: { fontSize: 18, color: '#8B2323', fontWeight: '600' },

    summaryCard: {
        backgroundColor: 'white', borderRadius: 8, borderWidth: 1, borderColor: '#8B2323', padding: 16,
        ...(Platform.OS === 'web' ? { boxShadow: '0px 4px 12px rgba(0,0,0,0.06)' } : {}),
    },
    summaryTitle: { fontSize: 18, fontWeight: '900', marginBottom: 12, color: '#8B2323' },
    summaryList: { gap: 4 },
    summaryLine: { color: '#333', fontSize: 14 },
    summaryLabel: { fontSize: 14, fontWeight: '700', color: '#8B2323' },
    summaryBullet: { color: '#666', fontSize: 14, lineHeight: 20 },

    termsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
    checkbox: {
        width: 16, height: 16, borderWidth: 1, borderColor: '#8B2323',
        borderRadius: 2, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', marginRight: 8,
    },
    checkboxSelected: { backgroundColor: '#8B2323' },
    termsText: { fontSize: 12, color: '#666', lineHeight: 16 },

    actionsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, gap: 10 },
    goBackButton: {
        backgroundColor: 'white', paddingVertical: 12, borderRadius: 6, alignItems: 'center',
        height: 48, justifyContent: 'center', borderWidth: 1, borderColor: '#8B2323', flex: 1,
    },
    goBackText: { color: '#8B2323', fontSize: 15, fontWeight: '600' },
    primaryBtn: {
        backgroundColor: '#8B2323', borderRadius: 6, paddingVertical: 12, alignItems: 'center',
        paddingHorizontal: 18, justifyContent: 'center', flex: 1,
    },
    primaryBtnText: { color: 'white', fontWeight: '600' },

    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#8B2323', marginTop: 10, marginBottom: 6 },
    bodyText: { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 16 },
    lastUpdated: {
        fontSize: 12,
        fontStyle: 'italic',
        color: '#666',
        textAlign: 'center',
        marginTop: 16,
    },

    // Success Modal Styles
    successModalOverlay: {
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100001, // Higher than summary modal (100000)
    },
    successModalContainer: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        minWidth: 320,
        maxWidth: 400,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
    },
    successModalContent: {
        alignItems: 'center',
        width: '100%',
    },
    successIconContainer: {
        marginBottom: 16,
    },
    successModalTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#10B981',
        marginBottom: 8,
    },
    successModalMessage: {
        fontSize: 16,
        color: '#374151',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    successModalButton: {
        backgroundColor: '#8B2323',
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 24,
        minWidth: 100,
    },
    successModalButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
});

export default PostCommission;
