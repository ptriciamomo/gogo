import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState, useMemo, useRef } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
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
type StudentRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    middle_name?: string | null;
    email: string | null;
    phone?: string | null;
    role: string | null;
    course?: string | null;
    student_id_number?: string | null;
    profile_picture_url?: string | null;
    created_at: string;
};

type Transaction = {
    id: number;
    type: "commission" | "errand";
    title: string | null;
    status: string | null;
    created_at: string;
    role: "caller" | "runner";
    other_party_id?: string | null;
    other_party_name?: string | null;
    commission_type?: string | null;
    category?: string | null;
    estimated_price?: number | null; // For commissions (from invoices)
    amount_price?: number | null; // For errands
};

type SettlementTransaction = {
    id: string;
    period_start_date: string;
    period_end_date: string;
    total_earnings: number;
    total_transactions: number;
    system_fees: number;
    status: "pending" | "paid" | "cancelled";
    created_at: string;
    updated_at: string;
    paid_at: string | null;
};

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
                titleCase((user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "") ||
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

export default function AdminStudents() {
    const router = useRouter();
    const { loading, fullName } = useAuthProfile();
    const { width: screenWidth } = useWindowDimensions();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState<"all" | "buddyrunner" | "buddycaller">("all");
    const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [settlementTransactions, setSettlementTransactions] = useState<SettlementTransaction[]>([]);
    const [loadingSettlements, setLoadingSettlements] = useState(false);
    
    // Track initial mount to defer heavy logic until user interaction
    const isInitialMount = useRef(true);

    // Query limits for performance (conservative limit to reduce load time)
    const PAGE_SIZE = 200;

    // Responsive breakpoints
    const isSmall = screenWidth < 768;
    const isMedium = screenWidth >= 768 && screenWidth < 1024;
    const isLarge = screenWidth >= 1024;

    React.useEffect(() => {
        if (Platform.OS !== 'web') {
            Alert.alert('Not Available', 'Admin panel is only available on web.');
            router.replace('/login');
            return;
        }
    }, []);

    React.useEffect(() => {
        // Auto-collapse sidebar on small screens
        if (isSmall) {
            setSidebarOpen(false);
        }
    }, [isSmall]);

    React.useEffect(() => {
        const fetchStudents = async () => {
            try {
                setLoadingStudents(true);
                const { data, error } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, middle_name, email, phone, role, course, student_id_number, profile_picture_url, created_at')
                    .neq('role', 'admin')
                    .order('created_at', { ascending: false })
                    .limit(PAGE_SIZE);
                
                if (error) throw error;
                setStudents(data || []);
            } catch (error) {
                console.error('Error fetching students:', error);
                Alert.alert('Error', 'Failed to load students.');
            } finally {
                setLoadingStudents(false);
            }
        };
        fetchStudents();
    }, []);

    // Memoize filtered students to avoid re-computation on every render
    const filteredStudents = useMemo(() => {
        return students.filter((student) => {
            // Role filter
            if (roleFilter !== "all") {
                const studentRole = (student.role || "").toLowerCase();
                if (roleFilter === "buddyrunner" && studentRole !== "buddyrunner") {
                    return false;
                }
                if (roleFilter === "buddycaller" && studentRole !== "buddycaller") {
                    return false;
                }
            }
            
            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const fullName = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
                const email = (student.email || '').toLowerCase();
                const course = (student.course || '').toLowerCase();
                const studentId = (student.student_id_number || '').toLowerCase();
                return fullName.includes(query) || email.includes(query) || course.includes(query) || studentId.includes(query);
            }
            
            return true;
        });
    }, [students, roleFilter, searchQuery]);

    // Fetch transactions when exactly one student matches
    React.useEffect(() => {
        // Defer heavy logic until after initial mount (only run when user interacts)
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        
        const fetchStudentTransactions = async () => {
            // Use memoized filtered students to avoid duplicate computation
            if (filteredStudents.length !== 1) {
                setSelectedStudent(null);
                setTransactions([]);
                setSettlementTransactions([]);
                return;
            }

            const student = filteredStudents[0];
            setSelectedStudent(student);
            setLoadingTransactions(true);
            setLoadingSettlements(true);

            try {
                const studentId = student.id;
                const allTransactions: Transaction[] = [];

                // Fetch commissions where student is caller
                const { data: commissionsAsCaller, error: callerError } = await supabase
                    .from('commission')
                    .select('id, title, status, created_at, runner_id, commission_type')
                    .eq('buddycaller_id', studentId)
                    .order('created_at', { ascending: false });

                // Fetch commissions where student is runner
                const { data: commissionsAsRunner, error: runnerError } = await supabase
                    .from('commission')
                    .select('id, title, status, created_at, buddycaller_id, commission_type')
                    .eq('runner_id', studentId)
                    .order('created_at', { ascending: false });

                // Collect all commission IDs to fetch invoices
                const allCommissionIds: number[] = [];
                if (commissionsAsCaller) {
                    allCommissionIds.push(...commissionsAsCaller.map(c => c.id));
                }
                if (commissionsAsRunner) {
                    allCommissionIds.push(...commissionsAsRunner.map(c => c.id));
                }

                // Fetch invoices for all commissions
                const invoicesMap = new Map<number, number>();
                if (allCommissionIds.length > 0) {
                    try {
                        // Try querying with commission IDs as numbers first
                        let { data: allInvoicesData, error: allInvoicesError } = await supabase
                            .from('invoices')
                            .select('id, commission_id, amount, status, created_at, accepted_at')
                            .in('commission_id', allCommissionIds)
                            .order('created_at', { ascending: false });

                        if (allInvoicesError || !allInvoicesData || allInvoicesData.length === 0) {
                            // Try querying with commission IDs as strings
                            const commissionIdsAsStrings = allCommissionIds.map(id => String(id));
                            const { data: invoicesAsStrings, error: errorAsStrings } = await supabase
                                .from('invoices')
                                .select('id, commission_id, amount, status, created_at, accepted_at')
                                .in('commission_id', commissionIdsAsStrings)
                                .order('created_at', { ascending: false });

                            if (!errorAsStrings && invoicesAsStrings && invoicesAsStrings.length > 0) {
                                allInvoicesData = invoicesAsStrings;
                                allInvoicesError = null;
                            }
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
                    } catch (invoiceError) {
                        console.error('Error fetching invoices:', invoiceError);
                    }
                }

                if (!callerError && commissionsAsCaller) {
                    // Fetch runner names
                    const runnerIds = commissionsAsCaller.map(c => c.runner_id).filter(Boolean) as string[];
                    let runnerMap: Record<string, string> = {};
                    if (runnerIds.length > 0) {
                        const { data: runners } = await supabase
                            .from('users')
                            .select('id, first_name, last_name')
                            .in('id', runnerIds);
                        
                        if (runners) {
                            runnerMap = runners.reduce((acc, r) => {
                                const name = `${titleCase(r.first_name)} ${titleCase(r.last_name)}`.trim();
                                acc[r.id] = name || 'Unknown';
                                return acc;
                            }, {} as Record<string, string>);
                        }
                    }

                    commissionsAsCaller.forEach(comm => {
                        const totalPrice = invoicesMap.get(comm.id) || null;
                        allTransactions.push({
                            id: comm.id,
                            type: 'commission',
                            title: comm.title,
                            status: comm.status,
                            created_at: comm.created_at,
                            role: 'caller',
                            other_party_id: comm.runner_id || undefined,
                            other_party_name: comm.runner_id ? runnerMap[comm.runner_id] : undefined,
                            commission_type: comm.commission_type || undefined,
                            estimated_price: totalPrice || undefined,
                        });
                    });
                }

                if (!runnerError && commissionsAsRunner) {
                    // Fetch caller names
                    const callerIds = commissionsAsRunner.map(c => c.buddycaller_id).filter(Boolean) as string[];
                    let callerMap: Record<string, string> = {};
                    if (callerIds.length > 0) {
                        const { data: callers } = await supabase
                            .from('users')
                            .select('id, first_name, last_name')
                            .in('id', callerIds);
                        
                        if (callers) {
                            callerMap = callers.reduce((acc, r) => {
                                const name = `${titleCase(r.first_name)} ${titleCase(r.last_name)}`.trim();
                                acc[r.id] = name || 'Unknown';
                                return acc;
                            }, {} as Record<string, string>);
                        }
                    }

                    commissionsAsRunner.forEach(comm => {
                        const totalPrice = invoicesMap.get(comm.id) || null;
                        allTransactions.push({
                            id: comm.id,
                            type: 'commission',
                            title: comm.title,
                            status: comm.status,
                            created_at: comm.created_at,
                            role: 'runner',
                            other_party_id: comm.buddycaller_id || undefined,
                            other_party_name: comm.buddycaller_id ? callerMap[comm.buddycaller_id] : undefined,
                            commission_type: comm.commission_type || undefined,
                            estimated_price: totalPrice || undefined,
                        });
                    });
                }

                // Fetch errands where student is caller
                const { data: errandsAsCaller, error: errandCallerError } = await supabase
                    .from('errand')
                    .select('id, title, status, created_at, runner_id, category, amount_price')
                    .eq('buddycaller_id', studentId)
                    .order('created_at', { ascending: false });

                if (!errandCallerError && errandsAsCaller) {
                    // Fetch runner names
                    const runnerIds = errandsAsCaller.map(e => e.runner_id).filter(Boolean) as string[];
                    let runnerMap: Record<string, string> = {};
                    if (runnerIds.length > 0) {
                        const { data: runners } = await supabase
                            .from('users')
                            .select('id, first_name, last_name')
                            .in('id', runnerIds);
                        
                        if (runners) {
                            runnerMap = runners.reduce((acc, r) => {
                                const name = `${titleCase(r.first_name)} ${titleCase(r.last_name)}`.trim();
                                acc[r.id] = name || 'Unknown';
                                return acc;
                            }, {} as Record<string, string>);
                        }
                    }

                    errandsAsCaller.forEach(errand => {
                        allTransactions.push({
                            id: errand.id,
                            type: 'errand',
                            title: errand.title,
                            status: errand.status,
                            created_at: errand.created_at,
                            role: 'caller',
                            other_party_id: errand.runner_id || undefined,
                            other_party_name: errand.runner_id ? runnerMap[errand.runner_id] : undefined,
                            category: errand.category || undefined,
                            amount_price: errand.amount_price || undefined,
                        });
                    });
                }

                // Fetch errands where student is runner
                const { data: errandsAsRunner, error: errandRunnerError } = await supabase
                    .from('errand')
                    .select('id, title, status, created_at, buddycaller_id, category, amount_price')
                    .eq('runner_id', studentId)
                    .order('created_at', { ascending: false });

                if (!errandRunnerError && errandsAsRunner) {
                    // Fetch caller names
                    const callerIds = errandsAsRunner.map(e => e.buddycaller_id).filter(Boolean) as string[];
                    let callerMap: Record<string, string> = {};
                    if (callerIds.length > 0) {
                        const { data: callers } = await supabase
                            .from('users')
                            .select('id, first_name, last_name')
                            .in('id', callerIds);
                        
                        if (callers) {
                            callerMap = callers.reduce((acc, r) => {
                                const name = `${titleCase(r.first_name)} ${titleCase(r.last_name)}`.trim();
                                acc[r.id] = name || 'Unknown';
                                return acc;
                            }, {} as Record<string, string>);
                        }
                    }

                    errandsAsRunner.forEach(errand => {
                        allTransactions.push({
                            id: errand.id,
                            type: 'errand',
                            title: errand.title,
                            status: errand.status,
                            created_at: errand.created_at,
                            role: 'runner',
                            other_party_id: errand.buddycaller_id || undefined,
                            other_party_name: errand.buddycaller_id ? callerMap[errand.buddycaller_id] : undefined,
                            category: errand.category || undefined,
                            amount_price: errand.amount_price || undefined,
                        });
                    });
                }

                // Sort all transactions by created_at descending
                allTransactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setTransactions(allTransactions);
            } catch (error) {
                console.error('Error fetching transactions:', error);
                Alert.alert('Error', 'Failed to load student transactions.');
            } finally {
                setLoadingTransactions(false);
            }

            // Fetch settlement transactions for this student (only for BuddyRunners)
            const studentRole = (student.role || "").toLowerCase();
            if (studentRole === "buddyrunner") {
                try {
                    const { data: settlements, error: settlementsError } = await supabase
                        .from('settlements')
                        .select('id, period_start_date, period_end_date, total_earnings, total_transactions, system_fees, status, created_at, updated_at, paid_at')
                        .eq('user_id', student.id)
                        .order('period_start_date', { ascending: false });

                    if (settlementsError) {
                        console.error('Error fetching settlements:', settlementsError);
                    } else {
                        const settlementData: SettlementTransaction[] = (settlements || []).map(s => ({
                            id: s.id,
                            period_start_date: s.period_start_date,
                            period_end_date: s.period_end_date,
                            total_earnings: parseFloat(s.total_earnings?.toString() || '0'),
                            total_transactions: s.total_transactions || 0,
                            system_fees: parseFloat(s.system_fees?.toString() || '0'),
                            status: (s.status || 'pending') as "pending" | "paid" | "cancelled",
                            created_at: s.created_at || new Date().toISOString(),
                            updated_at: s.updated_at || new Date().toISOString(),
                            paid_at: s.paid_at || null,
                        }));
                        setSettlementTransactions(settlementData);
                    }
                } catch (error) {
                    console.error('Error fetching settlement transactions:', error);
                } finally {
                    setLoadingSettlements(false);
                }
            } else {
                // Not a BuddyRunner - clear settlement transactions and set loading to false
                setSettlementTransactions([]);
                setLoadingSettlements(false);
            }
        };

        fetchStudentTransactions();
    }, [filteredStudents]);

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
                <Sidebar
                    open={sidebarOpen}
                    onToggle={() => setSidebarOpen((v) => !v)}
                    onLogout={() => setConfirmLogout(true)}
                    userName={fullName}
                    activeRoute="students"
                />
                
                <View style={styles.mainArea}>
                    <View style={styles.topBar}>
                        <Text style={styles.welcome}>List of Students</Text>
                    </View>

                    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
                        <View style={styles.content}>
                            <View style={styles.searchContainer}>
                                <Ionicons name="search-outline" size={20} color={colors.text} style={{ opacity: 0.6 }} />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search by name, email, course, or student ID..."
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

                            <View style={styles.filterContainer}>
                                <TouchableOpacity
                                    style={[
                                        styles.filterButton,
                                        roleFilter === "all" && styles.filterButtonActive
                                    ]}
                                    onPress={() => setRoleFilter("all")}
                                >
                                    <Text style={[
                                        styles.filterButtonText,
                                        roleFilter === "all" && styles.filterButtonTextActive
                                    ]}>
                                        All
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.filterButton,
                                        roleFilter === "buddyrunner" && styles.filterButtonActive
                                    ]}
                                    onPress={() => setRoleFilter("buddyrunner")}
                                >
                                    <Text style={[
                                        styles.filterButtonText,
                                        roleFilter === "buddyrunner" && styles.filterButtonTextActive
                                    ]}>
                                        BuddyRunners
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.filterButton,
                                        roleFilter === "buddycaller" && styles.filterButtonActive
                                    ]}
                                    onPress={() => setRoleFilter("buddycaller")}
                                >
                                    <Text style={[
                                        styles.filterButtonText,
                                        roleFilter === "buddycaller" && styles.filterButtonTextActive
                                    ]}>
                                        BuddyCallers
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {loadingStudents ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <ActivityIndicator size="large" color={colors.maroon} />
                                </View>
                            ) : filteredStudents.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Ionicons name="people-outline" size={48} color={colors.border} />
                                    <Text style={styles.emptyStateText}>
                                        {searchQuery ? 'No students found matching your search.' : 'No students found.'}
                                    </Text>
                                </View>
                            ) : filteredStudents.length === 1 && selectedStudent ? (
                                <>
                                    {/* Student Details Section */}
                                    <View style={styles.studentDetailsCard}>
                                        <View style={styles.studentDetailsHeader}>
                                            {selectedStudent.profile_picture_url ? (
                                                <Image 
                                                    source={{ uri: selectedStudent.profile_picture_url }} 
                                                    style={styles.profilePicture}
                                                />
                                            ) : (
                                                <View style={styles.profilePicturePlaceholder}>
                                                    <Ionicons name="person" size={40} color={colors.maroon} />
                                                </View>
                                            )}
                                            <View style={styles.studentDetailsHeaderText}>
                                                <Text style={styles.studentName}>
                                                    {(() => {
                                                        const middleName = selectedStudent.middle_name ? selectedStudent.middle_name.trim().toLowerCase() : "";
                                                        const shouldExcludeMiddleName = middleName === "n/a" || middleName === "na" || middleName === "none";
                                                        const nameParts = [
                                                            titleCase(selectedStudent.first_name),
                                                            !shouldExcludeMiddleName ? titleCase(selectedStudent.middle_name) : null,
                                                            titleCase(selectedStudent.last_name)
                                                        ].filter(Boolean);
                                                        return nameParts.join(" ") || "N/A";
                                                    })()}
                                                </Text>
                                                <Text style={styles.studentRole}>{titleCase(selectedStudent.role || "N/A")}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.studentDetailsGrid}>
                                            <View style={styles.studentDetailItem}>
                                                <Text style={styles.studentDetailLabel}>Student ID</Text>
                                                <Text style={styles.studentDetailValue}>{selectedStudent.student_id_number || "N/A"}</Text>
                                            </View>
                                            <View style={[styles.studentDetailItem, styles.emailDetailItem]}>
                                                <Text style={styles.studentDetailLabel}>Email</Text>
                                                <Text style={styles.studentDetailValue}>{selectedStudent.email || "N/A"}</Text>
                                            </View>
                                            <View style={styles.studentDetailItem}>
                                                <Text style={styles.studentDetailLabel}>Phone</Text>
                                                <Text style={styles.studentDetailValue}>{selectedStudent.phone || "N/A"}</Text>
                                            </View>
                                            <View style={styles.studentDetailItem}>
                                                <Text style={styles.studentDetailLabel}>Program</Text>
                                                <Text style={styles.studentDetailValue}>{selectedStudent.course || "N/A"}</Text>
                                            </View>
                                            <View style={styles.studentDetailItem}>
                                                <Text style={styles.studentDetailLabel}>Joined</Text>
                                                <Text style={styles.studentDetailValue}>{new Date(selectedStudent.created_at).toLocaleDateString()}</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Transactions Section */}
                                    <Text style={styles.sectionTitle}>Transactions</Text>
                                    {loadingTransactions ? (
                                        <View style={{ padding: 40, alignItems: 'center' }}>
                                            <ActivityIndicator size="large" color={colors.maroon} />
                                        </View>
                                    ) : transactions.length === 0 ? (
                                        <View style={styles.emptyState}>
                                            <Ionicons name="receipt-outline" size={48} color={colors.border} />
                                            <Text style={styles.emptyStateText}>No transactions found for this student.</Text>
                                        </View>
                                    ) : (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                            <View style={[styles.tableContainer, { minWidth: 1100 }]}>
                                                <View style={styles.tableHeader}>
                                                    <Text style={[styles.tableHeaderText, styles.transactionCellId]}>ID</Text>
                                                    <Text style={[styles.tableHeaderText, styles.transactionCellType]}>Type</Text>
                                                    <Text style={[styles.tableHeaderText, styles.transactionCellTitle]}>Title</Text>
                                                    <Text style={[styles.tableHeaderText, styles.transactionCellRole]}>Role</Text>
                                                    <Text style={[styles.tableHeaderText, styles.transactionCellOtherParty]}>
                                                        {transactions.length > 0 ? (transactions[0].role === 'caller' ? 'BuddyRunner' : 'BuddyCaller') : 'Other Party'}
                                                    </Text>
                                                    <Text style={[styles.tableHeaderText, styles.transactionCellStatus]}>Status</Text>
                                                    <Text style={[styles.tableHeaderText, styles.transactionCellCategory]}>Category/Type</Text>
                                                    <Text style={[styles.tableHeaderText, styles.transactionCellPrice]}>Total Price</Text>
                                                    <Text style={[styles.tableHeaderText, styles.transactionCellDate]}>Date</Text>
                                                </View>
                                                {transactions.map((transaction, index) => (
                                                    <TransactionTableRow key={`${transaction.type}-${transaction.id}`} transaction={transaction} index={index} />
                                                ))}
                                            </View>
                                        </ScrollView>
                                    )}

                                    {/* Settlement Transactions Section - Only for BuddyRunners */}
                                    {selectedStudent && (selectedStudent.role || "").toLowerCase() === "buddyrunner" && (
                                        <>
                                            <Text style={styles.sectionTitle}>Settlement Transactions</Text>
                                            {loadingSettlements ? (
                                                <View style={{ padding: 40, alignItems: 'center' }}>
                                                    <ActivityIndicator size="large" color={colors.maroon} />
                                                </View>
                                            ) : settlementTransactions.length === 0 ? (
                                                <View style={styles.emptyState}>
                                                    <Ionicons name="cash-outline" size={48} color={colors.border} />
                                                    <Text style={styles.emptyStateText}>No settlement transactions found for this student.</Text>
                                                </View>
                                            ) : (
                                                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                                    <View style={[styles.tableContainer, { minWidth: 1000 }]}>
                                                        <View style={styles.tableHeader}>
                                                            <Text style={[styles.tableHeaderText, styles.settlementCellDate]}>Date</Text>
                                                            <Text style={[styles.tableHeaderText, styles.settlementCellTransactions]}>Transactions</Text>
                                                            <Text style={[styles.tableHeaderText, styles.settlementCellEarnings]}>Total Earnings</Text>
                                                            <Text style={[styles.tableHeaderText, styles.settlementCellFees]}>System Fees</Text>
                                                            <Text style={[styles.tableHeaderText, styles.settlementCellStatus]}>Status</Text>
                                                            <Text style={[styles.tableHeaderText, styles.settlementCellPaidAt]}>Paid At</Text>
                                                        </View>
                                                        {settlementTransactions.map((settlement, index) => (
                                                            <SettlementTableRow key={settlement.id} settlement={settlement} index={index} />
                                                        ))}
                                                    </View>
                                                </ScrollView>
                                            )}
                                        </>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Text style={styles.resultsCount}>
                                        {filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'}
                                        {searchQuery && ` found`}
                                    </Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                        <View style={styles.tableContainer}>
                                            <View style={styles.tableHeader}>
                                                <Text style={[styles.tableHeaderText, styles.tableCellId]}>Student ID</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellName]}>Name</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellRole]}>Role</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellProgram]}>Program</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellEmail]}>Email</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellPhone]}>Phone</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellJoined]}>Created At</Text>
                                            </View>
                                            <FlatList
                                                data={filteredStudents}
                                                renderItem={({ item: student, index }) => (
                                                    <StudentTableRow student={student} index={index} />
                                                )}
                                                keyExtractor={(student) => student.id}
                                                initialNumToRender={15}
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
        </SafeAreaView>
    );
}

