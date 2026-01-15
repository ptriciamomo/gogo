import { Stack } from "expo-router";
import { Platform } from "react-native";
import { supabase } from "../../lib/supabase";
import GlobalTaskCompletionModal from "../../components/GlobalTaskCompletionModal";
import GlobalTaskCompletionModalWeb from "../../components/GlobalTaskCompletionModalWeb";
import SimpleTaskApprovalModal from "../../components/SimpleTaskApprovalModal";
import SimpleTaskApprovalModalWeb from "../../components/SimpleTaskApprovalModalWeb";
import GlobalInvoiceAcceptanceModal from "../../components/GlobalInvoiceAcceptanceModal";
import { invoiceAcceptanceService } from "../../services/InvoiceAcceptanceService";
import { useEffect } from "react";
import { globalNotificationService } from "../../services/GlobalNotificationService";
import { useRouter } from "expo-router";

export default function BuddyrunnerLayout() {
    const router = useRouter();
    
    // Global authentication guard for blocked users
    useEffect(() => {
        const checkUserStatus = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('is_blocked, is_settlement_blocked')
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
        supabase.auth.getUser().then(({ data: { user } }) => {
            const currentUserId = user?.id;
            if (!currentUserId) {
                console.log('BuddyrunnerLayout: No authenticated user, skipping approvals channel subscription');
                return;
            }
            const channelName = `task_approvals_${currentUserId}`;
            console.log('BuddyrunnerLayout: Subscribing to approvals channel:', channelName);
            const channel = supabase
                .channel(channelName)
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
                    supabase.removeChannel(channel);
                } catch (e) {
                    console.warn('BuddyrunnerLayout: Error removing approvals channel:', e);
                }
            };
        }).catch((e) => {
            console.warn('BuddyrunnerLayout: Failed to get user for approvals channel:', e);
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
    useEffect(() => {
        let presenceInterval: NodeJS.Timeout | null = null;

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
        <>
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
        </>
    );
}
