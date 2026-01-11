// app/reset_password.tsx
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
    type DimensionValue,
    type ViewStyle,
    type TextStyle,
    type ImageStyle,
} from 'react-native';
import { supabase } from '../lib/supabase';

const MAROON = '#8B0000';

export default function ResetPasswordScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ token?: string; type?: string }>();
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === 'web' || width >= 900;
    
    // Responsive breakpoints for web
    const isSmallScreen = width < 600;
    const isMediumScreen = width >= 600 && width < 900;
    const isLargeScreen = width >= 900;

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [tokenVerified, setTokenVerified] = useState(false);
    const [checkingToken, setCheckingToken] = useState(true);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    
    // Use refs to prevent multiple executions and track state
    const hasVerifiedRef = useRef(false);
    const isCheckingRef = useRef(false);
    const subscriptionRef = useRef<any>(null);

    useEffect(() => {
        // Prevent multiple initializations
        if (hasVerifiedRef.current || isCheckingRef.current) {
            return;
        }
        
        let isMounted = true;
        let redirectTimeout: ReturnType<typeof setTimeout> | null = null;
        
        // Function to verify token and set state (only once)
        const verifyToken = () => {
            if (hasVerifiedRef.current || !isMounted) return;
            
            hasVerifiedRef.current = true;
            isCheckingRef.current = false;
            setTokenVerified(true);
            setCheckingToken(false);
            
            if (redirectTimeout) {
                clearTimeout(redirectTimeout);
            }
            
            // Clean up URL on web
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.history.replaceState(null, '', window.location.pathname);
            }
        };
        
        // Listen for auth state changes FIRST (handles automatic token processing when detectSessionInUrl is enabled)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!isMounted || hasVerifiedRef.current) return;
            
            console.log('[Reset Password] Auth state change:', event, 'Has session:', !!session);
            
            if (event === 'PASSWORD_RECOVERY' && session) {
                console.log('[Reset Password] PASSWORD_RECOVERY event detected');
                verifyToken();
            } else if (event === 'SIGNED_IN' && session) {
                // Check if we're on the reset password page and this is a recovery session
                const currentPath = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : '';
                const hash = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hash : '';
                const search = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.search : '';
                
                if (currentPath.includes('reset_password')) {
                    // Check if URL has recovery indicators
                    const hasRecoveryIndicator = hash.includes('recovery') || search.includes('recovery') || 
                                                 hash.includes('type=recovery') || search.includes('type=recovery') ||
                                                 hash.includes('type%3Drecovery') || search.includes('type%3Drecovery');
                    
                    // If we have recovery indicators OR URL was cleaned (token already processed)
                    if (hasRecoveryIndicator || (!hash && !search && session)) {
                        console.log('[Reset Password] Recovery session detected on SIGNED_IN');
                        verifyToken();
                    }
                }
            }
        });
        
        subscriptionRef.current = subscription;

        // Check if we have a token from the URL (web) or params (mobile)
        const checkToken = async () => {
            if (isCheckingRef.current || hasVerifiedRef.current) return;
            
            try {
                isCheckingRef.current = true;
                setCheckingToken(true);
                
                // For web, check URL hash for token
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    const hash = window.location.hash;
                    const search = window.location.search;
                    console.log('[Reset Password] URL hash:', hash);
                    console.log('[Reset Password] URL search:', search);
                    console.log('[Reset Password] Full URL:', window.location.href);
                    
                    // Check both hash and query params (some email clients might strip the hash)
                    const hasTokenInHash = hash && hash.includes('access_token');
                    const hasTokenInQuery = search && search.includes('access_token');
                    
                    if (hasTokenInHash || hasTokenInQuery) {
                        // Extract token from hash or query
                        const source = hasTokenInHash ? hash.substring(1) : search.substring(1);
                        const urlParams = new URLSearchParams(source);
                        const accessToken = urlParams.get('access_token');
                        const refreshToken = urlParams.get('refresh_token');
                        const type = urlParams.get('type');
                        
                        console.log('[Reset Password] Token found - type:', type);
                        
                        if (accessToken && type === 'recovery') {
                            // Set the session with the recovery token
                            const { data, error } = await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken || '',
                            });
                            
                            if (!error && data?.session && isMounted && !hasVerifiedRef.current) {
                                console.log('[Reset Password] Session set successfully');
                                verifyToken();
                                return;
                            } else if (error) {
                                console.error('[Reset Password] Session error:', error);
                            }
                        }
                    }
                    
                    // If no token in URL, check for existing session
                    // This handles the case where Supabase auto-processed the token (detectSessionInUrl: true)
                    const { data: sessionData } = await supabase.auth.getSession();
                    if (sessionData?.session && isMounted && !hasVerifiedRef.current) {
                        console.log('[Reset Password] Existing session found');
                        // Check if URL indicates this is a recovery flow
                        const urlHasRecovery = (hash && hash.includes('recovery')) || (search && search.includes('recovery'));
                        if (urlHasRecovery || window.location.pathname.includes('reset_password')) {
                            console.log('[Reset Password] Recovery session confirmed');
                            verifyToken();
                            return;
                        }
                    }
                    
                    // If we get here, no valid token or session found yet
                    // Wait for auth state change to process the token (Supabase might be processing it)
                    console.log('[Reset Password] No immediate token/session, waiting for auth state change...');
                    redirectTimeout = setTimeout(() => {
                        if (isMounted && !hasVerifiedRef.current) {
                            console.log('[Reset Password] No valid session after timeout, redirecting...');
                            setCheckingToken(false);
                            router.replace('/forgot_password');
                        }
                    }, 3000); // Give more time for Supabase to process with detectSessionInUrl
                } else {
                    // Mobile: check params or session
                    if (params.token && isMounted && !hasVerifiedRef.current) {
                        console.log('[Reset Password] Mobile token found in params');
                        verifyToken();
                    } else {
                        const { data: sessionData } = await supabase.auth.getSession();
                        if (sessionData?.session && isMounted && !hasVerifiedRef.current) {
                            console.log('[Reset Password] Mobile session found');
                            verifyToken();
                        } else {
                            console.log('[Reset Password] No mobile token or session');
                            redirectTimeout = setTimeout(() => {
                                if (isMounted && !hasVerifiedRef.current) {
                                    setCheckingToken(false);
                                    router.replace('/forgot_password');
                                }
                            }, 3000);
                        }
                    }
                }
            } catch (error) {
                console.error('[Reset Password] Token verification error:', error);
                if (isMounted && !hasVerifiedRef.current) {
                    isCheckingRef.current = false;
                    setCheckingToken(false);
                }
            }
        };

        // Check token after setting up listener
        checkToken();

        return () => {
            isMounted = false;
            if (redirectTimeout) {
                clearTimeout(redirectTimeout);
            }
            if (subscriptionRef.current) {
                subscriptionRef.current.unsubscribe();
            }
        };
    }, []);

    const handleResetPassword = async () => {
        // Validation
        if (!password.trim()) {
            Alert.alert('Missing Password', 'Please enter a new password.');
            return;
        }

        if (password.length < 6) {
            Alert.alert('Invalid Password', 'Password must be at least 6 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Password Mismatch', 'Passwords do not match. Please try again.');
            return;
        }

        try {
            setLoading(true);

            // Update password using Supabase
            const { error } = await supabase.auth.updateUser({
                password: password.trim(),
            });

            if (error) {
                if (error.message.includes('Password should be at least')) {
                    Alert.alert('Invalid Password', 'Password must be at least 6 characters long.');
                } else if (error.message.includes('session')) {
                    Alert.alert(
                        'Session Expired',
                        'Your reset link has expired. Please request a new password reset link.',
                        [
                            {
                                text: 'OK',
                                onPress: () => router.replace('/forgot_password'),
                            },
                        ]
                    );
                } else {
                    Alert.alert('Error', error.message || 'Failed to reset password. Please try again.');
                }
                return;
            }

            // Success - show modal
            setShowSuccessModal(true);
        } catch (error: any) {
            console.error('Password reset error:', error);
            Alert.alert('Error', 'Failed to reset password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (isWeb) {
        // Calculate responsive card width
        let cardWidth: DimensionValue = '100%';
        if (isLargeScreen) {
            cardWidth = 480;
        } else if (isMediumScreen) {
            cardWidth = '90%';
        } else {
            cardWidth = '95%';
        }
        
        // Calculate responsive padding
        const cardPadding = isSmallScreen ? 20 : isMediumScreen ? 24 : 28;
        
        const cardStyle: ViewStyle = {
            width: cardWidth,
            maxWidth: '95%' as DimensionValue,
            paddingHorizontal: cardPadding,
            paddingTop: isSmallScreen ? 24 : 30,
            paddingBottom: isSmallScreen ? 20 : 24,
        };
        
        return (
            <SafeAreaView style={styles.pageWeb as ViewStyle}>
                <View style={[
                    styles.cardWeb as ViewStyle,
                    cardStyle
                ]}>
                    <View style={styles.headerRowWeb as ViewStyle}>
                        <TouchableOpacity onPress={() => router.replace('/login')}>
                            <Ionicons name="arrow-back" size={isSmallScreen ? 16 : 18} color={MAROON} />
                        </TouchableOpacity>
                        <Text style={[
                            styles.headerWeb as TextStyle,
                            { fontSize: isSmallScreen ? 14 : 16 }
                        ]}>Reset Password</Text>
                    </View>

                    <View style={styles.webContent as ViewStyle}>
                        <Image
                            source={require('../assets/images/logo.png')}
                            style={[
                                styles.logoWeb as ImageStyle,
                                {
                                    width: isSmallScreen ? 80 : 100,
                                    height: isSmallScreen ? 80 : 100,
                                }
                            ]}
                            resizeMode="contain"
                        />

                        {checkingToken || !tokenVerified ? (
                            <View style={styles.loadingContainer as ViewStyle}>
                                <ActivityIndicator size="large" color={MAROON} />
                                <Text style={styles.loadingText as TextStyle}>
                                    {checkingToken ? 'Verifying reset link...' : 'Invalid or expired reset link. Redirecting...'}
                                </Text>
                            </View>
                        ) : (
                            <>
                                <Text style={[
                                    styles.descriptionWeb as TextStyle,
                                    { fontSize: isSmallScreen ? 12 : 13, marginBottom: isSmallScreen ? 16 : 20 }
                                ]}>
                                    Enter your new password below.
                                </Text>

                                <Text style={[
                                    styles.labelWeb as TextStyle,
                                    { fontSize: isSmallScreen ? 12 : 13 }
                                ]}>New Password:</Text>
                                <View style={styles.passwordWrapWeb as ViewStyle}>
                                    <TextInput
                                        style={[
                                            styles.inputWeb as TextStyle,
                                            {
                                                height: isSmallScreen ? 38 : 40,
                                                fontSize: isSmallScreen ? 13 : 14,
                                            }
                                        ]}
                                        placeholder="Enter new password"
                                        placeholderTextColor="#aaa"
                                        secureTextEntry={!showPassword}
                                        value={password}
                                        onChangeText={setPassword}
                                        editable={!loading}
                                    />
                                    <TouchableOpacity
                                        style={[
                                            styles.eyeIconWeb as ViewStyle,
                                            { top: isSmallScreen ? 9 : 10 }
                                        ]}
                                        onPress={() => setShowPassword(!showPassword)}
                                    >
                                        <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={isSmallScreen ? 14 : 16} color={MAROON} />
                                    </TouchableOpacity>
                                </View>

                                <Text style={[
                                    styles.labelWeb as TextStyle,
                                    { 
                                        marginTop: isSmallScreen ? 12 : 14,
                                        fontSize: isSmallScreen ? 12 : 13
                                    }
                                ]}>Confirm Password:</Text>
                                <View style={styles.passwordWrapWeb as ViewStyle}>
                                    <TextInput
                                        style={[
                                            styles.inputWeb as TextStyle,
                                            {
                                                height: isSmallScreen ? 38 : 40,
                                                fontSize: isSmallScreen ? 13 : 14,
                                            }
                                        ]}
                                        placeholder="Confirm new password"
                                        placeholderTextColor="#aaa"
                                        secureTextEntry={!showConfirmPassword}
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        editable={!loading}
                                    />
                                    <TouchableOpacity
                                        style={[
                                            styles.eyeIconWeb as ViewStyle,
                                            { top: isSmallScreen ? 9 : 10 }
                                        ]}
                                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                    >
                                        <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={isSmallScreen ? 14 : 16} color={MAROON} />
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity
                                    style={[
                                        styles.nextBtnWeb as ViewStyle, 
                                        loading && { opacity: 0.65 },
                                        {
                                            height: isSmallScreen ? 40 : 42,
                                            marginTop: isSmallScreen ? 20 : 24,
                                        }
                                    ]}
                                    onPress={handleResetPassword}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={[
                                            styles.nextBtnWebText as TextStyle,
                                            { fontSize: isSmallScreen ? 14 : 15 }
                                        ]}>Reset Password</Text>
                                    )}
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
                
                {/* Success Modal */}
                <Modal
                    visible={showSuccessModal}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => {
                        setShowSuccessModal(false);
                        router.replace('/login');
                    }}
                >
                    <View style={styles.modalOverlay as ViewStyle}>
                        <View style={[
                            styles.modalContent as ViewStyle,
                            {
                                width: isSmallScreen ? '90%' : isMediumScreen ? '70%' : 400,
                                padding: isSmallScreen ? 20 : 28,
                            }
                        ]}>
                            <View style={styles.modalIconContainer as ViewStyle}>
                                <Ionicons name="checkmark-circle" size={isSmallScreen ? 60 : 70} color="#4CAF50" />
                            </View>
                            <Text style={[
                                styles.modalTitle as TextStyle,
                                { fontSize: isSmallScreen ? 18 : 20 }
                            ]}>
                                Password Reset Successful!
                            </Text>
                            <Text style={[
                                styles.modalMessage as TextStyle,
                                { fontSize: isSmallScreen ? 13 : 14 }
                            ]}>
                                Your password has been reset successfully. You can now login with your new password.
                            </Text>
                            <TouchableOpacity
                                style={[
                                    styles.modalButton as ViewStyle,
                                    {
                                        height: isSmallScreen ? 42 : 46,
                                        marginTop: isSmallScreen ? 20 : 24,
                                    }
                                ]}
                                onPress={() => {
                                    setShowSuccessModal(false);
                                    router.replace('/login');
                                }}
                            >
                                <Text style={[
                                    styles.modalButtonText as TextStyle,
                                    { fontSize: isSmallScreen ? 14 : 15 }
                                ]}>
                                    Go to Login
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
        );
    }

    // Mobile version
    return (
        <SafeAreaView style={styles.pageMobile as ViewStyle}>
            <View style={styles.headerRowMobile as ViewStyle}>
                <TouchableOpacity onPress={() => router.replace('/login')}>
                    <Ionicons name="arrow-back" size={20} color={MAROON} />
                </TouchableOpacity>
                <Text style={styles.headerMobile as TextStyle}>Reset Password</Text>
            </View>

            <View style={styles.bodyMobile as ViewStyle}>
                <Image
                    source={require('../assets/images/logo.png')}
                    style={styles.logoMobile as ImageStyle}
                    resizeMode="contain"
                />

                {checkingToken || !tokenVerified ? (
                    <View style={styles.loadingContainer as ViewStyle}>
                        <ActivityIndicator size="large" color={MAROON} />
                        <Text style={styles.loadingText as TextStyle}>
                            {checkingToken ? 'Verifying reset link...' : 'Invalid or expired reset link. Redirecting...'}
                        </Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.descriptionMob as TextStyle}>
                            Enter your new password below.
                        </Text>

                        <Text style={styles.labelMob as TextStyle}>New Password:</Text>
                        <View style={styles.passwordWrapMob as ViewStyle}>
                            <TextInput
                                style={styles.inputMob as TextStyle}
                                placeholder="Enter new password"
                                placeholderTextColor="#aaa"
                                secureTextEntry={!showPassword}
                                value={password}
                                onChangeText={setPassword}
                                editable={!loading}
                            />
                            <TouchableOpacity
                                style={styles.eyeIconMob as ViewStyle}
                                onPress={() => setShowPassword(!showPassword)}
                            >
                                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color={MAROON} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.labelMob as TextStyle}>Confirm Password:</Text>
                        <View style={styles.passwordWrapMob as ViewStyle}>
                            <TextInput
                                style={styles.inputMob as TextStyle}
                                placeholder="Confirm new password"
                                placeholderTextColor="#aaa"
                                secureTextEntry={!showConfirmPassword}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                editable={!loading}
                            />
                            <TouchableOpacity
                                style={styles.eyeIconMob as ViewStyle}
                                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                                <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={18} color={MAROON} />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={[styles.loginBtnMob as ViewStyle, loading && { opacity: 0.65 }]}
                            onPress={handleResetPassword}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginTextMob as TextStyle}>Reset Password</Text>}
                        </TouchableOpacity>
                    </>
                )}
            </View>
            
            {/* Success Modal */}
            <Modal
                visible={showSuccessModal}
                transparent={true}
                animationType="fade"
                onRequestClose={() => {
                    setShowSuccessModal(false);
                    router.replace('/login');
                }}
            >
                <View style={styles.modalOverlay as ViewStyle}>
                    <View style={styles.modalContentMobile as ViewStyle}>
                        <View style={styles.modalIconContainer as ViewStyle}>
                            <Ionicons name="checkmark-circle" size={70} color="#4CAF50" />
                        </View>
                        <Text style={styles.modalTitleMobile as TextStyle}>
                            Password Reset Successful!
                        </Text>
                        <Text style={styles.modalMessageMobile as TextStyle}>
                            Your password has been reset successfully. You can now login with your new password.
                        </Text>
                        <TouchableOpacity
                            style={styles.modalButtonMobile as ViewStyle}
                            onPress={() => {
                                setShowSuccessModal(false);
                                router.replace('/login');
                            }}
                        >
                            <Text style={styles.modalButtonTextMobile as TextStyle}>
                                Go to Login
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
    } as ViewStyle,
    cardWeb: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E7B9B9',
        backgroundColor: '#fff',
    } as ViewStyle,
    headerRowWeb: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    } as ViewStyle,
    headerWeb: { fontWeight: '600', color: MAROON, marginLeft: 6 } as TextStyle,
    webContent: { width: '100%', alignSelf: 'center' } as ViewStyle,
    logoWeb: { alignSelf: 'center', marginVertical: 12 } as ImageStyle,
    labelWeb: { color: MAROON, fontWeight: '600', marginBottom: 6 } as TextStyle,
    descriptionWeb: {
        color: '#666',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20,
    } as TextStyle,
    inputWeb: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        paddingHorizontal: 10,
        color: '#000',
        width: '100%',
        marginBottom: 4,
    } as TextStyle,
    passwordWrapWeb: { position: 'relative', marginBottom: 4 } as ViewStyle,
    eyeIconWeb: { position: 'absolute', right: 12 } as ViewStyle,
    nextBtnWeb: {
        backgroundColor: MAROON,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    } as ViewStyle,
    nextBtnWebText: { color: '#fff', fontWeight: '600' } as TextStyle,
    loadingContainer: {
        alignItems: 'center',
        marginVertical: 40,
    } as ViewStyle,
    loadingText: {
        marginTop: 12,
        color: '#666',
        fontSize: 14,
    } as TextStyle,

    // ===== Mobile =====
    pageMobile: { flex: 1, backgroundColor: '#fff' } as ViewStyle,
    headerRowMobile: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 10,
    } as ViewStyle,
    headerMobile: { fontSize: 18, fontWeight: '600', color: MAROON, marginLeft: 10 } as TextStyle,
    bodyMobile: { flex: 1, paddingHorizontal: 24, paddingTop: 12 } as ViewStyle,
    logoMobile: { width: 110, height: 110, alignSelf: 'center', marginVertical: 18 } as ImageStyle,
    descriptionMob: {
        color: '#666',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    } as TextStyle,
    labelMob: { color: MAROON, fontWeight: '600', marginBottom: 6, fontSize: 14 } as TextStyle,
    inputMob: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        color: '#000',
        marginBottom: 20,
        fontSize: 14,
        paddingRight: 40,
    } as TextStyle,
    passwordWrapMob: { position: 'relative', marginBottom: 20 } as ViewStyle,
    eyeIconMob: { position: 'absolute', right: 12, top: 12 } as ViewStyle,
    loginBtnMob: {
        backgroundColor: MAROON,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    } as ViewStyle,
    loginTextMob: { color: '#fff', fontWeight: '600', fontSize: 15 } as TextStyle,
    
    // ===== Modal Styles =====
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    } as ViewStyle,
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E7B9B9',
    } as ViewStyle,
    modalContentMobile: {
        backgroundColor: '#fff',
        borderRadius: 12,
        alignItems: 'center',
        padding: 28,
        width: '90%',
        maxWidth: 400,
        borderWidth: 1,
        borderColor: '#E7B9B9',
    } as ViewStyle,
    modalIconContainer: {
        marginBottom: 16,
    } as ViewStyle,
    modalTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: MAROON,
        marginBottom: 12,
        textAlign: 'center',
    } as TextStyle,
    modalTitleMobile: {
        fontSize: 20,
        fontWeight: '600',
        color: MAROON,
        marginBottom: 12,
        textAlign: 'center',
    } as TextStyle,
    modalMessage: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 8,
    } as TextStyle,
    modalMessageMobile: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 8,
    } as TextStyle,
    modalButton: {
        backgroundColor: MAROON,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    } as ViewStyle,
    modalButtonMobile: {
        backgroundColor: MAROON,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingVertical: 14,
        marginTop: 24,
    } as ViewStyle,
    modalButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    } as TextStyle,
    modalButtonTextMobile: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    } as TextStyle,
});

