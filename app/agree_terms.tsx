// TermsAndConditions.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    Image,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
    onAgree?: () => void;   // optional; router fallback used if not provided
    onDecline?: () => void; // optional; router fallback used if not provided
    onClose?: () => void;   // used by mobile "X"
};

export default function TermsAndConditions({
    onAgree,
    onDecline,
    onClose,
}: Props) {
    const router = useRouter();
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // Breakpoints (kept simple; tweak as desired)
    const isXS = width < 360;
    const isSM = width >= 360 && width < 600;
    const isMD = width >= 600 && width < 900;
    const isLG = width >= 900;
    const isXL = width >= 1200;

    // Treat large screens as "web layout"; also keep Platform web
    const isWeb = Platform.OS === 'web' || isLG;

    const [ack, setAck] = useState(false);

    const sections = useMemo(
        () => [
            {
                title: 'Acceptance of Terms',
                body:
                    'By accessing or using this application (the “GoBuddy”), you agree to the following Terms and Conditions. If you do not agree, you must not use the App.',
            },
            {
                title: '1. Eligibility and Scope of Use',
                body:
                    'This App is intended for students and authorized members of the University community. You must use the App solely for University-related purposes and within the University’s approved community and locations.',
            },
            {
                title: '2. User Responsibilities',
                body:
                    'You are responsible for your actions, communications, and content while using the App. You agree not to engage in any illegal, harmful, harassing, fraudulent, or disruptive activities, and not to misuse or attempt unauthorized access to the App. All interactions and agreements between users are entered into voluntarily and at their own risk.'+ '\n' + '\n' + 
                    'Users who receive three (3) valid reports for misconduct, harassment, or any form of misbehavior may be automatically blocked from accessing the App. However, users will receive warnings prior to being permanently blocked to allow them the opportunity to correct their behavior.',
            },
            {
                title: '3. Platform Purpose and Limitation',
                body:
                    'The App serves only as a medium to connect users who wish to request or provide errands or assistance. The University does not supervise, control, manage, or participate in any transactions or agreements made between users. Any arrangements, payments, or outcomes resulting from the use of the App are solely the responsibility of the users involved.',
            },
            {
                title: '4. Account and Security',
                body:
                    'You must keep your login credentials secure and confidential. You are responsible for all activities conducted under your account. Any suspected unauthorized use or security concerns should be reported immediately.',
            },
            {
                title: '5. Inactive Accounts',
                body:
                    'Accounts that remain inactive for twelve (12) consecutive months may be deactivated or blocked automatically.',
            },
            
            {
                title: '6. Independence of Transactions',
                body:
                    'The University is not a party to any transactions or arrangements made between users. It does not verify, guarantee, or endorse any services or payments made through the App. Users are encouraged to act with caution and discretion.',
            },
            
            {
                title: '7.  Disclaimer of Liability',
                body:
                    'The App is provided “as is” without any guarantee of accuracy, reliability, or uninterrupted service. The University is not liable for any loss, damage, or issue arising from the use or misuse of the App',
            },
            
            {
                title: '8. Updates and Termination',
                body:
                    'The University may update, suspend, or discontinue the App at any time. Continued use after changes to these Terms constitutes acceptance of the revised version.',
            },
            
        ],
        []
    );

    const handleAgree = () => {
        if (!ack) return;
        onAgree?.();
        router.replace('/register');
    };

    const handleDecline = () => {
        onDecline?.();
        router.replace('/');
    };

    // ========= Responsive style overrides (keeps original look) =========
    // WEB card responsive sizing
    const webCardStyle = useMemo(() => {
        // base width percentage + maxWidth tuned per breakpoint
        const maxW = isLG ? 820 : isMD ? 740 : 660;
        // card height scales with viewport; stays within reasonable bounds
        const cardH = Math.max(520, Math.min(Math.floor(height * 0.8), 720));
        return {
            width: isLG ? '72%' : '90%',
            maxWidth: maxW,
            height: cardH,
            paddingHorizontal: 28,
            paddingTop: 28,
            paddingBottom: 16,
        } as const;
    }, [isLG, isMD, height]);

    // WEB scrollable body height (inside the card)
    const webBodyStyle = useMemo(() => {
        // Leave room for title + ack + buttons; adapt to viewport/card height
        const maxBodyH = Math.max(320, Math.min(Math.floor(height * 0.5), 520));
        return {
            maxHeight: maxBodyH,
            paddingHorizontal: 16,
            paddingVertical: 14,
        } as const;
    }, [height]);

    // MOBILE card responsive sizing
    const mobileCardStyle = useMemo(() => {
        // Keep small margins on tiny phones; allow wider phones to grow a bit
        const horizontalMargin = isXS ? 12 : 16;
        const computedMaxWidth = Math.min(420, width - horizontalMargin * 2);
        // Use most of the available height while respecting safe areas
        const maxH = Math.min(
            Math.max(560, Math.floor(height - (insets.top + insets.bottom) - 24)),
            720
        );
        return {
            width: '100%',
            maxWidth: computedMaxWidth,
            maxHeight: maxH,
            paddingHorizontal: 12,
            paddingTop: 16,
            paddingBottom: 0,
        } as const;
    }, [width, height, insets.top, insets.bottom, isXS]);

    // MOBILE header blank spacing adjusts with status/nav bars
    const headerBlankStyle = useMemo(() => {
        return {
            height: Math.max(16, Math.min(28, insets.top * 0.5 + 20)),
            width: '80%',
        } as const;
    }, [insets.top]);

    // Slight font tweaks on very small screens
    const headerTitleSize = isXS ? 14 : 15;

    return (
        <SafeAreaView
            style={[styles.page, isWeb ? styles.pageWeb : styles.pageMobile]}
            edges={['top', 'bottom']}
        >
            {/* Full-width header blank space outside the card (MOBILE ONLY) */}
            {!isWeb && <View style={[styles.headerBlank, headerBlankStyle]} />}

            {isWeb ? (
                // ======= WEB / DESKTOP =======
                <View style={[styles.webCard, webCardStyle]}>
                    <View style={styles.webTitleRow}>
                        <Image 
                            source={require('../assets/images/logo.png')} 
                            style={[
                                styles.logoSm,
                                isSM && { width: 24, height: 24 },
                                isMD && { width: 26, height: 26 },
                                isLG && { width: 28, height: 28 },
                                isXL && { width: 32, height: 32 },
                            ]} 
                            resizeMode="contain" 
                        />
                        <Text style={[
                            styles.title,
                            isSM && { fontSize: 16 },
                            isMD && { fontSize: 17 },
                            isLG && { fontSize: 18 },
                            isXL && { fontSize: 20 },
                        ]}>Terms and Conditions</Text>
                    </View>

                    <View style={[styles.webBody, webBodyStyle]}>
                        <ScrollView showsVerticalScrollIndicator contentContainerStyle={styles.bodyContent}>
                            {sections.map((s, idx) => (
                                <View key={idx} style={{ marginBottom: 18 }}>
                                    <Text style={[
                                        styles.sectionTitleWeb,
                                        isSM && { fontSize: 14, marginBottom: 4 },
                                        isMD && { fontSize: 15, marginBottom: 5 },
                                        isLG && { fontSize: 16, marginBottom: 6 },
                                        isXL && { fontSize: 17, marginBottom: 6 },
                                    ]}>{s.title}</Text>
                                    <Text style={[
                                        styles.paragraphWeb,
                                        isSM && { fontSize: 12, lineHeight: 18 },
                                        isMD && { fontSize: 13, lineHeight: 20 },
                                        isLG && { fontSize: 14, lineHeight: 22 },
                                        isXL && { fontSize: 15, lineHeight: 24 },
                                    ]}>{s.body}</Text>
                                </View>
                            ))}
                        </ScrollView>
                    </View>

                    <Pressable
                        onPress={() => setAck(!ack)}
                        style={({ pressed }) => [styles.ackRow, pressed && { opacity: 0.9 }, { marginTop: 10, marginBottom: 18 }]}
                        hitSlop={8}
                    >
                        <View style={[
                            styles.checkbox,
                            ack && styles.checkboxChecked,
                            isSM && { width: 16, height: 16 },
                            isMD && { width: 17, height: 17 },
                            isLG && { width: 18, height: 18 },
                            isXL && { width: 20, height: 20 },
                        ]}>
                            {ack && <Ionicons 
                                name="checkmark" 
                                size={isSM ? 11 : isMD ? 12 : isLG ? 13 : 15} 
                                color="#fff" 
                            />}
                        </View>
                        <Text style={[
                            styles.ackTextWeb,
                            isSM && { fontSize: 12.5 },
                            isMD && { fontSize: 13.5 },
                            isLG && { fontSize: 14.5 },
                            isXL && { fontSize: 15.5 },
                        ]}>
                            I acknowledge that I have read and agree to <Text style={styles.linkStrong}>GoBuddy&apos;s Terms and Conditions.</Text>
                        </Text>
                    </Pressable>

                    <View style={styles.webBtnRow}>
                        <TouchableOpacity
                            disabled={!ack}
                            onPress={handleAgree}
                            style={[
                                styles.btn, 
                                styles.btnAgree, 
                                !ack && styles.btnDisabled,
                                isSM && { minWidth: 100, paddingVertical: 8 },
                                isMD && { minWidth: 115, paddingVertical: 9 },
                                isLG && { minWidth: 130, paddingVertical: 10 },
                                isXL && { minWidth: 150, paddingVertical: 12 },
                            ]}
                            activeOpacity={0.90}
                        >
                            <Text style={[
                                styles.btnAgreeText, 
                                !ack && styles.btnDisabledText,
                                isSM && { fontSize: 13 },
                                isMD && { fontSize: 14 },
                                isLG && { fontSize: 14 },
                                isXL && { fontSize: 15 },
                            ]}>Agree</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            onPress={handleDecline} 
                            style={[
                                styles.btn, 
                                styles.btnOutline,
                                isSM && { minWidth: 100, paddingVertical: 8 },
                                isMD && { minWidth: 115, paddingVertical: 9 },
                                isLG && { minWidth: 130, paddingVertical: 10 },
                                isXL && { minWidth: 150, paddingVertical: 12 },
                            ]} 
                            activeOpacity={0.90}
                        >
                            <Text style={[
                                styles.btnOutlineText,
                                isSM && { fontSize: 13 },
                                isMD && { fontSize: 14 },
                                isLG && { fontSize: 14 },
                                isXL && { fontSize: 15 },
                            ]}>Decline</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                // ======= MOBILE (Android-focused; iOS shares same layout) =======
                <View style={[styles.mobileCard, mobileCardStyle]}>
                    {/* Header */}
                    <View style={styles.mobileHeader}>
                        <View style={styles.headerLeft}>
                            <Image source={require('../assets/images/logo.png')} style={styles.logoTiny} resizeMode="contain" />
                            <Text style={[styles.headerTitle, { fontSize: headerTitleSize }]}>Terms and Conditions</Text>
                        </View>
                        <TouchableOpacity onPress={onClose ?? handleDecline} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close" size={18} color="#8B0000" />
                        </TouchableOpacity>
                    </View>

                    {/* Scrollable CONTENT (Agree button lives here for BOTH platforms) */}
                    <ScrollView
                        showsVerticalScrollIndicator
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={[
                            styles.mobileContent,
                            { paddingBottom: 24 + (insets.bottom || 0) }, // space above gesture bar/soft-nav
                        ]}
                    >
                        {sections.map((s, idx) => (
                            <View key={idx} style={{ marginBottom: 14 }}>
                                <Text style={styles.sectionTitleMobile}>{s.title}</Text>
                                <Text style={styles.paragraphMobile}>{s.body}</Text>
                            </View>
                        ))}

                        {/* Acknowledgement */}
                        <Pressable
                            onPress={() => setAck(!ack)}
                            style={({ pressed }) => [styles.ackRow, pressed && { opacity: 0.9 }, { marginTop: 8, paddingVertical: 6 }]}
                            hitSlop={8}
                        >
                            <View style={[styles.checkbox, ack && styles.checkboxChecked]}>
                                {ack && <Ionicons name="checkmark" size={14} color="#fff" />}
                            </View>
                            <Text style={styles.ackTextMobile}>
                                I acknowledge that I have read and agree to <Text style={styles.linkStrong}>GoBuddy&apos;s Terms and Conditions.</Text>
                            </Text>
                        </Pressable>

                        {/* Primary action (inside scroll on BOTH platforms) */}
                        <TouchableOpacity
                            disabled={!ack}
                            onPress={handleAgree}
                            style={[styles.btnMobilePrimary, !ack && styles.btnDisabled, { marginTop: 12 }]}
                            activeOpacity={0.85}
                        >
                            <Text style={[styles.btnMobilePrimaryText, !ack && styles.btnDisabledText]}>Agree</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            )}
        </SafeAreaView>
    );
}