function StudentTableRow({ student, index }: { student: StudentRow; index: number }) {
    // Filter out middle names that are "N/A", "n/a", "na", "NA", "None", or "none"
    const middleName = student.middle_name ? student.middle_name.trim().toLowerCase() : "";
    const shouldExcludeMiddleName = middleName === "n/a" || middleName === "na" || middleName === "none";
    
    const nameParts = [
        titleCase(student.first_name),
        !shouldExcludeMiddleName ? titleCase(student.middle_name) : null,
        titleCase(student.last_name)
    ].filter(Boolean);
    
    const fullName = nameParts.join(" ") || "N/A";

    const role = student.role ? titleCase(student.role) : "N/A";
    const course = student.course || "N/A";
    const email = student.email || "N/A";
    const phone = student.phone || "N/A";
    const studentId = student.student_id_number || "N/A";
    const joinedDate = new Date(student.created_at).toLocaleDateString();

    const rowStyle = index % 2 === 0 ? styles.tableRow : styles.tableRowAlternate;

    return (
        <View style={rowStyle}>
            <Text style={[styles.tableCellText, styles.tableCellId]} numberOfLines={1} ellipsizeMode="tail">{studentId}</Text>
            <Text style={[styles.tableCellText, styles.tableCellName]} numberOfLines={1} ellipsizeMode="tail">{fullName}</Text>
            <Text style={[styles.tableCellText, styles.tableCellRole]} numberOfLines={1} ellipsizeMode="tail">{role}</Text>
            <Text style={[styles.tableCellText, styles.tableCellProgram]} numberOfLines={1} ellipsizeMode="tail">{course}</Text>
            <Text style={[styles.tableCellText, styles.tableCellEmail]} numberOfLines={1} ellipsizeMode="tail">{email}</Text>
            <Text style={[styles.tableCellText, styles.tableCellPhone]} numberOfLines={1} ellipsizeMode="tail">{phone}</Text>
            <Text style={[styles.tableCellText, styles.tableCellJoined]} numberOfLines={1} ellipsizeMode="tail">{joinedDate}</Text>
        </View>
    );
}

