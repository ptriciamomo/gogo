// app/register_email.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Image,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useRegistration } from '../stores/registration';

const MAROON = '#8B0000';

export default function RegisterEmailScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width: winW } = useWindowDimensions();

    // Breakpoints / platform
    const isMD = winW >= 600 && winW < 900;
    const isLG = winW >= 900;
    const isWeb = Platform.OS === 'web' || isLG;

    // Responsive web card width
    const webCardWidth = useMemo(() => {
        if (!isWeb) return '100%';
        const pct = isLG ? 0.30 : isMD ? 0.36 : 0.42;
        const computed = Math.floor(winW * pct);
        return Math.min(Math.max(320, computed), 560);
    }, [isWeb, isLG, isMD, winW]);

    // Mobile container clamp so inputs don’t hug edges
    const mobileWrapStyle = useMemo(() => {
        const sideMargin = 18;
        const clamp = 408;
        const maxWidth = Math.min(clamp, winW - sideMargin * 2);
        return { maxWidth, alignSelf: 'center', width: '100%', paddingHorizontal: 6 } as const;
    }, [winW]);

    const setFromRegisterTwo = useRegistration((s) => s.setFromRegisterTwo);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showDomainAlert, setShowDomainAlert] = useState(false);
    const [showBlockedModal, setShowBlockedModal] = useState(false);

    const umPattern = useMemo(() => /^[a-zA-Z0-9._%+-]+@umindanao\.edu\.ph$/, []);

    const showError = (message: string) => {
        setError(message);
        setTimeout(() => setError(''), 5000);
    };

    const validateDomainAndSetBanner = (_value: string) => {
        // Allow immediate proceed without domain banner/blockers
        if (showDomainAlert) setShowDomainAlert(false);
        return true;
    };

    const handleNext = async () => {
        if (isLoading) return;

        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password || !confirmPassword) {
            showError('Please complete all required fields.');
            return;
        }

        // Validate email domain - must be @umindanao.edu.ph
        if (!umPattern.test(trimmedEmail)) {
            showError('Please use your UMindanao account (@umindanao.edu.ph).');
            return;
        }

        // Validate password requirements
        const hasCapitalLetter = /[A-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
        
        const missingRequirements: string[] = [];
        if (!hasCapitalLetter) missingRequirements.push('capital letter');
        if (!hasNumber) missingRequirements.push('number');
        if (!hasSpecialChar) missingRequirements.push('special character');
        
        if (missingRequirements.length > 0) {
            let errorMsg = 'Password must contain a ';
            if (missingRequirements.length === 1) {
                errorMsg += missingRequirements[0] + '.';
            } else if (missingRequirements.length === 2) {
                errorMsg += missingRequirements[0] + ' and a ' + missingRequirements[1] + '.';
            } else {
                errorMsg += missingRequirements[0] + ', a ' + missingRequirements[1] + ', and a ' + missingRequirements[2] + '.';
            }
            showError(errorMsg);
            return;
        }

        // Validate passwords match
        if (password !== confirmPassword) {
            showError('Passwords do not match.');
            return;
        }

        setIsLoading(true);
        
        try {
            // Check if email is associated with a blocked account
            const { data: blockedUser, error: checkError } = await supabase
                .from('users')
                .select('email, is_blocked')
                .eq('email', trimmedEmail)
                .maybeSingle();

            // Handle error only if it's not a "no rows" error (PGRST116)
            if (checkError && checkError.code !== 'PGRST116') {
                console.error('Error checking blocked user:', checkError);
                // Continue with registration - don't block on query errors
            }

            if (blockedUser && blockedUser.is_blocked) {
                setIsLoading(false);
                
                // Show modal for web, alert for mobile
                if (Platform.OS === 'web') {
                    setShowBlockedModal(true);
                } else {
                    Alert.alert(
                        'Registration Blocked',
                        'This email is associated with a blocked account and cannot be used for registration. Please contact support if you believe this is an error.',
                        [{ text: 'OK' }]
                    );
                }
                return;
            }

            setFromRegisterTwo({ email: trimmedEmail, password, confirmPassword });

            // Do not block on domain banner anymore
            validateDomainAndSetBanner(trimmedEmail);

            const { error: otpErr } = await supabase.auth.signInWithOtp({
                email: trimmedEmail,
                options: { shouldCreateUser: true },
            });

            if (otpErr) {
                // Allow user to proceed even if Supabase rate-limits or returns an error.
                // Silently proceed (no scary banner); user can enter an earlier code or retry on Verify screen.
                if (!String(otpErr.message).includes('For security purposes')) {
                    // Log non-rate-limit errors for debugging without surfacing to user
                    console.log('[OTP send failed – proceeding]', otpErr);
                }
            }

            router.push({
                pathname: '/verify',
                params: { email: trimmedEmail, password, flow: 'email-otp' },
            });
        } catch (e: any) {
            // Proceed even if some unexpected error occurs; Verify screen can handle resend.
            console.log('[OTP send unexpected error – proceeding]', e);
            router.push({
                pathname: '/verify',
                params: { email: trimmedEmail, password, flow: 'email-otp' },
            });
        } finally {
            setIsLoading(false);
        }
    };

    // ================== WEB / DESKTOP ==================
    if (isWeb) {
        return (
            <SafeAreaView edges={[] as any} style={styles.pageWeb}>
                <View style={[styles.cardWeb, { width: webCardWidth }]}>
                    <View style={styles.headerRowWeb}>
                        <TouchableOpacity onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={18} color={MAROON} />
                        </TouchableOpacity>
                        <Text style={styles.headerWeb}>Create Account</Text>
                    </View>

                    <View style={[styles.webContent, { maxWidth: Math.min(460, Number(webCardWidth) - 60) }]}>
                        <Image source={require('../assets/images/logo.png')} style={styles.logoWeb} />

                        {/* Domain banner removed per requirement */}

                        {error ? (
                            <View style={styles.errorBanner}>
                                <Text style={styles.errorText}> ⚠️  {error}</Text>
                            </View>
                        ) : null}

                        <Text style={styles.labelWeb}>Email address:</Text>
                        <TextInput
                            style={[styles.inputWeb]}
                            placeholder="Enter your UMindanao email address"
                            placeholderTextColor="#000"
                            value={email}
                            onChangeText={(t) => {
                                setEmail(t);
                                if (showDomainAlert) setShowDomainAlert(false);
                            }}
                            // validation banner removed
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                        />

                        <Text style={styles.labelWeb}>Password:</Text>
                        <View style={styles.passwordWrap}>
                            <TextInput
                                style={styles.inputWebPassword}
                                placeholder="Enter your password"
                                placeholderTextColor="#000"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                keyboardType="default"
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="new-password"
                                textContentType="password"
                            />
                            <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword((s) => !s)} activeOpacity={0.7}>
                                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={16} color={MAROON} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.labelWeb}>Confirm Password:</Text>
                        <View style={styles.passwordWrap}>
                            <TextInput
                                style={styles.inputWebPassword}
                                placeholder="Enter your confirm password"
                                placeholderTextColor="#000"
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry={!showConfirmPassword}
                                keyboardType="default"
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="new-password"
                                textContentType="password"
                            />
                            <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowConfirmPassword((s) => !s)} activeOpacity={0.7}>
                                <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={16} color={MAROON} />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={[styles.nextBtnWeb, isLoading && styles.nextBtnDisabled]}
                            onPress={handleNext}
                            disabled={isLoading}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.nextBtnWebText}>{isLoading ? 'Sending code...' : 'Next'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                
                {/* Blocked User Modal */}
                {showBlockedModal && (
                    <View style={modalStyles.backdrop}>
                        <View style={modalStyles.card}>
                            <View style={modalStyles.iconWrap}>
                                <Ionicons name="close-circle" size={44} color={MAROON} />
                            </View>
                            <Text style={modalStyles.title}>Registration Blocked</Text>
                            <Text style={modalStyles.msg}>This email is associated with a blocked account and cannot be used for registration. Please contact support if you believe this is an error.</Text>
                            <TouchableOpacity
                                onPress={() => setShowBlockedModal(false)}
                                style={modalStyles.okBtn}
                                activeOpacity={0.9}
                            >
                                <Text style={modalStyles.okText}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </SafeAreaView>
        );
    }

    // ================== MOBILE (Android look) ==================
    return (
        // Safe margins live here and DO NOT SCROLL
        <SafeAreaView
            edges={['top', 'bottom']}
            style={[
                styles.pageMobile,
                {
                    paddingTop: Math.max(insets.top, 12),
                    paddingBottom: Math.max(insets.bottom, 16),
                },
            ]}
        >
            <StatusBar barStyle="dark-content" />
            <ScrollView
                style={{ flex: 1, width: '100%' }}
                contentContainerStyle={[styles.scrollMobile]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={[styles.mobileWrap, mobileWrapStyle]}>
                    <View style={styles.headerRowMobile}>
                        <TouchableOpacity onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={20} color={MAROON} />
                        </TouchableOpacity>
                        <Text style={styles.headerMobile}>Create Account</Text>
                    </View>

                    <View style={[styles.bodyMobile]}>
                        <Image source={require('../assets/images/logo.png')} style={styles.logoMobile} />

                        {/* Domain banner removed per requirement */}

                        {error ? (
                            <View style={styles.errorBanners}>
                                <Text style={styles.errorTexts}>⚠️  {error}</Text>
                            </View>
                        ) : null}

                        <Text style={styles.labelMob}>Email address:</Text>
                        <TextInput
                            style={[styles.inputMob]}
                            placeholder="Enter your UMindanao email address"
                            placeholderTextColor="#000"
                            value={email}
                            onChangeText={(t) => {
                                setEmail(t);
                                if (showDomainAlert) setShowDomainAlert(false);
                            }}
                            // validation banner removed
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                        />

                        <Text style={styles.labelMob}>Password:</Text>
                        <View style={styles.passwordWrap}>
                            <TextInput
                                style={styles.inputMobPassword}
                                placeholder="Enter your password"
                                placeholderTextColor="#000"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                keyboardType="default"
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="new-password"
                                textContentType="password"
                            />
                            <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword((s) => !s)}>
                                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color={MAROON} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.labelMob}>Confirm Password:</Text>
                        <View style={styles.passwordWrap}>
                            <TextInput
                                style={styles.inputMobPassword}
                                placeholder="Enter your confirm password"
                                placeholderTextColor="#000"
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                secureTextEntry={!showConfirmPassword}
                                keyboardType="default"
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="new-password"
                                textContentType="password"
                            />
                            <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowConfirmPassword((s) => !s)}>
                                <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={18} color={MAROON} />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={[styles.nextBtnMob, isLoading && styles.nextBtnDisabled]}
                            onPress={handleNext}
                            disabled={isLoading}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.nextBtnMobText}>{isLoading ? 'Sending code...' : 'Next'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

/* =============== STYLES =============== */
const styles = StyleSheet.create({
    // ---- WEB ----
    pageWeb: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
    },
    cardWeb: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E7B9B9',
        backgroundColor: '#fff',
        paddingHorizontal: 18,
        paddingTop: 14,
        paddingBottom: 40,
        ...(Platform.OS === 'web' ? { boxShadow: '0px 4px 12px rgba(0,0,0,0.06)' } : {}),
    },
    headerRowWeb: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
        marginLeft: 6,
        marginTop: 12,
    },
    headerWeb: { fontSize: 16, fontWeight: '600', color: MAROON, marginLeft: 10 },
    webContent: { width: '100%', alignSelf: 'center' },
    logoWeb: { width: 64, height: 64, alignSelf: 'center', marginTop: 16, marginBottom: 12 },

    labelWeb: { color: MAROON, fontWeight: '600', marginTop: 14, marginBottom: 4, fontSize: 13 },

    inputWeb: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        paddingRight: 38,
        fontSize: 13,
        color: '#000',
        minHeight: 38,
        ...(Platform.OS === 'web' ? {} : { textAlignVertical: 'center' }),
    },
    inputWebPassword: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        paddingRight: 38,
        fontSize: 13,
        color: '#000',
        minHeight: 38,
        ...(Platform.OS === 'web' ? {} : { textAlignVertical: 'center' }),
    },

    nextBtnWeb: {
        marginTop: 18,
        height: 44,
        backgroundColor: MAROON,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nextBtnWebText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    infoBanner: {
        backgroundColor: '#f8d7da',
        borderColor: '#f5c2c7',
        borderWidth: 1,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        marginBottom: 12,
        alignSelf: 'stretch',
        marginTop: 8,
    },
    infoText: { color: '#842029', fontSize: 13, fontWeight: '600', textAlign: 'left' },

    errorBanner: {
        backgroundColor: '#fde2e4',
        padding: 8,
        borderRadius: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#f5c2c7',
    },
    errorText: { color: '#842029', fontSize: 13, fontWeight: '500' },

    // ---- MOBILE ----
    pageMobile: { flex: 1, backgroundColor: '#fff' },

    // ScrollView content keeps only horizontal padding; top/bottom are owned by SafeAreaView
    scrollMobile: {
        flexGrow: 1,
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 0,
    },

    mobileWrap: { width: '100%' },

    headerRowMobile: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: 10,
    },
    headerMobile: { fontSize: 17, fontWeight: '600', color: MAROON, marginLeft: 12 },

    bodyMobile: { width: '100%', paddingTop: 12, paddingBottom: 12 },
    logoMobile: { width: 100, height: 100, alignSelf: 'center', marginBottom: 18 },

    labelMob: { fontWeight: '600', color: MAROON, marginTop: 12, marginBottom: 6, fontSize: 14 },

    inputMob: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        padding: 10,
        paddingRight: 40,
        fontSize: 14,
        color: '#4b4949ff',
        minHeight: 44,
        ...(Platform.OS === 'web' ? {} : { textAlignVertical: 'center' }),
    },
    inputMobPassword: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        padding: 10,
        paddingRight: 40,
        fontSize: 14,
        color: '#4b4949ff',
        minHeight: 44,
        ...(Platform.OS === 'web' ? {} : { textAlignVertical: 'center' }),
    },

    passwordWrap: { position: 'relative', pointerEvents: 'box-none' },
    eyeIcon: { position: 'absolute', right: 14, top: 10, pointerEvents: 'auto' },

    nextBtnMob: {
        backgroundColor: MAROON,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 45,
    },
    nextBtnMobText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    infoBanners: {
        backgroundColor: '#f8d7da',
        borderColor: '#f5c2c7',
        borderWidth: 1,
        height: 52,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 14,
        alignSelf: 'stretch',
        marginTop: 8,
    },
    infoTexts: { color: '#842029', fontSize: 13, fontWeight: '600', textAlign: 'left', marginTop: 6, marginLeft: 9 },

    errorBanners: {
        backgroundColor: '#fde2e4',
        height: 52,
        padding: 10,
        borderRadius: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#f5c2c7',
    },
    errorTexts: { color: '#842029', fontSize: 14, fontWeight: '500', marginTop: 6, marginLeft: 9 },

    nextBtnDisabled: { backgroundColor: '#ccc', opacity: 0.7 },
});

// Modal styles for blocked user
const modalStyles = StyleSheet.create({
    backdrop: {
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 99999,
    },
    card: { 
        width: 400, 
        maxWidth: "100%", 
        backgroundColor: "#fff", 
        borderRadius: 14, 
        padding: 18, 
        alignItems: "center" 
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 999,
        backgroundColor: "#F7F1F0",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    title: { 
        color: "#531010", 
        fontSize: 16, 
        fontWeight: "900", 
        marginBottom: 4, 
        textAlign: "center" 
    },
    msg: { 
        color: "#531010", 
        fontSize: 13, 
        opacity: 0.9, 
        marginBottom: 14, 
        textAlign: "center" 
    },
    okBtn: { 
        backgroundColor: MAROON, 
        paddingVertical: 14, 
        borderRadius: 12, 
        width: "70%", 
        alignItems: "center", 
        justifyContent: "center" 
    },
    okText: { 
        color: "#fff", 
        fontWeight: "700" 
    },
});
