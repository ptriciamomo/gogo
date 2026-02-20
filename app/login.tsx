// app/login.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { supabase } from '../lib/supabase';
import IdStatusModal from '../components/IdStatusModalWeb';

const MAROON = '#8B0000';

function routeForRole(router: ReturnType<typeof useRouter>, raw?: string) {
    const role = (raw ?? '').trim().toLowerCase();
    if (role === 'buddyrunner') {
        router.replace('/buddyrunner/home');
    } else if (role === 'buddycaller') {
        router.replace('/buddycaller/home');
    } else if (role === 'admin') {
        router.replace('/admin/home');
    } else {
        Alert.alert('Profile missing role', 'We could not determine your role.');
    }
}

/** WEB-ONLY: hide Edge/IE native password reveal/clear icons (so only the maroon eye shows) */
function HideNativePasswordEye() {
    if (Platform.OS !== 'web') return null;
    return (
        <style
            dangerouslySetInnerHTML={{
                __html: `
input[type="password"]::-ms-reveal { display: none; }
input[type="password"]::-ms-clear { display: none; }
input::-ms-reveal { display: none; }
input::-ms-clear { display: none; }`,
            }}
        />
    );
}

/** Simple error banner shown under the logo */
function ErrorBanner({ text }: { text: string }) {
    if (!text) return null;
    return (
        <View style={styles.errBanner}>
            <Ionicons name="alert-circle-outline" size={18} color={MAROON} style={{ marginRight: 8 }} />
            <Text style={styles.errBannerText}>{text}</Text>
        </View>
    );
}