function formatStatus(status: string | null): string {
    if (!status) return "N/A";
    const statusMap: Record<string, string> = {
        "pending": "Pending",
        "in_progress": "In Progress",
        "completed": "Completed",
        "cancelled": "Cancelled",
        "delivered": "Delivered",
        "accepted": "Accepted",
    };
    return statusMap[status.toLowerCase()] || titleCase(status);
}

function TransactionTableRow({ transaction, index }: { transaction: Transaction; index: number }) {
    const status = formatStatus(transaction.status);
    const transactionType = titleCase(transaction.type);
    const role = titleCase(transaction.role);
    const otherParty = transaction.other_party_name || "Not Assigned";
    const category = transaction.category || transaction.commission_type || "N/A";
    // Use amount_price for errands, estimated_price for commissions
    const price = transaction.amount_price 
        ? `₱${transaction.amount_price.toFixed(2)}` 
        : (transaction.estimated_price ? `₱${transaction.estimated_price.toFixed(2)}` : "N/A");
    const date = new Date(transaction.created_at).toLocaleString();

    const rowStyle = index % 2 === 0 ? styles.tableRow : styles.tableRowAlternate;

    return (
        <View style={rowStyle}>
            <Text style={[styles.tableCellText, styles.transactionCellId]} numberOfLines={1} ellipsizeMode="tail">{transaction.id}</Text>
            <Text style={[styles.tableCellText, styles.transactionCellType]} numberOfLines={1} ellipsizeMode="tail">{transactionType}</Text>
            <Text style={[styles.tableCellText, styles.transactionCellTitle]} numberOfLines={1} ellipsizeMode="tail">{transaction.title || "N/A"}</Text>
            <Text style={[styles.tableCellText, styles.transactionCellRole]} numberOfLines={1} ellipsizeMode="tail">{role}</Text>
            <Text style={[styles.tableCellText, styles.transactionCellOtherParty]} numberOfLines={1} ellipsizeMode="tail">{otherParty}</Text>
            <Text style={[styles.tableCellText, styles.transactionCellStatus]} numberOfLines={1} ellipsizeMode="tail">{status}</Text>
            <Text style={[styles.tableCellText, styles.transactionCellCategory]} numberOfLines={1} ellipsizeMode="tail">{category}</Text>
            <Text style={[styles.tableCellText, styles.transactionCellPrice]} numberOfLines={1} ellipsizeMode="tail">{price}</Text>
            <Text style={[styles.tableCellText, styles.transactionCellDate]} numberOfLines={1} ellipsizeMode="tail">{date}</Text>
        </View>
    );
}

