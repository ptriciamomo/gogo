import { Stack } from "expo-router";
import { Platform } from "react-native";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "expo-router";
import IdStatusModal from "../../components/IdStatusModalWeb";
import GlobalErrandAcceptanceModal from "../../components/GlobalErrandAcceptanceModal";
import GlobalErrandCompletionModal from "../../components/GlobalErrandCompletionModal";
import GlobalCallerErrandRatingModal from "../../components/GlobalCallerErrandRatingModal";
import GlobalCallerErrandRatingModalWeb from "../../components/GlobalCallerErrandRatingModalWeb";
import { errandCompletionService } from "../../services/ErrandCompletionService";
import { errandAcceptanceService } from "../../services/ErrandAcceptanceService";

export default function BuddycallerLayout() {
    const router = useRouter();
    const [showPendingIdModal, setShowPendingIdModal] = useState(false);
    const [showDisapprovedIdModal, setShowDisapprovedIdModal] = useState(false);
    
    // Global authentication guard for blocked users and ID approval
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

    // Global listener for errand completion (broadcast + database backup)
    const processedErrandsRef = useRef<Set<number>>(new Set());
    // Global listener for errand acceptance (broadcast + database backup)
    const processedAcceptancesRef = useRef<Set<number>>(new Set());

    useEffect(() => {
        console.log('BuddycallerLayout: Setting up errand completion listeners');
        
        let broadcastChannel: any = null;
        let dbChannel: any = null;

        const setupListeners = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    console.log('BuddycallerLayout: No user, skipping listener setup');
                    return;
                }

                const userId = user.id;
                console.log('BuddycallerLayout: Setting up listeners for user:', userId);

                // Primary: Listen for broadcast events
                broadcastChannel = supabase
                    .channel(`errand_completion_${userId}`)
                    .on('broadcast', { event: 'errand_completed' }, (payload: any) => {
                        console.log('BuddycallerLayout: Received broadcast completion event:', payload);
                        try {
                            const { errandId } = payload.payload || {};
                            if (errandId && !processedErrandsRef.current.has(errandId)) {
                                processedErrandsRef.current.add(errandId);
                                errandCompletionService.notifyCompletion({ errandId });
                                console.log('BuddycallerLayout: Broadcast notification sent to modal');
                            }
                        } catch (error) {
                            console.error('BuddycallerLayout: Error handling broadcast:', error);
                        }
                    })
                    .subscribe((status) => {
                        console.log('BuddycallerLayout: Broadcast channel status:', status);
                    });

                // Backup: Listen for database updates
                dbChannel = supabase
                    .channel(`errand_completion_db_${userId}`)
                    .on(
                        'postgres_changes',
                        {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'errand',
                            filter: `buddycaller_id=eq.${userId}`
                        },
                        (payload: any) => {
                            console.log('BuddycallerLayout: Received database update:', payload);
                            try {
                                const newStatus = payload.new?.status;
                                const oldStatus = payload.old?.status;
                                const errandId = payload.new?.id;

                                // Check if status changed to "completed"
                                if (newStatus === 'completed' && oldStatus !== 'completed' && errandId && !processedErrandsRef.current.has(errandId)) {
                                    processedErrandsRef.current.add(errandId);
                                    errandCompletionService.notifyCompletion({ errandId });
                                    console.log('BuddycallerLayout: Database update notification sent to modal');
                                }
                            } catch (error) {
                                console.error('BuddycallerLayout: Error handling database update:', error);
                            }
                        }
                    )
                    .subscribe((status) => {
                        console.log('BuddycallerLayout: Database channel status:', status);
                    });

            } catch (error) {
                console.error('BuddycallerLayout: Error setting up listeners:', error);
            }
        };

        setupListeners();

        return () => {
            console.log('BuddycallerLayout: Cleaning up errand completion listeners');
            if (broadcastChannel) {
                supabase.removeChannel(broadcastChannel);
            }
            if (dbChannel) {
                supabase.removeChannel(dbChannel);
            }
        };
    }, []);

    // Global listener for errand acceptance (broadcast + database backup)
    useEffect(() => {
        console.log('BuddycallerLayout: Setting up errand acceptance listeners');
        
        let acceptanceBroadcastChannel: any = null;
        let acceptanceDbChannel: any = null;

        const setupAcceptanceListeners = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    console.log('BuddycallerLayout: No user, skipping acceptance listener setup');
                    return;
                }

                const userId = user.id;
                console.log('BuddycallerLayout: Setting up acceptance listeners for user:', userId);

                // Primary: Listen for broadcast events
                acceptanceBroadcastChannel = supabase
                    .channel(`errand_acceptance_${userId}`)
                    .on('broadcast', { event: 'errand_accepted' }, (payload: any) => {
                        console.log('BuddycallerLayout: Received broadcast acceptance event:', payload);
                        try {
                            const { errandId, runnerName } = payload.payload || {};
                            if (errandId && runnerName && !processedAcceptancesRef.current.has(errandId)) {
                                processedAcceptancesRef.current.add(errandId);
                                errandAcceptanceService.notifyAcceptance({
                                    errandId,
                                    runnerName
                                });
                                console.log('BuddycallerLayout: Broadcast acceptance notification sent to modal');
                            }
                        } catch (error) {
                            console.error('BuddycallerLayout: Error handling acceptance broadcast:', error);
                        }
                    })
                    .subscribe((status) => {
                        console.log('BuddycallerLayout: Acceptance broadcast channel status:', status);
                    });

                // Backup: Listen for database updates
                acceptanceDbChannel = supabase
                    .channel(`errand_acceptance_db_${userId}`)
                    .on(
                        'postgres_changes',
                        {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'errand',
                            filter: `buddycaller_id=eq.${userId}`
                        },
                        async (payload: any) => {
                            console.log('BuddycallerLayout: Received acceptance database update:', payload);
                            try {
                                const newStatus = payload.new?.status;
                                const oldStatus = payload.old?.status;
                                const errandId = payload.new?.id;
                                const runnerId = payload.new?.runner_id;

                                // Check if status changed to "in_progress" (errand was accepted)
                                if (newStatus === 'in_progress' && oldStatus !== 'in_progress' && errandId && runnerId && !processedAcceptancesRef.current.has(errandId)) {
                                    processedAcceptancesRef.current.add(errandId);
                                    
                                    // Get runner name
                                    const { data: runnerData } = await supabase
                                        .from("users")
                                        .select("first_name, last_name")
                                        .eq("id", runnerId)
                                        .single();
                                    
                                    const runnerName = runnerData 
                                        ? `${runnerData.first_name || ''} ${runnerData.last_name || ''}`.trim() || 'BuddyRunner'
                                        : 'BuddyRunner';
                                    
                                    errandAcceptanceService.notifyAcceptance({
                                        errandId,
                                        runnerName
                                    });
                                    console.log('BuddycallerLayout: Database acceptance notification sent to modal');
                                }
                            } catch (error) {
                                console.error('BuddycallerLayout: Error handling acceptance database update:', error);
                            }
                        }
                    )
                    .subscribe((status) => {
                        console.log('BuddycallerLayout: Acceptance database channel status:', status);
                    });

            } catch (error) {
                console.error('BuddycallerLayout: Error setting up acceptance listeners:', error);
            }
        };

        setupAcceptanceListeners();

        return () => {
            console.log('BuddycallerLayout: Cleaning up errand acceptance listeners');
            if (acceptanceBroadcastChannel) {
                supabase.removeChannel(acceptanceBroadcastChannel);
            }
            if (acceptanceDbChannel) {
                supabase.removeChannel(acceptanceDbChannel);
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
                name="errand_form"
                options={{
                    presentation: Platform.OS === "web" ? "transparentModal" : "card",
                    animation: Platform.OS === "web" ? "fade" : "default",
                    // 👇 also set on the screen to be safe
                    contentStyle: { backgroundColor: "transparent" },
                }}
            />
            <Stack.Screen
                name="commission_form_web"
                options={{
                    presentation: Platform.OS === "web" ? "transparentModal" : "card",
                    animation: Platform.OS === "web" ? "fade" : "default",
                    // 👇 also set on the screen to be safe
                    contentStyle: { backgroundColor: "transparent" },
                }}
            />
            <Stack.Screen
                name="view_errand_web"
                options={{
                    presentation: Platform.OS === "web" ? "transparentModal" : "card",
                    animation: Platform.OS === "web" ? "fade" : "default",
                    // 👇 also set on the screen to be safe
                    contentStyle: { backgroundColor: "transparent" },
                }}
            />
            <Stack.Screen
                name="view_commission"
                options={{
                    presentation: Platform.OS === "web" ? "transparentModal" : "card",
                    animation: Platform.OS === "web" ? "fade" : "default",
                    // 👇 also set on the screen to be safe
                    contentStyle: { backgroundColor: "transparent" },
                }}
            />
            <Stack.Screen
                name="view_commission_web"
                options={{
                    presentation: Platform.OS === "web" ? "transparentModal" : "card",
                    animation: Platform.OS === "web" ? "fade" : "default",
                    // 👇 also set on the screen to be safe
                    contentStyle: { backgroundColor: "transparent" },
                }}
            />
            <Stack.Screen
                name="task_progress"
                options={{
                    presentation: Platform.OS === "web" ? "transparentModal" : "card",
                    animation: Platform.OS === "web" ? "fade" : "default",
                    // 👇 also set on the screen to be safe
                    contentStyle: { backgroundColor: "transparent" },
                }}
            />
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
        <GlobalErrandAcceptanceModal />
        <GlobalErrandCompletionModal />
        {Platform.OS === 'web' ? (
          <GlobalCallerErrandRatingModalWeb />
        ) : (
          <GlobalCallerErrandRatingModal />
        )}

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
        </>
    );
}
