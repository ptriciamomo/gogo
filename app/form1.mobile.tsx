// app/form1.mobile.tsx (Form1UploadScreen - Mobile Version)
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
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { useRegistration } from '../stores/registration';

const MAROON = '#8B0000';

export default function Form1UploadScreenMobile() {
    const router = useRouter();
    const { width: winW } = useWindowDimensions();

    const [selectedFile, setSelectedFile] = useState<{ uri: string; fileName: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showInvalidScheduleModal, setShowInvalidScheduleModal] = useState(false);
    const setFromForm1 = useRegistration((s) => s.setFromForm1);

    // Mobile: narrow the form so inputs don't hug edges
    const mobileWrapStyle = useMemo(() => {
        const sideMargin = 18;
        const clamp = 408;
        const maxWidth = Math.min(clamp, winW - sideMargin * 2);
        return { maxWidth, width: '100%', alignSelf: 'center', paddingHorizontal: 6 } as const;
    }, [winW]);

    const handleFileSelect = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Photo library permission is required to choose a photo.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                
                // File size validation (5MB maximum)
                const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
                if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
                    Alert.alert("File too large", "File size must be less than 5MB. Please upload a smaller image.");
                    return;
                }
                
                setSelectedFile({
                    uri: asset.uri,
                    fileName: asset.fileName || `form1-${Date.now()}.jpg`,
                });
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to select file. Please try again.');
        }
    };

    const handleCameraCapture = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Camera permission is required to take photos.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                setSelectedFile({
                    uri: asset.uri,
                    fileName: asset.fileName || `form1-${Date.now()}.jpg`,
                });
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to capture photo. Please try again.');
        }
    };

    const handleClear = () => {
        setSelectedFile(null);
    };

    const handleNext = async () => {
        console.log("Next button clicked");

        if (!selectedFile) {
            Alert.alert('Please upload Form 1 first.');
            return;
        }

        setIsLoading(true);

        try {
            // Upload to Supabase Storage
            const fileName = `${Date.now()}-${selectedFile.fileName}`;
            const bucketName = 'form1-verification';

            const response = await fetch(selectedFile.uri);
            const arrayBuffer = await response.arrayBuffer();

            const { error: uploadError } = await supabase
                .storage
                .from(bucketName)
                .upload(fileName, arrayBuffer, {
                    contentType: "image/png",
                    upsert: true,
                });

            if (uploadError) {
                Alert.alert('Upload failed.');
                setIsLoading(false);
                return;
            }

            const filePath = fileName;

            // Call OCR Edge Function
            console.log("FORM1: CALLING OCR");
            console.log("FORM1 OCR URL:", `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/azure-ocr`);
            console.log("FORM1 FILE PATH:", filePath);
            console.log("FORM1 OCR HEADERS:", {
                "Content-Type": "application/json"
            });
            const ocrResponse = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/azure-ocr`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ filePath }),
                }
            );

            console.log("FORM1 OCR STATUS:", ocrResponse.status);
            const ocrData = await ocrResponse.json();

            console.log("FORM1 OCR DATA:", ocrData);

            if (!ocrResponse.ok || !ocrData?.success) {
                console.log("FORM1 OCR FAILED — STOPPING FLOW");
                Alert.alert('OCR failed. Please try again.');
                setIsLoading(false);
                return;
            }

            console.log('OCR Response:', ocrData);

            // === Academic Calendar Validation (Mobile) ===
            try {
                // Get current Philippine date (YYYY-MM-DD)
                const today = new Date().toLocaleDateString("en-CA", {
                    timeZone: "Asia/Manila",
                });

                const { data: calendarData, error: calendarError } = await supabase
                    .from("academic_calendar")
                    .select("semester, school_year, start_date, end_date")
                    .lte("start_date", today)
                    .gte("end_date", today)
                    .single();

                if (calendarError || !calendarData) {
                    console.log("FORM1 CALENDAR VALIDATION FAILED");
                    Alert.alert(
                        "Verification Error",
                        "Unable to verify the academic calendar. Please try again later."
                    );
                    setIsLoading(false);
                    return;
                }

                const semesterMap: Record<string, string> = {
                    "1st Semester": "First Semester",
                    "2nd Semester": "Second Semester",
                };

                const calendarSemesterNormalized =
                    semesterMap[calendarData.semester as keyof typeof semesterMap] || calendarData.semester;

                const yearParts = (calendarData.school_year || "").split("-");
                const calendarYearShort =
                    yearParts.length === 2 ? `${yearParts[0]}-${yearParts[1].slice(2)}` : calendarData.school_year;

                console.log("=== Academic Calendar Validation Debug ===");
                console.log("OCR semester raw:", ocrData.semester);
                console.log("Calendar semester (normalized):", calendarSemesterNormalized);
                console.log("Calendar school_year:", calendarData?.school_year);
                console.log("Calendar year short:", calendarYearShort);

                const semesterMatch =
                    typeof ocrData.semester === "string" &&
                    ocrData.semester.includes(calendarSemesterNormalized);

                const yearMatch =
                    typeof ocrData.semester === "string" &&
                    ocrData.semester.includes(calendarYearShort);

                console.log("semesterMatch result:", semesterMatch);
                console.log("yearMatch result:", yearMatch);

                if (!semesterMatch || !yearMatch) {
                    console.log("Invalid schedule detected - validation failed");
                    console.log("FORM1 CALENDAR VALIDATION FAILED");
                    setShowInvalidScheduleModal(true);
                    setIsLoading(false);
                    return;
                }
            } catch (calendarValidationError) {
                console.error("Academic calendar validation error:", calendarValidationError);
                console.log("FORM1 CALENDAR VALIDATION FAILED");
                Alert.alert(
                    "Verification Error",
                    "An error occurred while verifying the academic calendar. Please try again later."
                );
                setIsLoading(false);
                return;
            }

            // Call Insert Function (Project A)
            const payload = {
                studentId: ocrData.studentId,
                name: ocrData.name,
                email: ocrData.email,
                semester: ocrData.semester,
                yearLevel: ocrData.yearLevel,
                program: ocrData.program,
                subjects: ocrData.subjects,
            };
            console.log("FORM1 INSERT PAYLOAD:", payload);
            const PROJECT_A_URL = Constants.expoConfig?.extra?.projectAUrl;
            const insertResponse = await fetch(
                `${PROJECT_A_URL}/functions/v1/insert-form1-data`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${Constants.expoConfig?.extra?.supabaseAnonKey}`,
                        apikey: Constants.expoConfig?.extra?.supabaseAnonKey,
                    },
                    body: JSON.stringify({
                        studentId: ocrData.studentId,
                        name: ocrData.name,
                        email: ocrData.email,
                        semester: ocrData.semester,
                        yearLevel: ocrData.yearLevel,
                        program: ocrData.program,
                        subjects: ocrData.subjects,
                    }),
                }
            );

            console.log("FORM1 INSERT STATUS:", insertResponse.status);
            const insertData = await insertResponse.json();
            const insertText = typeof insertData === 'string' ? insertData : JSON.stringify(insertData);
            console.log("FORM1 INSERT RESPONSE TEXT:", insertText);

            if (!insertResponse.ok) {
                Alert.alert('Failed to save student data.');
                setIsLoading(false);
                return;
            }

            // Store OCR studentId for later ownership verification
            setFromForm1({ ocrStudentId: ocrData.studentId });

            // Automatically redirect to register_two after successful OCR
            router.push('/register_two');
        } catch (error) {
            console.error('Error:', error);
            Alert.alert('Upload failed.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView edges={['top', 'bottom']} style={styles.pageMobile}>
            <StatusBar barStyle="light-content" />
            <ScrollView
                style={{ flex: 1, width: '100%' }}
                contentContainerStyle={styles.scrollMobile}
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
                                Upload your class schedule from your portal for schedule verification.
                            </Text>
                        </View>

                        <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.labelMob}>
                            Upload your class schedule:
                        </Text>

                        <TouchableOpacity style={styles.fileInputMob} onPress={handleFileSelect} activeOpacity={0.9}>
                            {selectedFile ? (
                                <View style={styles.fileRowMob}>
                                    <Image source={{ uri: selectedFile.uri }} style={styles.thumbMob} />
                                    <Text allowFontScaling={false} maxFontSizeMultiplier={1} style={styles.fileNameMob} numberOfLines={1}>
                                        {selectedFile.fileName}
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

                        <TouchableOpacity
                            style={[styles.nextBtnMob, isLoading && styles.nextBtnMobDisabled]}
                            onPress={handleNext}
                            activeOpacity={0.9}
                            disabled={isLoading}
                        >
                            <Text
                                allowFontScaling={false}
                                maxFontSizeMultiplier={1}
                                style={styles.nextBtnMobText}
                            >
                                {isLoading ? "Processing..." : "Next"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            {showInvalidScheduleModal && (
                <View style={styles.invalidModalOverlay}>
                    <View style={styles.invalidModalCard}>
                        <Text style={styles.invalidModalTitle}>Invalid Schedule</Text>
                        <Text style={styles.invalidModalText}>
                            The uploaded class schedule does not match the current academic term.
                        </Text>
                        <Text style={styles.invalidModalText}>
                            Please upload your latest schedule from the UM Student Portal.
                        </Text>
                        <TouchableOpacity
                            style={styles.invalidModalButton}
                            onPress={() => setShowInvalidScheduleModal(false)}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.invalidModalButtonText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    // ---- Mobile ----
    pageMobile: { flex: 1, backgroundColor: '#fff' },

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
    headerMobile: { fontSize: 17, fontWeight: '600', color: MAROON, marginLeft: 10 },

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
        marginBottom: 16,
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
        marginTop: 6,
    },
    nextBtnMobText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    nextBtnMobDisabled: { opacity: 0.6 },

    invalidModalOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    invalidModalCard: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingVertical: 18,
        paddingHorizontal: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E7B9B9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
    },
    invalidModalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: MAROON,
        marginBottom: 10,
        textAlign: 'center',
    },
    invalidModalText: {
        fontSize: 14,
        color: '#333',
        textAlign: 'center',
        marginBottom: 6,
        lineHeight: 20,
    },
    invalidModalButton: {
        marginTop: 14,
        backgroundColor: MAROON,
        paddingVertical: 10,
        paddingHorizontal: 26,
        borderRadius: 8,
    },
    invalidModalButtonText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
});
