import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
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
import { convertBase64ToUrl } from "../../utils/supabaseHelpers";

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    faint: "#F7F1F0",
};

/* ===================== TYPES ===================== */
type UserWithIdImage = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    middle_name?: string | null;
    email: string | null;
    student_id_number: string | null;
    role: string | null;
    id_image_path: string | null;
    id_image_approved: boolean | null;
    created_at: string;
    updated_at?: string | null;
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

export default function StudentIdImages() {
    const router = useRouter();
    const { loading: authLoading, fullName } = useAuthProfile();
    const [users, setUsers] = useState<UserWithIdImage[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedImage, setSelectedImage] = useState<{ url: string; name: string } | null>(null);
    const [filterType, setFilterType] = useState<'all' | 'approved' | 'disapproved'>('all');
    const { width: screenWidth } = useWindowDimensions();

    // Query limits for performance (conservative limit to reduce load time)
    const PAGE_SIZE = 200;

    // Responsive breakpoints
    const isSmall = screenWidth < 768;
    const isMedium = screenWidth >= 768 && screenWidth < 1024;
    const isLarge = screenWidth >= 1024;


    React.useEffect(() => {
        const fetchUsers = async () => {
            try {
                setLoadingUsers(true);
                // First try to fetch with id_image_approved column
                const { data: dataWithApproval, error: errorWithApproval } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, middle_name, email, student_id_number, role, id_image_path, id_image_approved, created_at, updated_at')
                    .neq('role', 'admin')
                    .order('created_at', { ascending: false })
                    .limit(PAGE_SIZE);

                let dataToUse = dataWithApproval;
                let hasApprovalColumn = true;

                // If column doesn't exist, fetch without it
                if (errorWithApproval && (errorWithApproval.message?.includes('id_image_approved') || errorWithApproval.message?.includes('column'))) {
                    console.log('id_image_approved column not found, fetching without it...');
                    hasApprovalColumn = false;
                    const { data: dataWithoutApproval, error: errorWithoutApproval } = await supabase
                        .from('users')
                        .select('id, first_name, last_name, middle_name, email, student_id_number, role, id_image_path, created_at, updated_at')
                        .neq('role', 'admin')
                        .order('created_at', { ascending: false })
                        .limit(PAGE_SIZE);

                    if (errorWithoutApproval) throw errorWithoutApproval;
                    dataToUse = dataWithoutApproval as any;
                } else if (errorWithApproval) {
                    throw errorWithApproval;
                }

                // Filter for users with non-null, non-empty id_image_path
                const usersWithImages: UserWithIdImage[] = (dataToUse || [])
                    .filter(user => {
                        const imagePath = user.id_image_path;
                        return imagePath && imagePath.trim() !== '' && imagePath !== null && imagePath !== undefined;
                    })
                    .map(user => ({
                        ...user,
                        id_image_path: user.id_image_path ? convertBase64ToUrl(user.id_image_path) : null,
                        id_image_approved: hasApprovalColumn ? (user.id_image_approved ?? null) : null,
                        updated_at: user.updated_at ?? null,
                    })) as UserWithIdImage[];

                setUsers(usersWithImages);
            } catch (error) {
                console.error('Error fetching users:', error);
                Alert.alert('Error', 'Failed to load student ID images.');
            } finally {
                setLoadingUsers(false);
            }
        };

        fetchUsers();
    }, []);


    const handleApprove = async (userId: string) => {
        try {
            console.log('=== APPROVING ID IMAGE ===');
            console.log('User ID:', userId);
            
            const { data, error } = await supabase
                .from('users')
                .update({ 
                    id_image_approved: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)
                .select('id, id_image_approved, updated_at');

            console.log('Update result:', { data, error });

            if (error) {
                console.error('Update error:', error);
                console.error('Error message:', error.message);
                console.error('Error details:', JSON.stringify(error, null, 2));
                
                // If column doesn't exist, show message to create it
                if (error.message?.includes('id_image_approved') || error.message?.includes('column') || error.message?.includes('does not exist')) {
                    Alert.alert(
                        'Column Missing',
                        'The id_image_approved column does not exist in the users table. Please add it first using SQL: ALTER TABLE users ADD COLUMN id_image_approved BOOLEAN DEFAULT NULL;'
                    );
                    return;
                }
                
                Alert.alert('Error', `Failed to approve ID image: ${error.message || 'Unknown error'}`);
                return;
            }

            console.log('Update successful, data:', data);

            // Verify the update
            const { data: verifyData, error: verifyError } = await supabase
                .from('users')
                .select('id, id_image_approved')
                .eq('id', userId)
                .single();

            console.log('Verification result:', { verifyData, verifyError });

            if (verifyError) {
                console.error('Verification error:', verifyError);
            } else {
                console.log('Verified id_image_approved value:', verifyData?.id_image_approved);
            }

            // Update local state immediately for instant UI feedback
            const currentTimestamp = new Date().toISOString();
            setUsers(prevUsers =>
                prevUsers.map(user =>
                    user.id === userId ? { ...user, id_image_approved: true, updated_at: currentTimestamp } : user
                )
            );

            // Refresh the user list to ensure we have the latest data
            setTimeout(async () => {
                try {
                    const { data: refreshData, error: refreshError } = await supabase
                        .from('users')
                        .select('id, first_name, last_name, middle_name, email, student_id_number, role, id_image_path, id_image_approved, created_at')
                        .neq('role', 'admin')
                        .order('created_at', { ascending: false })
                        .limit(PAGE_SIZE);

                    if (!refreshError && refreshData) {
                        const usersWithImages = refreshData
                            .filter(user => {
                                const imagePath = user.id_image_path;
                                return imagePath && imagePath.trim() !== '' && imagePath !== null && imagePath !== undefined;
                            })
                            .map(user => ({
                                ...user,
                                id_image_path: user.id_image_path ? convertBase64ToUrl(user.id_image_path) : null,
                                id_image_approved: user.id_image_approved ?? null,
                            }));

                        setUsers(usersWithImages);
                        console.log('User list refreshed after approve');
                    }
                } catch (refreshErr) {
                    console.error('Error refreshing user list:', refreshErr);
                }
            }, 500);

            Alert.alert('Success', 'ID image approved successfully.');
        } catch (error: any) {
            console.error('Error approving ID image:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            Alert.alert('Error', `Failed to approve ID image: ${error?.message || 'Unknown error'}`);
        }
    };

    const handleDisapprove = async (userId: string) => {
        try {
            console.log('=== DISAPPROVING ID IMAGE ===');
            console.log('User ID:', userId);
            
            const { data, error } = await supabase
                .from('users')
                .update({ 
                    id_image_approved: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)
                .select('id, id_image_approved, updated_at');

            console.log('Update result:', { data, error });

            if (error) {
                console.error('Update error:', error);
                console.error('Error message:', error.message);
                console.error('Error details:', JSON.stringify(error, null, 2));
                
                // If column doesn't exist, show message to create it
                if (error.message?.includes('id_image_approved') || error.message?.includes('column') || error.message?.includes('does not exist')) {
                    Alert.alert(
                        'Column Missing',
                        'The id_image_approved column does not exist in the users table. Please add it first using SQL: ALTER TABLE users ADD COLUMN id_image_approved BOOLEAN DEFAULT NULL;'
                    );
                    return;
                }
                
                Alert.alert('Error', `Failed to disapprove ID image: ${error.message || 'Unknown error'}`);
                return;
            }

            console.log('Update successful, data:', data);

            // Verify the update
            const { data: verifyData, error: verifyError } = await supabase
                .from('users')
                .select('id, id_image_approved')
                .eq('id', userId)
                .single();

            console.log('Verification result:', { verifyData, verifyError });

            if (verifyError) {
                console.error('Verification error:', verifyError);
            } else {
                console.log('Verified id_image_approved value:', verifyData?.id_image_approved);
            }

            // Update local state immediately for instant UI feedback
            const currentTimestamp = new Date().toISOString();
            setUsers(prevUsers =>
                prevUsers.map(user =>
                    user.id === userId ? { ...user, id_image_approved: false, updated_at: currentTimestamp } : user
                )
            );

            // Refresh the user list to ensure we have the latest data
            setTimeout(async () => {
                try {
                    const { data: refreshData, error: refreshError } = await supabase
                        .from('users')
                        .select('id, first_name, last_name, middle_name, email, student_id_number, role, id_image_path, id_image_approved, created_at, updated_at')
                        .neq('role', 'admin')
                        .order('created_at', { ascending: false })
                        .limit(PAGE_SIZE);

                    if (!refreshError && refreshData) {
                        const usersWithImages = refreshData
                            .filter(user => {
                                const imagePath = user.id_image_path;
                                return imagePath && imagePath.trim() !== '' && imagePath !== null && imagePath !== undefined;
                            })
                            .map(user => ({
                                ...user,
                                id_image_path: user.id_image_path ? convertBase64ToUrl(user.id_image_path) : null,
                                id_image_approved: user.id_image_approved ?? null,
                                updated_at: user.updated_at ?? null,
                            }));

                        setUsers(usersWithImages);
                        console.log('User list refreshed after disapprove');
                    }
                } catch (refreshErr) {
                    console.error('Error refreshing user list:', refreshErr);
                }
            }, 500);

            Alert.alert('Success', 'ID image disapproved successfully.');
        } catch (error: any) {
            console.error('Error disapproving ID image:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            Alert.alert('Error', `Failed to disapprove ID image: ${error?.message || 'Unknown error'}`);
        }
    };

    const filteredUsers = users
        .filter((user) => {
        // Apply search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
            const email = (user.email || '').toLowerCase();
            const studentId = (user.student_id_number || '').toLowerCase();
            const matchesSearch = fullName.includes(query) || email.includes(query) || studentId.includes(query);
            if (!matchesSearch) return false;
        }

        // Apply filter type
        if (filterType === 'all') {
            return user.id_image_approved === null;
        } else if (filterType === 'approved') {
            return user.id_image_approved === true;
        } else if (filterType === 'disapproved') {
            return user.id_image_approved === false;
        }

        return true;
        })
        .sort((a, b) => {
            // Sort based on filter type
            if (filterType === 'all') {
                // Pending: sort by created_at DESC (newest registered first)
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            } else if (filterType === 'approved' || filterType === 'disapproved') {
                // Approved/Disapproved: sort by updated_at DESC (most recently updated first)
                // Fallback to created_at if updated_at is null
                const aTime = a.updated_at ? new Date(a.updated_at).getTime() : new Date(a.created_at).getTime();
                const bTime = b.updated_at ? new Date(b.updated_at).getTime() : new Date(b.created_at).getTime();
                return bTime - aTime;
            }
            return 0;
    });

    if (authLoading) {
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
        <View style={{ flex: 1 }}>
                    <View style={[styles.topBar, isSmall && styles.topBarSmall]}>
                        <Text style={[styles.welcome, isSmall && styles.welcomeSmall]}>Student ID Approval</Text>
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

                            <View style={[styles.filterContainer, isSmall && styles.filterContainerSmall]}>
                                <TouchableOpacity
                                    style={[
                                        styles.filterButton, 
                                        isSmall ? styles.filterButtonSmall : styles.filterButtonAll, 
                                        filterType === 'all' && styles.filterButtonActive
                                    ]}
                                    onPress={() => setFilterType('all')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.filterButtonText, isSmall && styles.filterButtonTextSmall, filterType === 'all' && styles.filterButtonTextActive]}>
                                        Pending
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.filterButton, 
                                        isSmall ? styles.filterButtonSmall : styles.filterButtonWide, 
                                        filterType === 'approved' && styles.filterButtonActive
                                    ]}
                                    onPress={() => setFilterType('approved')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.filterButtonText, isSmall && styles.filterButtonTextSmall, filterType === 'approved' && styles.filterButtonTextActive]}>
                                        Approve
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.filterButton, 
                                        isSmall ? styles.filterButtonSmall : styles.filterButtonWide, 
                                        filterType === 'disapproved' && styles.filterButtonActive
                                    ]}
                                    onPress={() => setFilterType('disapproved')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.filterButtonText, isSmall && styles.filterButtonTextSmall, filterType === 'disapproved' && styles.filterButtonTextActive]}>
                                        Disapprove
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {loadingUsers ? (
                                <View style={{ padding: 40, alignItems: 'center' }}>
                                    <ActivityIndicator size="large" color={colors.maroon} />
                                </View>
                            ) : filteredUsers.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Ionicons name="images-outline" size={48} color={colors.border} />
                                    <Text style={styles.emptyStateText}>
                                        {searchQuery ? 'No student ID images found matching your search.' : 'No student ID images found.'}
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    <Text style={[styles.resultsCount, isSmall && styles.resultsCountSmall]}>
                                        {filteredUsers.length} {filteredUsers.length === 1 ? 'image' : 'images'}
                                        {searchQuery && ` found`}
                                    </Text>
                                    <View style={[styles.imageGrid, isSmall && styles.imageGridSmall, isMedium && styles.imageGridMedium]}>
                                        {filteredUsers.map((user) => {
                                            const fullName = (() => {
                                                const middleName = user.middle_name ? user.middle_name.trim().toLowerCase() : "";
                                                const shouldExcludeMiddleName = middleName === "n/a" || middleName === "na" || middleName === "none";
                                                const nameParts = [
                                                    titleCase(user.first_name),
                                                    !shouldExcludeMiddleName ? titleCase(user.middle_name) : null,
                                                    titleCase(user.last_name)
                                                ].filter(Boolean);
                                                return nameParts.join(" ") || "N/A";
                                            })();

                                            return (
                                                <View key={user.id} style={[
                                                    styles.imageCard,
                                                    isSmall && styles.imageCardSmall,
                                                    isMedium && styles.imageCardMedium
                                                ]}>
                                                    <TouchableOpacity
                                                        style={styles.imageCardContent}
                                                        onPress={() => {
                                                            if (user.id_image_path) {
                                                                setSelectedImage({
                                                                    url: user.id_image_path,
                                                                    name: fullName,
                                                                });
                                                            }
                                                        }}
                                                        activeOpacity={0.7}
                                                    >
                                                        <View style={[styles.imageContainer, isSmall && styles.imageContainerSmall]}>
                                                            {user.id_image_path ? (
                                                                <Image
                                                                    source={{ uri: user.id_image_path }}
                                                                    style={styles.idImage}
                                                                    resizeMode="cover"
                                                                />
                                                            ) : (
                                                                <View style={styles.noImagePlaceholder}>
                                                                    <Ionicons name="image-outline" size={isSmall ? 24 : 32} color={colors.border} />
                                                                </View>
                                                            )}
                                                        </View>
                                                        <View style={[styles.imageInfo, isSmall && styles.imageInfoSmall]}>
                                                            <Text style={[styles.imageName, isSmall && styles.imageNameSmall]} numberOfLines={1}>{fullName}</Text>
                                                            <Text style={[styles.imageStudentId, isSmall && styles.imageStudentIdSmall]} numberOfLines={1}>
                                                                {user.student_id_number || 'N/A'}
                                                            </Text>
                                                            <Text style={[styles.imageRole, isSmall && styles.imageRoleSmall]} numberOfLines={1}>
                                                                {titleCase(user.role || 'N/A')}
                                                            </Text>
                                                            {user.id_image_approved !== null && (
                                                                <View style={styles.approvalStatus}>
                                                                    <Ionicons 
                                                                        name={user.id_image_approved ? "checkmark-circle" : "close-circle"} 
                                                                        size={isSmall ? 14 : 16} 
                                                                        color={user.id_image_approved ? "#22c55e" : "#ef4444"} 
                                                                    />
                                                                    <Text style={[
                                                                        styles.approvalStatusText,
                                                                        isSmall && styles.approvalStatusTextSmall,
                                                                        user.id_image_approved ? styles.approvalStatusApproved : styles.approvalStatusDisapproved
                                                                    ]}>
                                                                        {user.id_image_approved ? "Approved" : "Disapproved"}
                                                                    </Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                    </TouchableOpacity>
                                                    {user.id_image_approved === null && (
                                                    <View style={[styles.actionButtons, isSmall && styles.actionButtonsSmall]}>
                                                        <TouchableOpacity
                                                            style={[styles.actionButton, styles.approveButton, user.id_image_approved === true && styles.actionButtonActive]}
                                                            onPress={() => {
                                                                console.log('Approve button clicked for user:', user.id, 'Current status:', user.id_image_approved);
                                                                handleApprove(user.id);
                                                            }}
                                                            activeOpacity={0.7}
                                                            disabled={false}
                                                        >
                                                            <Ionicons name="checkmark" size={isSmall ? 14 : 16} color={user.id_image_approved === true ? "#fff" : colors.maroon} />
                                                            <Text style={[styles.actionButtonText, isSmall && styles.actionButtonTextSmall, user.id_image_approved === true && styles.actionButtonTextActive]}>
                                                                Approve
                                                            </Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={[styles.actionButton, styles.disapproveButton, user.id_image_approved === false && styles.actionButtonActive]}
                                                            onPress={() => {
                                                                console.log('Disapprove button clicked for user:', user.id, 'Current status:', user.id_image_approved);
                                                                handleDisapprove(user.id);
                                                            }}
                                                            activeOpacity={0.7}
                                                            disabled={false}
                                                        >
                                                            <Ionicons name="close" size={isSmall ? 14 : 16} color={user.id_image_approved === false ? "#fff" : colors.maroon} />
                                                            <Text style={[styles.actionButtonText, isSmall && styles.actionButtonTextSmall, user.id_image_approved === false && styles.actionButtonTextActive]}>
                                                                Disapprove
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                </>
                            )}
                        </View>
                    </ScrollView>

            {selectedImage && (
                <Modal
                    visible={true}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setSelectedImage(null)}
                >
                    <TouchableOpacity
                        style={styles.imageModalOverlay}
                        activeOpacity={1}
                        onPress={() => setSelectedImage(null)}
                    >
                        <View style={[styles.imageModalContent, isSmall && styles.imageModalContentSmall]}>
                            <TouchableOpacity
                                style={[styles.imageModalClose, isSmall && styles.imageModalCloseSmall]}
                                onPress={() => setSelectedImage(null)}
                            >
                                <Ionicons name="close" size={isSmall ? 20 : 24} color="#fff" />
                            </TouchableOpacity>
                            <Text style={[styles.imageModalTitle, isSmall && styles.imageModalTitleSmall]}>{selectedImage.name}</Text>
                            <Image
                                source={{ uri: selectedImage.url }}
                                style={styles.imageModalImage}
                                resizeMode="contain"
                            />
                        </View>
                    </TouchableOpacity>
                </Modal>
            )}
        </View>
    );
}


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    topBar: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: "#fff",
    },
    topBarSmall: {
        padding: 12,
    },
    welcome: {
        fontSize: 24,
        fontWeight: "800",
        color: colors.text,
    },
    welcomeSmall: {
        fontSize: 18,
    },
    content: {
        padding: 20,
    },
    contentSmall: {
        padding: 12,
    },
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 24,
        gap: 12,
    },
    searchContainerSmall: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 16,
        gap: 8,
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
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 16,
    },
    resultsCountSmall: {
        fontSize: 13,
        marginBottom: 12,
    },
    imageGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 20,
    },
    imageGridSmall: {
        gap: 12,
        flexDirection: "column",
    },
    imageGridMedium: {
        gap: 16,
    },
    imageCard: {
        width: 280,
        backgroundColor: "#fff",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    imageCardSmall: {
        width: "100%",
        maxWidth: "100%",
    },
    imageCardMedium: {
        width: "48%",
        maxWidth: "48%",
    },
    imageCardContent: {
        flex: 1,
    },
    imageContainer: {
        width: "100%",
        height: 200,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
    },
    imageContainerSmall: {
        height: 160,
    },
    idImage: {
        width: "100%",
        height: "100%",
    },
    noImagePlaceholder: {
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.faint,
    },
    imageInfo: {
        padding: 16,
    },
    imageInfoSmall: {
        padding: 12,
    },
    imageName: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 4,
    },
    imageNameSmall: {
        fontSize: 14,
    },
    imageStudentId: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.7,
        marginBottom: 2,
    },
    imageStudentIdSmall: {
        fontSize: 12,
    },
    imageRole: {
        fontSize: 12,
        color: colors.maroon,
        fontWeight: "600",
        marginTop: 4,
    },
    imageRoleSmall: {
        fontSize: 11,
    },
    approvalStatus: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    approvalStatusText: {
        fontSize: 12,
        fontWeight: "600",
    },
    approvalStatusTextSmall: {
        fontSize: 11,
    },
    approvalStatusApproved: {
        color: "#22c55e",
    },
    approvalStatusDisapproved: {
        color: "#ef4444",
    },
    actionButtons: {
        flexDirection: "row",
        gap: 8,
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.faint,
    },
    actionButtonsSmall: {
        padding: 10,
        gap: 6,
    },
    actionButton: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "#fff",
    },
    approveButton: {
        borderColor: colors.maroon,
    },
    disapproveButton: {
        borderColor: colors.maroon,
    },
    actionButtonActive: {
        backgroundColor: colors.maroon,
        borderColor: colors.maroon,
    },
    actionButtonText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.maroon,
    },
    actionButtonTextSmall: {
        fontSize: 12,
    },
    actionButtonTextActive: {
        color: "#fff",
    },
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
    },
    emptyStateText: {
        fontSize: 16,
        color: colors.text,
        opacity: 0.6,
        marginTop: 16,
        textAlign: "center",
    },
    filterContainer: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 24,
        alignItems: "center",
    },
    filterContainerSmall: {
        gap: 8,
        marginBottom: 16,
        flexWrap: "wrap",
    },
    filterButton: {
        paddingVertical: 11,
        paddingHorizontal: 20,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        height: 36,
    },
    filterButtonAll: {
        width: 85,
        paddingHorizontal: 20,
    },
    filterButtonWide: {
        width: 135,
        paddingHorizontal: 20,
    },
    filterButtonSmall: {
        flex: 1,
        minWidth: 80,
        paddingHorizontal: 12,
        height: 34,
    },
    filterButtonActive: {
        backgroundColor: colors.maroon,
        borderColor: colors.maroon,
    },
    filterButtonText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
    },
    filterButtonTextSmall: {
        fontSize: 12,
    },
    filterButtonTextActive: {
        color: "#fff",
        fontWeight: "700",
    },
    modalOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
    },
    modalCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 24,
        width: 400,
        maxWidth: "90%",
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 8,
    },
    modalMessage: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.7,
        marginBottom: 24,
    },
    modalButtons: {
        flexDirection: "row",
        gap: 12,
        justifyContent: "flex-end",
    },
    modalButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "#fff",
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
    imageModalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        alignItems: "center",
        justifyContent: "center",
    },
    imageModalContent: {
        width: "90%",
        maxWidth: 800,
        height: "90%",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
    },
    imageModalContentSmall: {
        width: "95%",
        height: "95%",
    },
    imageModalClose: {
        position: "absolute",
        top: 20,
        right: 20,
        zIndex: 10,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        borderRadius: 20,
        padding: 8,
    },
    imageModalCloseSmall: {
        top: 10,
        right: 10,
        padding: 6,
        borderRadius: 16,
    },
    imageModalTitle: {
        position: "absolute",
        top: 20,
        left: 20,
        fontSize: 18,
        fontWeight: "700",
        color: "#fff",
        zIndex: 10,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    imageModalTitleSmall: {
        top: 10,
        left: 10,
        fontSize: 14,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    imageModalImage: {
        width: "100%",
        height: "100%",
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