function SettlementTableRow({ settlement, index }: { settlement: SettlementTransaction; index: number }) {
    const formatDateRange = (startDate: string, endDate: string) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const formatDate = (date: Date) => {
            return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
        };
        return `${formatDate(start)} - ${formatDate(end)}`;
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'paid': return '#10B981';
            case 'pending': return '#F59E0B';
            case 'cancelled': return '#EF4444';
            default: return colors.text;
        }
    };

    const status = titleCase(settlement.status);
    const dateRange = formatDateRange(settlement.period_start_date, settlement.period_end_date);
    const paidAt = settlement.paid_at ? new Date(settlement.paid_at).toLocaleString() : "N/A";

    const rowStyle = index % 2 === 0 ? styles.tableRow : styles.tableRowAlternate;

    return (
        <View style={rowStyle}>
            <Text style={[styles.tableCellText, styles.settlementCellDate]} numberOfLines={1} ellipsizeMode="tail">{dateRange}</Text>
            <Text style={[styles.tableCellText, styles.settlementCellTransactions]} numberOfLines={1} ellipsizeMode="tail">{settlement.total_transactions}</Text>
            <Text style={[styles.tableCellText, styles.settlementCellEarnings]} numberOfLines={1} ellipsizeMode="tail">₱{settlement.total_earnings.toFixed(2)}</Text>
            <Text style={[styles.tableCellText, styles.settlementCellFees]} numberOfLines={1} ellipsizeMode="tail">₱{settlement.system_fees.toFixed(2)}</Text>
            <Text style={[styles.tableCellText, styles.settlementCellStatus, { color: getStatusColor(settlement.status) }]} numberOfLines={1} ellipsizeMode="tail">{status}</Text>
            <Text style={[styles.tableCellText, styles.settlementCellPaidAt]} numberOfLines={1} ellipsizeMode="tail">{paidAt}</Text>
        </View>
    );
}

