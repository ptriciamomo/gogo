// app/verify.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Image,
    KeyboardAvoidingView,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useRegistration } from '../stores/registration';

const MAROON = '#8B0000';
const OTP_TTL_SECONDS = 60;

export default function VerifyScreen() {
    const router = useRouter();
    const { email, password } =
        useLocalSearchParams<{ email?: string; password?: string }>();

    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === 'web' || width >= 900;

    // small responsive helpers for mobile widths
    const mobileInnerWidth = useMemo(() => Math.min(320, Math.max(260, width - 64)), [width]);

    const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);

    const inputsRef = useRef<(TextInput | null)[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const startCountdown = useCallback(() => {
        clearTimer();
        setSecondsLeft(OTP_TTL_SECONDS);
        timerRef.current = setInterval(() => {
            setSecondsLeft((s) => {
                if (s <= 1) {
                    clearTimer();
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
    }, []);

    const resetInputs = () => {
        setCode(['', '', '', '', '', '']);
        setTimeout(() => inputsRef.current[0]?.focus(), 0);
    };

    useFocusEffect(
        useCallback(() => {
            startCountdown();
            return () => clearTimer();
        }, [startCountdown])
    );
    useEffect(() => clearTimer, []);

    const resend = async () => {
        if (!email || resendLoading || secondsLeft > 0) return;
        setResendLoading(true);
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: String(email),
                options: { shouldCreateUser: true },
            });
            if (error) throw error;
            resetInputs();
            startCountdown();
        } catch (e: any) {
            Alert.alert('Email Error', e?.message || 'Failed to resend code.');
        } finally {
            setResendLoading(false);
        }
    };

    const distributePaste = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 6).split('');
        const next = ['', '', '', '', '', ''];
        for (let i = 0; i < digits.length; i++) next[i] = digits[i];
        setCode(next);
        inputsRef.current[Math.min(digits.length, 5)]?.focus();
    };

    const setDigit = (i: number, v: string) => {
        if (i === 0 && v.length > 1) return distributePaste(v);
        const d = v.replace(/\D/g, '').slice(0, 1);
        const next = [...code];
        next[i] = d;
        setCode(next);
        if (d && i < 5) inputsRef.current[i + 1]?.focus();
    };

    const handleKeyPress = (e: any, i: number) => {
        if (e.nativeEvent.key === 'Backspace' && !code[i] && i > 0) {
            inputsRef.current[i - 1]?.focus();
        }
    };

    const joinedCode = code.join('');
    const canVerify = joinedCode.length === 6 && !loading;

    const handleVerify = async () => {
        if (loading) return; // Prevent double submission
        
        if (joinedCode.length !== 6) {
            Alert.alert('Incomplete', 'Please enter the complete 6-digit code.');
            return;
        }
        
        if (!email) {
            Alert.alert('Missing email', 'No email for verification.');
            return;
        }

        if (secondsLeft <= 0) {
            Alert.alert('Code expired', 'Please resend code and try again.');
            return;
        }

        setLoading(true);
        try {
            // For new users created via signInWithOtp with shouldCreateUser: true, the OTP type is 'email'
            // Try 'email' first, then 'signup', then 'magiclink' as fallback
            const tryTypes: any[] = ['email', 'signup', 'magiclink'];
            let lastError: any = null;
            let verified = false;
            let verificationData: any = null;
            
            for (const t of tryTypes) {
                try {
                    const { data, error } = await supabase.auth.verifyOtp({
                        email: String(email),
                        token: joinedCode.trim(),
                        type: t,
                    } as any);
                    
                    if (!error && data) {
                        verified = true;
                        verificationData = data;
                        lastError = null;
                        console.log(`[OTP Verification] Successfully verified with type '${t}'`);
                        break;
                    }
                    if (error) {
                        lastError = error;
                        // Log the error for debugging but continue trying other types
                        console.log(`[OTP Verification] Type '${t}' failed:`, error.message, error.status);
                    }
                } catch (verifyErr: any) {
                    lastError = verifyErr;
                    console.log(`[OTP Verification] Type '${t}' exception:`, verifyErr?.message || verifyErr);
                }
            }
            
            if (!verified && lastError) {
                console.error('All OTP verification types failed:', lastError);
                // Provide more helpful error message
                const errorMsg = lastError?.message || lastError?.error_description || 'Could not verify code';
                if (errorMsg.includes('expired') || errorMsg.includes('invalid')) {
                    throw new Error('The verification code is invalid or has expired. Please request a new code.');
                } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
                    throw new Error('Verification failed. Please check your code and try again, or request a new code.');
                }
                throw lastError;
            }

            // Ensure session is established after verification
            let sessionEstablished = false;
            if (verificationData?.session) {
                // Session is already established from verifyOtp
                console.log('[OTP Verification] Session established successfully from verifyOtp');
                sessionEstablished = true;
            } else {
                // Wait a moment for session to be established, then verify
                console.log('[OTP Verification] Waiting for session to be established...');
                for (let i = 0; i < 3; i++) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
                    if (sessionData?.session) {
                        console.log('[OTP Verification] Session established after wait');
                        sessionEstablished = true;
                        break;
                    }
                    if (sessionError) {
                        console.warn('[OTP Verification] Session error:', sessionError);
                    }
                }
            }

            if (!sessionEstablished) {
                console.warn('[OTP Verification] Session not established, but proceeding...');
            }

            // Set password if provided
            if (password) {
                const { error: upErr } = await supabase.auth.updateUser({ password: String(password) });
                if (upErr) {
                    console.error('Password update error:', upErr);
                    // Don't throw - password update failure shouldn't block verification
                }
            }

            // Verify user is authenticated before proceeding
            let userAuthenticated = false;
            for (let i = 0; i < 3; i++) {
                const { data: userData, error: userError } = await supabase.auth.getUser();
                if (!userError && userData?.user) {
                    console.log('[OTP Verification] User authenticated successfully');
                    userAuthenticated = true;
                    break;
                }
                if (userError) {
                    console.warn(`[OTP Verification] getUser attempt ${i + 1} failed:`, userError.message);
                }
                if (i < 2) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            if (!userAuthenticated) {
                console.error('[OTP Verification] User not authenticated after verification attempts');
                throw new Error('Authentication failed. Please try verifying again.');
            }

            // Get the authenticated user's ID
            const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser();
            if (currentUserError || !currentUserData?.user?.id) {
                console.error('[OTP Verification] Could not get user ID after authentication');
                throw new Error('Could not retrieve user information. Please try again.');
            }
            const userId = currentUserData.user.id;

            // Check if user already has a record in the users table
            console.log('[OTP Verification] Checking if user record exists in database...');
            const { data: existingUser, error: checkError } = await supabase
                .from('users')
                .select('id')
                .eq('id', userId)
                .maybeSingle();

            if (checkError && checkError.code !== 'PGRST116') {
                // PGRST116 is "no rows returned" which is expected for new users
                console.warn('[OTP Verification] Error checking user existence:', checkError);
                // Continue anyway - we'll try to create the record
            }

            // If user doesn't exist, create a minimal record with id and email
            if (!existingUser) {
                console.log('[OTP Verification] User record not found, creating minimal record...');
                const { error: insertError } = await supabase
                    .from('users')
                    .insert({
                        id: userId,
                        email: String(email),
                        created_at: new Date().toISOString(),
                    });

                if (insertError) {
                    console.error('[OTP Verification] Failed to create user record:', insertError);
                    // Don't throw - allow user to proceed to account_confirm where they can complete registration
                    // The account_confirm page will handle creating/updating the record
                    console.warn('[OTP Verification] Continuing despite user record creation failure');
                } else {
                    console.log('[OTP Verification] User record created successfully');
                }
            } else {
                console.log('[OTP Verification] User record already exists');
            }

            // Update registration state
            useRegistration.getState().setFromRegisterTwo({ email: String(email) });
            
            // Navigate to account confirmation
            router.replace({ pathname: '/account_confirm', params: { email: String(email) } });
        } catch (e: any) {
            console.error('Verification error:', e);
            const errorMessage = e?.message || e?.error_description || 'Could not verify code. Please check your code and try again.';
            Alert.alert('Verification Failed', errorMessage);
        } finally {
            setLoading(false);
        }
    };

    // ---------- UI ----------
    if (isWeb) {
        return (
            <SafeAreaView edges={[] as any} style={[styles.container, styles.containerWeb]}>
                <View style={styles.cardWeb}>
                    <View style={styles.headerRowWebInside}>
                        <TouchableOpacity onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={16} color={MAROON} />
                        </TouchableOpacity>
                        <Text style={styles.headerWeb}>Verify Account</Text>
                    </View>

                    <View style={styles.innerWeb}>
                        <Image
                            source={require('../assets/images/logo.png')}
                            style={styles.logoWeb}
                            resizeMode="contain"
                        />
                        <Text style={styles.instructionsWeb}>
                            Get code from your umindanao email
                        </Text>
                        <Text style={styles.labelWeb}>Verification code:</Text>

                        <View style={styles.codeRowWeb}>
                            {code.map((d, i) => (
                                <TextInput
                                    key={i}
                                    ref={(r) => { inputsRef.current[i] = r; }}
                                    style={styles.codeBoxWeb}
                                    value={d}
                                    onChangeText={(t) => setDigit(i, t)}
                                    onKeyPress={(e) => handleKeyPress(e, i)}
                                    keyboardType="numeric"
                                    inputMode="numeric"
                                    maxLength={1}
                                    textAlign="center"
                                    autoFocus={i === 0}
                                />
                            ))}
                        </View>

                        <TouchableOpacity
                            style={styles.resendBtnWeb}
                            onPress={resend}
                            disabled={resendLoading || secondsLeft > 0}
                        >
                            <Text style={styles.resendTxtWeb}>
                                {secondsLeft > 0
                                    ? `Resend in ${secondsLeft}s`
                                    : resendLoading
                                        ? 'Sending...'
                                        : 'Resend code'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.verifyBtnWeb, (!canVerify || loading) && styles.verifyBtnDisabled]}
                            onPress={handleVerify}
                            disabled={!canVerify || loading}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.verifyTxtWeb}>
                                {loading ? 'Verifying...' : 'Verify Code'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    // ===== MOBILE =====
    return (
        // Non-scrolling safe areas (top/bottom)
        <SafeAreaView edges={['top', 'bottom']} style={styles.containerMobile}>
            <StatusBar barStyle="dark-content" />
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                {/* Scrolling form with NO top/bottom padding (only horizontal) */}
                <ScrollView
                    style={{ flex: 1, width: '100%' }}
                    contentContainerStyle={styles.scrollMobile}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                <View style={styles.headerRowMobile}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={MAROON} />
                    </TouchableOpacity>
                    <Text style={styles.headerMobile}>Verify Account</Text>
                </View>

                <View style={styles.mobileOuter}>
                    <Image
                        source={require('../assets/images/logo.png')}
                        style={styles.logoMobile}
                        resizeMode="contain"
                    />

                    <Text style={styles.instructionsMobile}>
                        Get code from your umindanao email
                    </Text>

                    <View style={[styles.mobileInner, { width: mobileInnerWidth }]}>
                        <Text style={styles.labelMobile}>Verification code:</Text>

                        <View style={[styles.codeRowMobile, { width: mobileInnerWidth }]}>
                            {code.map((d, i) => (
                                <TextInput
                                    key={i}
                                    ref={(r) => { inputsRef.current[i] = r; }}
                                    style={styles.codeBoxMobile}
                                    value={d}
                                    onChangeText={(t) => setDigit(i, t)}
                                    onKeyPress={(e) => handleKeyPress(e, i)}
                                    keyboardType="number-pad"
                                    inputMode="numeric"
                                    textContentType="oneTimeCode"
                                    maxLength={1}
                                    textAlign="center"
                                    autoFocus={i === 0}
                                    showSoftInputOnFocus={true}
                                    selectTextOnFocus={false}
                                />
                            ))}
                        </View>

                        <TouchableOpacity
                            style={[styles.resendBtnMobile, { width: mobileInnerWidth }]}
                            onPress={resend}
                            disabled={resendLoading || secondsLeft > 0}
                        >
                            <Text
                                style={[
                                    styles.resendTxtMobile,
                                    (resendLoading || secondsLeft > 0) && { opacity: 0.5 },
                                ]}
                            >
                                {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.verifyBtnMobile,
                                { width: mobileInnerWidth },
                                (!canVerify || loading) && styles.verifyBtnDisabled,
                            ]}
                            onPress={handleVerify}
                            disabled={!canVerify || loading}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.verifyTxtMobile}>
                                {loading ? 'Verifying...' : 'Verify Code'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    /* shared container for web */
    container: { flex: 1, backgroundColor: '#fff', padding: 24 },

    /* ------- MOBILE ------- */
    containerMobile: { flex: 1, backgroundColor: '#fff' }, // no padding; safe area owns top/bottom
    // content container: ONLY horizontal padding; NO top/bottom so margins don't scroll
    scrollMobile: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 0 },

    headerRowMobile: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        marginLeft: 20,
        marginTop: 25,
    },
    headerMobile: { fontSize: 19, fontWeight: '700', color: MAROON },

    mobileOuter: { flex: 1, alignItems: 'center' },
    logoMobile: { width: 90, height: 90, marginTop: 20, marginBottom: 12 },
    instructionsMobile: {
        fontSize: 17,
        color: MAROON,
        textAlign: 'center',
        fontWeight: '500',
        marginBottom: 16,
    },

    mobileInner: { alignItems: 'center' }, // width is set responsively inline

    labelMobile: {
        fontSize: 16,
        fontWeight: '700',
        color: MAROON,
        alignSelf: 'flex-start',
        marginTop: 16,
        marginBottom: 12,
    },

    codeRowMobile: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 20,
    },

    codeBoxMobile: {
        width: 50,
        height: 55,
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 10,
        fontSize: 20,
        fontWeight: 'bold',
        color: MAROON,
        backgroundColor: '#fff',
        textAlign: 'center',
        paddingTop: 5,
        paddingBottom: 0,
        includeFontPadding: false,
    },

    resendBtnMobile: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 14 },
    resendTxtMobile: { fontSize: 14, color: MAROON },

    verifyBtnMobile: {
        backgroundColor: MAROON,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        height: 55,
        marginTop: 6,
    },
    verifyBtnDisabled: { backgroundColor: '#ccc' },
    verifyTxtMobile: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 4 },

    /* ------- WEB ------- */
    containerWeb: { alignItems: 'center', justifyContent: 'center' },
    cardWeb: {
        width: '100%',
        maxWidth: 540,
        borderWidth: 1,
        borderColor: '#E7B9B9',
        borderRadius: 10,
        backgroundColor: '#fff',
        paddingVertical: 18,
        paddingHorizontal: 18,
    },
    headerRowWebInside: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
        marginTop: 10,
        marginLeft: 6,
    },
    headerWeb: { fontSize: 15, fontWeight: '600', color: MAROON },
    innerWeb: { alignItems: 'center' },
    logoWeb: { width: 64, height: 64, marginTop: 8, marginBottom: 8 },
    instructionsWeb: {
        fontSize: 13,
        color: MAROON,
        textAlign: 'center',
        marginBottom: 12,
        fontWeight: '500',
    },
    labelWeb: {
        fontSize: 13,
        fontWeight: '600',
        color: MAROON,
        alignSelf: 'flex-start',
        marginBottom: 20,
        marginLeft: 100,
        marginTop: 20,
    },
    codeRowWeb: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: 280,
        marginBottom: 10,
    },
    codeBoxWeb: {
        width: 36,
        height: 42,
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        fontSize: 16,
        fontWeight: 'bold',
        color: MAROON,
        backgroundColor: '#fff',
        textAlign: 'center',
        paddingVertical: 0,
        lineHeight: 42,
    },
    resendBtnWeb: { alignItems: 'flex-start', width: 280, marginBottom: 10 },
    resendTxtWeb: { fontSize: 13, color: MAROON, textDecorationLine: 'underline' },
    verifyBtnWeb: {
        backgroundColor: MAROON,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        width: 280,
        marginTop: 8,
        marginBottom: 20,
    },
    verifyTxtWeb: { color: '#fff', fontSize: 15, fontWeight: '600' },
});