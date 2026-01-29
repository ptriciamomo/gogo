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
import { useEffect, useState, createContext, useContext } from "react";
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
    
    // Global notification badge state
    const [unreadCount, setUnreadCount] = useState(0);
    
    const incrementUnread = () => {
        setUnreadCount(prev => prev + 1);
    };
    
    const clearUnread = () => {
        setUnreadCount(0);
    };
    
    // Expose incrementUnread for use in broadcast handlers
    (globalThis as any).__incrementNotificationBadge = incrementUnread;
    
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

        // NEW: Direct realtime broadcast channel (no DB dependency)
        // Subscribe runner to a user-specific approvals channel and forward payloads to the modal
        let approvalsChannelCleanup: (() => void) | undefined;
        let commissionNotifyChannelCleanup: (() => void) | undefined;
        let errandNotifyChannelCleanup: (() => void) | undefined;
        
        supabase.auth.getUser().then(({ data: { user } }) => {
            const currentUserId = user?.id;
            if (!currentUserId) {
                console.log('BuddyrunnerLayout: No authenticated user, skipping channel subscriptions');
                return;
            }
            
            // Task approvals channel
            const approvalsChannelName = `task_approvals_${currentUserId}`;
            console.log('BuddyrunnerLayout: Subscribing to approvals channel:', approvalsChannelName);
            const approvalsChannel = supabase
                .channel(approvalsChannelName)
                .on('broadcast', { event: 'task_approval' }, (payload: any) => {
                    try {
                        const approval = payload?.payload;
                        console.log('BuddyrunnerLayout: Received broadcast approval payload:', approval);
                        if (approval) {
                            const { approvalModalService } = require('../../services/ApprovalModalService');
                            approvalModalService.notifyApproval(approval);
                        }
                    } catch (e) {
                        console.warn('BuddyrunnerLayout: Error handling approval broadcast:', e);
                    }
                })
                .subscribe((status) => {
                    console.log('BuddyrunnerLayout: Approvals channel status:', status);
                });

            approvalsChannelCleanup = () => {
                try {
                    supabase.removeChannel(approvalsChannel);
                } catch (e) {
                    console.warn('BuddyrunnerLayout: Error removing approvals channel:', e);
                }
            };

            // Commission notification channel
            const commissionNotifyChannelName = `commission_notify_${currentUserId}`;
            console.log('BuddyrunnerLayout: Subscribing to commission notification channel:', commissionNotifyChannelName);
            const commissionNotifyChannel = supabase
                .channel(commissionNotifyChannelName)
                .on('broadcast', { event: 'commission_notification' }, async (payload: any) => {
                    try {
                        const notification = payload?.payload;
                        console.log('BuddyrunnerLayout: Received commission notification broadcast:', notification);
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
                            
                            // Increment badge
                            incrementUnread();
                            
                            // Dispatch custom event for notification screen to handle
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('commission_notification_received', { detail: notif }));
                            }
                        }
                    } catch (e) {
                        console.warn('BuddyrunnerLayout: Error handling commission notification broadcast:', e);
                    }
                })
                .subscribe((status) => {
                    console.log('BuddyrunnerLayout: Commission notification channel status:', status);
                });

            commissionNotifyChannelCleanup = () => {
                try {
                    supabase.removeChannel(commissionNotifyChannel);
                } catch (e) {
                    console.warn('BuddyrunnerLayout: Error removing commission notification channel:', e);
                }
            };

            // Errand notification channel
            const errandNotifyChannelName = `errand_notify_${currentUserId}`;
            console.log('BuddyrunnerLayout: Subscribing to errand notification channel:', errandNotifyChannelName);
            const errandNotifyChannel = supabase
                .channel(errandNotifyChannelName)
                .on('broadcast', { event: 'errand_notification' }, async (payload: any) => {
                    try {
                        const notification = payload?.payload;
                        console.log('BuddyrunnerLayout: Received errand notification broadcast:', notification);
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
                            
                            // Increment badge
                            incrementUnread();
                            
                            // Dispatch custom event for notification screen to handle
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('errand_notification_received', { detail: notif }));
                            }
                        }
                    } catch (e) {
                        console.warn('BuddyrunnerLayout: Error handling errand notification broadcast:', e);
                    }
                })
                .subscribe((status) => {
                    console.log('BuddyrunnerLayout: Errand notification channel status:', status);
                });

            errandNotifyChannelCleanup = () => {
                try {
                    supabase.removeChannel(errandNotifyChannel);
                } catch (e) {
                    console.warn('BuddyrunnerLayout: Error removing errand notification channel:', e);
                }
            };
        }).catch((e) => {
            console.warn('BuddyrunnerLayout: Failed to get user for channel subscriptions:', e);
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
            if (commissionNotifyChannelCleanup) {
                commissionNotifyChannelCleanup();
            }
            if (errandNotifyChannelCleanup) {
                errandNotifyChannelCleanup();
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
