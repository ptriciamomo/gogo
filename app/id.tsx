// app/id.tsx (StudentIdUploadScreen)
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
    TouchableOpacity,
    View,
    useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRegistration } from '../stores/registration';

const MAROON = '#8B0000';

export default function StudentIdUploadScreen() {
    const router = useRouter();
    const { width: winW } = useWindowDimensions();
    const isMD = winW >= 600 && winW < 900;
    const isLG = winW >= 900;
    const isWeb = Platform.OS === 'web' || isLG;

    const setFromId = useRegistration((s) => s.setFromId);

    // Web card width (≈30–42% of viewport, clamped 360–560px)
    const containerWidth = useMemo(() => {
        if (!isWeb) return '100%';
        const pct = isLG ? 0.30 : isMD ? 0.36 : 0.42;
        const computed = Math.floor(winW * pct);
        return Math.min(Math.max(360, computed), 560);
    }, [isWeb, isLG, isMD, winW]);

    // Mobile: narrow the form so inputs don’t hug edges
    const mobileWrapStyle = useMemo(() => {
        const sideMargin = 18;
        const clamp = 408;
        const maxWidth = Math.min(clamp, winW - sideMargin * 2);
        return { maxWidth, width: '100%', alignSelf: 'center', paddingHorizontal: 6 } as const;
    }, [winW]);

    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('');

    // ---------- helpers ----------
    const guessExt = (uri?: string) => {
        if (!uri) return 'jpg';
        const m = uri.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
        let ext = (m?.[1] || 'jpg').toLowerCase();
        if (ext === 'heic' || ext === 'heif') ext = 'jpg';
        return ext;
    };
    const rand4 = () => Math.floor(1000 + Math.random() * 9000);
    const autoName = (uri: string, source: 'library' | 'camera') =>
        source === 'library' ? `img.${guessExt(uri)}` : `img${rand4()}.${guessExt(uri)}`;

    // Works across Expo SDK variants
    const getMediaTypesOption = (): any => {
        const IP: any = ImagePicker as any;
        if (IP?.MediaType?.Image) return { mediaTypes: [IP.MediaType.Image] };
        if (IP?.MediaType?.Images) return { mediaTypes: [IP.MediaType.Images] };
        if (IP?.MediaTypeOptions?.Images != null) return { mediaTypes: IP.MediaTypeOptions.Images };
        if (IP?.MediaTypeOptions?.All != null) return { mediaTypes: IP.MediaTypeOptions.All };
        return { mediaTypes: 'images' as any };
    };

    const requestCameraPermissions = async () => {
        if (Platform.OS !== 'web') {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Camera permission is required to take photos.');
                return false;
            }
        }
        return true;
    };

    const requestLibraryPermissions = async () => {
        if (Platform.OS !== 'web') {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Photo library permission is required to choose a photo.');
                return false;
            }
        }
        return true;
    };

    // ---------- actions ----------
    const handleFileSelect = async () => {
        try {
            const ok = await requestLibraryPermissions();
            if (!ok) return;

            const result = await ImagePicker.launchImageLibraryAsync({
                ...getMediaTypesOption(),
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                const a = result.assets[0];
                setSelectedFile(a.uri);
                setFileName(a.fileName ?? autoName(a.uri, 'library'));
            }
        } catch {
            Alert.alert('Error', 'Failed to select photo. Please try again.');
        }
    };

    const handleCameraCapture = async () => {
        const ok = await requestCameraPermissions();
        if (!ok) return;

        try {
            const result = await ImagePicker.launchCameraAsync({
                ...getMediaTypesOption(),
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                const a = result.assets[0];
                setSelectedFile(a.uri);
                setFileName(a.fileName ?? autoName(a.uri, 'camera'));
            }
        } catch {
            Alert.alert('Error', 'Failed to capture photo. Please try again.');
        }
    };

    const handleClear = () => {
        setSelectedFile(null);
        setFileName('');
    };

    const handleNext = () => {
        if (!selectedFile) {
            Alert.alert('No File Selected', 'Please upload your Student ID or take a photo.');
            return;
        }

        // Store the image URI in registration state for later upload after authentication
        setFromId(selectedFile);
        router.push('/register_two');
    };

    // ================== WEB / DESKTOP UI ==================
    if (isWeb) {
        return (
            <SafeAreaView edges={[] as any} style={styles.pageWeb}>
                <View style={[styles.cardWeb, { width: containerWidth }]}>
                    {/* Header */}
                    <View style={styles.headerRowWeb}>
                        <TouchableOpacity onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={18} color={MAROON} />
                        </TouchableOpacity>
                        <Text style={styles.headerWeb}>Create Account</Text>
                    </View>

                    <View style={styles.webContent}>
                        <Image source={require('../assets/images/logo.png')} style={styles.logoWeb} />

                        <View style={styles.instructionsContainerWeb}>
                            <Text style={styles.instructionTextWeb}>Upload your Student ID for verification.</Text>
                            <Text style={styles.instructionTextWeb}>Please note only UM Matina students are accepted.</Text>
                        </View>

                        <Text style={styles.labelWeb}>Upload your Student ID:</Text>

                        <TouchableOpacity style={styles.fileInputWeb} onPress={handleFileSelect} activeOpacity={0.9}>
                            {selectedFile ? (
                                <View style={styles.fileRowWeb}>
                                    <Image source={{ uri: selectedFile }} style={styles.thumbWeb} />
                                    <Text style={styles.fileNameWeb} numberOfLines={1}>{fileName}</Text>
                                    <TouchableOpacity onPress={handleClear}>
                                        <Ionicons name="close-circle" size={18} color={MAROON} />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <Text style={styles.placeholderWeb}>Select file</Text>
                            )}
                        </TouchableOpacity>

                        <Text style={styles.orWeb}>or</Text>

                        <TouchableOpacity style={styles.camBtnWeb} onPress={handleCameraCapture} activeOpacity={0.9}>
                            <Ionicons name="camera" size={20} color="#fff" />
                            <Text style={styles.camBtnWebText}>Open Camera &amp; Take a Photo</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={styles.nextBtnWeb} 
                            onPress={handleNext} 
                            activeOpacity={0.9}
                        >
                            <Text style={styles.nextBtnWebText}>Next</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    // ================== MOBILE (Android look on BOTH Android & iOS) ==================
    return (
        <SafeAreaView edges={['top', 'bottom']} style={styles.pageMobile}>
            <StatusBar barStyle="light-content" />
            <ScrollView
                style={{ flex: 1, width: '100%' }}
                contentContainerStyle={styles.scrollMobile} // only horizontal padding; top/bottom safe margins stay fixed
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={[styles.mobileWrap, mobileWrapStyle]}>
                    {/* Header */}
                    <View style={styles.headerRowMobile}>
                        <TouchableOpacity onPress={() => router.back()}>
                            <Ionicons name="arrow-back" size={20} color={MAROON} />
                        </TouchableOpacity>
                        <Text
                            allowFontScaling={false}
                            maxFontSizeMultiplier={1}
                            style={styles.headerMobile}
                        >
                            Create Account
                        </Text>
                    </View>

                    {/* Body */}
                    <View style={styles.bodyMobile}>
                        <Image source={require('../assets/images/logo.png')} style={styles.logoMobile} />

                        <View style={styles.instructionsContainerMob}>
                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.instructionTextMob}>
                                Upload your Student ID for verification.
                            </Text>
                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.instructionTextMob}>
                                Please note only UM Matina students are accepted.
                            </Text>
                        </View>

                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.labelMob}>
                            Upload your Student ID:
                        </Text>

                        <TouchableOpacity style={styles.fileInputMob} onPress={handleFileSelect} activeOpacity={0.9}>
                            {selectedFile ? (
                                <View style={styles.fileRowMob}>
                                    <Image source={{ uri: selectedFile }} style={styles.thumbMob} />
                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.fileNameMob} numberOfLines={1}>
                                        {fileName}
                                    </Text>
                                    <TouchableOpacity onPress={handleClear}>
                                        <Ionicons name="close-circle" size={24} color={MAROON} />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.placeholderMob}>
                                    Select file
                                </Text>
                            )}
                        </TouchableOpacity>

                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.orMob}>
                            or
                        </Text>

                        <TouchableOpacity style={styles.camBtnMob} onPress={handleCameraCapture} activeOpacity={0.9}>
                            <Ionicons name="camera" size={20} color="#fff" />
                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.camBtnMobText}>
                                Open Camera &amp; Take a Photo
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={styles.nextBtnMob} 
                            onPress={handleNext} 
                            activeOpacity={0.9}
                        >
                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.nextBtnMobText}>
                                Next
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    // ---- Web / Desktop ----
    pageWeb: {
        flex: 1,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
    },
    cardWeb: {
        backgroundColor: '#fff',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E7B9B9',
        paddingHorizontal: 22,
        paddingTop: 20,
        paddingBottom: 22,
        ...(Platform.OS === 'web' ? { boxShadow: '0px 4px 12px rgba(0,0,0,0.06)' } : {}),
    },
    headerRowWeb: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    headerWeb: { fontSize: 15, fontWeight: '600', color: MAROON, marginLeft: 8 },
    webContent: { width: '100%', maxWidth: 480, alignSelf: 'center' },
    logoWeb: { width: 52, height: 52, alignSelf: 'center', marginTop: 10, marginBottom: 14 },

    instructionsContainerWeb: { alignItems: 'center', marginBottom: 16, paddingHorizontal: 8 },
    instructionTextWeb: { fontSize: 13, color: MAROON, fontWeight: '500', textAlign: 'center', lineHeight: 18 },

    labelWeb: {
        color: MAROON,
        fontWeight: '600',
        fontSize: 13,
        alignSelf: 'flex-start',
        marginTop: 14,
        marginBottom: 8,
    },
    fileInputWeb: {
        width: '100%',
        borderWidth: 1,
        height: 120,
        borderColor: MAROON,
        borderRadius: 8,
        justifyContent: 'center',
        paddingHorizontal: 12,
        backgroundColor: '#fff',
        marginBottom: 16,
    },
    placeholderWeb: { color: '#666', fontSize: 14, alignSelf: 'center' },
    fileRowWeb: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    thumbWeb: { width: 34, height: 34, borderRadius: 8 },
    fileNameWeb: { flex: 1, color: '#333', fontSize: 14, fontWeight: '400' },
    orWeb: { textAlign: 'center', color: '#666', marginVertical: 14, fontSize: 12, fontWeight: '600' },
    camBtnWeb: {
        width: '100%',
        height: 44,
        backgroundColor: '#FF6B6B',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 18,
    },
    camBtnWebText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    nextBtnWeb: {
        width: '100%',
        backgroundColor: MAROON,
        borderRadius: 8,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
    },
    nextBtnWebText: { color: '#fff', fontWeight: '600', fontSize: 15 },

    // ---- Mobile (Android look for BOTH Android & iOS) ----
    pageMobile: { flex: 1, backgroundColor: '#fff' },

    // ScrollView content: only horizontal padding. Top/bottom safe margins come from SafeAreaView and DO NOT SCROLL.
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
        paddingTop: 14,
        paddingBottom: 10,
    },
    headerMobile: { fontSize: 17, fontWeight: '600', color: MAROON, marginLeft: 10, },

    bodyMobile: { width: '100%', paddingTop: 12, paddingBottom: 12 },
    logoMobile: { width: 100, height: 100, alignSelf: 'center', marginBottom: 30 },

    instructionsContainerMob: { alignItems: 'center', marginBottom: 24, paddingHorizontal: 20 },
    instructionTextMob: {
        fontSize: 14,
        color: MAROON,
        textAlign: 'center',
        marginBottom: 6,
        fontWeight: '500',
        lineHeight: 22,
    },

    labelMob: { fontWeight: '600', color: MAROON, marginBottom: 12, fontSize: 13 },

    fileInputMob: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 10,
        minHeight: 90,
        paddingHorizontal: 16,
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    placeholderMob: { color: '#666', fontSize: 14, alignSelf: 'center' },
    fileRowMob: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    thumbMob: { width: 36, height: 36, borderRadius: 8 },
    fileNameMob: { flex: 1, color: '#333', fontSize: 14, fontWeight: '500' },

    orMob: { textAlign: 'center', color: '#666', marginVertical: 18, fontSize: 13, fontWeight: '600' },
    camBtnMob: {
        backgroundColor: '#FF6B6B',
        paddingVertical: 14,
        borderRadius: 8,
        minHeight: 52,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 12,
    },
    camBtnMobText: { color: '#fff', fontWeight: '600', fontSize: 13 },

    nextBtnMob: {
        backgroundColor: MAROON,
        borderRadius: 8,
        minHeight: 50,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
    },
    nextBtnMobText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
