import { Stack } from "expo-router";
import { Platform } from "react-native";
import { supabase } from "../../lib/supabase";
import IdStatusModal from "../../components/IdStatusModalWeb";
import GlobalTaskCompletionModal from "../../components/GlobalTaskCompletionModal";
import GlobalTaskCompletionModalWeb from "../../components/GlobalTaskCompletionModalWeb";
import SimpleTaskApprovalModal from "../../components/SimpleTaskApprovalModal";
import SimpleTaskApprovalModalWeb from "../../components/SimpleTaskApprovalModalWeb";
import GlobalInvoiceAcceptanceModal from "../../components/GlobalInvoiceAcceptanceModal";
import { invoiceAcceptanceService } from "../../services/InvoiceAcceptanceService";
import { useEffect, useState, createContext, useContext, useCallback, useRef } from "react";
import { globalNotificationService } from "../../services/GlobalNotificationService";
import { useRouter } from "expo-router";

// Global notification badge context
interface NotificationBadgeContextType {
    unreadCount: number;
    incrementUnread: () => void;
    clearUnread: () => void;
}

const NotificationBadgeContext = createContext<NotificationBadgeContextType>({
    unreadCount: 0,
    incrementUnread: () => {},
    clearUnread: () => {},
});

export const useNotificationBadge = () => useContext(NotificationBadgeContext);

