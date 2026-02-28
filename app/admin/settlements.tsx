import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState, useMemo } from "react";
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

/* ================= HELPER FUNCTIONS ================= */
// Food and drink items for Food Delivery category
const FOOD_ITEMS = {
    "Canteen": [
        { name: "Toppings", price: "₱55" },
        { name: "Biscuits", price: "₱10" },
        { name: "Pansit Canton", price: "₱30" },
        { name: "Waffles", price: "₱35" },
        { name: "Pastel", price: "₱20" },
        { name: "Rice Bowl", price: "₱60 " },
    ],
    "Drinks": [
        { name: "Real Leaf", price: "₱30" },
        { name: "Water (500ml)", price: "₱25" },
        { name: "Minute Maid", price: "₱30" },
        { name: "Kopiko Lucky Day", price: "₱30" },
    ]
} as const;

const SCHOOL_MATERIALS = [
    { name: "Yellowpad", price: "₱10" },
    { name: "Ballpen", price: "₱10" },
] as const;

// Helper function to parse price from FOOD_ITEMS or School Materials
function parseItemPrice(itemName: string): number {
    // Food Delivery items
    for (const category of Object.values(FOOD_ITEMS)) {
        const item = category.find(i => i.name === itemName);
        if (item) {
            const match = item.price.match(/[\d.]+/);
            if (match) return parseFloat(match[0]);
        }
    }
    // School Materials
    const schoolItem = SCHOOL_MATERIALS.find((i) => i.name === itemName);
    if (schoolItem) {
        const match = schoolItem.price.match(/[\d.]+/);
        if (match) return parseFloat(match[0]);
    }
    return 0;
}

// Calculate actual System Fee for Errand
function calculateErrandSystemFee(errand: any): number {
    try {
        const items = Array.isArray(errand.items) ? errand.items : [];
        const category = errand.category || "";
        
        // Calculate subtotal from items
        let subtotal = 0;
        items.forEach((item: any) => {
            if (item.name && item.qty) {
                // Use item.price if available (e.g., Printing items), otherwise use parseItemPrice
                let itemPrice = 0;
                if (item.price !== undefined && item.price !== null) {
                    itemPrice = parseFloat(String(item.price)) || 0;
                } else {
                    itemPrice = parseItemPrice(item.name);
                }
                const quantity = parseFloat(String(item.qty)) || 0;
                subtotal += itemPrice * quantity;
            }
        });
        
        // Calculate total quantity
        const totalQuantity = items.reduce((sum: number, item: any) => {
            if (item.name && item.name.trim() !== "") {
                const qty = parseFloat(String(item.qty)) || 0;
                return sum + qty;
            }
            return sum;
        }, 0);
        
        // Calculate delivery fee based on category
        let baseFlatFee = 0;
        let addOnPerExtra = 0;
        
        if (category === "Deliver Items") {
            baseFlatFee = 20;
            addOnPerExtra = 5;
        } else if (category === "Food Delivery") {
            baseFlatFee = 15;
            addOnPerExtra = 5;
        } else if (category === "School Materials") {
            baseFlatFee = 10;
            addOnPerExtra = 5;
        } else if (category === "Printing") {
            baseFlatFee = 5;
            addOnPerExtra = 2;
        }
        
        const extraItems = Math.max(totalQuantity - 1, 0);
        const deliveryFee = baseFlatFee + (addOnPerExtra * extraItems);
        
        // Calculate System Fee: ₱5 + 12% × (Subtotal + Delivery Fee)
        const serviceFeeBase = 5;
        const baseAmount = subtotal + deliveryFee;
        const vatAmount = baseAmount * 0.12;
        const systemFee = serviceFeeBase + vatAmount;
        
        return systemFee;
    } catch (error) {
        console.warn('Error calculating errand system fee:', error);
        return 0;
    }
}

// Calculate actual System Fee for Commission
function calculateCommissionSystemFee(invoiceTotal: number): number {
    try {
        // Reverse calculate subtotal from total
        // Total = Subtotal + System Fee
        // System Fee = 5 + (Subtotal × 0.12)
        // Total = Subtotal + 5 + (Subtotal × 0.12) = Subtotal × 1.12 + 5
        // Subtotal = (Total - 5) / 1.12
        const subtotal = invoiceTotal > 5 ? (invoiceTotal - 5) / 1.12 : 0;
        
        if (subtotal <= 0) {
            return 0;
        }
        
        // Calculate System Fee: ₱5 + 12% × Subtotal
        const baseFee = 5;
        const vatAmount = subtotal * 0.12;
        const systemFee = baseFee + vatAmount;
        
        return systemFee;
    } catch (error) {
        console.warn('Error calculating commission system fee:', error);
        return 0;
    }
}

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    faint: "#F7F1F0",
};

/* ===================== TYPES ===================== */
type Settlement = {
    id: string;
    user_id: string;
    period_start_date: string;
    period_end_date: string;
    total_earnings: number;
    total_transactions: number;
    system_fees: number;
    status: "pending" | "paid" | "overdue";
    created_at: string;
    updated_at: string;
    paid_at: string | null;
    commission_ids?: string[];
    errand_ids?: string[];
    user?: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        student_id_number: string | null;
        role: string | null;
    };
};

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

            const f = (row?.first_name || "").trim();
            const l = (row?.last_name || "").trim();
            setFullName((f && l ? `${f} ${l}` : "").trim() || "Admin");
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

