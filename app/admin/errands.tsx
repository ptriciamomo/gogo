import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState, useRef, useEffect } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ImageStyle,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    TouchableWithoutFeedback,
    useWindowDimensions,
} from "react-native";
import { supabase } from "../../lib/supabase";

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    faint: "#F7F1F0",
};

/* ===================== TYPES ===================== */
type ErrandRowDB = {
    id: number;
    title: string | null;
    category: string | null;
    status: "pending" | "in_progress" | "completed" | "cancelled" | "delivered" | null;
    created_at: string;
    completed_at?: string | null;
    buddycaller_id: string | null;
    runner_id: string | null;
    amount_price?: number | null;
    description?: string | null;
    pickup_status?: string | null;
    pickup_photo?: string | null;
    pickup_confirmed_at?: string | null;
    delivery_proof_photo?: string | null;
};

type UserInfo = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    student_id_number?: string | null;
    profile_picture_url?: string | null;
};

type ErrandWithUsers = ErrandRowDB & {
    caller?: UserInfo;
    runner?: UserInfo;
};

function toUiStatus(s: ErrandRowDB["status"]): string {
    if (!s) return "Pending";
    if (s === "in_progress") return "In Progress";
    if (s === "completed") return "Completed";
    if (s === "pending") return "Pending";
    if (s === "cancelled") return "Cancelled";
    if (s === "delivered") return "Delivered";
    return "Pending";
}

function getStatusColor(status: string): string {
    switch (status) {
        case "Pending": return "#F59E0B";
        case "In Progress": return "#3B82F6";
        case "Completed": return "#10B981";
        case "Delivered": return "#8B5CF6";
        case "Cancelled": return "#EF4444";
        default: return colors.maroon;
    }
}

/* ===================== AUTH PROFILE HOOK ===================== */
function titleCase(s?: string | null) {
    if (!s) return "";
    return s
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
}



function useAuthProfile() {
    const router = useRouter();
    const [loading, setLoading] = React.useState(true);
    const [fullName, setFullName] = React.useState<string>("");

    const fetchProfile = React.useCallback(async () => {
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes?.user;
            if (!user) {
                setLoading(false);
                return;
            }
            const { data: row, error } = await supabase
                .from("users")
                .select("id, role, first_name, last_name, is_blocked")
                .eq("id", user.id)
                .single();
            if (error) throw error;

            if (row?.is_blocked) {
                await supabase.auth.signOut();
                router.replace('/login');
                return;
            }

            const roleRaw = (row?.role || "").toString().toLowerCase();
            if (roleRaw !== 'admin') {
                Alert.alert('Access Denied', 'You do not have admin privileges.');
                await supabase.auth.signOut();
                router.replace('/login');
                return;
            }

            const f = titleCase(row?.first_name || "");
            const l = titleCase(row?.last_name || "");
            const finalFull =
                (f && l ? `${f} ${l}` : "").trim() ||
                "Admin";
            setFullName(finalFull);
        } catch {
            setFullName("Admin");
        } finally {
            setLoading(false);
        }
    }, [router]);

    React.useEffect(() => {
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
        return () => sub?.subscription?.unsubscribe?.();
    }, [fetchProfile]);
    return { loading, fullName };
}