export default function LoginScreen() {
    const router = useRouter();
    const { width, height } = useWindowDimensions();
    const isWeb = Platform.OS === 'web' || width >= 900;
    
    // Responsive breakpoints for web
    const isSmallScreen = width < 600;
    const isMediumScreen = width >= 600 && width < 900;
    const isLargeScreen = width >= 900;

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);

    // NEW: banner text
    const [errorText, setErrorText] = useState('');
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    const [showInactiveLockedModal, setShowInactiveLockedModal] = useState(false);
    const [showPendingIdModal, setShowPendingIdModal] = useState(false);
    const [showDisapprovedIdModal, setShowDisapprovedIdModal] = useState(false);

    // Dismiss keyboard when Account Locked modal appears
    React.useEffect(() => {
        if (showBlockedModal) {
            Keyboard.dismiss();
        }
    }, [showBlockedModal]);

    // Web-only: Check authentication state on mount/refresh and redirect if already logged in
    React.useEffect(() => {
        if (!isWeb) return;

        const checkAuthAndRedirect = async () => {
            try {
                // Check if user is currently on account_confirm or verify page (registration flow)
                // Don't redirect if they're in the middle of registration
                const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
                if (currentPath.includes('account_confirm') || currentPath.includes('verify')) {
                    console.log('[Login] User is in registration flow, skipping redirect');
                    return;
                }

                const { data: { user }, error: authError } = await supabase.auth.getUser();
                
                if (authError) {
                    console.log('[Login] Auth check error (user not logged in):', authError.message);
                    return;
                }

                if (user) {
                    // User is authenticated, get their role and redirect
                    const { data: profile, error: profileError } = await supabase
                        .from('users')
                        .select('role, is_blocked, is_settlement_blocked, is_inactive_locked')
                        .eq('id', user.id)
                        .maybeSingle();

                    if (profileError && profileError.code !== 'PGRST116') {
                        console.error('[Login] Error fetching profile:', profileError);
                        return;
                    }

                    // If user is blocked or inactive locked, let them stay on login (they'll see blocked message if they try to login)
                    if (profile?.is_blocked || profile?.is_settlement_blocked || profile?.is_inactive_locked) {
                        console.log('[Login] User is blocked or inactive locked, staying on login page');
                        return;
                    }

                    // Only redirect if user has a complete profile with a role
                    // New users in registration flow won't have a users record yet, so don't redirect them
                    if (profile?.role) {
                        console.log('[Login] User already authenticated, redirecting to:', profile.role);
                        routeForRole(router, profile.role);
                    } else {
                        // User is authenticated but doesn't have a users record yet
                        // This is normal for new users completing registration - don't redirect
                        console.log('[Login] User authenticated but no profile record yet (likely in registration), staying on login');
                    }
                }
            } catch (error) {
                console.error('[Login] Error checking auth state:', error);
            }
        };

        checkAuthAndRedirect();
    }, [isWeb, router]);

    const handleLogin = async () => {
        if (!email.trim() || !password) {
            Alert.alert('Missing info', 'Please enter your email and password.');
            return;
        }

        try {
            setLoading(true);
            setErrorText(''); // clear any previous banner

            // 1) Auth
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });
            if (error) throw error;

            const uid = data.user?.id;
            if (!uid) throw new Error('No user id from auth.');

            // 2) Read role, blocked status, ID approval status, and registration date from your app profile table
            const { data: profile, error: pErr } = await supabase
                .from('users')
                .select('role, is_blocked, is_settlement_blocked, is_inactive_locked, id_image_approved, id_image_path, created_at')
                .eq('id', uid)
                .single();

            if (pErr) throw pErr;

            // Check if user is blocked (disciplinary or settlement-based)
            if (profile?.is_blocked || profile?.is_settlement_blocked) {
                setLoading(false);
                
                // Dismiss keyboard before showing modal
                Keyboard.dismiss();
                
                // Show modal for both web and mobile
                setShowBlockedModal(true);
                // Auto logout after a delay
                setTimeout(() => {
                    supabase.auth.signOut().then(() => {
                        setShowBlockedModal(false);
                    });
                }, 5000);
                return;
            }

            // Check if user is locked due to inactivity
            if (profile?.is_inactive_locked) {
                setLoading(false);
                
                // Dismiss keyboard before showing modal
                Keyboard.dismiss();
                
                // Show modal for both web and mobile
                setShowInactiveLockedModal(true);
                // Auto logout after a delay
                setTimeout(() => {
                    supabase.auth.signOut().then(() => {
                        setShowInactiveLockedModal(false);
                    });
                }, 5000);
                return;
            }

            // SECURITY: Check ID approval status for non-admin users
            if (profile?.role !== 'admin') {
                // If user has uploaded an ID image, check approval status
                if (profile.id_image_path) {
                    if (profile.id_image_approved === false) {
                        // ID was disapproved
                        setLoading(false);
                        Keyboard.dismiss();
                        
                        // Use modal on both web and mobile
                        setShowDisapprovedIdModal(true);
                        return;
                    }
                    
                    if (profile.id_image_approved === null) {
                        // ID is pending approval
                        setLoading(false);
                        Keyboard.dismiss();
                        
                        // Use modal on both web and mobile
                        setShowPendingIdModal(true);
                        return;
                    }
                } else {
                    // User hasn't uploaded ID yet - block login
                    setLoading(false);
                    Keyboard.dismiss();
                    
                    // Use modal on both web and mobile
                    setShowPendingIdModal(true);
                    return;
                }
            }

            // Continue with normal login flow
            // Account locking is now handled by SQL functions based on overdue settlements
            // No need to check settlements here - just check is_blocked status above

            // Route to the correct dashboard
            routeForRole(router, profile?.role);
        } catch (e: any) {
            const msg = String(e?.message || '');
            const isBadPwd =
                e?.status === 400 ||
                /invalid login/i.test(msg) ||
                /invalid email or password/i.test(msg) ||
                /password/i.test(msg);

            if (isBadPwd) {
                // Show banner like your screenshot
                setErrorText('Your password is incorrect');
            } else {
                // Keep your existing alert behavior for other errors
                Alert.alert('Login failed', msg || 'Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    // --------- WEB ---------
    if (isWeb) {
        // Responsive card width calculation with better breakpoints
        const cardWidth = React.useMemo(() => {
            if (width === 0) return 500; // Fallback during initial render
            if (width < 480) {
                // Very small screens (mobile-like)
                return Math.max(320, width - 24);
            } else if (width < 768) {
                // Small tablets
                return Math.min(width - 48, 520);
            } else if (width < 1024) {
                // Medium screens
                return Math.min(width * 0.75, 600);
            } else {
                // Large screens
                return Math.min(width * 0.5, 680);
            }
        }, [width]);
        
        // Responsive padding based on screen size
        const cardPadding = React.useMemo(() => {
            if (width < 480) return 20;
            if (width < 768) return 24;
            if (width < 1024) return 28;
            return 32;
        }, [width]);
        
        // Responsive font sizes
        const headerSize = width < 480 ? 14 : width < 768 ? 15 : 16;
        const labelSize = width < 480 ? 12 : width < 768 ? 13 : 14;
        const inputSize = width < 480 ? 13 : width < 768 ? 14 : 15;
        const buttonSize = width < 480 ? 14 : 15;
        const linkSize = width < 480 ? 11 : width < 768 ? 12 : 13;
        
        // Responsive spacing
        const logoSize = width < 480 ? 70 : width < 768 ? 80 : 90;
        const inputHeight = width < 480 ? 38 : width < 768 ? 40 : 42;
        const buttonHeight = width < 480 ? 40 : width < 768 ? 42 : 44;
        const iconSize = width < 480 ? 14 : width < 768 ? 16 : 18;
        const checkboxSize = width < 480 ? 16 : 18;
        
        return (
            <SafeAreaView style={styles.pageWeb}>
                <HideNativePasswordEye />
                <View style={[
                    styles.cardWeb,
                    {
                        width: cardWidth,
                        maxWidth: '95%',
                        minWidth: 320,
                        paddingHorizontal: cardPadding,
                        paddingTop: width < 480 ? 24 : width < 768 ? 28 : 32,
                        paddingBottom: width < 480 ? 20 : width < 768 ? 24 : 28,
                    }
                ]}>
                    <View style={styles.headerRowWeb}>
                        {/* go to index.tsx */}
                        <TouchableOpacity onPress={() => router.replace('/')}>
                            <Ionicons name="arrow-back" size={iconSize} color={MAROON} />
                        </TouchableOpacity>
                        <Text style={[
                            styles.headerWeb,
                            { fontSize: headerSize }
                        ]}>Welcome back!</Text>
                    </View>

                    <View style={[
                        styles.webContent,
                        { 
                            maxWidth: width < 480 ? '100%' : width < 768 ? 420 : 440,
                            width: '100%'
                        }
                    ]}>
                        <Image 
                            source={require('../assets/images/logo.png')} 
                            style={[
                                styles.logoWeb,
                                {
                                    width: logoSize,
                                    height: logoSize,
                                }
                            ]} 
                        />

                        {/* NEW: banner under the logo */}
                        <ErrorBanner text={errorText} />

                        <Text style={[
                            styles.labelWeb,
                            { 
                                fontSize: labelSize,
                                marginBottom: width < 480 ? 6 : 8
                            }
                        ]}>Email address:</Text>
                        <TextInput
                            style={[
                                styles.inputWeb,
                                {
                                    height: inputHeight,
                                    fontSize: inputSize,
                                    paddingHorizontal: width < 480 ? 10 : 12,
                                }
                            ]}
                            placeholder="Enter your email address"
                            placeholderTextColor="#aaa"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            value={email}
                            onChangeText={setEmail}
                        />

                        <Text style={[
                            styles.labelWeb, 
                            { 
                                marginTop: width < 480 ? 12 : width < 768 ? 14 : 16,
                                marginBottom: width < 480 ? 6 : 8,
                                fontSize: labelSize
                            }
                        ]}>Password:</Text>
                        <View style={styles.passwordWrapWeb}>
                            <TextInput
                                style={[
                                    styles.inputWeb,
                                    {
                                        height: inputHeight,
                                        fontSize: inputSize,
                                        paddingHorizontal: width < 480 ? 10 : 12,
                                    }
                                ]}
                                placeholder="Enter your password"
                                placeholderTextColor="#aaa"
                                secureTextEntry={!showPassword}
                                value={password}
                                onChangeText={setPassword}
                            />
                            <TouchableOpacity
                                style={[
                                    styles.eyeIconWeb,
                                    { 
                                        top: width < 480 ? 9 : width < 768 ? 10 : 11,
                                        right: width < 480 ? 10 : 12
                                    }
                                ]}
                                onPress={() => setShowPassword(!showPassword)}
                            >
                                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={iconSize} color={MAROON} />
                            </TouchableOpacity>
                        </View>

                        <View style={[
                            styles.optionsRowWeb,
                            { marginTop: width < 480 ? 8 : 10 }
                        ]}>
                            <TouchableOpacity 
                                style={styles.rememberMeWeb} 
                                onPress={() => setRememberMe(!rememberMe)}
                                activeOpacity={0.7}
                            >
                                <Ionicons 
                                    name={rememberMe ? 'checkbox' : 'square-outline'} 
                                    size={checkboxSize} 
                                    color={MAROON} 
                                />
                                <Text style={[
                                    styles.rememberTextWeb,
                                    { fontSize: linkSize }
                                ]}>Remember me</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                activeOpacity={0.7}
                                onPress={() => router.push('/forgot_password')}
                            >
                                <Text style={[
                                    styles.forgotTextWeb,
                                    { fontSize: linkSize }
                                ]}>Forgot your password?</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={[
                                styles.nextBtnWeb, 
                                loading && { opacity: 0.65 },
                                {
                                    height: buttonHeight,
                                    marginTop: width < 480 ? 16 : width < 768 ? 18 : 20,
                                }
                            ]}
                            onPress={handleLogin}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={[
                                    styles.nextBtnWebText,
                                    { fontSize: buttonSize }
                                ]}>Login</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
                
                {/* Blocked User Modal */}
                {showBlockedModal && (
                    <View style={modalStyles.backdrop}>
                        <View style={modalStyles.card}>
                        <View style={modalStyles.iconWrap}>
                            <Ionicons name="ban" size={Platform.OS === 'web' ? 44 : 48} color={MAROON} />
                        </View>
                        <Text style={modalStyles.title}>Account Locked</Text>
                        <Text style={modalStyles.msg}>Your account is locked due to unpaid settlements. Please settle your overdue balance to continue.</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setShowBlockedModal(false);
                                    supabase.auth.signOut();
                                }}
                                style={modalStyles.okBtn}
                                activeOpacity={0.9}
                            >
                                <Text style={modalStyles.okText}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Inactive Locked User Modal */}
                {showInactiveLockedModal && (
                    <View style={modalStyles.backdrop}>
                        <View style={modalStyles.card}>
                        <View style={modalStyles.iconWrap}>
                            <Ionicons name="ban" size={Platform.OS === 'web' ? 44 : 48} color={MAROON} />
                        </View>
                        <Text style={modalStyles.title}>Account Locked</Text>
                        <Text style={modalStyles.msg}>Your account has been locked due to 1 year of inactivity. Please contact the administrator.</Text>
                            <TouchableOpacity
                                onPress={() => {
                                    setShowInactiveLockedModal(false);
                                    supabase.auth.signOut();
                                }}
                                style={modalStyles.okBtn}
                                activeOpacity={0.9}
                            >
                                <Text style={modalStyles.okText}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
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
            </SafeAreaView>
        );
    }

    // --------- MOBILE ---------
    return (
        <SafeAreaView style={styles.pageMobile}>
            <View style={styles.headerRowMobile}>
                {/* go to index.tsx */}
                <TouchableOpacity onPress={() => router.replace('/')}>
                    <Ionicons name="arrow-back" size={24} color={MAROON} />
                </TouchableOpacity>
                <Text style={styles.headerMobile}>Welcome back!</Text>
            </View>

            <View style={styles.bodyMobile}>
                <Image source={require('../assets/images/logo.png')} style={styles.logoMobile} />

                {/* NEW: banner under the logo */}
                <ErrorBanner text={errorText} />

                <Text style={styles.labelMob}>Enter your email address:</Text>
                <TextInput
                    style={styles.inputMob}
                    placeholder="Email address"
                    placeholderTextColor="#aaa"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                />

                <Text style={styles.labelMob}>Enter your password:</Text>
                <View style={styles.passwordWrapMob}>
                    <TextInput
                        style={styles.inputMob}
                        placeholder="Password"
                        placeholderTextColor="#aaa"
                        secureTextEntry={!showPassword}
                        value={password}
                        onChangeText={setPassword}
                    />
                    <TouchableOpacity style={styles.eyeIconMob} onPress={() => setShowPassword(!showPassword)}>
                        <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={MAROON} />
                    </TouchableOpacity>
                </View>

                <View style={styles.optionsRowMob}>
                    <TouchableOpacity style={styles.rememberMe} onPress={() => setRememberMe(!rememberMe)}>
                        <Ionicons name={rememberMe ? 'checkbox' : 'square-outline'} size={20} color={MAROON} />
                        <Text style={styles.rememberText}>Remember me</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.push('/forgot_password')}>
                        <Text style={styles.forgotText}>Forgot your password?</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[styles.loginBtnMob, loading && { opacity: 0.65 }]}
                    onPress={handleLogin}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginTextMob}>Login</Text>}
                </TouchableOpacity>
            </View>
            
            {/* Blocked User Modal - Mobile */}
            {showBlockedModal && (
                <View style={modalStyles.backdrop}>
                    <View style={modalStyles.card}>
                        <View style={modalStyles.iconWrap}>
                            <Ionicons name="ban" size={Platform.OS === 'web' ? 44 : 48} color={MAROON} />
                        </View>
                        <Text style={modalStyles.title}>Account Locked</Text>
                        <Text style={modalStyles.msg}>Your account is locked due to unpaid settlements. Please settle your overdue balance to continue.</Text>
                        <TouchableOpacity
                            onPress={() => {
                                setShowBlockedModal(false);
                                supabase.auth.signOut();
                            }}
                            style={modalStyles.okBtn}
                            activeOpacity={0.9}
                        >
                            <Text style={modalStyles.okText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Inactive Locked User Modal - Mobile */}
            {showInactiveLockedModal && (
                <View style={modalStyles.backdrop}>
                    <View style={modalStyles.card}>
                        <View style={modalStyles.iconWrap}>
                            <Ionicons name="ban" size={Platform.OS === 'web' ? 44 : 48} color={MAROON} />
                        </View>
                        <Text style={modalStyles.title}>Account Locked</Text>
                        <Text style={modalStyles.msg}>Your account has been locked due to 1 year of inactivity. Please contact the administrator.</Text>
                        <TouchableOpacity
                            onPress={() => {
                                setShowInactiveLockedModal(false);
                                supabase.auth.signOut();
                            }}
                            style={modalStyles.okBtn}
                            activeOpacity={0.9}
                        >
                            <Text style={modalStyles.okText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
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
                message="Your student ID was disapproved."
                onPress={async () => {
                    setShowDisapprovedIdModal(false);
                    await supabase.auth.signOut();
                    router.replace('/login');
                }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    // ===== Web =====
    pageWeb: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        minHeight: '100vh' as any,
        width: '100%',
    } as any,
    cardWeb: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E7B9B9',
        backgroundColor: '#fff',
        // width, padding, etc. are set dynamically in component
    },
    headerRowWeb: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    headerWeb: { fontWeight: '600', color: MAROON, marginLeft: 6 },
    webContent: { width: '100%', alignSelf: 'center' },
    logoWeb: { alignSelf: 'center', marginVertical: 12 },
    labelWeb: { color: MAROON, fontWeight: '600', marginBottom: 6 },
    inputWeb: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        paddingHorizontal: 10,
        color: '#000',
        width: '100%',
    },
    passwordWrapWeb: { position: 'relative', marginBottom: 8 },
    eyeIconWeb: { position: 'absolute', right: 12 },
    optionsRowWeb: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    rememberMeWeb: { 
        flexDirection: 'row', 
        alignItems: 'center',
        gap: 6,
    },
    rememberTextWeb: { 
        color: '#444',
        fontWeight: '500',
    },
    forgotTextWeb: { 
        color: MAROON,
        fontWeight: '500',
    },
    nextBtnWeb: {
        backgroundColor: MAROON,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    nextBtnWebText: { color: '#fff', fontWeight: '600' },

    // ===== Mobile =====
    pageMobile: { flex: 1, backgroundColor: '#fff' },
    headerRowMobile: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 10,
    },
    headerMobile: { fontSize: 18, fontWeight: '600', color: MAROON, marginLeft: 10 },
    bodyMobile: { flex: 1, paddingHorizontal: 24, paddingTop: 12 },
    logoMobile: { width: 110, height: 110, alignSelf: 'center', marginVertical: 18 },

    // ===== Error banner (web & mobile) =====
    errBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F6D6D6', // light red similar to your screenshot
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E7B9B9',
        marginBottom: 12,
    },
    errBannerText: { color: MAROON, fontSize: 14, fontWeight: '600', flexShrink: 1 },

    labelMob: { fontWeight: '600', color: MAROON, marginBottom: 6, fontSize: 13 },
    inputMob: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        paddingHorizontal: 10,
        height: 44,
        fontSize: 15,
        color: '#000',
        marginBottom: 12,
    },
    passwordWrapMob: { position: 'relative' },
    eyeIconMob: { position: 'absolute', right: 12, top: 12 },
    optionsRowMob: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
        marginBottom: 10,
    },
    rememberMe: { flexDirection: 'row', alignItems: 'center' },
    rememberText: { marginLeft: 6, fontSize: 13, color: '#444' },
    forgotText: { fontSize: 13, color: MAROON },
    loginBtnMob: {
        backgroundColor: MAROON,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 6,
    },
    loginTextMob: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

// Modal styles for blocked user (responsive for both web and mobile)
const modalStyles = StyleSheet.create({
    backdrop: {
        ...(Platform.OS === 'web' ? {
            position: 'fixed' as any,
        } : {
            position: 'absolute',
        }),
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: Platform.OS === 'web' ? 16 : 20,
        zIndex: 99999,
    },
    card: { 
        width: Platform.OS === 'web' ? '100%' : '90%',
        maxWidth: 400, 
        backgroundColor: "#fff", 
        borderRadius: 14, 
        padding: Platform.OS === 'web' ? 18 : 24, 
        alignItems: "center",
        marginHorizontal: Platform.OS === 'web' ? 16 : 0,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    iconWrap: {
        width: Platform.OS === 'web' ? 80 : 90,
        height: Platform.OS === 'web' ? 80 : 90,
        borderRadius: 999,
        backgroundColor: "#F7F1F0",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
        borderWidth: 2,
        borderColor: MAROON,
    },
    title: { 
        color: MAROON, 
        fontSize: Platform.OS === 'web' ? 18 : 20, 
        fontWeight: "900", 
        marginBottom: 10, 
        textAlign: "center" 
    },
    msg: { 
        color: MAROON, 
        fontSize: Platform.OS === 'web' ? 14 : 15, 
        opacity: 0.9, 
        marginBottom: 20, 
        textAlign: "center",
        lineHeight: Platform.OS === 'web' ? 20 : 22,
        paddingHorizontal: Platform.OS === 'web' ? 0 : 4,
    },
    okBtn: { 
        backgroundColor: MAROON, 
        paddingVertical: Platform.OS === 'web' ? 14 : 16, 
        borderRadius: 12, 
        width: Platform.OS === 'web' ? "70%" : "80%", 
        alignItems: "center", 
        justifyContent: "center",
        minHeight: 48,
    },
    okText: { 
        color: "#fff", 
        fontWeight: "700",
        fontSize: Platform.OS === 'web' ? 16 : 17,
    },
});
