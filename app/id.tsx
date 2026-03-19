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
import { supabase, supabaseAnonKey as SUPABASE_ANON_KEY } from '../lib/supabase';

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
    const [isLoading, setIsLoading] = useState(false);

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

    const uploadToSupabase = async (uri: string) => {
        console.log("UPLOAD URI TYPE:", uri);

        const response = await fetch(uri);

        // Mobile (file:// URIs) can be more reliable when uploading as raw bytes (ArrayBuffer)
        if (Platform.OS !== 'web') {
            const arrayBuffer = await response.arrayBuffer();
            console.log("ARRAYBUFFER CREATED:", arrayBuffer);

            const fileName = `ids/${Date.now()}.jpg`;

            const { data, error } = await supabase.storage
                .from('student-ids')
                .upload(fileName, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true,
                });

            console.log("UPLOAD ERROR FULL:", error);

            if (error) {
                console.error("UPLOAD ERROR:", error.message);
                throw error;
            }

            return fileName;
        }

        const blob = await response.blob();
        console.log("BLOB CREATED:", blob);

        const fileName = `ids/${Date.now()}.jpg`;

        const { data, error } = await supabase.storage
            .from('student-ids')
            .upload(fileName, blob, {
                contentType: blob.type || 'image/jpeg',
                upsert: true,
            });

        // 🔥 Log BOTH response and full error
        console.log("UPLOAD ERROR FULL:", error);

        if (error) {
            console.error("UPLOAD ERROR:", error.message);
            throw error;
        }

        return fileName;
    };

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
                allowsEditing: Platform.OS === 'web' ? true : false,
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
                allowsEditing: Platform.OS === 'web' ? true : false,
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

    const handleNext = async () => {
        if (isLoading) return;
        if (!selectedFile) {
            Alert.alert('No File Selected', 'Please upload your Student ID or take a photo.');
            return;
        }

        setIsLoading(true);
        try {
            const uploadedPath = await uploadToSupabase(selectedFile);

            const { data: publicUrlData } = supabase
                .storage
                .from('student-ids')
                .getPublicUrl(uploadedPath);

            const publicUrl = publicUrlData.publicUrl;

            console.log("PUBLIC URL:", publicUrl);

            const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

            const ocrUrl = `${SUPABASE_URL}/functions/v1/smart-function`;

            console.log("FINAL OCR URL:", ocrUrl);
            console.log("PUBLIC URL BEFORE OCR:", publicUrl);
            console.log("OCR REQUEST DEBUG:", {
                url: `${SUPABASE_URL}/functions/v1/smart-function`,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ filePath: publicUrl }),
            });

            const requestBody = JSON.stringify({ filePath: publicUrl });
            console.log("FINAL REQUEST BODY STRING:", requestBody);

            let response;

            try {
                response = await fetch(ocrUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        apikey: SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    },
                    body: requestBody,
                });
                console.log("OCR FETCH CALLED");
                console.log("OCR RESPONSE STATUS:", response.status);

                console.log("OCR FETCH RESPONSE OBJECT:", response);
                console.log("OCR STATUS:", response.status);

            } catch (fetchError) {
                console.error("OCR FETCH CRASH:", fetchError);
                throw fetchError;
            }

            if (!response) {
                throw new Error("No response from OCR fetch");
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error("OCR FETCH ERROR BODY:", errorText);
                throw new Error("OCR request failed");
            }

            let ocrData;

            try {
                ocrData = await response.json();
            } catch (parseError) {
                console.error("OCR JSON PARSE ERROR:", parseError);
                throw parseError;
            }

            {
                const text = ocrData?.text || "";

                const extractedId = text.match(/S?(\d{6})/)?.[1] || "";

                const nameMatch = text.match(/STUDENT\s+([A-Z\s]+?)\s+College/i);
                const fullName = nameMatch ? nameMatch[1].trim() : "";

                const nameParts = fullName.split(" ");
                const firstName = nameParts[0] || "";
                const middleName = nameParts.length > 2
                    ? nameParts.slice(1, -1).join(" ")
                    : "";
                const lastName = nameParts[nameParts.length - 1] || "";

                const courseMatch = text.match(/College of\s+([A-Za-z\s]+)/i);
                const course = courseMatch ? courseMatch[1].trim() : "";

                console.log("EXTRACTED DATA:", {
                    extractedId,
                    firstName,
                    middleName,
                    lastName,
                    course
                });
            }

            const text = ocrData?.text || "";

            const extractedId = text.match(/S?(\d{6})/)?.[1] || "";

            const nameMatch = text.match(/STUDENT\s+([A-Z\s]+?)\s+College/i);
            const fullName = nameMatch ? nameMatch[1].trim() : "";

            const nameParts = fullName.split(" ");
            const firstName = nameParts[0] || "";
            const lastName = nameParts[nameParts.length - 1] || "";

            if (false) {
                const { data, error } = await supabase
                    .from("users")
                    .select("*")
                    .eq("student_id_number", extractedId)
                    .ilike("first_name", firstName)
                    .ilike("last_name", lastName)
                    .maybeSingle();

                if (error || !data) {
                    Alert.alert("ID not recognized or does not match our records");
                    return;
                }

                console.log("USER VERIFIED:", data);
            }

            {
                const text = ocrData?.text || "";

                const studentIdMatch = text.match(/S?(\d{6})/);
                const nameMatch = text.match(/STUDENT\s+([A-Z\s]+?)\s+College/i);
                const courseMatch = text.match(/College of\s+([A-Za-z\s]+)/i);

                const studentId = studentIdMatch ? studentIdMatch[1] : "";
                const fullName = nameMatch ? nameMatch[1].trim() : "";
                const course = courseMatch ? courseMatch[1].trim() : "";

                const nameParts = fullName.split(" ");
                const firstName = nameParts[0] || "";
                const lastName = nameParts[nameParts.length - 1] || "";
                const middleName = nameParts.length > 2
                    ? nameParts.slice(1, -1).join(" ")
                    : "";

                const { updateField } = useRegistration.getState();
                const setStudentId = (v: string) => updateField('studentId', v);
                const setFirstName = (v: string) => updateField('firstName', v);
                const setMiddleName = (v: string) => updateField('middleName', v);
                const setLastName = (v: string) => updateField('lastName', v);
                const setCourse = (v: string) => updateField('course', v);

                if (studentId) setStudentId(studentId);
                if (firstName) setFirstName(firstName);
                if (middleName?.trim()) setMiddleName(middleName);
                else setMiddleName("NA");
                if (lastName) setLastName(lastName);
                if (course) setCourse(course);
            }

            const {
                studentId: student_id,
                firstName: first_name,
                middleName: middle_name,
                lastName: last_name,
                course
            } = useRegistration.getState();

            if (!response?.ok || !ocrData?.success) {
                Alert.alert("Could not read your ID. Please try again.");
                // return;
            }

            // Student ID (STRICT MATCH)
            // Name (FLEXIBLE MATCH)
            const ocrName = String(ocrData.name ?? '').toUpperCase();
            const firstNameUpper = String(first_name ?? '').toUpperCase();
            const lastNameUpper = String(last_name ?? '').toUpperCase();

            // Store the image URI in registration state for later upload after authentication
            setFromId(selectedFile);

            // Navigate to Form 1 page based on platform
            if (Platform.OS === 'web') {
                router.push('/register');
            } else {
                router.push('/register');
            }
        } catch (e) {
            Alert.alert("Could not read your ID. Please try again.");
        } finally {
            setIsLoading(false);
        }
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

                        <View style={styles.dividerRowWeb}>
                            <View style={styles.dividerLineWeb} />
                            <Text style={styles.orWeb}>or</Text>
                            <View style={styles.dividerLineWeb} />
                        </View>

                        <TouchableOpacity style={styles.camBtnWeb} onPress={handleCameraCapture} activeOpacity={0.9}>
                            <Ionicons name="camera" size={20} color="#fff" />
                            <Text style={styles.camBtnWebText}>Open Camera &amp; Take a Photo</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={styles.nextBtnWeb} 
                            onPress={handleNext} 
                            disabled={isLoading}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.nextBtnWebText}>{isLoading ? "Verifying ID..." : "Next"}</Text>
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
                            disabled={isLoading}
                            activeOpacity={0.9}
                        >
                            <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.nextBtnMobText}>
                                {isLoading ? "Verifying ID..." : "Next"}
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
        backgroundColor: '#fdf2f2',
        ...(Platform.OS === 'web' ? {
            backgroundImage: 'linear-gradient(180deg, #fff7f7 0%, #f3f4f6 100%)',
        } as any : {}),
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
    },
    cardWeb: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#f1f1f1',
        paddingHorizontal: 28,
        paddingTop: 24,
        paddingBottom: 28,
        ...(Platform.OS === 'web' ? { boxShadow: '0 12px 35px rgba(0,0,0,0.08), 0 10px 40px rgba(185,28,28,0.05)' } as any : {}),
    },
    headerRowWeb: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    headerWeb: { fontSize: 18, fontWeight: '800', color: MAROON, marginLeft: 8, marginBottom: 4 },
    webContent: { width: '100%', maxWidth: 640, alignSelf: 'center' },
    logoWeb: { width: 64, height: 64, alignSelf: 'center', marginTop: 8, marginBottom: 16 },

    instructionsContainerWeb: { alignItems: 'center', marginBottom: 20, paddingHorizontal: 8 },
    instructionTextWeb: { fontSize: 14, color: '#555', fontWeight: '500', textAlign: 'center', lineHeight: 20 },

    labelWeb: {
        color: '#4a4a4a',
        fontWeight: '700',
        fontSize: 12,
        alignSelf: 'flex-start',
        marginTop: 14,
        marginBottom: 8,
    },
    fileInputWeb: {
        width: '100%',
        borderWidth: 1.5,
        minHeight: 120,
        borderColor: '#fca5a5',
        borderRadius: 12,
        justifyContent: 'center',
        paddingHorizontal: 12,
        backgroundColor: '#fafafa',
        marginBottom: 20,
        ...(Platform.OS === 'web' ? {
            cursor: 'pointer',
            transition: 'border-color 120ms ease',
        } as any : {}),
    },
    placeholderWeb: { color: '#666', fontSize: 14, alignSelf: 'center' },
    fileRowWeb: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    thumbWeb: { width: 34, height: 34, borderRadius: 8 },
    fileNameWeb: { flex: 1, color: '#333', fontSize: 14, fontWeight: '400' },
    dividerRowWeb: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
    dividerLineWeb: { flex: 1, height: 1, backgroundColor: '#e5e5e5' },
    orWeb: { textAlign: 'center', color: '#666', fontSize: 12, fontWeight: '700' },
    camBtnWeb: {
        width: '100%',
        height: 46,
        backgroundColor: '#FF6B6B',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        marginBottom: 18,
        ...(Platform.OS === 'web' ? {
            backgroundImage: 'linear-gradient(90deg, #ff6b6b, #ff4d4d)',
            boxShadow: '0 6px 14px rgba(255,107,107,0.25)',
        } as any : {}),
    },
    camBtnWebText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    nextBtnWeb: {
        width: '100%',
        backgroundColor: MAROON,
        borderRadius: 12,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
        ...(Platform.OS === 'web' ? {
            backgroundImage: 'linear-gradient(90deg, #b91c1c, #7f1d1d)',
            boxShadow: '0 10px 20px rgba(127,29,29,0.25)',
        } as any : {}),
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