export default function AdminErrands() {
    const router = useRouter();
    const { loading, fullName } = useAuthProfile();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [errands, setErrands] = useState<ErrandWithUsers[]>([]);
    const [loadingErrands, setLoadingErrands] = useState(true);
    const [selectedErrand, setSelectedErrand] = useState<ErrandWithUsers | null>(null);
    const [showErrandModal, setShowErrandModal] = useState(false);
    const { width: screenWidth } = useWindowDimensions();

    // Reusable function to open transaction details modal
    const handleOpenTransaction = (errand: ErrandWithUsers) => {
        setSelectedErrand(errand);
        setShowErrandModal(true);
    };

    // Query limits for performance (conservative limit to reduce load time)
    const PAGE_SIZE = 200;

    // Responsive breakpoints
    const isSmall = screenWidth < 768;

    React.useEffect(() => {
        // Auto-collapse sidebar on small screens
        if (isSmall) {
            setSidebarOpen(false);
        }
    }, [isSmall]);

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDate, setSelectedDate] = useState<string>("");
    const [calendarVisible, setCalendarVisible] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

    const handleDatePickerClick = () => {
        setCalendarVisible(true);
    };

    const handleDateSelect = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        setSelectedDate(`${year}-${month}-${day}`);
        setCalendarVisible(false);
    };

    const handlePrevMonth = () => {
        setCalendarMonth(prev => {
            if (prev === 0) {
                setCalendarYear(year => year - 1);
                return 11;
            }
            return prev - 1;
        });
    };

    const handleNextMonth = () => {
        setCalendarMonth(prev => {
            if (prev === 11) {
                setCalendarYear(year => year + 1);
                return 0;
            }
            return prev + 1;
        });
    };

    const handleToday = () => {
        const today = new Date();
        setCalendarMonth(today.getMonth());
        setCalendarYear(today.getFullYear());
        handleDateSelect(today);
    };

    const handleClear = () => {
        setSelectedDate("");
        setCalendarVisible(false);
    };

    const handleMonthChange = (month: number) => {
        setCalendarMonth(month);
    };

    const handleYearChange = (year: number) => {
        setCalendarYear(year);
    };



    React.useEffect(() => {
        if (Platform.OS !== 'web') {
            Alert.alert('Not Available', 'Admin panel is only available on web.');
            router.replace('/login');
            return;
        }
    }, []);

    React.useEffect(() => {
        const fetchErrands = async () => {
            try {
                setLoadingErrands(true);
                const { data: errandsData, error: errandsError } = await supabase
                    .from('errand')
                    .select('id, title, category, status, created_at, completed_at, buddycaller_id, runner_id, amount_price, description, delivery_proof_photo')
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(PAGE_SIZE);
                
                if (errandsError) throw errandsError;
                
                // Fetch user information for callers and runners
                const userIds = new Set<string>();
                errandsData?.forEach(errand => {
                    if (errand.buddycaller_id) userIds.add(errand.buddycaller_id);
                    if (errand.runner_id) userIds.add(errand.runner_id);
                });

                const { data: usersData, error: usersError } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, email, student_id_number, profile_picture_url')
                    .in('id', Array.from(userIds));

                if (usersError) throw usersError;

                const usersMap = new Map<string, UserInfo>();
                usersData?.forEach(user => {
                    usersMap.set(user.id, user);
                });

                const errandsWithUsers: ErrandWithUsers[] = (errandsData || []).map(errand => ({
                    ...errand,
                    caller: errand.buddycaller_id ? usersMap.get(errand.buddycaller_id) : undefined,
                    runner: errand.runner_id ? usersMap.get(errand.runner_id) : undefined,
                }));

                setErrands(errandsWithUsers);
            } catch (error) {
                console.error('Error fetching errands:', error);
                Alert.alert('Error', 'Failed to load errands.');
            } finally {
                setLoadingErrands(false);
            }
        };
        fetchErrands();
    }, []);

    const handleLogout = async () => {
        setConfirmLogout(false);
        
        // Clear any cached data immediately (web only)
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            localStorage.clear();
            sessionStorage.clear();
        }
        
        // Sign out in the background (don't wait for it)
        supabase.auth.signOut().catch((error) => {
            console.error('Error during signOut:', error);
        });
        
        // Force immediate redirect using window.location for hard navigation
        // This bypasses React Router and any auth state listeners
        // Do this immediately, don't wait for signOut to complete
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            // Use window.location.replace for immediate navigation without history entry
            window.location.replace('/login');
        } else {
            router.replace('/login');
        }
    };

    const filteredErrands = errands.filter((errand) => {
        // Date filter
        if (selectedDate) {
            const errandDate = new Date(errand.created_at);
            const selectedDateObj = new Date(selectedDate);
            const errandDateOnly = new Date(errandDate.getFullYear(), errandDate.getMonth(), errandDate.getDate());
            const selectedDateOnly = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate());
            if (errandDateOnly.getTime() !== selectedDateOnly.getTime()) {
                return false;
            }
        }

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const title = (errand.title || '').toLowerCase();
            const callerName = errand.caller ? `${errand.caller.first_name || ''} ${errand.caller.last_name || ''}`.toLowerCase() : '';
            const runnerName = errand.runner ? `${errand.runner.first_name || ''} ${errand.runner.last_name || ''}`.toLowerCase() : '';
            const category = (errand.category || '').toLowerCase();
            return title.includes(query) || callerName.includes(query) || runnerName.includes(query) || category.includes(query);
        }
        
        return true;
    });

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={colors.maroon} />
            </SafeAreaView>
        );
    }

    if (Platform.OS !== 'web') {
        return null;
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#fff' }}>
                {/* Sidebar Overlay on small screens */}
                {(isSmall && sidebarOpen) && (
                    <TouchableOpacity 
                        style={[styles.sidebarOverlay, { width: screenWidth }]}
                        activeOpacity={1}
                        onPress={() => setSidebarOpen(false)}
                    />
                )}
                
                <Sidebar
                    open={sidebarOpen}
                    onToggle={() => setSidebarOpen((v) => !v)}
                    onLogout={() => setConfirmLogout(true)}
                    userName={fullName}
                    activeRoute="errands"
                    isSmall={isSmall}
                />
                
                <View style={styles.mainArea}>
                    <View style={styles.topBar}>
                        <Text style={styles.welcome}>Errands Transactions</Text>
                    </View>

                    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
                        <View style={styles.content}>
                            <View style={styles.searchContainer}>
                                <Ionicons name="search-outline" size={20} color={colors.text} style={{ opacity: 0.6 }} />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search by title, caller, runner, or category..."
                                    placeholderTextColor="#999"
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                                {searchQuery.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearchQuery("")}>
                                        <Ionicons name="close-circle" size={20} color={colors.text} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View style={styles.datePickerWrapper}>
                                <TouchableOpacity 
                                    onPress={handleDatePickerClick}
                                    style={styles.datePickerContainer}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="calendar-outline" size={20} color={colors.text} style={{ opacity: 0.6, marginRight: 8 }} />
                                    <TextInput
                                        style={styles.datePickerInput}
                                        placeholder="Select date"
                                        placeholderTextColor="#999"
                                        value={selectedDate ? (() => {
                                            try {
                                                const date = new Date(selectedDate + 'T00:00:00');
                                                return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
                                            } catch {
                                                return selectedDate;
                                            }
                                        })() : ''}
                                        editable={false}
                                        pointerEvents="none"
                                    />
                                </TouchableOpacity>
                                {selectedDate.length > 0 && (
                                    <TouchableOpacity 
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            setSelectedDate("");
                                        }}
                                        style={styles.clearDateButton}
                                    >
                                        <Ionicons name="close-circle" size={20} color={colors.text} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <CalendarModal
                                visible={calendarVisible}
                                onClose={() => setCalendarVisible(false)}
                                onDateSelect={handleDateSelect}
                                selectedDate={selectedDate}
                                currentMonth={calendarMonth}
                                currentYear={calendarYear}
                                onPrevMonth={handlePrevMonth}
                                onNextMonth={handleNextMonth}
                                onMonthChange={handleMonthChange}
                                onYearChange={handleYearChange}
                                onToday={handleToday}
                                onClear={handleClear}
                            />

                            {loadingErrands ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <ActivityIndicator size="large" color={colors.maroon} />
                                </View>
                            ) : filteredErrands.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Ionicons name="briefcase-outline" size={48} color={colors.border} />
                                    <Text style={styles.emptyStateText}>
                                        {searchQuery || selectedDate ? 'No errands found matching your filters.' : 'No errands found.'}
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    <Text style={styles.resultsCount}>
                                        {filteredErrands.length} {filteredErrands.length === 1 ? 'errand' : 'errands'}
                                        {(searchQuery || selectedDate) && ` found`}
                                    </Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                        <View style={styles.tableContainer}>
                                            <View style={styles.tableHeader}>
                                                <Text style={[styles.tableHeaderText, styles.tableCellErrandId]}>Errand ID</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellCallerName]}>Caller Name</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellCallerEmail]}>Caller Email</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellRunnerName]}>Runner Name</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellRunnerEmail]}>Runner Email</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellCategory]}>Category</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellCreated]}>Created At</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellPrice]}>Total Price</Text>
                                                <View style={styles.tableCellAction}></View>
                                            </View>
                                            {filteredErrands.map((errand, index) => (
                                                <ErrandTableRow 
                                                    key={errand.id} 
                                                    errand={errand} 
                                                    index={index}
                                                    onRowPress={() => handleOpenTransaction(errand)}
                                                    onIconPress={() => handleOpenTransaction(errand)}
                                                />
                                            ))}
                                        </View>
                                    </ScrollView>
                                </>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </View>

            {confirmLogout && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Log Out?</Text>
                        <Text style={styles.modalMessage}>Are you sure you want to log out?</Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setConfirmLogout(false)}
                            >
                                <Text style={styles.modalButtonCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonConfirm]}
                                onPress={handleLogout}
                            >
                                <Text style={styles.modalButtonConfirmText}>Log Out</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {showErrandModal && selectedErrand && (
                <ErrandDetailsModal
                    errand={selectedErrand}
                    visible={showErrandModal}
                    onClose={() => {
                        setShowErrandModal(false);
                        setSelectedErrand(null);
                    }}
                />
            )}
        </SafeAreaView>
    );
}