export default function BuddyrunnerLayout() {
    const router = useRouter();
    const [showPendingIdModal, setShowPendingIdModal] = useState(false);
    const [showDisapprovedIdModal, setShowDisapprovedIdModal] = useState(false);
    
    // Global notification badge state - computed from database
    const [unreadCount, setUnreadCount] = useState(0);
    
    // Compute badge count from database (source of truth)
    // Memoized to prevent stale closures in subscription handlers
    const computeBadgeCount = useCallback(async (userId: string) => {
        try {
            // Count pending commissions assigned to this runner
            const { count: commissionCount } = await supabase
                .from('commission')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending')
                .eq('notified_runner_id', userId);
            
            // Count pending errands assigned to this runner
            const { count: errandCount } = await supabase
                .from('errand')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending')
                .eq('notified_runner_id', userId);
            
            const total = (commissionCount || 0) + (errandCount || 0);
            setUnreadCount(total);
        } catch (error) {
            console.warn('🔔 [BADGE] Error computing badge count:', error);
        }
    }, []); // Empty deps: setUnreadCount is stable, supabase is stable
    
    const incrementUnread = () => {
        // Optional: Increment for realtime UI hint, but refresh from DB to ensure accuracy
        setUnreadCount(prev => prev + 1);
        // Refresh from DB after a short delay to sync with actual state
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user?.id) {
                setTimeout(() => computeBadgeCount(user.id), 500);
            }
        });
    };
    
    const clearUnread = () => {
        setUnreadCount(0);
    };
    
    // Global authentication guard for blocked users
    useEffect(() => {
        const checkUserStatus = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('is_blocked, is_settlement_blocked, id_image_approved, id_image_path, role')
                    .eq('id', user.id)
                    .maybeSingle();

                // If user doesn't exist yet (new registration), allow them to continue
                // They'll complete registration on account_confirm page
                if (userError && userError.code === 'PGRST116') {
                    console.log('Layout: User record not found yet (new registration), allowing to continue');
                    return;
                }

                // If there's another error, log it but don't block
                if (userError) {
                    console.warn('Layout: Error checking user status:', userError);
                    return;
                }

                // Only redirect if user is blocked (disciplinary or settlement-based)
                if (userData?.is_blocked || userData?.is_settlement_blocked) {
                    console.log('Layout: User is blocked, logging out...');
                    await supabase.auth.signOut();
                    router.replace('/login');
                    return;
                }

                // SECURITY: Check ID approval status for non-admin users
                if (userData && userData.role !== 'admin') {
                    if (userData.id_image_path) {
                        if (userData.id_image_approved === false) {
                            console.log('Layout: User ID disapproved, logging out...');
                            setShowDisapprovedIdModal(true);
                            await supabase.auth.signOut();
                            router.replace('/login');
                            return;
                        }
                        
                        if (userData.id_image_approved === null) {
                            console.log('Layout: User ID pending approval, logging out...');
                            setShowPendingIdModal(true);
                            await supabase.auth.signOut();
                            router.replace('/login');
                            return;
                        }
                    } else {
                        // User hasn't uploaded ID - block access
                        console.log('Layout: User has no ID image, logging out...');
                        setShowPendingIdModal(true);
                        await supabase.auth.signOut();
                        router.replace('/login');
                        return;
                    }
                }
            } catch (error) {
                console.error('Layout: Error checking user status:', error);
            }
        };

        checkUserStatus();
        
        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                await checkUserStatus();
            }
        });

        return () => subscription.unsubscribe();
    }, [router]);
    
    // Compute badge count from database on auth state change
    useEffect(() => {
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user?.id) {
                await computeBadgeCount(session.user.id);
            } else {
                setUnreadCount(0);
            }
        });
        
        // Also compute on initial mount
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user?.id) {
                computeBadgeCount(user.id);
            }
        });
        
        return () => {
            authListener?.subscription?.unsubscribe();
        };
    }, []);
    
    // Subscribe to notification channels using onAuthStateChange (INITIAL_SESSION)
    // CRITICAL: Use refs to prevent duplicate subscriptions per login session
    const subscriptionInitializedRef = useRef<string | null>(null);
    const commissionNotifyChannelRef = useRef<ReturnType<typeof supabase.channel> | undefined>(undefined);
    const errandNotifyChannelRef = useRef<ReturnType<typeof supabase.channel> | undefined>(undefined);
    const authListenerRef = useRef<ReturnType<typeof supabase.auth.onAuthStateChange>['data'] | undefined>(undefined);

    useEffect(() => {
        // Cleanup function to remove all subscriptions
        const cleanupSubscriptions = () => {
            if (commissionNotifyChannelRef.current) {
                supabase.removeChannel(commissionNotifyChannelRef.current);
                commissionNotifyChannelRef.current = undefined;
            }
            if (errandNotifyChannelRef.current) {
                supabase.removeChannel(errandNotifyChannelRef.current);
                errandNotifyChannelRef.current = undefined;
            }
            if (authListenerRef.current?.subscription) {
                authListenerRef.current.subscription.unsubscribe();
                authListenerRef.current = undefined;
            }
            subscriptionInitializedRef.current = null;
        };

        // Set up auth state listener (only once)
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
            const userId = session?.user?.id;

            // Handle logout: cleanup all subscriptions
            if (!userId) {
                cleanupSubscriptions();
                setUnreadCount(0);
                return;
            }

            // GUARD: Only create subscriptions once per user session
            // Prevent duplicate subscriptions if onAuthStateChange fires multiple times
            if (subscriptionInitializedRef.current === userId) {
                console.log('🔔 [SUBSCRIPTION] Already initialized for user, skipping duplicate setup');
                return;
            }

            // Cleanup any existing subscriptions before creating new ones
            cleanupSubscriptions();

            // Mark as initialized for this user
            subscriptionInitializedRef.current = userId;
            authListenerRef.current = authListener;

            console.log(`🔔 [SUBSCRIPTION] Initializing notification channels for user: ${userId}`);

            // Commission notification channel (created once per session)
            commissionNotifyChannelRef.current = supabase
                .channel(`commission_notify_${userId}`)
                .on('broadcast', { event: 'commission_notification' }, async (payload: any) => {
                    try {
                        const notification = payload?.payload;
                        if (notification) {
                            // Fetch caller details
                            const { data: callerData } = await supabase
                                .from('users')
                                .select('first_name, last_name, profile_picture_url')
                                .eq('id', notification.caller_id)
                                .single();
                            
                            const callerName = callerData
                                ? `${callerData.first_name || ''} ${callerData.last_name || ''}`.trim() || 'BuddyCaller'
                                : 'BuddyCaller';
                            
                            // Create notification object
                            const { createNotificationFromCommission } = await import('./notification');
                            const notif = createNotificationFromCommission(
                                {
                                    id: notification.commission_id,
                                    title: notification.commission_title,
                                    created_at: notification.assigned_at,
                                },
                                callerName,
                                callerData?.profile_picture_url
                            );
                            
                            // Refresh badge count from database (source of truth)
                            await computeBadgeCount(userId);
                            
                            // Dispatch custom event for notification screen
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('commission_notification_received', { detail: notif }));
                            }
                        }
                    } catch (e) {
                        console.warn('🔔 [COMMISSION BROADCAST] Error handling broadcast:', e);
                    }
                })
                .subscribe();

            // Errand notification channel (created once per session)
            errandNotifyChannelRef.current = supabase
                .channel(`errand_notify_${userId}`)
                .on('broadcast', { event: 'errand_notification' }, async (payload: any) => {
                    try {
                        const notification = payload?.payload;
                        if (notification) {
                            // Fetch caller details
                            const { data: callerData } = await supabase
                                .from('users')
                                .select('first_name, last_name, profile_picture_url')
                                .eq('id', notification.caller_id)
                                .single();
                            
                            const callerName = callerData
                                ? `${callerData.first_name || ''} ${callerData.last_name || ''}`.trim() || 'BuddyCaller'
                                : 'BuddyCaller';
                            
                            // Create notification object
                            const { createNotificationFromErrand } = await import('./notification');
                            const notif = createNotificationFromErrand(
                                {
                                    id: notification.errand_id,
                                    title: notification.errand_title,
                                    created_at: notification.assigned_at,
                                },
                                callerName,
                                callerData?.profile_picture_url
                            );
                            
                            // CRITICAL: Always call computeBadgeCount to update badge state
                            await computeBadgeCount(userId);
                            
                            // Dispatch custom event for notification screen
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('errand_notification_received', { detail: notif }));
                            }
                        }
                    } catch (e) {
                        console.warn('🔔 [ERRAND BROADCAST] Error handling broadcast:', e);
                    }
                })
                .subscribe();

            console.log(`🔔 [SUBSCRIPTION] Notification channels initialized for user: ${userId}`);
        });

        // Store auth listener for cleanup
        authListenerRef.current = authListener;

        // Cleanup on unmount
        return () => {
            console.log('🔔 [SUBSCRIPTION] Cleaning up notification channels');
            cleanupSubscriptions();
        };
    }, [computeBadgeCount]); // computeBadgeCount is stable (memoized), so this effect runs once
    
    useEffect(() => {
        console.log('BuddyrunnerLayout: Setting up global notification service');
        
        // Deduplication: Track processed commission and errand IDs to prevent duplicate notifications
        const processedCommissions = new Set<number>();
        const processedErrands = new Set<number>();
        
        // Add test functions to window for debugging
        if (typeof window !== 'undefined') {
            (window as any).testApprovalNotification = () => {
                globalNotificationService.testApprovalNotification();
            };
            (window as any).checkApprovalListeners = () => {
                // Test function - logs removed
            };
            (window as any).testDirectApproval = () => {
                const testNotification = {
                    id: `test_direct_${Date.now()}`,
                    commissionId: 999,
                    commissionTitle: 'Test Direct Commission',
                    callerName: 'Test Direct Caller',
                    callerId: 'test-direct-caller-id',
                    runnerId: 'test-runner-id',
                    timestamp: new Date().toISOString()
                };
                globalNotificationService.notifyTaskApproval(testNotification);
            };
            (window as any).testSimpleApproval = () => {
                const { approvalModalService } = require('../../services/ApprovalModalService');
                approvalModalService.testNotification();
            };
            (window as any).testDirectSimpleApproval = () => {
                const { approvalModalService } = require('../../services/ApprovalModalService');
                const testNotification = {
                    id: `direct_test_${Date.now()}`,
                    commissionId: 888,
                    commissionTitle: 'Direct Test Commission',
                    callerName: 'Direct Test Caller',
                    callerId: 'direct-test-caller-id',
                    runnerId: 'direct-test-runner-id',
                    timestamp: new Date().toISOString()
                };
                approvalModalService.notifyApproval(testNotification);
            };
            (window as any).testRealApprovalFlow = () => {
                const { approvalModalService } = require('../../services/ApprovalModalService');
                const { globalNotificationService } = require('../../services/GlobalNotificationService');
                
                const realNotification = {
                    id: `approval_${Date.now()}`,
                    commissionId: 123,
                    commissionTitle: 'Real Test Commission',
                    callerName: 'Real Test Caller',
                    callerId: 'real-test-caller-id',
                    runnerId: 'real-test-runner-id',
                    timestamp: new Date().toISOString()
                };
                
                globalNotificationService.notifyTaskApproval(realNotification);
                approvalModalService.notifyApproval(realNotification);
            };
            (window as any).checkSimpleApprovalListeners = () => {
                const { approvalModalService } = require('../../services/ApprovalModalService');
                // Test function - logs removed
            };
            (window as any).testMobileApproval = () => {
                const { approvalModalService } = require('../../services/ApprovalModalService');
                const mobileNotification = {
                    id: `mobile_test_${Date.now()}`,
                    commissionId: 777,
                    commissionTitle: 'Mobile Test Commission',
                    callerName: 'Mobile Test Caller',
                    callerId: 'mobile-test-caller-id',
                    runnerId: 'mobile-test-runner-id',
                    timestamp: new Date().toISOString()
                };
                approvalModalService.notifyApproval(mobileNotification);
            };
            
        }
        
        // Set up real-time subscription for task completion notifications
        let cleanup: (() => void) | undefined;
        try {
            cleanup = globalNotificationService.setupRealtimeSubscription();
            console.log('BuddyrunnerLayout: Global notification service setup complete');
        } catch (error) {
            console.warn('BuddyrunnerLayout: Failed to setup global notification service - this is not critical for task approvals:', error);
        }

        // CRITICAL FIX: Bridge GlobalNotificationService approvals to ApprovalModalService
        // This is what was missing - the modal listens to ApprovalModalService, but the realtime
        // notifications come through GlobalNotificationService. We need to forward them.
        console.log('BuddyrunnerLayout: Setting up approval bridge from GlobalNotificationService to ApprovalModalService');
        const { approvalModalService } = require('../../services/ApprovalModalService');
        
        const unsubscribeApproval = globalNotificationService.subscribeApproval((notification) => {
            console.log('BuddyrunnerLayout: Received approval notification from GlobalNotificationService:', notification);
            if (notification) {
                console.log('BuddyrunnerLayout: Forwarding to ApprovalModalService');
                approvalModalService.notifyApproval(notification);
            }
        });

        // Task approvals channel (keep existing)
        let approvalsChannelCleanup: (() => void) | undefined;
        supabase.auth.getSession().then(({ data: { session } }) => {
            const currentUserId = session?.user?.id;
            if (!currentUserId) return;
            
            const approvalsChannelName = `task_approvals_${currentUserId}`;
            const approvalsChannel = supabase
                .channel(approvalsChannelName)
                .on('broadcast', { event: 'task_approval' }, (payload: any) => {
                    try {
                        const approval = payload?.payload;
                        if (approval) {
                            const { approvalModalService } = require('../../services/ApprovalModalService');
                            approvalModalService.notifyApproval(approval);
                        }
                    } catch (e) {
                        console.warn('BuddyrunnerLayout: Error handling approval broadcast:', e);
                    }
                })
                .subscribe();

            approvalsChannelCleanup = () => {
                try {
                    supabase.removeChannel(approvalsChannel);
                } catch (e) {
                    console.warn('BuddyrunnerLayout: Error removing approvals channel:', e);
                }
            };
        });

        return () => {
            console.log('BuddyrunnerLayout: Cleaning up subscriptions');
            if (cleanup) {
                cleanup();
            }
            if (unsubscribeApproval) {
                unsubscribeApproval();
            }
            if (approvalsChannelCleanup) {
                approvalsChannelCleanup();
            }
        };
    }, []);

    // Runner presence heartbeat: Update last_seen_at while app is active
    // HEARTBEAT INTERVAL: Currently updates every 60 seconds
    // PRESENCE THRESHOLD: Eligibility queries use 75s threshold (buffered to prevent flapping)
    // This ensures runners remain visible between heartbeat updates (60s interval < 75s threshold)
    useEffect(() => {
        let presenceInterval: ReturnType<typeof setInterval> | null = null;

        const updatePresence = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user?.id) {
                    console.log('BuddyrunnerLayout: No authenticated user, skipping presence update');
                    return;
                }

                const { error } = await supabase
                    .from('users')
                    .update({ last_seen_at: new Date().toISOString() })
                    .eq('id', user.id);

                if (error) {
                    console.warn('BuddyrunnerLayout: Failed to update presence:', error);
                }
            } catch (error) {
                console.warn('BuddyrunnerLayout: Error updating presence:', error);
            }
        };

        // Update immediately on mount
        updatePresence();

        // Set up interval to update every 60 seconds
        presenceInterval = setInterval(() => {
            updatePresence();
        }, 60000);

        // Cleanup on unmount
        return () => {
            if (presenceInterval) {
                clearInterval(presenceInterval);
                presenceInterval = null;
            }
        };
    }, []);

    return (
        <NotificationBadgeContext.Provider value={{ unreadCount, incrementUnread, clearUnread }}>
            <Stack
                screenOptions={{
                    headerShown: false,
                    // 👇 important: make scenes transparent on web so previous screen shows through
                    contentStyle: Platform.OS === "web" ? { backgroundColor: "transparent" } : undefined,
                }}
            >
            <Stack.Screen name="home" />
            <Stack.Screen name="notification" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="edit_profile" />
            <Stack.Screen name="change_password" />
            <Stack.Screen name="messages_list" />
            <Stack.Screen name="messages" />
            {/* Register split-view messages hub for web */}
            <Stack.Screen name="messages_hub" />
            <Stack.Screen name="start_conversation" />
            <Stack.Screen
                name="view_errand_web"
                options={{
                    presentation: Platform.OS === "web" ? "transparentModal" : "card",
                    animation: Platform.OS === "web" ? "fade" : "default",
                    // 👇 also set on the screen to be safe
                    contentStyle: { backgroundColor: "transparent" },
                }}
            />
            <Stack.Screen name="view_commission" />
            <Stack.Screen
                name="view_commission_web"
                options={{
                    presentation: Platform.OS === "web" ? "transparentModal" : "card",
                    animation: Platform.OS === "web" ? "fade" : "default",
                    // 👇 also set on the screen to be safe
                    contentStyle: { backgroundColor: "transparent" },
                }}
            />
            <Stack.Screen name="task_progress" />
            <Stack.Screen
                name="task_progress_web"
                options={{
                    presentation: Platform.OS === "web" ? "transparentModal" : "card",
                    animation: Platform.OS === "web" ? "fade" : "default",
                    // 👇 also set on the screen to be safe
                    contentStyle: { backgroundColor: "transparent" },
                }}
            />
            <Stack.Screen name="view_map" />
            <Stack.Screen
                name="view_map_web"
                options={{
                    presentation: Platform.OS === "web" ? "card" : "card",
                    animation: Platform.OS === "web" ? "default" : "default",
                }}
            />
        </Stack>
        
        {/* Global notification modals */}
        {Platform.OS === "web" ? <GlobalTaskCompletionModalWeb /> : <GlobalTaskCompletionModal />}
        {Platform.OS === "web" ? <SimpleTaskApprovalModalWeb /> : <SimpleTaskApprovalModal />}
        <GlobalInvoiceAcceptanceModal />

        {/* ID Status Modals - Web & Mobile (unified UI) */}
        <IdStatusModal
            visible={showPendingIdModal}
            title="ID Pending Approval"
            message="Your student ID is pending admin approval. Please wait until your ID is approved."
            onPress={async () => {
                setShowPendingIdModal(false);
                await supabase.auth.signOut();
                router.replace('/login');
            }}
        />
        <IdStatusModal
            visible={showDisapprovedIdModal}
            title="ID Not Approved"
            message="Your student ID was disapproved. Please contact support or upload a new ID image."
            onPress={async () => {
                setShowDisapprovedIdModal(false);
                await supabase.auth.signOut();
                router.replace('/login');
            }}
        />
        </NotificationBadgeContext.Provider>
    );
}