const MAROON = '#8B0000';

const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: '#fff', alignItems: 'center' },

    // WEB centered vertically
    pageWeb: { justifyContent: 'center', paddingVertical: 0 },

    // MOBILE
    pageMobile: { justifyContent: 'flex-start' },

    // mobile-only header blank space
    headerBlank: { width: '80%', backgroundColor: '#fff' },

    // ===== Web card =====
    webCard: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E9D5D5',
        backgroundColor: '#fff',
    },
    webTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 8,
    },
    title: { fontSize: 18, fontWeight: '800', color: MAROON },
    webBody: {
        borderWidth: 1,
        borderColor: '#E9D5D5',
        borderRadius: 8,
        marginTop: 8,
    },
    bodyContent: { paddingBottom: 6 },
    webBtnRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 14 },
    sectionTitleWeb: {
        fontSize: 16,
        fontWeight: '700',
        color: '#512B2B',
        marginBottom: 6,
        marginTop: 6,
    },
    paragraphWeb: {
        fontSize: 14,
        lineHeight: 22,
        color: '#2B2B2B',
        textAlign: 'justify',
        paddingLeft: 10,
        paddingRight: 12,
    },

    // ===== Mobile card =====
    mobileCard: {
        height: '100%',
        alignSelf: 'center',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E9D5D5',
        backgroundColor: '#fff',
        overflow: 'hidden',
    },
    mobileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomColor: '#E9D5D5',
        borderBottomWidth: 1,
        paddingBottom: 8,
        marginBottom: 8,
        justifyContent: 'space-between',
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerTitle: { fontSize: 15, fontWeight: '700', color: MAROON, marginTop: 20, marginBottom: 16, marginLeft: 6 },
    mobileContent: { paddingLeft: 12, paddingRight: 12 },

    sectionTitleMobile: {
        fontSize: 16,
        fontWeight: '700',
        color: '#512B2B',
        marginBottom: 6,
        marginTop: 6,
    },
    paragraphMobile: { fontSize: 14, lineHeight: 22, color: '#2B2B2B', textAlign: 'justify' },

    // ===== Shared pieces =====
    ackRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    checkbox: {
        width: 18,
        height: 18,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: MAROON,
        marginRight: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    checkboxChecked: { backgroundColor: MAROON },
    ackTextWeb: { fontSize: 14.5, color: '#333', flex: 1 },
    ackTextMobile: { fontSize: 13, color: '#333', flex: 1 },
    linkStrong: { color: MAROON, fontWeight: '700' },

    // Web buttons
    btn: { minWidth: 130, paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
    btnAgree: { backgroundColor: '#EAF6EA', borderWidth: 1, borderColor: '#B7E0B7' },
    btnAgreeText: { color: '#2C7A2C', fontWeight: '700' },
    btnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: MAROON },
    btnOutlineText: { color: MAROON, fontWeight: '700' },

    // Disabled
    btnDisabled: { opacity: 0.6 },
    btnDisabledText: { color: '#777' },

    // Mobile primary button (inside ScrollView for BOTH platforms)
    btnMobilePrimary: {
        marginTop: 0,
        backgroundColor: MAROON,
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
    },
    btnMobilePrimaryText: { color: '#fff', fontWeight: '700' },

    // Logos
    logoSm: { width: 28, height: 28 },
    logoTiny: { width: 30, height: 30 },
});