/* ===================== CALENDAR MODAL ===================== */
function CalendarModal({
    visible,
    onClose,
    onDateSelect,
    selectedDate,
    currentMonth,
    currentYear,
    onPrevMonth,
    onNextMonth,
    onMonthChange,
    onYearChange,
    onToday,
    onClear,
}: {
    visible: boolean;
    onClose: () => void;
    onDateSelect: (date: Date) => void;
    selectedDate: string;
    currentMonth: number;
    currentYear: number;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    onMonthChange: (month: number) => void;
    onYearChange: (year: number) => void;
    onToday: () => void;
    onClear: () => void;
}) {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
    const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
    
    // Refs and positions for dropdowns
    const monthButtonRef = useRef<View>(null);
    const yearButtonRef = useRef<View>(null);
    const [monthButtonPos, setMonthButtonPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
    const [yearButtonPos, setYearButtonPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

    // Generate years (current year ± 10 years)
    const currentYearNum = new Date().getFullYear();
    const years = Array.from({ length: 21 }, (_, i) => currentYearNum - 10 + i);

    // Close dropdowns when modal closes
    useEffect(() => {
        if (!visible) {
            setMonthDropdownOpen(false);
            setYearDropdownOpen(false);
            setMonthButtonPos(null);
            setYearButtonPos(null);
        }
    }, [visible]);
    
    // Measure button positions when dropdowns open
    const measureMonthButton = () => {
        if (monthButtonRef.current) {
            monthButtonRef.current.measureInWindow((x, y, width, height) => {
                setMonthButtonPos({ x, y, width, height });
            });
        }
    };
    
    const measureYearButton = () => {
        if (yearButtonRef.current) {
            yearButtonRef.current.measureInWindow((x, y, width, height) => {
                setYearButtonPos({ x, y, width, height });
            });
        }
    };
    
    const openMonthDropdown = () => {
        setMonthDropdownOpen(true);
        setYearDropdownOpen(false);
        setTimeout(() => measureMonthButton(), 0);
    };
    
    const openYearDropdown = () => {
        setYearDropdownOpen(true);
        setMonthDropdownOpen(false);
        setTimeout(() => measureYearButton(), 0);
    };
    
    // Get first day of month and number of days
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    
    // Get selected date components
    const selectedDateObj = selectedDate ? new Date(selectedDate + 'T00:00:00') : null;
    const selectedYear = selectedDateObj ? selectedDateObj.getFullYear() : null;
    const selectedMonth = selectedDateObj ? selectedDateObj.getMonth() : null;
    const selectedDay = selectedDateObj ? selectedDateObj.getDate() : null;
    
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();
    
    const renderCalendarDays = () => {
        const days = [];
        
        // Previous month's trailing days
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = daysInPrevMonth - i;
            days.push(
                <View key={`prev-${day}`} style={styles.calendarDay}>
                    <Text style={styles.calendarDayTextInactive}>{day}</Text>
                </View>
            );
        }
        
        // Current month's days
        for (let day = 1; day <= daysInMonth; day++) {
            const isSelected = selectedYear === currentYear && selectedMonth === currentMonth && selectedDay === day;
            const isToday = todayYear === currentYear && todayMonth === currentMonth && todayDay === day;
            const isPast = new Date(currentYear, currentMonth, day) < new Date(todayYear, todayMonth, todayDay);
            
            days.push(
                <TouchableOpacity
                    key={day}
                    style={[
                        styles.calendarDay,
                        isSelected && styles.calendarDaySelected,
                    ]}
                    onPress={() => {
                        onDateSelect(new Date(currentYear, currentMonth, day));
                    }}
                >
                    <Text
                        style={[
                            styles.calendarDayText,
                            isSelected && styles.calendarDayTextSelected,
                            isPast && !isSelected && !isToday && styles.calendarDayTextFaded,
                            isToday && !isSelected && styles.calendarDayTextToday,
                        ]}
                    >
                        {day}
                    </Text>
                </TouchableOpacity>
            );
        }
        
        // Next month's leading days (to fill the grid)
        const totalCells = 42; // 6 weeks * 7 days
        const remainingCells = totalCells - days.length;
        for (let day = 1; day <= remainingCells; day++) {
            days.push(
                <View key={`next-${day}`} style={styles.calendarDay}>
                    <Text style={styles.calendarDayTextInactive}>{day}</Text>
                </View>
            );
        }
        
        return days;
    };
    
    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.calendarOverlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View
                    style={styles.calendarModal}
                    onStartShouldSetResponder={() => {
                        setMonthDropdownOpen(false);
                        setYearDropdownOpen(false);
                        return false;
                    }}
                >
                    {/* Header */}
                    <View style={styles.calendarHeader}>
                        <View style={styles.calendarHeaderLeft}>
                            <View ref={monthButtonRef} collapsable={false}>
                                <TouchableOpacity
                                    onPress={openMonthDropdown}
                                    style={styles.calendarDropdownButton}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.calendarMonthText}>{monthNames[currentMonth]}</Text>
                                    <Ionicons name="chevron-down" size={16} color={colors.maroon} style={{ marginLeft: 4 }} />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={styles.calendarHeaderRight}>
                            <View ref={yearButtonRef} collapsable={false}>
                                <TouchableOpacity
                                    onPress={openYearDropdown}
                                    style={styles.calendarDropdownButton}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.calendarYearText}>{currentYear}</Text>
                                    <Ionicons name="chevron-down" size={16} color={colors.maroon} style={{ marginLeft: 4 }} />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={styles.calendarNavButtons}>
                            <TouchableOpacity onPress={onPrevMonth} style={styles.calendarNavButton}>
                                <Ionicons name="chevron-up" size={20} color={colors.maroon} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onNextMonth} style={styles.calendarNavButton}>
                                <Ionicons name="chevron-down" size={20} color={colors.maroon} />
                            </TouchableOpacity>
                        </View>
                    </View>
                    
                    {/* Days of week header */}
                    <View style={styles.calendarDaysHeader}>
                        {dayNames.map((day, index) => (
                            <View key={index} style={styles.calendarDayHeader}>
                                <Text style={styles.calendarDayHeaderText}>{day}</Text>
                            </View>
                        ))}
                    </View>
                    
                    {/* Calendar grid */}
                    <View 
                        style={styles.calendarGrid}
                        onStartShouldSetResponder={() => {
                            setMonthDropdownOpen(false);
                            setYearDropdownOpen(false);
                            return false;
                        }}
                        pointerEvents={monthDropdownOpen || yearDropdownOpen ? 'none' : 'auto'}
                    >
                        {renderCalendarDays()}
                    </View>
                    
                    {/* Footer buttons */}
                    <View style={styles.calendarFooter}>
                        <TouchableOpacity onPress={onClear} style={styles.calendarFooterButton}>
                            <Text style={styles.calendarFooterButtonText}>Clear</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onToday} style={styles.calendarFooterButton}>
                            <Text style={styles.calendarFooterButtonText}>Today</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
            
            {/* Month Dropdown Modal */}
            {monthDropdownOpen && monthButtonPos && (
                <Modal
                    visible={true}
                    transparent={true}
                    animationType="none"
                    onRequestClose={() => setMonthDropdownOpen(false)}
                >
                    <TouchableWithoutFeedback onPress={() => setMonthDropdownOpen(false)}>
                        <View style={styles.dropdownModalBackdrop} />
                    </TouchableWithoutFeedback>
                    <View
                        style={[
                            styles.dropdownModalContainer,
                            {
                                top: monthButtonPos.y + monthButtonPos.height + 4,
                                left: monthButtonPos.x,
                                width: monthButtonPos.width,
                            }
                        ]}
                        pointerEvents="box-none"
                    >
                        <View style={styles.calendarDropdown}>
                            <ScrollView 
                                style={styles.calendarDropdownScroll}
                                contentContainerStyle={styles.calendarDropdownScrollContent}
                                nestedScrollEnabled={true}
                                showsVerticalScrollIndicator={true}
                                scrollEnabled={true}
                                bounces={false}
                            >
                                {monthNames.map((month, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        onPress={() => {
                                            onMonthChange(index);
                                            setMonthDropdownOpen(false);
                                        }}
                                        style={[
                                            styles.calendarDropdownItem,
                                            currentMonth === index && styles.calendarDropdownItemSelected,
                                        ]}
                                        activeOpacity={0.7}
                                    >
                                        <Text
                                            style={[
                                                styles.calendarDropdownItemText,
                                                currentMonth === index && styles.calendarDropdownItemTextSelected,
                                            ]}
                                        >
                                            {month}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
            
            {/* Year Dropdown Modal */}
            {yearDropdownOpen && yearButtonPos && (
                <Modal
                    visible={true}
                    transparent={true}
                    animationType="none"
                    onRequestClose={() => setYearDropdownOpen(false)}
                >
                    <TouchableWithoutFeedback onPress={() => setYearDropdownOpen(false)}>
                        <View style={styles.dropdownModalBackdrop} />
                    </TouchableWithoutFeedback>
                    <View
                        style={[
                            styles.dropdownModalContainer,
                            {
                                top: yearButtonPos.y + yearButtonPos.height + 4,
                                left: yearButtonPos.x,
                                width: yearButtonPos.width,
                            }
                        ]}
                        pointerEvents="box-none"
                    >
                        <View style={styles.calendarDropdown}>
                            <ScrollView 
                                style={styles.calendarDropdownScroll}
                                contentContainerStyle={styles.calendarDropdownScrollContent}
                                nestedScrollEnabled={true}
                                showsVerticalScrollIndicator={true}
                                scrollEnabled={true}
                                bounces={false}
                            >
                                {years.map((year) => (
                                    <TouchableOpacity
                                        key={year}
                                        onPress={() => {
                                            onYearChange(year);
                                            setYearDropdownOpen(false);
                                        }}
                                        style={[
                                            styles.calendarDropdownItem,
                                            currentYear === year && styles.calendarDropdownItemSelected,
                                        ]}
                                        activeOpacity={0.7}
                                    >
                                        <Text
                                            style={[
                                                styles.calendarDropdownItemText,
                                                currentYear === year && styles.calendarDropdownItemTextSelected,
                                            ]}
                                        >
                                            {year}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
        </Modal>
    );
}

function ErrandTableRow({ errand, index, onRowPress, onIconPress }: { errand: ErrandWithUsers; index: number; onRowPress: () => void; onIconPress: () => void }) {
    const [isIconHovered, setIsIconHovered] = useState(false);
    const [isRowHovered, setIsRowHovered] = useState(false);
    const category = errand.category ? titleCase(errand.category) : "N/A";
    const callerName = errand.caller 
        ? `${titleCase(errand.caller.first_name)} ${titleCase(errand.caller.last_name)}`.trim() 
        : "N/A";
    const callerEmail = errand.caller?.email || "N/A";
    const runnerName = errand.runner 
        ? `${titleCase(errand.runner.first_name)} ${titleCase(errand.runner.last_name)}`.trim() 
        : "Not Assigned";
    const runnerEmail = errand.runner?.email || "N/A";
    const amountPrice = errand.amount_price ? `₱${errand.amount_price.toFixed(2)}` : "N/A";
    const createdAt = new Date(errand.created_at).toLocaleString();

    const rowStyle = index % 2 === 0 ? styles.tableRow : styles.tableRowAlternate;

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            style={[
                rowStyle,
                isRowHovered && styles.tableRowHovered
            ]}
            onPress={onRowPress}
            {...(Platform.OS === 'web' ? {
                onMouseEnter: () => setIsRowHovered(true),
                onMouseLeave: () => setIsRowHovered(false),
            } as any : {})}
        >
            <Text style={[styles.tableCellText, styles.tableCellErrandId]} numberOfLines={1} ellipsizeMode="tail">{errand.id}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCallerName]} numberOfLines={1} ellipsizeMode="tail">{callerName}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCallerEmail]} numberOfLines={1} ellipsizeMode="tail">{callerEmail}</Text>
            <Text style={[styles.tableCellText, styles.tableCellRunnerName]} numberOfLines={1} ellipsizeMode="tail">{runnerName}</Text>
            <Text style={[styles.tableCellText, styles.tableCellRunnerEmail]} numberOfLines={1} ellipsizeMode="tail">{runnerEmail}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCategory]} numberOfLines={1} ellipsizeMode="tail">{category}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCreated]} numberOfLines={1} ellipsizeMode="tail">{createdAt}</Text>
            <Text style={[styles.tableCellText, styles.tableCellPrice]} numberOfLines={1} ellipsizeMode="tail">{amountPrice}</Text>
            <View style={styles.tableCellAction}>
                <TouchableOpacity 
                    style={[
                        styles.actionIconContainer,
                        isIconHovered && styles.actionIconContainerHovered
                    ]} 
                    activeOpacity={0.7}
                    onPress={(e) => {
                        e.stopPropagation?.();
                        onIconPress();
                    }}
                    {...(Platform.OS === 'web' ? {
                        onMouseEnter: () => setIsIconHovered(true),
                        onMouseLeave: () => setIsIconHovered(false),
                    } as any : {})}
                >
                    <Ionicons name="information-circle-outline" size={20} color={colors.text} />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );
}

