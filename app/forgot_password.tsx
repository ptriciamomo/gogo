// app/forgot_password.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
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

export default function ForgotPasswordScreen() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isWeb = Platform.OS === 'web' || width >= 900;
    
    // Responsive breakpoints for web
    const isSmallScreen = width < 600;
    const isMediumScreen = width >= 600 && width < 900;
    const isLargeScreen = width >= 900;

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [emailSent, setEmailSent] = useState(false);

    const handleSendResetLink = async () => {
        if (!email.trim()) {
            Alert.alert('Missing Email', 'Please enter your email address.');
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            Alert.alert('Invalid Email', 'Please enter a valid email address.');
            return;
        }

        try {
            setLoading(true);
            
            // Use Supabase's resetPasswordForEmail to send reset link
            // IMPORTANT: The redirect URL must be whitelisted in Supabase Dashboard:
            // Authentication > URL Configuration > Redirect URLs
            let redirectTo = '/reset_password';
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                // Use full URL with protocol for web
                // Make sure to use the exact URL format Supabase expects
                const origin = window.location.origin;
                redirectTo = `${origin}/reset_password`;
                
                // Remove trailing slash if present
                redirectTo = redirectTo.replace(/\/$/, '');
            }
            
            console.log('[Password Reset] Sending reset email to:', email.trim());
            console.log('[Password Reset] Redirect URL:', redirectTo);
            console.log('[Password Reset] Platform:', Platform.OS);
            
            // Call Supabase resetPasswordForEmail
            // Note: Supabase will send the email if:
            // 1. The redirect URL is whitelisted in Supabase Dashboard
            // 2. Email service is configured (SMTP or default)
            // 3. The email address exists in the system
            const { data, error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: redirectTo,
            });

            if (error) {
                console.error('[Password Reset] Error details:', {
                    message: error.message,
                    status: error.status,
                    name: error.name,
                    code: (error as any).code,
                });
                
                // Check for specific errors that we should handle differently
                const errorMsg = error.message?.toLowerCase() || '';
                
                if (errorMsg.includes('rate limit') || errorMsg.includes('too many') || errorMsg.includes('429')) {
                    Alert.alert(
                        'Too Many Requests',
                        'Please wait a few minutes before requesting another password reset link.',
                        [{ text: 'OK' }]
                    );
                    setLoading(false);
                    return;
                }
                
                // Check if it's a configuration error (redirect URL not whitelisted)
                if (errorMsg.includes('redirect') || errorMsg.includes('url') || errorMsg.includes('invalid')) {
                    console.error('[Password Reset] Configuration error - redirect URL may not be whitelisted in Supabase dashboard');
                    // Still show success for security, but log the issue
                }
                
                // For other errors, still show success for security (don't reveal if email exists)
                // But log the error for debugging
            } else {
                console.log('[Password Reset] Email sent successfully. Response:', data);
            }

            // Always show success message for security (don't reveal if email exists)
            // Note: The redirect URL must be whitelisted in Supabase Dashboard > Authentication > URL Configuration
            setEmailSent(true);
        } catch (error: any) {
            console.error('[Password Reset] Exception:', error);
            console.error('[Password Reset] Error stack:', error?.stack);
            // Still show success for security
            setEmailSent(true);
        } finally {
            setLoading(false);
        }
    };

    if (isWeb) {
        // Calculate responsive card width
        let cardWidth: DimensionValue = '100%';
        if (isLargeScreen) {
            cardWidth = 480; // Fixed width for large screens
        } else if (isMediumScreen) {
            cardWidth = '90%'; // 90% width for medium screens
        } else {
            cardWidth = '95%'; // 95% width for small screens
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
                        <TouchableOpacity onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={isSmallScreen ? 16 : 18} color={MAROON} />
                        </TouchableOpacity>
                        <Text style={[
                            styles.headerWeb as TextStyle,
                            { fontSize: isSmallScreen ? 14 : 16 }
                        ]}>Forgot Password</Text>
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

                        {!emailSent ? (
                            <>
                                <Text style={[
                                    styles.descriptionWeb as TextStyle,
                                    { fontSize: isSmallScreen ? 12 : 13, marginBottom: isSmallScreen ? 16 : 20 }
                                ]}>
                                    Enter your email address and we'll send you a link to reset your password.
                                </Text>

                                <Text style={[
                                    styles.labelWeb as TextStyle,
                                    { fontSize: isSmallScreen ? 12 : 13 }
                                ]}>Email address:</Text>
                                <TextInput
                                    style={[
                                        styles.inputWeb as TextStyle,
                                        {
                                            height: isSmallScreen ? 38 : 40,
                                            fontSize: isSmallScreen ? 13 : 14,
                                        }
                                    ]}
                                    placeholder="Enter your email address"
                                    placeholderTextColor="#aaa"
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    value={email}
                                    onChangeText={setEmail}
                                    editable={!loading}
                                />

                                <TouchableOpacity
                                    style={[
                                        styles.nextBtnWeb as ViewStyle, 
                                        loading && { opacity: 0.65 },
                                        {
                                            height: isSmallScreen ? 40 : 42,
                                            marginTop: isSmallScreen ? 20 : 24,
                                        }
                                    ]}
                                    onPress={handleSendResetLink}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={[
                                            styles.nextBtnWebText as TextStyle,
                                            { fontSize: isSmallScreen ? 14 : 15 }
                                        ]}>Send Reset Link</Text>
                                    )}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <View style={styles.successContainer as ViewStyle}>
                                    <Ionicons name="checkmark-circle" size={isSmallScreen ? 48 : 60} color="#10B981" />
                                    <Text style={[
                                        styles.successTitle as TextStyle,
                                        { fontSize: isSmallScreen ? 16 : 18 }
                                    ]}>Email Sent!</Text>
                                    <Text style={[
                                        styles.successText as TextStyle,
                                        { fontSize: isSmallScreen ? 12 : 13 }
                                    ]}>
                                        If an account with that email exists, we've sent you a password reset link. Please check your email (including spam/junk folder) and follow the instructions.
                                    </Text>
                                    <Text style={[
                                        styles.successNote as TextStyle,
                                        { fontSize: isSmallScreen ? 11 : 12, marginTop: 8 }
                                    ]}>
                                        Note: If you don't receive the email, please check your spam folder or contact support.
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    style={[
                                        styles.nextBtnWeb as ViewStyle, 
                                        {
                                            height: isSmallScreen ? 40 : 42,
                                            marginTop: isSmallScreen ? 20 : 24,
                                        }
                                    ]}
                                    onPress={() => router.replace('/login')}
                                >
                                    <Text style={[
                                        styles.nextBtnWebText as TextStyle,
                                        { fontSize: isSmallScreen ? 14 : 15 }
                                    ]}>Back to Login</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    // Mobile version
    return (
        <SafeAreaView style={styles.pageMobile as ViewStyle}>
            <View style={styles.headerRowMobile as ViewStyle}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={20} color={MAROON} />
                </TouchableOpacity>
                <Text style={styles.headerMobile as TextStyle}>Forgot Password</Text>
            </View>

            <View style={styles.bodyMobile as ViewStyle}>
                <Image
                    source={require('../assets/images/logo.png')}
                    style={styles.logoMobile as ImageStyle}
                    resizeMode="contain"
                />

                {!emailSent ? (
                    <>
                        <Text style={styles.descriptionMob as TextStyle}>
                            Enter your email address and we'll send you a link to reset your password.
                        </Text>

                        <Text style={styles.labelMob as TextStyle}>Enter your email address:</Text>
                        <TextInput
                            style={styles.inputMob as TextStyle}
                            placeholder="Email address"
                            placeholderTextColor="#aaa"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            value={email}
                            onChangeText={setEmail}
                            editable={!loading}
                        />

                        <TouchableOpacity
                            style={[styles.loginBtnMob as ViewStyle, loading && { opacity: 0.65 }]}
                            onPress={handleSendResetLink}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginTextMob as TextStyle}>Send Reset Link</Text>}
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <View style={styles.successContainer as ViewStyle}>
                            <Ionicons name="checkmark-circle" size={60} color="#10B981" />
                            <Text style={styles.successTitle as TextStyle}>Email Sent!</Text>
                            <Text style={styles.successText as TextStyle}>
                                If an account with that email exists, we've sent you a password reset link. Please check your email (including spam/junk folder) and follow the instructions.
                            </Text>
                            <Text style={[styles.successNote as TextStyle, { marginTop: 8 }]}>
                                Note: If you don't receive the email, please check your spam folder or contact support.
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={styles.loginBtnMob as ViewStyle}
                            onPress={() => router.replace('/login')}
                        >
                            <Text style={styles.loginTextMob as TextStyle}>Back to Login</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
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
    nextBtnWeb: {
        backgroundColor: MAROON,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    } as ViewStyle,
    nextBtnWebText: { color: '#fff', fontWeight: '600' } as TextStyle,
    successContainer: {
        alignItems: 'center',
        marginVertical: 20,
    } as ViewStyle,
    successTitle: {
        fontWeight: '700',
        color: MAROON,
        marginTop: 12,
        marginBottom: 8,
    } as TextStyle,
    successText: {
        color: '#666',
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 8,
    } as TextStyle,
    successNote: {
        color: '#999',
        textAlign: 'center',
        lineHeight: 18,
        paddingHorizontal: 8,
        fontStyle: 'italic',
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
    } as TextStyle,
    loginBtnMob: {
        backgroundColor: MAROON,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    } as ViewStyle,
    loginTextMob: { color: '#fff', fontWeight: '600', fontSize: 15 } as TextStyle,
});