export default function AdminSettlements() {
    const router = useRouter();
    const { loading, fullName } = useAuthProfile();
    const { width: screenWidth } = useWindowDimensions();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [processingSettlementId, setProcessingSettlementId] = useState<string | null>(null);
    const [loadingSettlements, setLoadingSettlements] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"pending" | "paid" | "overdue">("pending");
    const [currentPage, setCurrentPage] = useState(0);

    // Query limits for performance
    const QUERY_LIMIT = 200; // Limit for users query (reasonable scope)
    const PAGE_SIZE = 50; // UI pagination page size

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
        const fetchSettlements = async () => {
            try {
                setLoadingSettlements(true);
                
                // Run daily check to lock/unlock accounts based on overdue settlements
                try {
                    const { error: dailyCheckError } = await supabase.rpc('daily_settlement_account_check');
                    if (dailyCheckError) {
                        console.warn('⚠️ Error running daily settlement account check (non-critical):', dailyCheckError);
                    } else {
                        console.log('✅ Daily settlement account check completed');
                    }
                } catch (checkErr) {
                    console.warn('⚠️ Exception running daily settlement account check (non-critical):', checkErr);
                }
                
                // Update overdue settlements using database function (single source of truth)
                try {
                    const { error: updateOverdueError } = await supabase.rpc('update_overdue_settlements');
                    if (updateOverdueError) {
                        console.warn('⚠️ Error updating overdue settlements (non-critical):', updateOverdueError);
                    } else {
                        console.log('✅ Overdue settlements updated by database function');
                    }
                } catch (updateErr) {
                    console.warn('⚠️ Exception updating overdue settlements (non-critical):', updateErr);
                }
                
                // Fetch all users who are runners (they earn money)
                const { data: allUsers, error: usersError } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, email, student_id_number, role')
                    .order('created_at', { ascending: false })
                    .limit(QUERY_LIMIT);
                
                if (usersError) throw usersError;
                
                // Filter for BuddyRunners (case-insensitive)
                const runners = (allUsers || []).filter(user => 
                    user.role && user.role.toLowerCase() === 'buddyrunner'
                );

                if (runners.length === 0) {
                    setSettlements([]);
                    return;
                }

                const runnerIds = runners.map(r => r.id);

                // Fetch all completed commissions with invoices (no limit - needed for settlement computation)
                const { data: commissions, error: commissionsError } = await supabase
                    .from('commission')
                    .select('id, runner_id, created_at, status')
                    .in('runner_id', runnerIds)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false });
                
                if (commissionsError) throw commissionsError;

                // Fetch all invoices for these commissions
                const commissionIds = (commissions || []).map(c => c.id);
                const invoicesMap = new Map<number, number>(); // commission_id -> amount

                if (commissionIds.length > 0) {
                    // Fetch all invoices (no limit - needed for settlement computation)
                    const { data: allInvoices, error: invoicesError } = await supabase
                        .from('invoices')
                        .select('id, commission_id, amount, status, created_at, accepted_at')
                        .in('commission_id', commissionIds)
                        .order('created_at', { ascending: false });

                    if (invoicesError) throw invoicesError;

                    // Group invoices by commission_id, prefer accepted, else latest
                    const invoicesByCommission = new Map<number, Array<{ id: string; amount: number; status: string; created_at: string; accepted_at: string | null }>>();
                    
                    (allInvoices || []).forEach(inv => {
                        const commId = parseInt(inv.commission_id.toString());
                        if (!invoicesByCommission.has(commId)) {
                            invoicesByCommission.set(commId, []);
                        }
                        invoicesByCommission.get(commId)!.push(inv);
                    });

                    invoicesByCommission.forEach((invoices, commissionId) => {
                        const acceptedInvoice = invoices.find(inv => 
                            (inv.accepted_at !== null && inv.accepted_at !== undefined) || inv.status === 'accepted'
                        );
                        if (acceptedInvoice) {
                            invoicesMap.set(commissionId, acceptedInvoice.amount);
                        } else if (invoices.length > 0) {
                            invoicesMap.set(commissionId, invoices[0].amount);
                        }
                    });
                }

                // Fetch all completed errands (no limit - needed for settlement computation)
                const { data: errands, error: errandsError } = await supabase
                    .from('errand')
                    .select('id, runner_id, created_at, status, amount_price, items, category')
                    .in('runner_id', runnerIds)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false });
                
                if (errandsError) throw errandsError;

                // CRITICAL: Fetch existing settlements BEFORE processing transactions
                // This allows us to check if commission/errand IDs are already tracked
                // and prevent duplicates across settlements (no limit - needed for computation)
                const { data: existingSettlements, error: settlementsDbError } = await supabase
                    .from('settlements')
                    .select('id, user_id, period_start_date, period_end_date, status, paid_at, created_at, updated_at, total_earnings, total_transactions, system_fees, commission_ids, errand_ids')
                    .in('user_id', runnerIds)
                    .order('updated_at', { ascending: false });

                if (settlementsDbError) {
                    console.warn('Error fetching existing settlements:', settlementsDbError);
                }
                
                // Note: Overdue status is now updated by database function (update_overdue_settlements)
                // called earlier in this flow. No manual JavaScript logic needed.
                
                // Create a map of all tracked commission and errand IDs from existing settlements
                // This prevents duplicates - a commission/errand should only be in ONE settlement
                const trackedCommissionIds = new Set<string>();
                const trackedErrandIds = new Set<string>();
                const existingSettlementsByPeriod = new Map<string, any>();
                
                (existingSettlements || []).forEach((settlement: any) => {
                    // Track all commission IDs
                    if (settlement.commission_ids && Array.isArray(settlement.commission_ids)) {
                        settlement.commission_ids.forEach((cid: string) => {
                            trackedCommissionIds.add(String(cid));
                        });
                    }
                    
                    // Track all errand IDs
                    if (settlement.errand_ids && Array.isArray(settlement.errand_ids)) {
                        settlement.errand_ids.forEach((eid: string) => {
                            trackedErrandIds.add(String(eid));
                        });
                    }
                    
                    // Map by period for easy lookup
                    const periodKey = `${settlement.user_id}|${settlement.period_start_date}`;
                    if (!existingSettlementsByPeriod.has(periodKey)) {
                        existingSettlementsByPeriod.set(periodKey, settlement);
                    }
                });
                
                console.log('🔍 Existing settlements loaded:', {
                    totalFromDb: existingSettlements?.length || 0,
                    trackedCommissionIds: trackedCommissionIds.size,
                    trackedErrandIds: trackedErrandIds.size
                });

                // Group transactions by runner and period
                // NEW LOGIC: Periods only start when a runner has a new transaction after all settlements are paid
                const settlementsMap = new Map<string, {
                    user_id: string;
                    period_start_date: string;
                    period_end_date: string;
                    total_earnings: number;
                    total_transactions: number;
                    system_fees: number;
                    commission_ids: string[];
                    errand_ids: string[];
                    status?: string;
                }>(); // key: user_id|period_start

                // Helper function to check if runner has any active (pending/overdue) settlements
                const hasActiveSettlement = (runnerId: string, settlementsInMap: Map<string, any>, existingSettlementsMap: Map<string, any>) => {
                    // Check settlements in map first
                    for (const [key, settlement] of settlementsInMap.entries()) {
                        if (key.startsWith(`${runnerId}|`)) {
                            const status = String(settlement.status || '').toLowerCase().trim();
                            // Active settlements are pending or overdue (not paid)
                            if (status !== 'paid') {
                                return true;
                            }
                        }
                    }
                    // Also check existing settlements from database
                    for (const [key, existingSettlement] of existingSettlementsMap.entries()) {
                        if (key.startsWith(`${runnerId}|`)) {
                            const status = String(existingSettlement.status || '').toLowerCase().trim();
                            if (status !== 'paid') {
                                return true;
                            }
                        }
                    }
                    return false;
                };

                // Helper function to get the last paid settlement date for a runner
                const getLastPaidSettlementDate = (runnerId: string, settlementsInMap: Map<string, any>, existingSettlementsMap: Map<string, any>): Date | null => {
                    let lastPaidDate: Date | null = null;
                    
                    // Check settlements in map
                    for (const [key, settlement] of settlementsInMap.entries()) {
                        if (key.startsWith(`${runnerId}|`)) {
                            const status = String(settlement.status || '').toLowerCase().trim();
                            if (status === 'paid') {
                                const periodEnd = new Date(settlement.period_end_date + 'T00:00:00Z');
                                if (!lastPaidDate || periodEnd > lastPaidDate) {
                                    lastPaidDate = periodEnd;
                                }
                            }
                        }
                    }
                    
                    // Check existing settlements from database
                    for (const [key, existingSettlement] of existingSettlementsMap.entries()) {
                        if (key.startsWith(`${runnerId}|`)) {
                            const status = String(existingSettlement.status || '').toLowerCase().trim();
                            if (status === 'paid') {
                                const periodEnd = new Date(existingSettlement.period_end_date + 'T00:00:00Z');
                                if (!lastPaidDate || periodEnd > lastPaidDate) {
                                    lastPaidDate = periodEnd;
                                }
                            }
                        }
                    }
                    
                    return lastPaidDate;
                };

                // Helper function to find or create period for a transaction date
                // NEW LOGIC: Only creates new settlement when runner has no active settlements
                // and transaction is after the last paid settlement (or no paid settlements exist)
                const getOrCreatePeriod = (runnerId: string, transactionDate: Date, transactionId?: string, isCommission: boolean = true) => {
                    const formatDate = (d: Date) => {
                        const y = d.getUTCFullYear();
                        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                        const dDay = String(d.getUTCDate()).padStart(2, '0');
                        return `${y}-${m}-${dDay}`;
                    };
                    
                    // Normalize transaction date to start of day
                    const txDate = new Date(transactionDate);
                    txDate.setUTCHours(0, 0, 0, 0);
                    
                    // FIRST: Check if this transaction falls into an existing ACTIVE (pending/overdue) settlement period
                    let matchingPeriod: { periodStart: string; periodEnd: string; key: string } | null = null;
                    
                    // Check settlements in map (active ones first)
                    for (const [key, settlement] of settlementsMap.entries()) {
                        if (key.startsWith(`${runnerId}|`)) {
                            const status = String(settlement.status || '').toLowerCase().trim();
                            
                            // Only consider active (pending/overdue) settlements
                            if (status !== 'paid') {
                                // Check if this transaction ID is already in the settlement's tracked IDs
                                const isAlreadyTracked = transactionId && (
                                    (isCommission && settlement.commission_ids.includes(transactionId)) ||
                                    (!isCommission && settlement.errand_ids.includes(transactionId))
                                );
                                
                                if (isAlreadyTracked) {
                                    matchingPeriod = {
                                        periodStart: settlement.period_start_date,
                                        periodEnd: settlement.period_end_date,
                                        key: key
                                    };
                                    break;
                                }
                                
                                const periodStart = new Date(settlement.period_start_date + 'T00:00:00Z');
                                const periodEnd = new Date(settlement.period_end_date + 'T00:00:00Z');
                                
                                // Check if transaction falls within this active period (inclusive)
                                if (txDate >= periodStart && txDate <= periodEnd) {
                                    matchingPeriod = {
                                        periodStart: settlement.period_start_date,
                                        periodEnd: settlement.period_end_date,
                                        key: key
                                    };
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Also check existing settlements from database for active ones
                    if (!matchingPeriod) {
                        for (const [key, existingSettlement] of existingSettlementsByPeriod.entries()) {
                            if (key.startsWith(`${runnerId}|`)) {
                                const status = String(existingSettlement.status || '').toLowerCase().trim();
                                
                                // Only consider active (pending/overdue) settlements
                                if (status !== 'paid') {
                                    const periodStart = new Date(existingSettlement.period_start_date + 'T00:00:00Z');
                                    const periodEnd = new Date(existingSettlement.period_end_date + 'T00:00:00Z');
                                    
                                    // Check if transaction falls within this active period (inclusive)
                                    if (txDate >= periodStart && txDate <= periodEnd) {
                                        matchingPeriod = {
                                            periodStart: existingSettlement.period_start_date,
                                            periodEnd: existingSettlement.period_end_date,
                                            key: key
                                        };
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    // If we found an active settlement that matches, return it
                    if (matchingPeriod) {
                        return matchingPeriod;
                    }
                    
                    // SECOND: No active settlement found - check if we should create a new one
                    // Only create new settlement if runner has no active settlements
                    // and transaction is after the last paid settlement (if any)
                    if (hasActiveSettlement(runnerId, settlementsMap, existingSettlementsByPeriod)) {
                        // Runner has active settlement but transaction doesn't fit in it
                        // This shouldn't happen, but if it does, log a warning
                        console.warn('⚠️ Transaction does not fit in active settlement period:', {
                            runnerId,
                            transactionDate: formatDate(txDate),
                            transactionId,
                            note: 'Transaction may be outside active settlement period - skipping'
                        });
                        // Return empty period to indicate no valid period found
                        return {
                            periodStart: '',
                            periodEnd: '',
                            key: ''
                        };
                    }
                    
                    // Check if transaction is after last paid settlement
                    const lastPaidDate = getLastPaidSettlementDate(runnerId, settlementsMap, existingSettlementsByPeriod);
                    if (lastPaidDate && txDate <= lastPaidDate) {
                        // Transaction is before or on the last paid settlement date
                        // This shouldn't create a new settlement - it's an old transaction that should have been in a previous settlement
                        console.warn('⚠️ Transaction is before or on last paid settlement date:', {
                            runnerId,
                            transactionDate: formatDate(txDate),
                            lastPaidDate: formatDate(lastPaidDate),
                            note: 'This transaction should have been in a previous settlement - skipping'
                        });
                        return {
                            periodStart: '',
                            periodEnd: '',
                            key: ''
                        };
                    }
                    
                    // THIRD: Create new period starting from transaction date
                    // This only happens when:
                    // 1. Runner has no active settlements (all are paid)
                    // 2. Transaction is after the last paid settlement (or no paid settlements exist)
                    const periodStart = new Date(txDate);
                    const periodEnd = new Date(periodStart);
                    periodEnd.setUTCDate(periodEnd.getUTCDate() + 4); // 5-day period inclusive (start + 4 days = 5 total)
                    
                    const periodStartStr = formatDate(periodStart);
                    const periodEndStr = formatDate(periodEnd);
                    const key = `${runnerId}|${periodStartStr}`;
                    
                    return {
                        periodStart: periodStartStr,
                        periodEnd: periodEndStr,
                        key: key
                    };
                };

                // Process commissions
                (commissions || []).forEach(comm => {
                    const invoiceAmount = invoicesMap.get(parseInt(comm.id));
                    if (invoiceAmount && invoiceAmount > 0) {
                        const commissionId = String(comm.id);
                        
                        // CRITICAL: Skip if this commission is already tracked in an existing settlement
                        // This prevents duplicate commission IDs across settlements
                        if (trackedCommissionIds.has(commissionId)) {
                            console.log('⚠️ Skipping commission already tracked in existing settlement:', {
                                commission_id: commissionId,
                                runner_id: comm.runner_id
                            });
                            return; // Skip this commission - it's already in a settlement
                        }
                        
                        // Extract date from timestamp
                        const dateStr = comm.created_at.split('T')[0].split(' ')[0];
                        const [year, month, day] = dateStr.split('-').map(Number);
                        const transactionDate = new Date(Date.UTC(year, month - 1, day));
                        
                        // Check if runner has any active (pending/overdue) settlements
                        // If yes, transaction must fall within an active settlement period, or we skip it
                        let existingSettlementForPeriod: any = null;
                        let hasActiveSettlements = false;
                        
                        for (const [key, existingSettlement] of existingSettlementsByPeriod.entries()) {
                            if (key.startsWith(`${comm.runner_id}|`)) {
                                const status = String(existingSettlement.status || '').toLowerCase().trim();
                                
                                // Track if runner has any active (pending/overdue) settlements
                                if (status !== 'paid') {
                                    hasActiveSettlements = true;
                                    
                                    const periodStart = new Date(existingSettlement.period_start_date + 'T00:00:00Z');
                                    const periodEnd = new Date(existingSettlement.period_end_date + 'T00:00:00Z');
                                    
                                    // Check if transaction falls within this active settlement period (inclusive)
                                    if (transactionDate >= periodStart && transactionDate <= periodEnd) {
                                        existingSettlementForPeriod = existingSettlement;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // If runner has active settlements but transaction doesn't fall in any, skip it
                        if (hasActiveSettlements && !existingSettlementForPeriod) {
                            console.log('⚠️ Skipping commission - runner has active settlement but transaction is outside period:', {
                                commission_id: commissionId,
                                runner_id: comm.runner_id,
                                transactionDate: dateStr,
                                note: 'Transaction is outside active settlement period - will be included after settlement is paid'
                            });
                            return; // Skip this commission
                        }
                        
                        // Get or create period for this transaction (only if no active settlement matched)
                        const periodInfo = getOrCreatePeriod(comm.runner_id, transactionDate, commissionId, true);
                        
                        // Skip if no valid period found (transaction doesn't qualify for new settlement)
                        if (!periodInfo.key || !periodInfo.periodStart || !periodInfo.periodEnd) {
                            console.log('⚠️ Skipping commission - no valid period found:', {
                                commission_id: commissionId,
                                runner_id: comm.runner_id,
                                transactionDate: dateStr,
                                note: 'Transaction does not qualify for new settlement'
                            });
                            return; // Skip this commission
                        }
                        
                        // If commission falls within an existing settlement period, merge with it
                        if (existingSettlementForPeriod) {
                            const existingKey = `${existingSettlementForPeriod.user_id}|${existingSettlementForPeriod.period_start_date}`;
                            
                            // Use existing settlement's period dates
                            if (!settlementsMap.has(existingKey)) {
                                settlementsMap.set(existingKey, {
                                    user_id: existingSettlementForPeriod.user_id,
                                    period_start_date: existingSettlementForPeriod.period_start_date,
                                    period_end_date: existingSettlementForPeriod.period_end_date,
                                    total_earnings: parseFloat(existingSettlementForPeriod.total_earnings?.toString() || '0'),
                                    total_transactions: existingSettlementForPeriod.total_transactions || 0,
                                    system_fees: parseFloat(existingSettlementForPeriod.system_fees?.toString() || '0'),
                                    commission_ids: [...(existingSettlementForPeriod.commission_ids || [])],
                                    errand_ids: [...(existingSettlementForPeriod.errand_ids || [])],
                                    status: existingSettlementForPeriod.status || 'pending',
                                });
                            }
                            
                            const settlement = settlementsMap.get(existingKey)!;
                            
                            // Only add if not already in the list
                            if (!settlement.commission_ids.includes(commissionId)) {
                                settlement.total_earnings += invoiceAmount;
                                settlement.total_transactions += 1;
                                const actualSystemFee = calculateCommissionSystemFee(invoiceAmount);
                                settlement.system_fees += actualSystemFee;
                                settlement.commission_ids.push(commissionId);
                                trackedCommissionIds.add(commissionId); // Mark as tracked
                            }
                        } else {
                            // New settlement - create it (only when no active settlements exist and transaction is after last paid settlement)
                            if (!settlementsMap.has(periodInfo.key)) {
                                settlementsMap.set(periodInfo.key, {
                                user_id: comm.runner_id,
                                    period_start_date: periodInfo.periodStart,
                                    period_end_date: periodInfo.periodEnd,
                                total_earnings: 0,
                                total_transactions: 0,
                                system_fees: 0,
                                    commission_ids: [],
                                    errand_ids: [],
                                    status: 'pending',
                            });
                        }
                        
                            const settlement = settlementsMap.get(periodInfo.key)!;
                        settlement.total_earnings += invoiceAmount;
                        settlement.total_transactions += 1;
                        const actualSystemFee = calculateCommissionSystemFee(invoiceAmount);
                        settlement.system_fees += actualSystemFee;
                            
                            // Track commission ID (already have it from above)
                            if (!settlement.commission_ids.includes(commissionId)) {
                                settlement.commission_ids.push(commissionId);
                                trackedCommissionIds.add(commissionId); // Mark as tracked
                            }
                        }
                        
                        // Get the settlement we're working with (either existing or new)
                        const settlement = existingSettlementForPeriod 
                            ? settlementsMap.get(`${existingSettlementForPeriod.user_id}|${existingSettlementForPeriod.period_start_date}`)!
                            : settlementsMap.get(periodInfo.key)!;
                        
                        // Update period_start_date to use the earliest transaction date from tracked IDs
                        // This ensures accuracy based on actual transaction dates
                        if (settlement.commission_ids.length > 0 || settlement.errand_ids.length > 0) {
                            // Find the earliest transaction date from all tracked commissions and errands
                            let earliestDate = transactionDate;
                            
                            // Check all commissions in this settlement
                            for (const cid of settlement.commission_ids) {
                                const commData = commissions?.find(c => String(c.id) === cid);
                                if (commData) {
                                    const dateStr = commData.created_at.split('T')[0].split(' ')[0];
                                    const [y, m, d] = dateStr.split('-').map(Number);
                                    const commDate = new Date(Date.UTC(y, m - 1, d));
                                    commDate.setUTCHours(0, 0, 0, 0);
                                    if (commDate < earliestDate) {
                                        earliestDate = commDate;
                                    }
                                }
                            }
                            
                            // Check all errands in this settlement
                            for (const eid of settlement.errand_ids) {
                                const errandData = errands?.find(e => String(e.id) === eid);
                                if (errandData) {
                                    const dateStr = errandData.created_at.split('T')[0].split(' ')[0];
                                    const [y, m, d] = dateStr.split('-').map(Number);
                                    const errandDate = new Date(Date.UTC(y, m - 1, d));
                                    errandDate.setUTCHours(0, 0, 0, 0);
                                    if (errandDate < earliestDate) {
                                        earliestDate = errandDate;
                                    }
                                }
                            }
                            
                            // Update period start date if we found an earlier transaction
                            const formatDate = (d: Date) => {
                                const y = d.getUTCFullYear();
                                const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                                const dDay = String(d.getUTCDate()).padStart(2, '0');
                                return `${y}-${m}-${dDay}`;
                            };
                            
                            const earliestDateStr = formatDate(earliestDate);
                            if (earliestDateStr !== settlement.period_start_date) {
                                const newPeriodEnd = new Date(earliestDate);
                                newPeriodEnd.setUTCDate(newPeriodEnd.getUTCDate() + 4);
                                const newPeriodEndStr = formatDate(newPeriodEnd);
                                
                                settlement.period_start_date = earliestDateStr;
                                settlement.period_end_date = newPeriodEndStr;
                                
                                // Update the map key if period changed
                                const currentKey = existingSettlementForPeriod 
                                    ? `${existingSettlementForPeriod.user_id}|${existingSettlementForPeriod.period_start_date}`
                                    : periodInfo.key;
                                const newKey = `${comm.runner_id}|${earliestDateStr}`;
                                if (currentKey !== newKey) {
                                    settlementsMap.delete(currentKey);
                                    settlementsMap.set(newKey, settlement);
                                }
                            }
                        }
                    }
                });

                // Process errands
                (errands || []).forEach(errand => {
                    const price = errand.amount_price || 0;
                    if (price > 0) {
                        const errandId = String(errand.id);
                        
                        // CRITICAL: Skip if this errand is already tracked in an existing settlement
                        // This prevents duplicate errand IDs across settlements
                        if (trackedErrandIds.has(errandId)) {
                            console.log('⚠️ Skipping errand already tracked in existing settlement:', {
                                errand_id: errandId,
                                runner_id: errand.runner_id
                            });
                            return; // Skip this errand - it's already in a settlement
                        }
                        
                        // Extract date from timestamp
                        const dateStr = errand.created_at.split('T')[0].split(' ')[0];
                        const [year, month, day] = dateStr.split('-').map(Number);
                        const transactionDate = new Date(Date.UTC(year, month - 1, day));
                        
                        // Check if runner has any active (pending/overdue) settlements
                        // If yes, transaction must fall within an active settlement period, or we skip it
                        let existingSettlementForPeriod: any = null;
                        let hasActiveSettlements = false;
                        
                        for (const [key, existingSettlement] of existingSettlementsByPeriod.entries()) {
                            if (key.startsWith(`${errand.runner_id}|`)) {
                                const status = String(existingSettlement.status || '').toLowerCase().trim();
                                
                                // Track if runner has any active (pending/overdue) settlements
                                if (status !== 'paid') {
                                    hasActiveSettlements = true;
                                    
                                    const periodStart = new Date(existingSettlement.period_start_date + 'T00:00:00Z');
                                    const periodEnd = new Date(existingSettlement.period_end_date + 'T00:00:00Z');
                                    
                                    // Check if transaction falls within this active settlement period (inclusive)
                                    if (transactionDate >= periodStart && transactionDate <= periodEnd) {
                                        existingSettlementForPeriod = existingSettlement;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // If runner has active settlements but transaction doesn't fall in any, skip it
                        if (hasActiveSettlements && !existingSettlementForPeriod) {
                            console.log('⚠️ Skipping errand - runner has active settlement but transaction is outside period:', {
                                errand_id: errandId,
                                runner_id: errand.runner_id,
                                transactionDate: dateStr,
                                note: 'Transaction is outside active settlement period - will be included after settlement is paid'
                            });
                            return; // Skip this errand
                        }
                        
                        // Get or create period for this transaction (only if no active settlement matched)
                        const periodInfo = getOrCreatePeriod(errand.runner_id, transactionDate, errandId, false);
                        
                        // Skip if no valid period found (transaction doesn't qualify for new settlement)
                        if (!periodInfo.key || !periodInfo.periodStart || !periodInfo.periodEnd) {
                            console.log('⚠️ Skipping errand - no valid period found:', {
                                errand_id: errandId,
                                runner_id: errand.runner_id,
                                transactionDate: dateStr,
                                note: 'Transaction does not qualify for new settlement'
                            });
                            return; // Skip this errand
                        }
                        
                        // If errand falls within an existing settlement period, merge with it
                        if (existingSettlementForPeriod) {
                            const existingKey = `${existingSettlementForPeriod.user_id}|${existingSettlementForPeriod.period_start_date}`;
                            
                            // Use existing settlement's period dates
                            if (!settlementsMap.has(existingKey)) {
                                settlementsMap.set(existingKey, {
                                    user_id: existingSettlementForPeriod.user_id,
                                    period_start_date: existingSettlementForPeriod.period_start_date,
                                    period_end_date: existingSettlementForPeriod.period_end_date,
                                    total_earnings: parseFloat(existingSettlementForPeriod.total_earnings?.toString() || '0'),
                                    total_transactions: existingSettlementForPeriod.total_transactions || 0,
                                    system_fees: parseFloat(existingSettlementForPeriod.system_fees?.toString() || '0'),
                                    commission_ids: [...(existingSettlementForPeriod.commission_ids || [])],
                                    errand_ids: [...(existingSettlementForPeriod.errand_ids || [])],
                                    status: existingSettlementForPeriod.status || 'pending',
                                });
                            }
                            
                            const settlement = settlementsMap.get(existingKey)!;
                            
                            // Only add if not already in the list
                            if (!settlement.errand_ids.includes(errandId)) {
                                settlement.total_earnings += price;
                                settlement.total_transactions += 1;
                                const actualSystemFee = calculateErrandSystemFee(errand);
                                settlement.system_fees += actualSystemFee;
                                settlement.errand_ids.push(errandId);
                                trackedErrandIds.add(errandId); // Mark as tracked
                            }
                        } else {
                            // New settlement - create it (only when no active settlements exist and transaction is after last paid settlement)
                            if (!settlementsMap.has(periodInfo.key)) {
                                settlementsMap.set(periodInfo.key, {
                                user_id: errand.runner_id,
                                    period_start_date: periodInfo.periodStart,
                                    period_end_date: periodInfo.periodEnd,
                                total_earnings: 0,
                                total_transactions: 0,
                                system_fees: 0,
                                    commission_ids: [],
                                    errand_ids: [],
                                    status: 'pending',
                            });
                        }
                        
                            const settlement = settlementsMap.get(periodInfo.key)!;
                        settlement.total_earnings += price;
                        settlement.total_transactions += 1;
                        const actualSystemFee = calculateErrandSystemFee(errand);
                        settlement.system_fees += actualSystemFee;
                            
                            // Track errand ID (already have it from above)
                            if (!settlement.errand_ids.includes(errandId)) {
                                settlement.errand_ids.push(errandId);
                                trackedErrandIds.add(errandId); // Mark as tracked
                            }
                        }
                        
                        // Get the settlement we're working with (either existing or new)
                        const settlement = existingSettlementForPeriod 
                            ? settlementsMap.get(`${existingSettlementForPeriod.user_id}|${existingSettlementForPeriod.period_start_date}`)!
                            : settlementsMap.get(periodInfo.key)!;
                        
                        // Update period_start_date to use the earliest transaction date from tracked IDs
                        // This ensures accuracy based on actual transaction dates
                        if (settlement.commission_ids.length > 0 || settlement.errand_ids.length > 0) {
                            // Find the earliest transaction date from all tracked commissions and errands
                            let earliestDate = transactionDate;
                            
                            // Check all commissions in this settlement
                            for (const cid of settlement.commission_ids) {
                                const commData = commissions?.find(c => String(c.id) === cid);
                                if (commData) {
                                    const dateStr = commData.created_at.split('T')[0].split(' ')[0];
                                    const [y, m, d] = dateStr.split('-').map(Number);
                                    const commDate = new Date(Date.UTC(y, m - 1, d));
                                    commDate.setUTCHours(0, 0, 0, 0);
                                    if (commDate < earliestDate) {
                                        earliestDate = commDate;
                                    }
                                }
                            }
                            
                            // Check all errands in this settlement
                            for (const eid of settlement.errand_ids) {
                                const errandData = errands?.find(e => String(e.id) === eid);
                                if (errandData) {
                                    const dateStr = errandData.created_at.split('T')[0].split(' ')[0];
                                    const [y, m, d] = dateStr.split('-').map(Number);
                                    const errandDate = new Date(Date.UTC(y, m - 1, d));
                                    errandDate.setUTCHours(0, 0, 0, 0);
                                    if (errandDate < earliestDate) {
                                        earliestDate = errandDate;
                                    }
                                }
                            }
                            
                            // Update period start date if we found an earlier transaction
                            const formatDate = (d: Date) => {
                                const y = d.getUTCFullYear();
                                const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                                const dDay = String(d.getUTCDate()).padStart(2, '0');
                                return `${y}-${m}-${dDay}`;
                            };
                            
                            const earliestDateStr = formatDate(earliestDate);
                            if (earliestDateStr !== settlement.period_start_date) {
                                const newPeriodEnd = new Date(earliestDate);
                                newPeriodEnd.setUTCDate(newPeriodEnd.getUTCDate() + 4);
                                const newPeriodEndStr = formatDate(newPeriodEnd);
                                
                                settlement.period_start_date = earliestDateStr;
                                settlement.period_end_date = newPeriodEndStr;
                                
                                // Update the map key if period changed
                                const currentKey = existingSettlementForPeriod 
                                    ? `${existingSettlementForPeriod.user_id}|${existingSettlementForPeriod.period_start_date}`
                                    : periodInfo.key;
                                const newKey = `${errand.runner_id}|${earliestDateStr}`;
                                if (currentKey !== newKey) {
                                    settlementsMap.delete(currentKey);
                                    settlementsMap.set(newKey, settlement);
                                }
                            }
                        }
                    }
                });

                // Log existing settlements for debugging
                console.log('🔍 All settlements from database:', {
                    totalFromDb: existingSettlements?.length || 0,
                    trackedCommissionIds: trackedCommissionIds.size,
                    trackedErrandIds: trackedErrandIds.size,
                    byStatus: {
                        pending: existingSettlements?.filter(s => String(s.status || '').toLowerCase().trim() === 'pending').length || 0,
                        paid: existingSettlements?.filter(s => String(s.status || '').toLowerCase().trim() === 'paid').length || 0,
                        overdue: existingSettlements?.filter(s => String(s.status || '').toLowerCase().trim() === 'overdue').length || 0,
                    },
                    allSettlements: existingSettlements?.map(s => ({
                        id: s.id,
                        user_id: s.user_id,
                        period: `${s.period_start_date} - ${s.period_end_date}`,
                        status: s.status,
                        commission_ids: s.commission_ids,
                        errand_ids: s.errand_ids
                    }))
                });

                // Create a map of existing settlements by key
                const existingSettlementsMap = new Map<string, {
                    id: string;
                    status: string;
                    paid_at: string | null;
                    created_at: string;
                    updated_at: string;
                }>();
                (existingSettlements || []).forEach((settlement: any) => {
                    const key = `${settlement.user_id}|${settlement.period_start_date}`;
                    existingSettlementsMap.set(key, {
                        id: settlement.id,
                        status: settlement.status,
                        paid_at: settlement.paid_at,
                        created_at: settlement.created_at,
                        updated_at: settlement.updated_at,
                    });
                });
                
                console.log('🔍 Existing settlements map keys:', Array.from(existingSettlementsMap.keys()));

                // Convert map to array and add user info, merge with existing settlements
                const settlementsList: Settlement[] = [];
                console.log('🔍 Calculated settlements map keys:', Array.from(settlementsMap.keys()));
                settlementsMap.forEach((settlementData, key) => {
                    const runner = runners.find(r => r.id === settlementData.user_id);
                    if (runner) {
                        const existing = existingSettlementsMap.get(key);
                        
                        if (!existing) {
                            console.log('⚠️ No existing settlement found for calculated key:', {
                                key: key,
                                user_id: settlementData.user_id,
                                period: `${settlementData.period_start_date} - ${settlementData.period_end_date}`,
                                earnings: settlementData.total_earnings,
                                transactions: settlementData.total_transactions
                            });
                        } else {
                            console.log('✅ Found existing settlement for key:', {
                                key: key,
                                existing_id: existing.id,
                                status: existing.status
                            });
                        }
                        
                        settlementsList.push({
                            id: existing?.id || '',
                            user_id: settlementData.user_id,
                            period_start_date: settlementData.period_start_date,
                            period_end_date: settlementData.period_end_date,
                            total_earnings: settlementData.total_earnings,
                            total_transactions: settlementData.total_transactions,
                            system_fees: settlementData.system_fees,
                            status: (existing?.status || 'pending') as 'pending' | 'paid' | 'overdue',
                            created_at: existing?.created_at || new Date().toISOString(),
                            updated_at: existing?.updated_at || new Date().toISOString(),
                            paid_at: existing?.paid_at || null,
                            commission_ids: settlementData.commission_ids || [],
                            errand_ids: settlementData.errand_ids || [],
                            user: runner
                        });
                    }
                });
                
                // CRITICAL: Add settlements that exist in database but NOT in calculated map
                // These might be settlements created manually or from other sources
                // Empty settlements (0 transactions, 0 earnings) will be deleted
                if (existingSettlements) {
                    const emptySettlementsToCancel: any[] = [];
                    
                    existingSettlements.forEach((dbSettlement: any) => {
                        const key = `${dbSettlement.user_id}|${dbSettlement.period_start_date}`;
                        const transactions = dbSettlement.total_transactions || 0;
                        const earnings = parseFloat(dbSettlement.total_earnings?.toString() || '0');
                        const status = String(dbSettlement.status || '').toLowerCase().trim();
                        
                        // If settlement is empty (0 transactions, 0 earnings), mark it for deletion
                        // Delete regardless of status (pending, paid, or overdue) - empty settlements shouldn't exist
                        if (transactions === 0 && earnings === 0) {
                            emptySettlementsToCancel.push(dbSettlement);
                        }
                        
                        // Only add if it doesn't already exist in settlementsList
                        if (!settlementsMap.has(key)) {
                            const runner = runners.find(r => r.id === dbSettlement.user_id);
                            if (runner) {
                                console.log('⚠️ Found settlement in database not in calculated list:', {
                                    id: dbSettlement.id,
                                    user_id: dbSettlement.user_id,
                                    period: `${dbSettlement.period_start_date} - ${dbSettlement.period_end_date}`,
                                    status: dbSettlement.status,
                                    normalizedStatus: status,
                                    transactions,
                                    earnings,
                                    isEmpty: transactions === 0 && earnings === 0
                                });
                                
                                // Use the status from database (pending, overdue, or paid)
                                // Empty settlements will be deleted, so we don't need special handling
                                const finalStatus = (dbSettlement.status || 'pending');
                                
                                settlementsList.push({
                                    id: dbSettlement.id || '',
                                    user_id: dbSettlement.user_id,
                                    period_start_date: dbSettlement.period_start_date,
                                    period_end_date: dbSettlement.period_end_date,
                                    total_earnings: earnings,
                                    total_transactions: transactions,
                                    system_fees: parseFloat(dbSettlement.system_fees?.toString() || '0'),
                                    status: finalStatus as 'pending' | 'paid' | 'overdue',
                                    created_at: dbSettlement.created_at || new Date().toISOString(),
                                    updated_at: dbSettlement.updated_at || new Date().toISOString(),
                                    paid_at: dbSettlement.paid_at || null,
                                    commission_ids: dbSettlement.commission_ids || [],
                                    errand_ids: dbSettlement.errand_ids || [],
                                    user: runner
                                });
                            }
                        }
                    });
                    
                    // Automatically delete empty settlements (0 transactions, 0 earnings) from the database
                    // These shouldn't exist and serve no purpose
                    if (emptySettlementsToCancel.length > 0) {
                        console.log('🔄 Auto-deleting empty settlements (0 transactions, 0 earnings):', {
                            count: emptySettlementsToCancel.length,
                            settlements: emptySettlementsToCancel.map(s => ({
                                id: s.id,
                                user_id: s.user_id,
                                period: `${s.period_start_date} - ${s.period_end_date}`,
                                status: s.status
                            }))
                        });
                        
                        // Delete all empty settlements from the database
                        for (const emptySettlement of emptySettlementsToCancel) {
                            try {
                                const { error: deleteError } = await supabase
                                    .from('settlements')
                                    .delete()
                                    .eq('id', emptySettlement.id);
                                
                                if (deleteError) {
                                    console.warn(`⚠️ Failed to delete empty settlement ${emptySettlement.id}:`, deleteError);
                                } else {
                                    console.log(`✅ Auto-deleted empty settlement ${emptySettlement.id} (period: ${emptySettlement.period_start_date} - ${emptySettlement.period_end_date})`);
                                }
                            } catch (error) {
                                console.warn(`⚠️ Error deleting empty settlement ${emptySettlement.id}:`, error);
                            }
                        }
                    }
                }

                // Sort by period start date (newest first)
                settlementsList.sort((a, b) => {
                    return new Date(b.period_start_date).getTime() - new Date(a.period_start_date).getTime();
                });

                // Automatically persist all calculated settlements to the database
                // This ensures all BuddyRunners have settlement records for tracking
                // CRITICAL: Only create/update settlements that have actual work (transactions > 0 or earnings > 0)
                // Empty settlements (0 transactions, 0 earnings) shouldn't be created
                try {
                    // CRITICAL: Only persist settlements with actual work transactions
                    // A settlement should only exist if there are commissions OR errands
                    // Check both total_transactions AND that commission_ids/errand_ids are populated
                    const settlementsWithWork = settlementsList.filter(s => {
                        const hasTransactions = s.total_transactions > 0;
                        const hasCommissionIds = s.commission_ids && s.commission_ids.length > 0;
                        const hasErrandIds = s.errand_ids && s.errand_ids.length > 0;
                        
                        // Settlement should only exist if it has actual transactions AND IDs
                        // This ensures settlements are only created when runners have work
                        return hasTransactions && (hasCommissionIds || hasErrandIds);
                    });
                    
                    const settlementsToCreate = settlementsWithWork.filter(s => !s.id || s.id === '');
                    const settlementsToUpdate = settlementsWithWork.filter(s => s.id && s.id !== '');
                    
                    // Log if we're filtering out empty settlements
                    const emptySettlements = settlementsList.filter(s => 
                        s.total_transactions === 0 && s.total_earnings === 0
                    );
                    if (emptySettlements.length > 0) {
                        console.log('⚠️ Skipping empty settlements (0 transactions, 0 earnings):', {
                            count: emptySettlements.length,
                            settlements: emptySettlements.map(s => ({
                                user_id: s.user_id,
                                period: `${s.period_start_date} - ${s.period_end_date}`,
                                transactions: s.total_transactions,
                                earnings: s.total_earnings
                            }))
                        });
                    }

                    // Create new settlement records
                    // Since Supabase upsert doesn't support composite unique constraints in onConflict,
                    // we need to check existence first, then insert or update accordingly
                    if (settlementsToCreate.length > 0) {
                        console.log('🔍 Attempting to create settlements:', settlementsToCreate.map(s => ({
                            user_id: s.user_id,
                            period: `${s.period_start_date} - ${s.period_end_date}`,
                            earnings: s.total_earnings,
                            transactions: s.total_transactions
                        })));
                        
                        for (const settlement of settlementsToCreate) {
                            try {
                                // First, check if settlement already exists (might have been created by another process)
                                // Also check for settlements with overlapping periods for the same user
                                const { data: existingSettlement, error: checkError } = await supabase
                            .from('settlements')
                                    .select('id, status, period_start_date, period_end_date')
                                    .eq('user_id', settlement.user_id)
                                    .eq('period_start_date', settlement.period_start_date)
                                    .eq('period_end_date', settlement.period_end_date)
                                    .maybeSingle();

                                if (checkError) {
                                    console.warn(`Error checking settlement existence for user ${settlement.user_id}, period ${settlement.period_start_date} - ${settlement.period_end_date}:`, checkError);
                                    continue;
                                }
                                

                                if (existingSettlement) {
                                    // Settlement exists, update it with our calculated values (only if pending)
                                    if (existingSettlement.status === 'pending') {
                                        const { data: updatedSettlement, error: updateError } = await supabase
                                            .from('settlements')
                                            .update({
                                                total_earnings: settlement.total_earnings,
                                                total_transactions: settlement.total_transactions,
                                                system_fees: settlement.system_fees,
                                                commission_ids: settlement.commission_ids || [],
                                                errand_ids: settlement.errand_ids || [],
                                                updated_at: settlement.updated_at,
                                            })
                                            .eq('id', existingSettlement.id)
                                            .select('id')
                                            .single();

                                        if (updateError) {
                                            console.warn(`Error updating existing settlement ${existingSettlement.id}:`, updateError);
                                        } else if (updatedSettlement) {
                                            // Update the settlement in the list with the database ID
                                            const settlementInList = settlementsList.find(s => 
                                                s.user_id === settlement.user_id &&
                                                s.period_start_date === settlement.period_start_date &&
                                                s.period_end_date === settlement.period_end_date
                                            );
                                            if (settlementInList) {
                                                settlementInList.id = updatedSettlement.id;
                                            }
                                        }
                                    } else {
                                        // Settlement exists but is not pending, just update the ID in our list
                                        const settlementInList = settlementsList.find(s => 
                                            s.user_id === settlement.user_id &&
                                            s.period_start_date === settlement.period_start_date &&
                                            s.period_end_date === settlement.period_end_date
                                        );
                                        if (settlementInList) {
                                            settlementInList.id = existingSettlement.id;
                                        }
                                    }
                                } else {
                                    // Settlement doesn't exist, use RPC function to create it
                                    // This function handles period calculation correctly and bypasses RLS
                                    // NOTE: Function returns NULL if no transactions exist (settlement shouldn't exist)
                                    const { data: createdSettlement, error: rpcError } = await supabase.rpc('create_or_update_settlement', {
                                        p_user_id: settlement.user_id,
                                        p_start_date: settlement.period_start_date,
                                        p_end_date: settlement.period_end_date,
                                    });
                                    
                                    // If function returns NULL, it means there are no transactions
                                    // This is expected - don't create a settlement
                                    if (!createdSettlement && !rpcError) {
                                        console.log('ℹ️ No settlement created (no transactions for this period):', {
                                            user_id: settlement.user_id,
                                            period: `${settlement.period_start_date} - ${settlement.period_end_date}`
                                        });
                                        continue; // Skip to next settlement
                                    }
                                    
                                    if (rpcError) {
                                        console.warn(`Error creating settlement via RPC for user ${settlement.user_id}, period ${settlement.period_start_date} - ${settlement.period_end_date}:`, rpcError);
                                        
                                        // Fallback: Try direct insert (will fail if RLS blocks it, but worth trying)
                                        // CRITICAL: Only insert if there are actual transactions
                                        if (settlement.total_transactions > 0 && 
                                            ((settlement.commission_ids && settlement.commission_ids.length > 0) || 
                                             (settlement.errand_ids && settlement.errand_ids.length > 0))) {
                                            const { data: insertedSettlement, error: insertError } = await supabase
                                                .from('settlements')
                                                .insert({
                                                    user_id: settlement.user_id,
                                                    period_start_date: settlement.period_start_date,
                                                    period_end_date: settlement.period_end_date,
                                                    total_earnings: settlement.total_earnings,
                                                    total_transactions: settlement.total_transactions,
                                                    system_fees: settlement.system_fees,
                                                    status: settlement.status,
                                                    commission_ids: settlement.commission_ids || [],
                                                    errand_ids: settlement.errand_ids || [],
                                                    created_at: settlement.created_at,
                                                    updated_at: settlement.updated_at,
                                                })
                                                .select('id')
                                                .single();
                                            
                                            if (insertError) {
                                                // If insert failed due to unique constraint violation, settlement was created between check and insert
                                                // Fetch it and update the ID in our list
                                                if (insertError.code === '23505' || insertError.message?.includes('unique') || insertError.message?.includes('duplicate')) {
                                                    const { data: fetchedSettlement, error: fetchError } = await supabase
                                                        .from('settlements')
                                                        .select('id, status')
                                                        .eq('user_id', settlement.user_id)
                                                        .eq('period_start_date', settlement.period_start_date)
                                                        .eq('period_end_date', settlement.period_end_date)
                                                        .maybeSingle();

                                                    if (!fetchError && fetchedSettlement) {
                                                        const settlementInList = settlementsList.find(s => 
                                                            s.user_id === settlement.user_id &&
                                                            s.period_start_date === settlement.period_start_date &&
                                                            s.period_end_date === settlement.period_end_date
                                                        );
                                                        if (settlementInList) {
                                                            settlementInList.id = fetchedSettlement.id;
                                                        }
                                                    }
                                                } else {
                                                    console.warn(`Error inserting settlement for user ${settlement.user_id}, period ${settlement.period_start_date} - ${settlement.period_end_date}:`, insertError);
                                                }
                                            } else if (insertedSettlement) {
                                                // Direct insert succeeded
                                                const settlementInList = settlementsList.find(s => 
                                                    s.user_id === settlement.user_id &&
                                                    s.period_start_date === settlement.period_start_date &&
                                                    s.period_end_date === settlement.period_end_date
                                                );
                                                if (settlementInList) {
                                                    settlementInList.id = insertedSettlement.id;
                                                }
                                            }
                                        } else {
                                            console.log('ℹ️ Skipping empty settlement (no transactions):', {
                                                user_id: settlement.user_id,
                                                period: `${settlement.period_start_date} - ${settlement.period_end_date}`
                                            });
                                        }
                                    } else if (createdSettlement) {
                                        // RPC function succeeded - update the settlement in the list with the database ID
                                        const settlementInList = settlementsList.find(s => 
                                            s.user_id === settlement.user_id &&
                                            s.period_start_date === settlement.period_start_date &&
                                            s.period_end_date === settlement.period_end_date
                                        );
                                        if (settlementInList) {
                                            settlementInList.id = (createdSettlement as any).id;
                                            // Also update period dates in case RPC calculated different ones
                                            if ((createdSettlement as any).period_start_date) {
                                                settlementInList.period_start_date = (createdSettlement as any).period_start_date;
                                            }
                                            if ((createdSettlement as any).period_end_date) {
                                                settlementInList.period_end_date = (createdSettlement as any).period_end_date;
                                            }
                                        }
                                    }
                                }
                            } catch (error) {
                                console.warn(`Error creating settlement for user ${settlement.user_id}, period ${settlement.period_start_date} - ${settlement.period_end_date}:`, error);
                            }
                        }
                    }

                    // Update existing settlement records (only update pending ones, preserve paid/overdue status)
                    if (settlementsToUpdate.length > 0) {
                        const pendingUpdates = settlementsToUpdate.filter(s => s.status === 'pending');
                        
                        if (pendingUpdates.length > 0) {
                            // Batch update all pending settlements
                            const updates = pendingUpdates.map(s => ({
                                id: s.id,
                                total_earnings: s.total_earnings,
                                total_transactions: s.total_transactions,
                                system_fees: s.system_fees,
                                commission_ids: s.commission_ids || [],
                                errand_ids: s.errand_ids || [],
                                updated_at: s.updated_at,
                            }));

                            // Update each pending settlement individually to preserve status
                            for (const update of updates) {
                                const { error: updateError } = await supabase
                                    .from('settlements')
                                    .update({
                                        total_earnings: update.total_earnings,
                                        total_transactions: update.total_transactions,
                                        system_fees: update.system_fees,
                                        commission_ids: update.commission_ids,
                                        errand_ids: update.errand_ids,
                                        updated_at: update.updated_at,
                                    })
                                    .eq('id', update.id)
                                    .eq('status', 'pending');

                                if (updateError) {
                                    console.warn(`Error updating settlement ${update.id}:`, updateError);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Error persisting settlements to database:', error);
                    // Don't block the UI if persistence fails - settlements are still visible
                }

                setSettlements(settlementsList);
            } catch (error) {
                console.error('Error fetching settlements:', error);
                Alert.alert('Error', 'Failed to load settlements.');
            } finally {
                setLoadingSettlements(false);
            }
        };

        fetchSettlements();
    }, []);
    
    // Reset to page 0 when filters change
    React.useEffect(() => {
        setCurrentPage(0);
    }, [statusFilter, searchQuery]);

    // Memoize filtered settlements to avoid re-computation on every render
    const filteredSettlements = useMemo(() => {
        return settlements.filter((settlement) => {
            // Filter by status - use actual status from database
            if (statusFilter === "paid" && settlement.status !== "paid") {
                return false;
            }
            if (statusFilter === "pending" && settlement.status !== "pending") {
                return false;
            }
            if (statusFilter === "overdue" && settlement.status !== "overdue") {
                return false;
            }
            
            // Filter by search query
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            const firstName = (settlement.user?.first_name || '').toLowerCase();
            const lastName = (settlement.user?.last_name || '').toLowerCase();
            const email = (settlement.user?.email || '').toLowerCase();
            const studentId = (settlement.user?.student_id_number || '').toLowerCase();
            return firstName.includes(query) || lastName.includes(query) || 
                   email.includes(query) || studentId.includes(query);
        });
    }, [settlements, statusFilter, searchQuery]);
    
    // Memoize pagination calculations to avoid re-computation on every render
    const { paginatedSettlements, totalPages, hasNextPage, hasPrevPage } = useMemo(() => {
        const startIndex = currentPage * PAGE_SIZE;
        const endIndex = startIndex + PAGE_SIZE;
        const paginated = filteredSettlements.slice(startIndex, endIndex);
        const total = Math.max(1, Math.ceil(filteredSettlements.length / PAGE_SIZE));
        const hasNext = currentPage < total - 1;
        const hasPrev = currentPage > 0;
        return {
            paginatedSettlements: paginated,
            totalPages: total,
            hasNextPage: hasNext,
            hasPrevPage: hasPrev
        };
    }, [filteredSettlements, currentPage, PAGE_SIZE]);

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

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString();
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'paid': return '#10B981';
            case 'pending': return '#F59E0B';
            case 'overdue': return '#EF4444';
            default: return colors.text;
        }
    };

    const handleMarkAsPaid = async (settlement: Settlement) => {
        // Create a unique key for this settlement to track processing
        const settlementKey = `${settlement.user_id}-${settlement.period_start_date}-${settlement.period_end_date}`;
        
        // Prevent double-clicks by checking if already processing
        if (processingSettlementId === settlementKey) {
            return;
        }

        try {
            // Mark as processing immediately to disable button
            setProcessingSettlementId(settlementKey);
            
            // Note: Do NOT update local state here - wait for database confirmation
            // This prevents UI showing "paid" status when database update fails

            // First, try to find the settlement in the database
            // Try multiple methods since period dates might not match due to calculation differences
            let existingSettlement: any = null;
            let settlementId: string | undefined = undefined;
            
            // Method 1: Try by settlement ID if available
            if (settlement.id && settlement.id.trim() !== '') {
                const { data: settlementById, error: idError } = await supabase
                    .from('settlements')
                    .select('id, status, user_id, period_start_date, period_end_date, updated_at, paid_at')
                    .eq('id', settlement.id)
                    .maybeSingle();
                
                if (!idError && settlementById) {
                    existingSettlement = settlementById;
                    settlementId = settlementById.id;
                    console.log('✅ Found settlement by ID:', settlementById);
                }
            }
            
            // Method 2: Try by period dates (exact match)
            if (!existingSettlement) {
                const { data: settlementByPeriod, error: periodError } = await supabase
                .from('settlements')
                .select('id, status, user_id, period_start_date, period_end_date, updated_at, paid_at')
                .eq('user_id', settlement.user_id)
                .eq('period_start_date', settlement.period_start_date)
                .eq('period_end_date', settlement.period_end_date)
                .maybeSingle();

                if (!periodError && settlementByPeriod) {
                    existingSettlement = settlementByPeriod;
                    settlementId = settlementByPeriod.id;
                    console.log('✅ Found settlement by period dates:', settlementByPeriod);
                }
            }
            
            // Method 3: Try by matching earnings/transactions (period dates might differ)
            if (!existingSettlement) {
                const { data: allUserSettlements, error: allError } = await supabase
                    .from('settlements')
                    .select('id, status, user_id, period_start_date, period_end_date, updated_at, paid_at, total_earnings, total_transactions')
                    .eq('user_id', settlement.user_id);
                
                if (!allError && allUserSettlements) {
                    const matchingSettlement = allUserSettlements.find(s => 
                        Math.abs((parseFloat(s.total_earnings?.toString() || '0')) - settlement.total_earnings) < 0.01 &&
                        (s.total_transactions || 0) === settlement.total_transactions &&
                        (String(s.status || '').toLowerCase().trim() === 'pending' || String(s.status || '').toLowerCase().trim() === 'overdue')
                    );
                    
                    if (matchingSettlement) {
                        existingSettlement = matchingSettlement;
                        settlementId = matchingSettlement.id;
                        console.log('✅ Found settlement by earnings/transactions match:', {
                            found: matchingSettlement,
                            ui_period: `${settlement.period_start_date} - ${settlement.period_end_date}`,
                            db_period: `${matchingSettlement.period_start_date} - ${matchingSettlement.period_end_date}`
                        });
                    }
                }
            }

            console.log('🔍 Pre-update settlement state:', {
                found: !!existingSettlement,
                settlementId: settlementId,
                existingSettlement: existingSettlement ? {
                    id: existingSettlement.id,
                    status: existingSettlement.status,
                    normalizedStatus: existingSettlement.status ? String(existingSettlement.status).toLowerCase().trim() : 'null',
                    user_id: existingSettlement.user_id,
                    period: `${existingSettlement.period_start_date} - ${existingSettlement.period_end_date}`,
                    updated_at: existingSettlement.updated_at,
                    paid_at: existingSettlement.paid_at
                } : null,
                targetSettlement: {
                    id: settlement.id,
                    user_id: settlement.user_id,
                    period: `${settlement.period_start_date} - ${settlement.period_end_date}`,
                    currentStatus: settlement.status,
                    earnings: settlement.total_earnings,
                    transactions: settlement.total_transactions
                }
            });

            // If settlement doesn't exist, create it first
            if (!settlementId) {
                console.log('⚠️ Settlement not found in database, creating new one...');
                const { data: newSettlement, error: createError } = await supabase.rpc('create_or_update_settlement', {
                    p_user_id: settlement.user_id,
                    p_start_date: settlement.period_start_date,
                    p_end_date: settlement.period_end_date,
                });

                if (createError) {
                    console.error('❌ Error creating settlement via RPC:', createError);
                    // Try direct insert as fallback
                    const { data: insertedSettlement, error: insertError } = await supabase
                        .from('settlements')
                        .insert({
                            user_id: settlement.user_id,
                            period_start_date: settlement.period_start_date,
                            period_end_date: settlement.period_end_date,
                            total_earnings: settlement.total_earnings,
                            total_transactions: settlement.total_transactions,
                            system_fees: settlement.system_fees,
                            status: 'pending',
                            commission_ids: settlement.commission_ids || [],
                            errand_ids: settlement.errand_ids || [],
                        })
                        .select('id')
                        .single();
                    
                    if (insertError) {
                        console.error('❌ Error creating settlement via direct insert:', insertError);
                        throw insertError;
                    }
                    
                    if (insertedSettlement) {
                        settlementId = insertedSettlement.id;
                    } else {
                        throw new Error('Failed to create settlement: No ID returned');
                    }
                } else if (newSettlement) {
                settlementId = (newSettlement as any)?.id || '';
                }
            }

            // Update the settlement status to 'paid' and set paid_at
            // Use the unique constraint (user_id, period_start_date, period_end_date) for more reliable updates
            // This ensures the update works even if the ID lookup had issues
            const paidAtTimestamp = new Date().toISOString();
            
            // Log the exact values being used for the update to debug date format issues
            console.log('🔧 Updating settlement with exact values:', {
                user_id: settlement.user_id,
                period_start_date: settlement.period_start_date,
                period_end_date: settlement.period_end_date,
                period_start_date_type: typeof settlement.period_start_date,
                period_end_date_type: typeof settlement.period_end_date,
                paidAtTimestamp
            });
            
            let updatedSettlement: any = null;
            let updateError: any = null;
            
            // Try updating by ID first (most reliable)
            let updateResult: any = null;
            let updateErr: any = null;
            
            if (settlementId) {
                console.log('🔧 Attempting to update settlement by ID:', {
                    settlementId,
                    currentStatus: existingSettlement?.status,
                    targetStatus: 'paid'
                });
                
                const { data: updateById, error: errorById } = await supabase
                .from('settlements')
                .update({
                    status: 'paid',
                    paid_at: paidAtTimestamp,
                    updated_at: paidAtTimestamp,
                })
                    .eq('id', settlementId)
                    .in('status', ['pending', 'overdue']) // Only allow updating from pending or overdue
                .select('id, status, paid_at, updated_at, user_id, period_start_date, period_end_date')
                .single();

                console.log('🔧 Update by ID result:', {
                    success: !!updateById,
                    error: errorById,
                    rowsAffected: updateById ? 1 : 0,
                    updatedRow: updateById
                });

                updateResult = updateById;
                updateErr = errorById;
            }
            
            // If ID-based update failed, try by unique constraint (period dates)
            if (updateErr || !updateResult) {
                console.log('⚠️ Update by ID failed, trying by period dates...', {
                    error: updateErr,
                    hasResult: !!updateResult
                });
                
                const { data: updateByPeriod, error: errorByPeriod } = await supabase
                        .from('settlements')
                        .update({
                            status: 'paid',
                            paid_at: paidAtTimestamp,
                            updated_at: paidAtTimestamp,
                        })
                    .eq('user_id', settlement.user_id)
                    .eq('period_start_date', settlement.period_start_date)
                    .eq('period_end_date', settlement.period_end_date)
                    .in('status', ['pending', 'overdue']) // Only allow updating from pending or overdue
                        .select('id, status, paid_at, updated_at, user_id, period_start_date, period_end_date')
                        .single();
                    
                console.log('🔧 Update by period dates result:', {
                    success: !!updateByPeriod,
                    error: errorByPeriod,
                    updatedRow: updateByPeriod
                });
                    
                if (!errorByPeriod && updateByPeriod) {
                    updateResult = updateByPeriod;
                    updateErr = null;
                    settlementId = updateByPeriod.id; // Update settlementId for later use
                } else {
                    updateErr = errorByPeriod || updateErr;
                    console.error('❌ Update by period dates also failed:', errorByPeriod || updateErr);
                }
            }

            if (updateErr || !updateResult) {
                console.error('❌ Settlement update failed:', updateErr);
                throw updateErr || new Error('Failed to update settlement: No data returned');
            } else {
                updatedSettlement = updateResult;
            }
            
            // Verify the update was successful
            if (!updatedSettlement) {
                console.error('❌ No settlement returned from update');
                throw new Error('Failed to update settlement: No data returned');
            }
            
            // Call unlock function to check if account should be unlocked
            // (Trigger will also handle this, but explicit call ensures immediate unlock)
            try {
                const { error: unlockError } = await supabase.rpc('unlock_accounts_with_paid_settlements');
                if (unlockError) {
                    console.warn('⚠️ Error calling unlock function (non-critical):', unlockError);
                } else {
                    console.log('✅ Unlock function called successfully');
                }
            } catch (unlockErr) {
                console.warn('⚠️ Exception calling unlock function (non-critical):', unlockErr);
            }
            
            // Normalize status for comparison (handle case sensitivity)
            const normalizedStatus = String(updatedSettlement.status || '').toLowerCase().trim();
            if (normalizedStatus !== 'paid') {
                console.error('❌ Settlement status not paid after update:', {
                    expected: 'paid',
                    actual: updatedSettlement.status,
                    normalized: normalizedStatus,
                    settlementId: updatedSettlement.id,
                    userId: updatedSettlement.user_id
                });
                throw new Error(`Failed to update settlement status to paid. Current status: ${updatedSettlement.status}`);
            }
            
            console.log('✅ Settlement successfully updated to paid:', {
                settlementId: updatedSettlement.id,
                userId: updatedSettlement.user_id,
                period: `${updatedSettlement.period_start_date} - ${updatedSettlement.period_end_date}`,
                status: updatedSettlement.status,
                paidAt: updatedSettlement.paid_at,
                updatedAt: updatedSettlement.updated_at
            });
            
            // CRITICAL: Verify the update from the runner's perspective
            // Query EXACTLY as the login check does to ensure they can see the updated status
            // This helps catch RLS policy issues or caching problems
            console.log('🔍 Verifying settlement update from runner perspective (matching login query exactly)...');
            
            // Wait longer to ensure database transaction is fully committed and propagated
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // First, verify as admin (what we see)
            const { data: adminVerification, error: adminVerificationError } = await supabase
                .from('settlements')
                .select('id, status, user_id, period_start_date, period_end_date, updated_at, paid_at')
                .eq('user_id', settlement.user_id)
                .order('updated_at', { ascending: false })
                .limit(100);
            
            console.log('🔍 Admin verification (what admin sees):', {
                total: adminVerification?.length || 0,
                settlements: adminVerification?.map(s => ({
                    id: s.id,
                    status: s.status,
                    period: `${s.period_start_date} - ${s.period_end_date}`
                }))
            });
            
            // Query EXACTLY like the login check does (this will use runner's RLS if we could switch context)
            // Since we can't switch auth context, we'll query the same way but note it's as admin
            const { data: verificationSettlements, error: verificationError } = await supabase
                .from('settlements')
                .select('id, status, user_id, period_start_date, period_end_date, updated_at, paid_at')
                .eq('user_id', settlement.user_id)
                .order('updated_at', { ascending: false })
                .limit(100);
            
            // Log discrepancy if any
            if (adminVerification && verificationSettlements) {
                const adminCount = adminVerification.length;
                const verificationCount = verificationSettlements.length;
                if (adminCount !== verificationCount) {
                    console.warn('⚠️ SETTLEMENT COUNT MISMATCH:', {
                        adminSees: adminCount,
                        verificationSees: verificationCount,
                        difference: adminCount - verificationCount,
                        note: 'This might indicate RLS policy differences or missing settlements'
                    });
                }
            }
            
            if (verificationError) {
                console.error('❌ Verification query error:', verificationError);
            } else {
                const verificationPending = (verificationSettlements || []).filter(s => {
                    if (!s.status) return false;
                    return String(s.status).toLowerCase().trim() === 'pending';
                });
                
                const verificationPaid = (verificationSettlements || []).filter(s => {
                    if (!s.status) return false;
                    return String(s.status).toLowerCase().trim() === 'paid';
                });
                
                console.log('🔍 Verification Results:', {
                    totalSettlements: verificationSettlements?.length || 0,
                    pendingCount: verificationPending.length,
                    paidCount: verificationPaid.length,
                    allSettlements: verificationSettlements?.map(s => ({
                        id: s.id,
                        status: s.status,
                        normalizedStatus: s.status ? String(s.status).toLowerCase().trim() : 'null',
                        period: `${s.period_start_date} - ${s.period_end_date}`,
                        updated_at: s.updated_at,
                        paid_at: s.paid_at
                    })),
                    targetSettlement: verificationSettlements?.find(s => 
                        s.period_start_date === settlement.period_start_date &&
                        s.period_end_date === settlement.period_end_date
                    )
                });
                
                // Check if the specific settlement we updated is actually paid
                const targetSettlement = verificationSettlements?.find(s => 
                    s.period_start_date === settlement.period_start_date &&
                    s.period_end_date === settlement.period_end_date
                );
                
                if (targetSettlement) {
                    const targetStatus = String(targetSettlement.status || '').toLowerCase().trim();
                    if (targetStatus !== 'paid') {
                        console.error('❌ CRITICAL: Target settlement is NOT paid after update!', {
                            expected: 'paid',
                            actual: targetSettlement.status,
                            normalized: targetStatus,
                            settlementId: targetSettlement.id
                        });
                        throw new Error(`Verification failed: Settlement status is still ${targetSettlement.status}, not 'paid'`);
                    } else {
                        console.log('✅ Verification PASSED: Target settlement is confirmed as paid');
                    }
                } else {
                    console.warn('⚠️ Target settlement not found in verification query');
                }
                
                // Warn if there are other pending settlements
                if (verificationPending.length > 0) {
                    console.warn('⚠️ WARNING: User has other pending settlements that will still block access:', {
                        pendingSettlements: verificationPending.map(s => ({
                            id: s.id,
                            period: `${s.period_start_date} - ${s.period_end_date}`,
                            status: s.status,
                            normalizedStatus: s.status ? String(s.status).toLowerCase().trim() : 'null'
                        }))
                    });
                    
                    // Show detailed breakdown
                    console.warn('⚠️ DETAILED PENDING SETTLEMENTS:', {
                        count: verificationPending.length,
                        details: verificationPending.map(s => ({
                            id: s.id,
                            user_id: s.user_id,
                            period_start_date: s.period_start_date,
                            period_end_date: s.period_end_date,
                            status: s.status,
                            normalizedStatus: s.status ? String(s.status).toLowerCase().trim() : 'null',
                            updated_at: s.updated_at,
                            paid_at: s.paid_at
                        }))
                    });
                } else {
                    console.log('✅ No pending settlements found - user should be able to log in');
                }
            }
            
            // Update settlementId from the returned data to ensure we have the correct ID
            if (updatedSettlement.id) {
                settlementId = updatedSettlement.id;
            }

            // Update local state ONLY after database update succeeds
            // This ensures UI reflects database truth
            if (updatedSettlement && updatedSettlement.status === 'paid') {
                console.log('✅ Updating local state with confirmed paid status');
                setSettlements(prevSettlements =>
                    prevSettlements.map(s =>
                        s.user_id === settlement.user_id &&
                        s.period_start_date === settlement.period_start_date &&
                        s.period_end_date === settlement.period_end_date
                            ? {
                                  ...s,
                                  id: updatedSettlement.id || s.id,
                                  status: 'paid' as const,
                                  paid_at: updatedSettlement.paid_at || new Date().toISOString(),
                                  updated_at: updatedSettlement.updated_at || new Date().toISOString(),
                              }
                            : s
                    )
                );
            } else {
                console.warn('⚠️ Not updating local state - settlement status is not confirmed as paid');
            }

            // Final check: Warn admin if user has multiple settlements
            // Also check if there's a discrepancy in settlement counts
            // Get the count from the verification query which shows all settlements for the user
            const totalFromVerification = verificationSettlements?.length || 0;
            const totalFromAdminVerification = adminVerification?.length || 0;
            
            if (totalFromAdminVerification !== totalFromVerification) {
                console.error('❌ CRITICAL: Settlement count mismatch detected!', {
                    adminSees: totalFromAdminVerification,
                    verification: totalFromVerification,
                    difference: totalFromAdminVerification - totalFromVerification,
                    warning: 'Some settlements may not be visible to the runner due to RLS or other issues'
                });
                
                Alert.alert(
                    'Settlement Marked as Paid',
                    `This settlement has been marked as paid successfully.\n\n⚠️ WARNING: Settlement count mismatch detected (admin sees ${totalFromAdminVerification}, verification shows ${totalFromVerification}). There may be settlements not visible to the runner. Please check the database directly or have the runner try logging in after a few seconds.`,
                    [{ text: 'OK' }]
                );
            } else if (verificationSettlements && verificationSettlements.length > 1) {
                const stillPending = verificationSettlements.filter(s => {
                    if (!s.status) return false;
                    return String(s.status).toLowerCase().trim() === 'pending';
                });
                
                if (stillPending.length > 0) {
                    Alert.alert(
                        'Settlement Marked as Paid',
                        `This settlement has been marked as paid successfully.\n\n⚠️ WARNING: This user has ${stillPending.length} other pending settlement(s) that will still block their account access. Please mark all settlements as paid to restore full access.`,
                        [{ text: 'OK' }]
                    );
                } else {
                    Alert.alert(
                        'Success', 
                        'Settlement marked as paid successfully. All settlements for this user are now paid. The user should be able to log in. If they still cannot, please wait a few seconds for the database to update, then have them try again.',
                        [{ text: 'OK' }]
                    );
                }
            } else {
                Alert.alert(
                    'Success', 
                    'Settlement marked as paid successfully. The user should be able to log in. If they still cannot, please wait a few seconds for the database to update, then have them try again.',
                    [{ text: 'OK' }]
                );
            }
        } catch (error) {
            console.error('❌ Error marking settlement as paid:', error);
            
            // Note: No need to revert local state since we never optimistically updated it
            // The UI will continue to show the current database state
            
            Alert.alert(
                'Error', 
                `Failed to mark settlement as paid. ${error instanceof Error ? error.message : 'Please check the console for details.'}`
            );
        } finally {
            // Clear processing state
            setProcessingSettlementId(null);
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
                {/* Sidebar Overlay on small screens */}
                {(isSmall && sidebarOpen) && (
                    <View 
                        style={[styles.sidebarOverlay, { width: screenWidth }]}
                        onTouchEnd={() => setSidebarOpen(false)}
                    />
                )}
                
                <Sidebar
                    open={sidebarOpen}
                    onToggle={() => setSidebarOpen((v) => !v)}
                    onLogout={() => setConfirmLogout(true)}
                    userName={fullName}
                    activeRoute="settlements"
                    isSmall={isSmall}
                />
                
                <View style={styles.mainArea}>
                    <View style={styles.topBar}>
                        <Text style={[styles.welcome, isSmall && styles.welcomeSmall]}>Settlements Management</Text>
                    </View>

                    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
                        <View style={[styles.content, isSmall && styles.contentSmall]}>
                            <View style={[styles.searchContainer, isSmall && styles.searchContainerSmall]}>
                                <Ionicons name="search-outline" size={isSmall ? 18 : 20} color={colors.text} style={{ opacity: 0.6 }} />
                                <TextInput
                                    style={[styles.searchInput, isSmall && styles.searchInputSmall]}
                                    placeholder="Search by name, email, or student ID..."
                                    placeholderTextColor="#999"
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                                {searchQuery.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearchQuery("")}>
                                        <Ionicons name="close-circle" size={isSmall ? 18 : 20} color={colors.text} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View style={styles.filterContainer}>
                                <TouchableOpacity
                                    style={[
                                        styles.filterButton,
                                        statusFilter === "pending" && styles.filterButtonActive
                                    ]}
                                    onPress={() => setStatusFilter("pending")}
                                >
                                    <Text style={[
                                        styles.filterButtonText,
                                        statusFilter === "pending" && styles.filterButtonTextActive
                                    ]}>
                                        Pending
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.filterButton,
                                        statusFilter === "paid" && styles.filterButtonActive
                                    ]}
                                    onPress={() => setStatusFilter("paid")}
                                >
                                    <Text style={[
                                        styles.filterButtonText,
                                        statusFilter === "paid" && styles.filterButtonTextActive
                                    ]}>
                                        Paid
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.filterButton,
                                        statusFilter === "overdue" && styles.filterButtonActive
                                    ]}
                                    onPress={() => setStatusFilter("overdue")}
                                >
                                    <Text style={[
                                        styles.filterButtonText,
                                        statusFilter === "overdue" && styles.filterButtonTextActive
                                    ]}>
                                        Overdue
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {loadingSettlements ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <ActivityIndicator size="large" color={colors.maroon} />
                                </View>
                            ) : filteredSettlements.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Ionicons name="receipt-outline" size={48} color={colors.border} />
                                    <Text style={styles.emptyStateText}>
                                        {searchQuery ? 'No settlements found matching your search.' : 'No settlements found for this period.'}
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    <Text style={[styles.resultsCount, isSmall && styles.resultsCountSmall]}>
                                        {filteredSettlements.length} {filteredSettlements.length === 1 ? 'settlement' : 'settlements'}
                                    </Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                        <View style={[styles.tableContainer, isSmall && styles.tableContainerSmall]}>
                                            <View style={styles.tableHeader}>
                                                <Text style={[styles.tableHeaderText, styles.tableCellName]} numberOfLines={1} ellipsizeMode="tail">Student Name</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellId]} numberOfLines={1} ellipsizeMode="tail">Student ID</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellDate]} numberOfLines={1} ellipsizeMode="tail">Date</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellTransactions, styles.headerCenter]} numberOfLines={1} ellipsizeMode="tail">Total Trans</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellErrandTransactions, styles.headerCenter]} numberOfLines={1} ellipsizeMode="tail">Errands</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellCommissionTransactions, styles.headerCenter]} numberOfLines={1} ellipsizeMode="tail">Commissions</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellEarnings, styles.headerCenter]}>Total Earnings</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellFees, styles.headerCenter]}>System Fees</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellStatus]} numberOfLines={1} ellipsizeMode="tail">Status</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellPaidAt, styles.headerCenter]}>Paid at</Text>
                                                <Text style={[styles.tableHeaderText, styles.tableCellActions]} numberOfLines={1} ellipsizeMode="tail">Actions</Text>
                                            </View>
                                            <FlatList
                                                data={paginatedSettlements}
                                                renderItem={({ item: settlement, index }) => (
                                                    <SettlementRow 
                                                        settlement={settlement} 
                                                        index={index}
                                                        onMarkAsPaid={handleMarkAsPaid}
                                                        processingSettlementId={processingSettlementId}
                                                    />
                                                )}
                                                keyExtractor={(settlement) => `${settlement.user_id}-${settlement.period_start_date}`}
                                                initialNumToRender={10}
                                                windowSize={5}
                                                removeClippedSubviews={true}
                                                scrollEnabled={false}
                                            />
                                        </View>
                                    </ScrollView>
                                    
                                    {/* Pagination Controls */}
                                    {totalPages > 1 && (
                                        <View style={styles.paginationContainer}>
                                            <TouchableOpacity
                                                style={[styles.paginationButton, !hasPrevPage && styles.paginationButtonDisabled]}
                                                onPress={() => hasPrevPage && setCurrentPage(prev => prev - 1)}
                                                disabled={!hasPrevPage}
                                                activeOpacity={0.7}
                                            >
                                                <Ionicons name="chevron-back" size={16} color={hasPrevPage ? colors.text : colors.border} />
                                                <Text style={[styles.paginationButtonText, !hasPrevPage && styles.paginationButtonTextDisabled]}>
                                                    Previous
                                                </Text>
                                            </TouchableOpacity>
                                            
                                            <Text style={styles.paginationInfo}>
                                                Page {currentPage + 1} of {totalPages}
                                            </Text>
                                            
                                            <TouchableOpacity
                                                style={[styles.paginationButton, !hasNextPage && styles.paginationButtonDisabled]}
                                                onPress={() => hasNextPage && setCurrentPage(prev => prev + 1)}
                                                disabled={!hasNextPage}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={[styles.paginationButtonText, !hasNextPage && styles.paginationButtonTextDisabled]}>
                                                    Next
                                                </Text>
                                                <Ionicons name="chevron-forward" size={16} color={hasNextPage ? colors.text : colors.border} />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </View>

            {confirmLogout && (
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, isSmall && styles.modalCardSmall]}>
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

function SettlementRow({ settlement, index, onMarkAsPaid, processingSettlementId }: { settlement: Settlement; index: number; onMarkAsPaid: (settlement: Settlement) => Promise<void>; processingSettlementId: string | null }) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'paid': return '#10B981';
            case 'pending': return '#F59E0B';
            case 'overdue': return '#EF4444';
            default: return colors.text;
        }
    };

    const firstName = settlement.user?.first_name || '';
    const lastName = settlement.user?.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'N/A';
    const studentId = settlement.user?.student_id_number || 'N/A';
    const rowStyle = index % 2 === 0 ? styles.tableRow : styles.tableRowAlternate;

    const formatDateRange = (startDate: string, endDate: string) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const formatDate = (date: Date) => {
            return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
        };
        return `${formatDate(start)} - ${formatDate(end)}`;
    };

    const errandTransactionsCount = settlement.errand_ids?.length || 0;
    const commissionTransactionsCount = settlement.commission_ids?.length || 0;

    return (
        <View style={rowStyle}>
            <Text style={[styles.tableCellText, styles.tableCellName]} numberOfLines={1} ellipsizeMode="tail">{fullName}</Text>
            <Text style={[styles.tableCellText, styles.tableCellId]} numberOfLines={1} ellipsizeMode="tail">{studentId}</Text>
            <Text style={[styles.tableCellText, styles.tableCellDate]} numberOfLines={1} ellipsizeMode="tail">{formatDateRange(settlement.period_start_date, settlement.period_end_date)}</Text>
            <Text style={[styles.tableCellText, styles.tableCellTransactions, { textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">{settlement.total_transactions}</Text>
            <Text style={[styles.tableCellText, styles.tableCellErrandTransactions, { textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">{errandTransactionsCount}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCommissionTransactions, { textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">{commissionTransactionsCount}</Text>
            <Text style={[styles.tableCellText, styles.tableCellEarnings, { textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">₱{settlement.total_earnings.toFixed(2)}</Text>
            <Text style={[styles.tableCellText, styles.tableCellFees, { fontWeight: '700', color: settlement.system_fees > 0 ? '#10B981' : colors.text, textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">₱{settlement.system_fees.toFixed(2)}</Text>
            <Text style={[styles.tableCellText, styles.tableCellStatus, { color: getStatusColor(settlement.status), textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">{settlement.status.charAt(0).toUpperCase() + settlement.status.slice(1)}</Text>
            <Text style={[styles.tableCellText, styles.tableCellPaidAt, { textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">
                {settlement.paid_at ? new Date(settlement.paid_at).toLocaleString() : 'N/A'}
            </Text>
            <View style={styles.tableCellActions}>
                {(settlement.status === 'pending' || settlement.status === 'overdue') ? (
                    (() => {
                        const settlementKey = `${settlement.user_id}-${settlement.period_start_date}-${settlement.period_end_date}`;
                        const isProcessing = processingSettlementId === settlementKey;
                        return (
                            <TouchableOpacity
                                style={[styles.markPaidButton, isProcessing && styles.markPaidButtonDisabled]}
                                onPress={() => onMarkAsPaid(settlement)}
                                activeOpacity={0.7}
                                disabled={isProcessing}
                            >
                                {isProcessing ? (
                                    <>
                                        <ActivityIndicator size="small" color="#fff" style={{ marginRight: 5 }} />
                                        <Text style={styles.markPaidButtonText}>Processing...</Text>
                                    </>
                                ) : (
                                    <>
                                        <Ionicons name="checkmark-circle" size={14} color="#fff" style={{ marginRight: 3 }} />
                                        <Text style={styles.markPaidButtonText}>Mark as Paid</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        );
                    })()
                ) : settlement.status === 'paid' ? (
                    <View style={styles.paidIndicator}>
                        <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        <Text style={styles.paidText}>Paid</Text>
                    </View>
                ) : null}
            </View>
        </View>
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
    sidebarOverlay: {
        position: 'absolute' as any,
        top: 0,
        left: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 999,
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
    welcomeSmall: {
        fontSize: 16,
    },
    content: {
        width: "100%",
        maxWidth: 1200,
        alignSelf: "center",
        paddingHorizontal: 24,
        paddingVertical: 24,
        backgroundColor: "#fff",
    },
    contentSmall: {
        paddingHorizontal: 16,
        paddingVertical: 16,
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
    searchContainerSmall: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 16,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: colors.text,
    },
    searchInputSmall: {
        fontSize: 13,
    },
    resultsCount: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
        marginBottom: 16,
        opacity: 0.7,
    },
    resultsCountSmall: {
        fontSize: 13,
        marginBottom: 12,
    },
    tableContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: "#fff",
        overflow: "hidden",
        minWidth: 1200,
    },
    tableContainerSmall: {
        minWidth: Math.max(1260, 800), // Ensure minimum width for small screens
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: colors.faint,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 16,
        alignItems: "center",
        minHeight: 56,
    },
    tableHeaderText: {
        color: colors.text,
        fontSize: 13,
        fontWeight: "700",
        letterSpacing: 0.2,
        flexShrink: 0,
    },
    headerCenter: {
        textAlign: "center",
    },
    tableRow: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 16,
        alignItems: "center",
        minHeight: 56,
        backgroundColor: "#fff",
    },
    tableRowAlternate: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 16,
        alignItems: "center",
        minHeight: 56,
        backgroundColor: "#F5F5F5",
    },
    tableCellText: {
        color: colors.text,
        fontSize: 13,
        lineHeight: 20,
    },
    tableCellName: {
        width: 160,
        paddingLeft: 4,
        paddingRight: 10,
        fontWeight: "600",
    },
    tableCellId: {
        width: 110,
        paddingLeft: 4,
        paddingRight: 10,
    },
    tableCellDate: {
        width: 170,
        paddingLeft: 4,
        paddingRight: 10,
    },
    tableCellTransactions: {
        width: 110,
        paddingLeft: 4,
        paddingRight: 10,
        textAlign: "center",
    },
    tableCellErrandTransactions: {
        width: 100,
        paddingLeft: 4,
        paddingRight: 10,
        textAlign: "center",
    },
    tableCellCommissionTransactions: {
        width: 120,
        paddingLeft: 4,
        paddingRight: 10,
        textAlign: "center",
    },
    tableCellEarnings: {
        width: 120,
        paddingLeft: 4,
        paddingRight: 10,
        textAlign: "center",
    },
    tableCellFees: {
        width: 110,
        paddingLeft: 4,
        paddingRight: 10,
        textAlign: "center",
    },
    tableCellNet: {
        width: 120,
        paddingLeft: 4,
        paddingRight: 16,
        textAlign: "center",
    },
    tableCellStatus: {
        width: 85,
        paddingLeft: 4,
        paddingRight: 16,
        textAlign: "center",
        fontWeight: "600",
    },
    tableCellPaidAt: {
        width: 160,
        paddingLeft: 4,
        paddingRight: 12,
        textAlign: "center",
    },
    tableCellActions: {
        width: 140,
        paddingLeft: 4,
        paddingRight: 4,
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
    },
    markPaidButton: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F59E0B",
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: "#F59E0B",
    },
    markPaidButtonDisabled: {
        backgroundColor: "#6B7280",
        borderColor: "#6B7280",
        opacity: 0.7,
    },
    markPaidButtonText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "600",
    },
    paidIndicator: {
        flexDirection: "row",
        alignItems: "center",
    },
    paidText: {
        color: "#10B981",
        fontSize: 12,
        fontWeight: "600",
        marginLeft: 4,
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
    paginationContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        marginTop: 24,
        paddingVertical: 12,
    },
    paginationButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "#fff",
    },
    paginationButtonDisabled: {
        opacity: 0.5,
        backgroundColor: colors.faint,
    },
    paginationButtonText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
    },
    paginationButtonTextDisabled: {
        color: colors.border,
    },
    paginationInfo: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
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
    modalCardSmall: {
        width: "90%",
        padding: 20,
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
});


