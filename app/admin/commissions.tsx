import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState, useRef, useEffect, useMemo } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    ImageStyle,
    Linking,
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
type CommissionRowDB = {
    id: number;
    title: string | null;
    commission_type: string | null;
    status: string | null;
    created_at: string;
    buddycaller_id: string | null;
    runner_id: string | null;
    meetup_location?: string | null;
    due_at?: string | null;
    description?: string | null;
};

type UserInfo = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    student_id_number?: string | null;
    profile_picture_url?: string | null;
};

type TaskProgress = {
    file_url?: string | null;
};

type CommissionWithUsers = CommissionRowDB & {
    caller?: UserInfo;
    runner?: UserInfo;
    totalPrice?: number | null;
    task_progress?: TaskProgress[];
    delivery_proof_url?: string | null;
};

function toUiStatus(s: string | null): string {
    if (!s) return "Pending";
    if (s === "in_progress") return "In Progress";
    if (s === "completed") return "Completed";
    if (s === "pending") return "Pending";
    if (s === "cancelled") return "Cancelled";
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
        case "pending": return "#F59E0B";
        case "in_progress":
        case "in progress": return "#3B82F6";
        case "completed": return "#10B981";
        case "cancelled": return "#EF4444";
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

export default function AdminCommissions() {
    const router = useRouter();
    const { loading, fullName } = useAuthProfile();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [commissions, setCommissions] = useState<CommissionWithUsers[]>([]);
    const [selectedCommission, setSelectedCommission] = useState<CommissionWithUsers | null>(null);
    const [showCommissionModal, setShowCommissionModal] = useState(false);
    const { width: screenWidth } = useWindowDimensions();

    // Reusable function to open commission details modal
    const handleOpenCommission = (commission: CommissionWithUsers) => {
        setSelectedCommission(commission);
        setShowCommissionModal(true);
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
    const [loadingCommissions, setLoadingCommissions] = useState(true);
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
        const fetchCommissions = async () => {
            try {
                setLoadingCommissions(true);
                const { data: commissionsData, error: commissionsError } = await supabase
                    .from('commission')
                    .select(`
                        id,
                        title,
                        commission_type,
                        status,
                        created_at,
                        buddycaller_id,
                        runner_id,
                        meetup_location,
                        due_at,
                        description
                    `)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(PAGE_SIZE);
                
                if (commissionsError) throw commissionsError;
                
                // Get all commission IDs for task progress fetch
                const commissionIdsForTaskProgress = commissionsData?.map(c => c.id) || [];
                
                // Fetch task progress separately
                const { data: taskProgressData, error: taskProgressError } = await supabase
                    .from('task_progress')
                    .select('commission_id, file_url')
                    .in('commission_id', commissionIdsForTaskProgress);
                
                if (taskProgressError) {
                    console.error('Error fetching task progress:', taskProgressError);
                }
                
                // Fetch user information for callers and runners
                const userIds = new Set<string>();
                commissionsData?.forEach(commission => {
                    if (commission.buddycaller_id) userIds.add(commission.buddycaller_id);
                    if (commission.runner_id) userIds.add(commission.runner_id);
                });

                const { data: usersData, error: usersError } = await supabase
                    .from('users')
                    .select(`
                        id,
                        first_name,
                        last_name,
                        email,
                        student_id_number,
                        profile_picture_url
                    `)
                    .in('id', Array.from(userIds));

                if (usersError) throw usersError;

                const usersMap = new Map<string, UserInfo>();
                usersData?.forEach(user => {
                    usersMap.set(user.id, user);
                });

                // Fetch invoice amounts for commissions
                const commissionIds = commissionsData?.map(c => c.id) || [];
                const invoicesMap = new Map<number, number>();
                
                if (commissionIds.length > 0) {
                    // Fetch all invoices first to check data structure
                    const { data: allInvoicesUnfiltered, error: errorUnfiltered } = await supabase
                        .from('invoices')
                        .select('id, commission_id, amount, status, created_at, accepted_at')
                        .limit(100)
                        .order('created_at', { ascending: false });

                    if (errorUnfiltered) {
                        console.error('Error fetching invoices:', errorUnfiltered);
                        // Check for RLS-specific errors
                        if (errorUnfiltered.code === '42501' || errorUnfiltered.message?.includes('permission') || errorUnfiltered.message?.includes('RLS')) {
                            console.error('RLS policy issue: Admin may not have SELECT permissions on invoices table.');
                        }
                    }

                    // Fetch invoices matching our commission IDs
                    // Try both as numbers and as strings to handle type mismatches
                    let allInvoicesData: any[] = [];
                    let allInvoicesError: any = null;

                    // Try querying with numbers first (most common case)
                    let { data: invoicesAsNumbers, error: errorAsNumbers } = await supabase
                        .from('invoices')
                        .select('id, commission_id, amount, status, created_at, accepted_at')
                        .in('commission_id', commissionIds)
                        .order('created_at', { ascending: false });

                    if (!errorAsNumbers && invoicesAsNumbers && invoicesAsNumbers.length > 0) {
                        allInvoicesData = invoicesAsNumbers;
                    } else {
                        // Try querying with commission IDs as strings
                        const commissionIdsAsStrings = commissionIds.map(id => String(id));
                        let { data: invoicesAsStrings, error: errorAsStrings } = await supabase
                            .from('invoices')
                            .select('id, commission_id, amount, status, created_at, accepted_at')
                            .in('commission_id', commissionIdsAsStrings)
                            .order('created_at', { ascending: false });

                        if (!errorAsStrings && invoicesAsStrings && invoicesAsStrings.length > 0) {
                            allInvoicesData = invoicesAsStrings;
                        } else {
                            // If both fail, manually filter from all invoices we fetched
                            if (allInvoicesUnfiltered && allInvoicesUnfiltered.length > 0) {
                                allInvoicesData = allInvoicesUnfiltered.filter(inv => {
                                    if (!inv.commission_id) return false;
                                    const invCommissionId = typeof inv.commission_id === 'string' 
                                        ? parseInt(inv.commission_id, 10) 
                                        : inv.commission_id;
                                    return !isNaN(invCommissionId) && commissionIds.includes(invCommissionId);
                                });
                            } else {
                                allInvoicesError = errorAsNumbers || errorAsStrings;
                            }
                        }
                    }

                    if (allInvoicesError) {
                        console.error('Error fetching invoices:', allInvoicesError);
                    }

                    if (!allInvoicesError && allInvoicesData && allInvoicesData.length > 0) {
                        // Group invoices by commission_id
                        const invoicesByCommission = new Map<number, Array<{ id: string; amount: number; status: string; created_at: string; accepted_at: string | null }>>();
                        
                        allInvoicesData.forEach((invoice) => {
                            if (invoice.commission_id && invoice.amount !== null && invoice.amount !== undefined) {
                                const commissionId = typeof invoice.commission_id === 'string' 
                                    ? parseInt(invoice.commission_id, 10) 
                                    : invoice.commission_id;
                                
                                if (!isNaN(commissionId) && commissionId > 0) {
                                    const amount = typeof invoice.amount === 'number' 
                                        ? invoice.amount 
                                        : parseFloat(String(invoice.amount)) || 0;
                                    
                                    if (amount > 0) {
                                        if (!invoicesByCommission.has(commissionId)) {
                                            invoicesByCommission.set(commissionId, []);
                                        }
                                        invoicesByCommission.get(commissionId)!.push({
                                            id: invoice.id,
                                            amount,
                                            status: invoice.status || 'pending',
                                            created_at: invoice.created_at || '',
                                            accepted_at: invoice.accepted_at || null
                                        });
                                    }
                                }
                            }
                        });
                        
                        // For each commission, prefer accepted invoice (has accepted_at or status='accepted'), otherwise use the latest one
                        invoicesByCommission.forEach((invoices, commissionId) => {
                            if (invoices.length === 0) return;
                            
                            // First, try to find an invoice that is accepted
                            const acceptedInvoice = invoices.find(inv => 
                                (inv.accepted_at !== null && inv.accepted_at !== undefined) || 
                                inv.status === 'accepted'
                            );
                            
                            if (acceptedInvoice) {
                                invoicesMap.set(commissionId, acceptedInvoice.amount);
                            } else {
                                // For completed commissions, use the latest invoice even if not accepted
                                const latestInvoice = invoices[0]; // Already sorted by created_at desc
                                invoicesMap.set(commissionId, latestInvoice.amount);
                            }
                        });
                    }
                }

                const commissionsWithUsers: CommissionWithUsers[] = (commissionsData || []).map(commission => {
                    const totalPrice = invoicesMap.get(commission.id) || null;
                    const deliveryProof = taskProgressData?.find(
                        (tp) => tp.commission_id === commission.id
                    );
                    return {
                        ...commission,
                        caller: commission.buddycaller_id ? usersMap.get(commission.buddycaller_id) : undefined,
                        runner: commission.runner_id ? usersMap.get(commission.runner_id) : undefined,
                        totalPrice: totalPrice,
                        delivery_proof_url: deliveryProof?.file_url || null,
                    };
                });

                setCommissions(commissionsWithUsers);
            } catch (error) {
                console.error('Error fetching commissions:', error);
                Alert.alert('Error', 'Failed to load commissions.');
            } finally {
                setLoadingCommissions(false);
            }
        };
        fetchCommissions();
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

    // Memoize filtered commissions to avoid re-computation on every render
    const filteredCommissions = useMemo(() => {
        return commissions.filter((commission) => {
            // Date filter
            if (selectedDate) {
                const commissionDate = new Date(commission.created_at);
                const selectedDateObj = new Date(selectedDate);
                const commissionDateOnly = new Date(commissionDate.getFullYear(), commissionDate.getMonth(), commissionDate.getDate());
                const selectedDateOnly = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), selectedDateObj.getDate());
                if (commissionDateOnly.getTime() !== selectedDateOnly.getTime()) {
                    return false;
                }
            }

            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const title = (commission.title || '').toLowerCase();
                const callerName = commission.caller ? `${commission.caller.first_name || ''} ${commission.caller.last_name || ''}`.toLowerCase() : '';
                const runnerName = commission.runner ? `${commission.runner.first_name || ''} ${commission.runner.last_name || ''}`.toLowerCase() : '';
                const commissionType = (commission.commission_type || '').toLowerCase();
                return title.includes(query) || callerName.includes(query) || runnerName.includes(query) || commissionType.includes(query);
            }
            
            return true;
        });
    }, [commissions, selectedDate, searchQuery]);

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
                    activeRoute="commissions"
                    isSmall={isSmall}
                />
                
                <View style={styles.mainArea}>
                    <View style={styles.topBar}>
                        <Text style={styles.welcome}>Commission Transactions</Text>
                    </View>

                    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
                        <View style={styles.content}>
                            <View style={styles.searchContainer}>
                                <Ionicons name="search-outline" size={20} color={colors.text} style={{ opacity: 0.6 }} />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search by title, caller, runner, or commission type..."
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

                            {loadingCommissions ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <ActivityIndicator size="large" color={colors.maroon} />
                                </View>
                            ) : filteredCommissions.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Ionicons name="document-text-outline" size={48} color={colors.border} />
                                    <Text style={styles.emptyStateText}>
                                        {searchQuery || selectedDate ? 'No commissions found matching your filters.' : 'No commissions found.'}
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    <Text style={styles.resultsCount}>
                                        {filteredCommissions.length} {filteredCommissions.length === 1 ? 'commission' : 'commissions'}
                                        {(searchQuery || selectedDate) && ` found`}
                                    </Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                        <View style={styles.tableContainer}>
                                            <View style={styles.tableHeader}>
                                                <Text style={[styles.tableHeaderText, styles.tableCellCommissionId]}>Commission ID</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellCallerName]}>Caller Name</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellCallerEmail]}>Caller Email</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellRunnerName]}>Runner Name</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellRunnerEmail]}>Runner Email</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellCategory]}>Category</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellCreated]}>Created At</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellDueDate]}>Due At</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellPrice]}>Total Price</Text>
                                                <View style={styles.tableCellAction}></View>
                                            </View>
                                            <FlatList
                                                data={filteredCommissions}
                                                renderItem={({ item: commission, index }) => (
                                                    <CommissionTableRow 
                                                        commission={commission} 
                                                        index={index}
                                                        onRowPress={() => handleOpenCommission(commission)}
                                                        onIconPress={() => handleOpenCommission(commission)}
                                                    />
                                                )}
                                                keyExtractor={(commission) => String(commission.id)}
                                                initialNumToRender={10}
                                                windowSize={5}
                                                removeClippedSubviews={true}
                                                scrollEnabled={false}
                                            />
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

            {showCommissionModal && selectedCommission && (
                <CommissionDetailsModal
                    commission={selectedCommission}
                    visible={showCommissionModal}
                    onClose={() => {
                        setShowCommissionModal(false);
                        setSelectedCommission(null);
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

/* ===================== COMMISSION DETAILS MODAL ===================== */
function CommissionDetailsModal({
    commission,
    visible,
    onClose,
}: {
    commission: CommissionWithUsers;
    visible: boolean;
    onClose: () => void;
}) {
    const callerName = commission.caller 
        ? `${titleCase(commission.caller.first_name)} ${titleCase(commission.caller.last_name)}`.trim() 
        : "N/A";
    const runnerName = commission.runner 
        ? `${titleCase(commission.runner.first_name)} ${titleCase(commission.runner.last_name)}`.trim() 
        : "Not Assigned";
    const callerEmail = commission.caller?.email || "N/A";
    const runnerEmail = commission.runner?.email || "N/A";
    const callerStudentId = commission.caller?.student_id_number || "N/A";
    const runnerStudentId = commission.runner?.student_id_number || "N/A";
    const callerProfilePic = commission.caller?.profile_picture_url;
    const runnerProfilePic = commission.runner?.profile_picture_url;
    const category = commission.commission_type 
        ? commission.commission_type.split(',').map(t => titleCase(t.trim())).join(', ')
        : "N/A";
    const price = commission.totalPrice ? `₱${commission.totalPrice.toFixed(2)}` : "N/A";
    const createdAt = new Date(commission.created_at).toLocaleString();
    const dueAt = commission.due_at ? new Date(commission.due_at).toLocaleString() : "N/A";

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.commissionModalOverlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View
                    style={styles.commissionModalCard}
                    onStartShouldSetResponder={() => true}
                >
                    {/* Header */}
                    <View style={styles.commissionModalHeader}>
                        <Text style={styles.commissionModalTitle}>Transaction Details</Text>
                        <TouchableOpacity onPress={onClose} style={styles.commissionModalCloseButton}>
                            <Ionicons name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.commissionModalContent} showsVerticalScrollIndicator={true}>
                        {/* Commission Transaction Details Section */}
                        <View style={styles.commissionModalSection}>
                            <Text style={styles.commissionModalSectionTitle}>Commission Transaction Details</Text>
                            <View style={styles.commissionModalDetailRow}>
                                <Text style={styles.commissionModalLabel}>Commission ID:</Text>
                                <Text style={styles.commissionModalValue}>{commission.id}</Text>
                            </View>
                            <View style={styles.commissionModalDetailRow}>
                                <Text style={styles.commissionModalLabel}>Created At:</Text>
                                <Text style={styles.commissionModalValue}>{createdAt}</Text>
                            </View>
                            <View style={styles.commissionModalDetailRow}>
                                <Text style={styles.commissionModalLabel}>Due At:</Text>
                                <Text style={styles.commissionModalValue}>{dueAt}</Text>
                            </View>
                            <View style={styles.commissionModalDetailRow}>
                                <Text style={styles.commissionModalLabel}>Category:</Text>
                                <Text style={styles.commissionModalValue}>{category}</Text>
                            </View>
                            <View style={styles.commissionModalDetailRow}>
                                <Text style={styles.commissionModalLabel}>Price:</Text>
                                <Text style={styles.commissionModalValue}>{price}</Text>
                            </View>
                        </View>

                        {/* Divider */}
                        <View style={styles.commissionModalDivider} />

                        {/* Caller Information Section */}
                        <View style={styles.commissionModalSection}>
                            <Text style={styles.commissionModalSectionTitle}>Caller Information</Text>
                            <View style={styles.commissionModalProfileRow}>
                                {callerProfilePic ? (
                                    <Image 
                                        source={{ uri: callerProfilePic }} 
                                        style={styles.commissionModalProfileImage as ImageStyle}
                                    />
                                ) : (
                                    <View style={styles.commissionModalProfileImagePlaceholder}>
                                        <Ionicons name="person" size={24} color={colors.border} />
                                    </View>
                                )}
                                <View style={styles.commissionModalProfileInfo}>
                                    <Text style={styles.commissionModalProfileName}>{callerName}</Text>
                                    <View style={styles.commissionModalProfileDetailRow}>
                                        <Text style={styles.commissionModalProfileLabel}>Email:</Text>
                                        <Text style={styles.commissionModalProfileValue}>{callerEmail}</Text>
                                    </View>
                                    <View style={styles.commissionModalProfileDetailRow}>
                                        <Text style={styles.commissionModalProfileLabel}>Student ID:</Text>
                                        <Text style={styles.commissionModalProfileValue}>{callerStudentId}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Divider */}
                        <View style={styles.commissionModalDivider} />

                        {/* Runner Information Section */}
                        <View style={styles.commissionModalSection}>
                            <Text style={styles.commissionModalSectionTitle}>Runner Information</Text>
                            <View style={styles.commissionModalProfileRow}>
                                {runnerProfilePic ? (
                                    <Image 
                                        source={{ uri: runnerProfilePic }} 
                                        style={styles.commissionModalProfileImage as ImageStyle}
                                    />
                                ) : (
                                    <View style={styles.commissionModalProfileImagePlaceholder}>
                                        <Ionicons name="person" size={24} color={colors.border} />
                                    </View>
                                )}
                                <View style={styles.commissionModalProfileInfo}>
                                    <Text style={styles.commissionModalProfileName}>{runnerName}</Text>
                                    <View style={styles.commissionModalProfileDetailRow}>
                                        <Text style={styles.commissionModalProfileLabel}>Email:</Text>
                                        <Text style={styles.commissionModalProfileValue}>{runnerEmail}</Text>
                                    </View>
                                    <View style={styles.commissionModalProfileDetailRow}>
                                        <Text style={styles.commissionModalProfileLabel}>Student ID:</Text>
                                        <Text style={styles.commissionModalProfileValue}>{runnerStudentId}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Divider */}
                        <View style={styles.commissionModalDivider} />

                        {/* Delivery Proof Section */}
                        <View style={styles.commissionModalSection}>
                            <Text style={styles.commissionModalSectionTitle}>Delivery Proof</Text>
                            {commission.delivery_proof_url ? (
                                (() => {
                                    const urls = commission.delivery_proof_url.split(",");
                                    const names = (commission as any).delivery_proof_name
                                        ? (commission as any).delivery_proof_name.split(",")
                                        : [];

                                    return (
                                        <View style={styles.deliveryContainer}>
                                            {urls.map((rawUrl: string, index: number) => {
                                                const url = rawUrl.trim().toLowerCase();
                                                const name = names[index]?.trim() || `File ${index + 1}`;

                                                const isImage =
                                                    url.endsWith(".png") ||
                                                    url.endsWith(".jpg") ||
                                                    url.endsWith(".jpeg") ||
                                                    url.endsWith(".webp");

                                                if (isImage) {
                                                    return (
                                                        <View key={index} style={styles.imageWrapper}>
                                                            <Image
                                                                source={{ uri: rawUrl.trim() }}
                                                                style={styles.deliveryImage as ImageStyle}
                                                                resizeMode="contain"
                                                            />
                                                        </View>
                                                    );
                                                }

                                                return (
                                                    <View key={index} style={styles.fileCard}>
                                                        <Text style={styles.fileName}>{name}</Text>

                                                        <TouchableOpacity
                                                            style={styles.openButton}
                                                            onPress={() => Linking.openURL(rawUrl.trim())}
                                                        >
                                                            <Text style={styles.openButtonText}>Open File</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    );
                                })()
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

function CommissionTableRow({ commission, index, onRowPress, onIconPress }: { commission: CommissionWithUsers; index: number; onRowPress: () => void; onIconPress: () => void }) {
    const [isIconHovered, setIsIconHovered] = useState(false);
    const [isRowHovered, setIsRowHovered] = useState(false);
    const commissionType = commission.commission_type 
        ? commission.commission_type.split(',').map(t => titleCase(t.trim())).join(', ')
        : "N/A";
    const callerName = commission.caller 
        ? `${titleCase(commission.caller.first_name)} ${titleCase(commission.caller.last_name)}`.trim() 
        : "N/A";
    const callerEmail = commission.caller?.email || "N/A";
    const runnerName = commission.runner 
        ? `${titleCase(commission.runner.first_name)} ${titleCase(commission.runner.last_name)}`.trim() 
        : "Not Assigned";
    const runnerEmail = commission.runner?.email || "N/A";
    const createdAt = new Date(commission.created_at).toLocaleString();
    const dueAt = commission.due_at ? new Date(commission.due_at).toLocaleString() : "N/A";
    const totalPrice = commission.totalPrice ? `₱${commission.totalPrice.toFixed(2)}` : "N/A";

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
            <Text style={[styles.tableCellText, styles.tableCellCommissionId]} numberOfLines={1} ellipsizeMode="tail">{commission.id}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCallerName]} numberOfLines={1} ellipsizeMode="tail">{callerName}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCallerEmail]} numberOfLines={1} ellipsizeMode="tail">{callerEmail}</Text>
            <Text style={[styles.tableCellText, styles.tableCellRunnerName]} numberOfLines={1} ellipsizeMode="tail">{runnerName}</Text>
            <Text style={[styles.tableCellText, styles.tableCellRunnerEmail]} numberOfLines={1} ellipsizeMode="tail">{runnerEmail}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCategory]} numberOfLines={1} ellipsizeMode="tail">{commissionType}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCreated]} numberOfLines={1} ellipsizeMode="tail">{createdAt}</Text>
            <Text style={[styles.tableCellText, styles.tableCellDueDate]} numberOfLines={1} ellipsizeMode="tail">{dueAt}</Text>
            <Text style={[styles.tableCellText, styles.tableCellPrice]} numberOfLines={1} ellipsizeMode="tail">{totalPrice}</Text>
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
    tableCellText: {
        color: colors.text,
        fontSize: 13,
    },
    tableCellCommissionId: {
        width: 120,
        paddingRight: 24,
        fontWeight: "600",
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
    tableCellDueDate: {
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
    tableRowHovered: {
        ...(Platform.OS === 'web' ? {
            backgroundColor: "#f9f5f5",
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
        } as any : {}),
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
    commissionModalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
    },
    commissionModalCard: {
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
    commissionModalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    commissionModalTitle: {
        color: colors.text,
        fontSize: 20,
        fontWeight: "900",
    },
    commissionModalCloseButton: {
        padding: 4,
        ...(Platform.OS === 'web' ? {
            cursor: 'pointer',
        } : {}),
    },
    commissionModalContent: {
        flex: 1,
    },
    commissionModalSection: {
        padding: 24,
    },
    commissionModalSectionTitle: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 16,
    },
    commissionModalDetailRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 12,
    },
    commissionModalLabel: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
        opacity: 0.7,
    },
    commissionModalValue: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "500",
        flex: 1,
        textAlign: "right",
    },
    commissionModalDivider: {
        height: 1,
        backgroundColor: colors.border,
        marginHorizontal: 24,
    },
    commissionModalProfileRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 16,
    },
    commissionModalProfileImage: {
        width: 60,
        height: 60,
        borderRadius: 30,
        overflow: "hidden" as const,
    },
    commissionModalProfileImagePlaceholder: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
    },
    commissionModalProfileInfo: {
        flex: 1,
    },
    commissionModalProfileName: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 8,
    },
    commissionModalProfileDetailRow: {
        flexDirection: "row",
        marginBottom: 6,
        gap: 8,
    },
    commissionModalProfileLabel: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
        opacity: 0.7,
    },
    commissionModalProfileValue: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "500",
    },
    deliveryProofImage: {
        width: "100%",
        height: 300,
        borderRadius: 12,
    },
    noProofText: {
        color: "#999",
        fontStyle: "italic",
        marginTop: 10,
    },
    fileContainer: {
        padding: 16,
        backgroundColor: "#f5f5f5",
        borderRadius: 8,
        alignItems: "center",
    },
    fileTitle: {
        fontSize: 14,
        marginBottom: 10,
        fontWeight: "600",
        color: "#333",
    },
    openFileButton: {
        backgroundColor: "#8B0000",
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 6,
    },
    openFileText: {
        color: "#fff",
        fontWeight: "600",
    },
    deliveryContainer: {
        gap: 12,
        marginTop: 10,
    },
    imageWrapper: {
        borderRadius: 10,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#eee",
    },
    deliveryImage: {
        width: "100%",
        height: 250,
        backgroundColor: "#f5f5f5",
    },
    fileCard: {
        backgroundColor: "#f8f8f8",
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e5e5",
    },
    fileName: {
        fontSize: 14,
        marginBottom: 8,
        fontWeight: "600",
        color: "#333",
    },
    openButton: {
        backgroundColor: "#8B0000",
        paddingVertical: 8,
        borderRadius: 6,
        alignItems: "center",
    },
    openButtonText: {
        color: "#fff",
        fontWeight: "600",
    },
    sidebarOverlay: {
        position: 'absolute' as any,
        top: 0,
        left: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 999,
    },
});