/* ===================== ERRAND DETAILS MODAL ===================== */
function ErrandDetailsModal({
    errand,
    visible,
    onClose,
}: {
    errand: ErrandWithUsers;
    visible: boolean;
    onClose: () => void;
}) {
    const callerName = errand.caller 
        ? `${titleCase(errand.caller.first_name)} ${titleCase(errand.caller.last_name)}`.trim() 
        : "N/A";
    const runnerName = errand.runner 
        ? `${titleCase(errand.runner.first_name)} ${titleCase(errand.runner.last_name)}`.trim() 
        : "Not Assigned";
    const callerEmail = errand.caller?.email || "N/A";
    const runnerEmail = errand.runner?.email || "N/A";
    const callerStudentId = errand.caller?.student_id_number || "N/A";
    const runnerStudentId = errand.runner?.student_id_number || "N/A";
    const callerProfilePic = errand.caller?.profile_picture_url;
    const runnerProfilePic = errand.runner?.profile_picture_url;
    const amountPrice = errand.amount_price ? `₱${errand.amount_price.toFixed(2)}` : "N/A";
    const createdAt = new Date(errand.created_at).toLocaleString();
    const completedAt = errand.completed_at ? new Date(errand.completed_at).toLocaleString() : "N/A";

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.errandModalOverlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View
                    style={styles.errandModalCard}
                    onStartShouldSetResponder={() => true}
                >
                    {/* Header */}
                    <View style={styles.errandModalHeader}>
                        <Text style={styles.errandModalTitle}>Transaction Details</Text>
                        <TouchableOpacity onPress={onClose} style={styles.errandModalCloseButton}>
                            <Ionicons name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.errandModalContent} showsVerticalScrollIndicator={true}>
                        {/* Transaction Details Section */}
                        <View style={styles.errandModalSection}>
                            <Text style={styles.errandModalSectionTitle}>Transaction Details</Text>
                            <View style={styles.errandModalDetailRow}>
                                <Text style={styles.errandModalLabel}>Errand ID:</Text>
                                <Text style={styles.errandModalValue}>{errand.id}</Text>
                            </View>
                            <View style={styles.errandModalDetailRow}>
                                <Text style={styles.errandModalLabel}>Created At:</Text>
                                <Text style={styles.errandModalValue}>{createdAt}</Text>
                            </View>
                            <View style={styles.errandModalDetailRow}>
                                <Text style={styles.errandModalLabel}>Completed At:</Text>
                                <Text style={styles.errandModalValue}>{completedAt}</Text>
                            </View>
                            <View style={styles.errandModalDetailRow}>
                                <Text style={styles.errandModalLabel}>Total Price:</Text>
                                <Text style={styles.errandModalValue}>{amountPrice}</Text>
                            </View>
                        </View>

                        {/* Divider */}
                        <View style={styles.errandModalDivider} />

                        {/* Caller Information Section */}
                        <View style={styles.errandModalSection}>
                            <Text style={styles.errandModalSectionTitle}>Caller Information</Text>
                            <View style={styles.errandModalProfileRow}>
                                {callerProfilePic ? (
                                    <Image 
                                        source={{ uri: callerProfilePic }} 
                                        style={styles.errandModalProfileImage as ImageStyle}
                                    />
                                ) : (
                                    <View style={styles.errandModalProfileImagePlaceholder}>
                                        <Ionicons name="person" size={24} color={colors.border} />
                                    </View>
                                )}
                                <View style={styles.errandModalProfileInfo}>
                                    <Text style={styles.errandModalProfileName}>{callerName}</Text>
                                    <View style={styles.errandModalProfileDetailRow}>
                                        <Text style={styles.errandModalProfileLabel}>Email:</Text>
                                        <Text style={styles.errandModalProfileValue}>{callerEmail}</Text>
                                    </View>
                                    <View style={styles.errandModalProfileDetailRow}>
                                        <Text style={styles.errandModalProfileLabel}>Student ID:</Text>
                                        <Text style={styles.errandModalProfileValue}>{callerStudentId}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Divider */}
                        <View style={styles.errandModalDivider} />

                        {/* Runner Information Section */}
                        <View style={styles.errandModalSection}>
                            <Text style={styles.errandModalSectionTitle}>Runner Information</Text>
                            <View style={styles.errandModalProfileRow}>
                                {runnerProfilePic ? (
                                    <Image 
                                        source={{ uri: runnerProfilePic }} 
                                        style={styles.errandModalProfileImage as ImageStyle}
                                    />
                                ) : (
                                    <View style={styles.errandModalProfileImagePlaceholder}>
                                        <Ionicons name="person" size={24} color={colors.border} />
                                    </View>
                                )}
                                <View style={styles.errandModalProfileInfo}>
                                    <Text style={styles.errandModalProfileName}>{runnerName}</Text>
                                    <View style={styles.errandModalProfileDetailRow}>
                                        <Text style={styles.errandModalProfileLabel}>Email:</Text>
                                        <Text style={styles.errandModalProfileValue}>{runnerEmail}</Text>
                                    </View>
                                    <View style={styles.errandModalProfileDetailRow}>
                                        <Text style={styles.errandModalProfileLabel}>Student ID:</Text>
                                        <Text style={styles.errandModalProfileValue}>{runnerStudentId}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Divider */}
                        <View style={styles.errandModalDivider} />

                        {/* Delivery Proof Section */}
                        <View style={styles.errandModalSection}>
                            <Text style={styles.errandModalSectionTitle}>Delivery Proof</Text>
                            {errand.delivery_proof_photo ? (
                                <Image 
                                    source={{ uri: errand.delivery_proof_photo }} 
                                    style={styles.deliveryProofImage as ImageStyle}
                                    resizeMode="contain"
                                />
                            ) : (
                                <Text style={styles.noProofText}>
                                    No delivery proof uploaded.
                                </Text>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

function Sidebar({
    open,
    onToggle,
    onLogout,
    userName,
    activeRoute,
    isSmall,
}: {
    open: boolean;
    onToggle: () => void;
    onLogout: () => void;
    userName: string;
    activeRoute?: string;
    isSmall: boolean;
}) {
    const router = useRouter();
    return (
        <View style={[
            styles.sidebar, 
            { 
                width: open ? (isSmall ? 260 : 260) : 74,
                ...(isSmall && open ? {
                    position: 'absolute' as any,
                    left: 0,
                    top: 0,
                    bottom: 0,
                    zIndex: 1000,
                    elevation: 10,
                } : {}),
            }
        ]}>
            <View style={styles.sidebarHeader}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: open ? 10 : 0,
                        justifyContent: open ? "flex-start" : "center",
                        paddingHorizontal: open ? 16 : 6,
                        paddingVertical: 16,
                    }}
                >
                    <TouchableOpacity onPress={onToggle} style={[styles.sideMenuBtn, !open && { marginRight: 0 }]}>
                        <Ionicons name="menu-outline" size={20} color="#fff" />
                    </TouchableOpacity>
                    {open && (
                        <>
                            <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
                            <Text style={styles.brand}>GoBuddy Admin</Text>
                        </>
                    )}
                </View>
            </View>

            <View style={{ flex: 1, justifyContent: "space-between", backgroundColor: "#fff" }}>
                <View style={{ paddingTop: 8 }}>
                    <SideItem
                        label="Dashboard"
                        icon="home-outline"
                        open={open}
                        active={activeRoute === 'home'}
                        onPress={() => router.push("/admin/home")}
                    />
                    <Separator />
                    <SideItem
                        label="List of Students"
                        icon="people-outline"
                        open={open}
                        active={activeRoute === 'students'}
                        onPress={() => router.push("/admin/students")}
                    />
                    <Separator />
                    <SideItem
                        label="Settlements"
                        icon="cash-outline"
                        open={open}
                        active={activeRoute === 'settlements'}
                        onPress={() => router.push("/admin/settlements")}
                    />
                    <Separator />
                    <SideItem
                        label="Student ID Approval"
                        icon="id-card-outline"
                        open={open}
                        active={activeRoute === 'id_images'}
                        onPress={() => router.push("/admin/id_images")}
                    />
                    <Separator />
                    <SideItem
                        label="Errands Transactions"
                        icon="briefcase-outline"
                        open={open}
                        active={activeRoute === 'errands'}
                        onPress={() => router.push("/admin/errands")}
                    />
                    <Separator />
                    <SideItem
                        label="Commission Transactions"
                        icon="document-text-outline"
                        open={open}
                        active={activeRoute === 'commissions'}
                        onPress={() => router.push("/admin/commissions")}
                    />
                    <Separator />
                    <SideItem
                        label="Category List"
                        icon="list-outline"
                        open={open}
                        active={activeRoute === 'categories'}
                        onPress={() => router.push("/admin/categories")}
                    />
                    <Separator />
                </View>

                <View style={styles.sidebarFooter}>
                    <View style={styles.userCard}>
                        <View style={styles.userAvatar}>
                            <Ionicons name="person" size={18} color="#fff" />
                        </View>
                        {open && (
                            <View style={{ flex: 1 }}>
                                <Text style={styles.userName}>{userName || "Admin"}</Text>
                                <Text style={styles.userRole}>Administrator</Text>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity onPress={onLogout} activeOpacity={0.8} style={styles.logoutBtn}>
                        <Ionicons name="log-out-outline" size={18} color="#fff" />
                        {open && <Text style={styles.logoutText}>Logout</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

function Separator() {
    return <View style={styles.separator} />;
}

function SideItem({
    label,
    icon,
    open,
    active,
    onPress,
}: {
    label: string;
    icon: any;
    open: boolean;
    active?: boolean;
    onPress?: () => void;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={[styles.sideItem, active && styles.sideItemActive, !open && styles.sideItemCollapsed]}
        >
            <Ionicons name={icon} size={18} color={active ? colors.maroon : colors.text} />
            {open && (
                <Text style={[styles.sideItemText, active && styles.sideItemTextActive]}>{label}</Text>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    sidebar: {
        borderRightColor: colors.border,
        borderRightWidth: 1,
        backgroundColor: "#fff",
    },
    sidebarHeader: {
        backgroundColor: "#a01a1a",
        ...(Platform.OS === 'web' ? {
            background: `linear-gradient(135deg, #a01a1a 0%, #8B0000 100%)`,
        } : {}),
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    brand: {
        color: "#fff",
        fontWeight: "800",
        fontSize: 16,
    },
    sideMenuBtn: {
        height: 36,
        width: 36,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginRight: 8,
    },
    sideItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 8,
        marginVertical: 2,
        borderRadius: 10,
        backgroundColor: "#fff",
    },
    sideItemActive: {
        backgroundColor: "#f2e9e9",
    },
    sideItemCollapsed: {
        justifyContent: "center",
        paddingHorizontal: 0,
        gap: 0,
        height: 56,
        marginHorizontal: 8,
    },
    sideItemText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
        flex: 1,
    },
    sideItemTextActive: {
        color: colors.maroon,
        fontWeight: "700",
    },
    separator: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 4,
        marginHorizontal: 12,
    },
    sidebarFooter: {
        padding: 12,
        gap: 10,
    },
    userCard: {
        backgroundColor: "#a01a1a",
        ...(Platform.OS === 'web' ? {
            background: `linear-gradient(135deg, #a01a1a 0%, #8B0000 100%)`,
        } : {}),
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    userAvatar: {
        width: 40,
        height: 40,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    userName: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "800",
    },
    userRole: {
        color: "#fff",
        fontSize: 11,
        opacity: 0.9,
    },
    logoutBtn: {
        borderWidth: 0,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: '#e72a2a',
        ...(Platform.OS === 'web' ? {
            background: `linear-gradient(135deg, #e72a2a 0%, #dc2626 100%)`,
        } : {}),
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    logoutText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 13,
    },
    mainArea: {
        flex: 1,
        backgroundColor: "#fff",
    },
    topBar: {
        height: 90,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingHorizontal: 16,
    },
    welcome: {
        color: colors.text,
        fontSize: 18,
        fontWeight: "900",
    },
    content: {
        width: "100%",
        maxWidth: 1200,
        alignSelf: "center",
        paddingHorizontal: 24,
        paddingVertical: 24,
        backgroundColor: "#fff",
    },
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 24,
        backgroundColor: "#fff",
        gap: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: colors.text,
    },
    datePickerWrapper: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 24,
        gap: 8,
        alignSelf: "flex-start",
    },
    datePickerContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: "#fff",
        width: 160,
        ...(Platform.OS === 'web' ? {
            cursor: 'pointer',
        } : {}),
    },
         datePickerInput: {
         fontSize: 14,
         color: colors.text,
         flex: 1,
         ...(Platform.OS === 'web' ? {
             outline: 'none',
         } : {}),
     },
    clearDateButton: {
        padding: 4,
    },
    resultsCount: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
        marginBottom: 16,
        opacity: 0.7,
    },
    tableContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: "#fff",
        overflow: "hidden",
        minWidth: 1630,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: colors.faint,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    tableHeaderText: {
        color: colors.text,
        fontSize: 13,
        fontWeight: "700",
    },
    tableRow: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 16,
        paddingHorizontal: 20,
        alignItems: "center",
        minHeight: 56,
        backgroundColor: "#fff",
    },
    tableRowAlternate: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 16,
        paddingHorizontal: 20,
        alignItems: "center",
        minHeight: 56,
        backgroundColor: "#F5F5F5",
    },
    tableRowHovered: {
        ...(Platform.OS === 'web' ? {
            backgroundColor: "#f9f5f5",
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
        } as any : {}),
    },
    tableCellText: {
        color: colors.text,
        fontSize: 13,
    },
    tableCellErrandId: {
        width: 120,
        paddingRight: 24,
        fontWeight: "600",
        ...(Platform.OS === 'web' ? {
            whiteSpace: 'nowrap',
        } as any : {}),
    },
    tableCellCallerName: {
        width: 200,
        paddingRight: 24,
    },
    tableCellCallerEmail: {
        width: 260,
        paddingRight: 24,
    },
    tableCellRunnerName: {
        width: 200,
        paddingRight: 24,
    },
    tableCellRunnerEmail: {
        width: 260,
        paddingRight: 24,
    },
    tableCellCategory: {
        width: 160,
        paddingRight: 24,
    },
    tableCellCreated: {
        width: 200,
        paddingRight: 24,
    },
    tableCellPrice: {
        width: 110,
        paddingRight: 24,
    },
    tableCellAction: {
        width: 60,
        paddingRight: 0,
        alignItems: "center",
        justifyContent: "center",
    },
    actionIconContainer: {
        padding: 6,
        borderRadius: 4,
        backgroundColor: "#F0F0F0",
        ...(Platform.OS === 'web' ? {
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        } : {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 2,
            elevation: 2,
        }),
    },
    actionIconContainerHovered: {
        backgroundColor: "#E5E5E5",
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
            transform: 'translateY(-1px)',
        } : {}),
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
        gap: 12,
    },
    emptyStateText: {
        color: colors.text,
        fontSize: 16,
        opacity: 0.6,
        textAlign: "center",
    },
    modalOverlay: {
        position: "absolute" as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
    },
    modalCard: {
        width: 400,
        maxWidth: "90%",
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 24,
        gap: 16,
    },
    modalTitle: {
        color: colors.text,
        fontSize: 20,
        fontWeight: "900",
        textAlign: "center",
    },
    modalMessage: {
        color: colors.text,
        fontSize: 14,
        opacity: 0.8,
        textAlign: "center",
    },
    modalButtons: {
        flexDirection: "row",
        gap: 12,
        marginTop: 8,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    modalButtonCancel: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "#fff",
    },
    modalButtonCancelText: {
        color: colors.text,
        fontWeight: "600",
    },
    modalButtonConfirm: {
        backgroundColor: colors.maroon,
    },
    modalButtonConfirmText: {
        color: "#fff",
        fontWeight: "700",
    },
    calendarOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        ...(Platform.OS === 'web' ? {
            overflow: 'visible',
            overflowY: 'visible',
            overflowX: 'visible',
        } : {}),
    },
    calendarModal: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 20,
        width: 340,
        maxWidth: "90%",
        zIndex: 10000,
        overflow: "visible",
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            backgroundColor: '#FFFFFF',
            background: '#FFFFFF',
            position: 'relative',
            overflow: 'visible',
            overflowY: 'visible',
            overflowX: 'visible',
            clipPath: 'none',
            clip: 'auto',
        } as any : {}),
    },
    calendarHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        ...(Platform.OS === 'web' ? {
            overflow: 'visible',
            overflowY: 'visible',
            overflowX: 'visible',
            position: 'relative',
        } : {}),
    },
    calendarHeaderLeft: {
        flexDirection: "row",
        alignItems: "center",
        position: "relative",
        zIndex: 10001,
        overflow: "visible",
        ...(Platform.OS === 'web' ? {
            zIndex: 10001,
            position: 'relative',
            overflow: 'visible',
            overflowY: 'visible',
            overflowX: 'visible',
            clipPath: 'none',
            clip: 'auto',
        } as any : {}),
    },
    calendarHeaderRight: {
        flexDirection: "row",
        alignItems: "center",
        position: "relative",
        zIndex: 10001,
        overflow: "visible",
        ...(Platform.OS === 'web' ? {
            zIndex: 10001,
            position: 'relative',
            overflow: 'visible',
            overflowY: 'visible',
            overflowX: 'visible',
            clipPath: 'none',
            clip: 'auto',
        } as any : {}),
    },
    calendarMonthText: {
        color: colors.maroon,
        fontSize: 16,
        fontWeight: "700",
    },
    calendarYearText: {
        color: colors.maroon,
        fontSize: 16,
        fontWeight: "700",
    },
    calendarNavButtons: {
        flexDirection: "row",
        gap: 8,
    },
    calendarNavButton: {
        padding: 4,
    },
    calendarDaysHeader: {
        flexDirection: "row",
        marginBottom: 8,
    },
    calendarDayHeader: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 8,
    },
    calendarDayHeaderText: {
        color: colors.maroon,
        fontSize: 12,
        fontWeight: "600",
    },
    calendarGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        marginBottom: 16,
        ...(Platform.OS === 'web' ? {
            zIndex: 1,
            position: 'relative',
            backgroundColor: '#FFFFFF',
        } : {}),
    },
    calendarDay: {
        width: "14.28%",
        aspectRatio: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 4,
    },
    calendarDaySelected: {
        backgroundColor: colors.maroon,
        borderRadius: 6,
    },
    calendarDayText: {
        color: colors.maroon,
        fontSize: 14,
        fontWeight: "500",
    },
    calendarDayTextSelected: {
        color: "#fff",
        fontWeight: "700",
    },
    calendarDayTextInactive: {
        color: colors.border,
        fontSize: 14,
    },
    calendarDayTextFaded: {
        opacity: 0.5,
    },
    calendarDayTextToday: {
        fontWeight: "700",
    },
    calendarFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    calendarFooterButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    calendarFooterButtonText: {
        color: colors.maroon,
        fontSize: 14,
        fontWeight: "600",
    },
    calendarDropdownButton: {
        flexDirection: "row",
        alignItems: "center",
        ...(Platform.OS === 'web' ? {
            cursor: 'pointer',
        } : {}),
    },
         calendarDropdown: {
         position: "absolute",
         top: "100%",
         left: 0,
         marginTop: 4,
         backgroundColor: "#FFFFFF",
         borderRadius: 8,
         borderWidth: 1,
         borderColor: colors.border,
         height: 200,
         minWidth: 120,
         zIndex: 99999,
         elevation: 15,
         overflow: "hidden",
         ...(Platform.OS === 'web' ? {
             boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
             backgroundColor: '#FFFFFF',
             background: '#FFFFFF',
             position: 'absolute',
             zIndex: 99999,
             overflow: 'hidden',
             transform: 'translateZ(0)',
             willChange: 'transform',
             isolation: 'isolate',
             clipPath: 'none',
             clip: 'auto',
         } as any : {}),
     },
     calendarDropdownScroll: {
         flex: 1,
         backgroundColor: "#FFFFFF",
         ...(Platform.OS === 'web' ? {
             backgroundColor: '#FFFFFF',
             background: '#FFFFFF',
             height: '100%',
             maxHeight: '100%',
             overflowY: 'auto',
             overflowX: 'hidden',
             WebkitOverflowScrolling: 'touch',
         } : {}),
     },
     calendarDropdownScrollContent: {
         backgroundColor: "#FFFFFF",
         ...(Platform.OS === 'web' ? {
             backgroundColor: '#FFFFFF',
             background: '#FFFFFF',
         } : {}),
     },
    sidebarOverlay: {
        position: 'absolute' as any,
        top: 0,
        left: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 999,
    },
    calendarDropdownItem: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.faint,
        backgroundColor: "#FFFFFF",
        ...(Platform.OS === 'web' ? {
            backgroundColor: '#FFFFFF',
            background: '#FFFFFF',
            opacity: 1,
         } : {}),
     },
     calendarDropdownItemSelected: {
         backgroundColor: colors.faint,
     },
     calendarDropdownItemText: {
         color: colors.text,
         fontSize: 14,
         fontWeight: "500",
     },
     calendarDropdownItemTextSelected: {
         color: colors.maroon,
         fontWeight: "700",
     },
     dropdownModalBackdrop: {
         position: 'absolute',
         top: 0,
         left: 0,
         right: 0,
         bottom: 0,
         backgroundColor: 'transparent',
     },
     dropdownModalContainer: {
         position: 'absolute' as const,
         zIndex: 100000,
         ...(Platform.OS === 'web' ? {
             zIndex: 100000,
         } : {}),
     },
    errandModalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
    },
    errandModalCard: {
        width: "90%",
        maxWidth: 600,
        maxHeight: "90%",
        backgroundColor: "#fff",
        borderRadius: 12,
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            maxHeight: '90vh',
        } as any : {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 20,
            elevation: 10,
        }),
    },
    errandModalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    errandModalTitle: {
        color: colors.text,
        fontSize: 20,
        fontWeight: "900",
    },
    errandModalCloseButton: {
        padding: 4,
        ...(Platform.OS === 'web' ? {
            cursor: 'pointer',
        } : {}),
    },
    errandModalContent: {
        flex: 1,
    },
    errandModalSection: {
        padding: 24,
    },
    errandModalSectionTitle: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 16,
    },
    errandModalDetailRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    errandModalLabel: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
        opacity: 0.7,
    },
    errandModalValue: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "500",
        flex: 1,
        textAlign: "right",
    },
    errandModalDivider: {
        height: 1,
        backgroundColor: colors.border,
        marginHorizontal: 24,
    },
    errandModalProfileRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 16,
    },
    errandModalProfileImage: {
        width: 60,
        height: 60,
        borderRadius: 30,
        overflow: "hidden" as const,
    },
    errandModalProfileImagePlaceholder: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
    },
    errandModalProfileInfo: {
        flex: 1,
    },
    errandModalProfileName: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 8,
    },
    errandModalProfileDetailRow: {
        flexDirection: "row",
        marginBottom: 6,
        gap: 8,
    },
    errandModalProfileLabel: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
        opacity: 0.7,
    },
    errandModalProfileValue: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "500",
    },
    errandModalImageContainer: {
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.faint,
        borderRadius: 8,
        padding: 16,
        minHeight: 200,
    },
    errandModalProofImage: {
        width: "100%",
        maxWidth: 500,
        maxHeight: 400,
        borderRadius: 8,
        overflow: "hidden" as const,
    },
    deliveryProofImage: {
        width: "100%",
        height: 300,
        borderRadius: 12,
    },
    noProofText: {
        textAlign: "center",
        color: "#888",
        paddingVertical: 20,
    },
    errandModalNoImageContainer: {
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.faint,
        borderRadius: 8,
        padding: 40,
        minHeight: 200,
    },
    errandModalNoImageText: {
        color: colors.text,
        fontSize: 14,
        opacity: 0.6,
        marginTop: 12,
    },
});