function Sidebar({
    open,
    onToggle,
    onLogout,
    userName,
    activeRoute,
}: {
    open: boolean;
    onToggle: () => void;
    onLogout: () => void;
    userName: string;
    activeRoute?: string;
}) {
    const router = useRouter();
    return (
        <View style={[styles.sidebar, { width: open ? 260 : 74 }]}>
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
    filterContainer: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 24,
    },
    filterButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "#fff",
    },
    filterButtonActive: {
        backgroundColor: colors.maroon,
        borderColor: colors.maroon,
    },
    filterButtonText: {
        color: colors.text,
        fontSize: 13,
        fontWeight: "600",
    },
    filterButtonTextActive: {
        color: "#fff",
        fontWeight: "700",
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
        minWidth: 1320,
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
    tableCellId: {
        width: 120,
        paddingRight: 24,
        fontWeight: "600",
    },
    tableCellName: {
        width: 200,
        paddingRight: 24,
        fontWeight: "600",
    },
    tableCellRole: {
        width: 120,
        paddingRight: 24,
    },
    tableCellProgram: {
        width: 240,
        paddingRight: 24,
    },
    tableCellEmail: {
        width: 260,
        paddingRight: 24,
    },
    tableCellPhone: {
        width: 140,
        paddingRight: 24,
    },
    tableCellJoined: {
        width: 200,
        paddingRight: 0,
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
    studentDetailsCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 24,
        marginBottom: 24,
    },
    studentDetailsHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 24,
        gap: 16,
    },
    profilePicture: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 2,
        borderColor: colors.border,
    },
    profilePicturePlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: colors.faint,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    studentDetailsHeaderText: {
        flex: 1,
    },
    studentName: {
        color: colors.text,
        fontSize: 24,
        fontWeight: "800",
        marginBottom: 4,
    },
    studentRole: {
        color: colors.maroon,
        fontSize: 16,
        fontWeight: "600",
    },
    studentDetailsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 24,
    },
    studentDetailItem: {
        minWidth: 200,
    },
    emailDetailItem: {
        marginLeft: -12,
    },
    studentDetailLabel: {
        color: colors.text,
        fontSize: 12,
        fontWeight: "600",
        opacity: 0.7,
        marginBottom: 4,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    studentDetailValue: {
        color: colors.text,
        fontSize: 16,
        fontWeight: "500",
    },
    sectionTitle: {
        color: colors.text,
        fontSize: 20,
        fontWeight: "800",
        marginBottom: 16,
        marginTop: 8,
    },
    transactionCellId: {
        width: 70,
        paddingRight: 14,
    },
    transactionCellType: {
        width: 100,
        paddingRight: 14,
    },
    transactionCellTitle: {
        width: 90,
        paddingRight: 14,
    },
    transactionCellRole: {
        width: 85,
        paddingRight: 14,
    },
    transactionCellOtherParty: {
        width: 180,
        paddingRight: 14,
    },
    transactionCellStatus: {
        width: 110,
        paddingRight: 14,
    },
    transactionCellCategory: {
        width: 160,
        paddingRight: 14,
    },
    transactionCellPrice: {
        width: 90,
        paddingRight: 14,
    },
    transactionCellDate: {
        width: 180,
        paddingRight: 0,
    },
    settlementCellDate: {
        width: 200,
        paddingRight: 14,
    },
    settlementCellTransactions: {
        width: 120,
        paddingRight: 14,
    },
    settlementCellEarnings: {
        width: 140,
        paddingRight: 14,
    },
    settlementCellFees: {
        width: 120,
        paddingRight: 14,
    },
    settlementCellNet: {
        width: 120,
        paddingRight: 14,
    },
    settlementCellStatus: {
        width: 100,
        paddingRight: 14,
    },
    settlementCellPaidAt: {
        width: 180,
        paddingRight: 0,
    },
});
