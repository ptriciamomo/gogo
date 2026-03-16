// app/form1.tsx (Form1UploadScreen - Web Version)
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { useRegistration } from '../stores/registration';

const MAROON = '#8B0000';

export default function Form1UploadScreen() {
    const router = useRouter();
    const { width: winW } = useWindowDimensions();
    const isMD = winW >= 600 && winW < 900;
    const isLG = winW >= 900;

    const [selectedFile, setSelectedFile] = useState<{ uri: string; fileName: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showInvalidScheduleModal, setShowInvalidScheduleModal] = useState(false);
    const setFromForm1 = useRegistration((s) => s.setFromForm1);

    // Web card width (≈30–42% of viewport, clamped 360–560px)
    const containerWidth = useMemo(() => {
        const pct = isLG ? 0.30 : isMD ? 0.36 : 0.42;
        const computed = Math.floor(winW * pct);
        return Math.min(Math.max(360, computed), 560);
    }, [isLG, isMD, winW]);

    const handleFileSelect = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
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
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
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
        if (!selectedFile) {
            Alert.alert('Please upload Form 1 first.');
            return;
        }

        setIsLoading(true);

        let shouldRedirect = false;

        try {
            // Upload to Supabase Storage
            const fileName = `${Date.now()}-${selectedFile.fileName}`;
            const bucketName = 'form1-verification';

            let uploadError;

            if (Platform.OS === 'web') {
                const response = await fetch(selectedFile.uri);
                const blob = await response.blob();

                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                try {
                    const result = await supabase
                        .storage
                        .from(bucketName)
                        .upload(fileName, blob, {
                            upsert: true,
                        });

                    uploadError = result.error;
                } catch (err) {
                    uploadError = err as any;
                }
            }

            if (uploadError) {
                Alert.alert('Upload failed.');
                setIsLoading(false);
                return;
            }

            const filePath = fileName;

            // Call OCR Edge Function
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

            const ocrData = await ocrResponse.json();

            if (!ocrResponse.ok || !ocrData?.success) {
                Alert.alert('OCR failed. Please try again.');
                setIsLoading(false);
                return;
            }

            // === Academic Calendar Validation (Web) ===
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

                const semesterMatch =
                    typeof ocrData.semester === "string" &&
                    ocrData.semester.includes(calendarSemesterNormalized);

                const yearMatch =
                    typeof ocrData.semester === "string" &&
                    ocrData.semester.includes(calendarYearShort);

                if (!semesterMatch || !yearMatch) {
                    setShowInvalidScheduleModal(true);
                    setIsLoading(false);
                    return;
                }
            } catch (calendarValidationError) {
                console.error("Academic calendar validation error:", calendarValidationError);
                Alert.alert(
                    "Verification Error",
                    "An error occurred while verifying the academic calendar. Please try again later."
                );
                setIsLoading(false);
                return;
            }

            // Call Insert Function (Project A)
            const insertResponse = await fetch(
                'https://ednraiixtmzymowfwarh.supabase.co/functions/v1/insert-form1-data',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${supabaseAnonKey}`,
                        apikey: supabaseAnonKey,
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

            await insertResponse.text();

            if (!insertResponse.ok) {
                Alert.alert('Failed to save student data.');
                setIsLoading(false);
                return;
            }

            // Store OCR studentId for later ownership verification
            setFromForm1({ ocrStudentId: ocrData.studentId });

            // OCR and insert successful - automatically redirect to register_two
            shouldRedirect = true;
            setIsLoading(false);
            router.push('/register_two');
            return;
        } catch (error) {
            console.error('Error:', error);
            Alert.alert('Upload failed.');
        } finally {
            if (!shouldRedirect) {
                setIsLoading(false);
            }
        }
    };

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
                        <Text style={styles.instructionTextWeb}>Upload your class schedule from your portal for schedule verification.</Text>
                    </View>

                    <Text style={styles.labelWeb}>Upload your class schedule:</Text>

                    <TouchableOpacity style={styles.fileInputWeb} onPress={handleFileSelect} activeOpacity={0.9}>
                        {selectedFile ? (
                            <View style={styles.fileRowWeb}>
                                <Image source={{ uri: selectedFile.uri }} style={styles.thumbWeb} />
                                <Text style={styles.fileNameWeb} numberOfLines={1}>{selectedFile.fileName}</Text>
                                <TouchableOpacity onPress={handleClear}>
                                    <Ionicons name="close-circle" size={18} color={MAROON} />
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <Text style={styles.placeholderWeb}>Select file</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.nextBtnWeb, isLoading && styles.nextBtnWebDisabled]}
                        onPress={handleNext}
                        activeOpacity={0.9}
                        disabled={isLoading}
                    >
                        <Text style={styles.nextBtnWebText}>
                            {isLoading ? "Processing..." : "Next"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

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
    fileNameWeb: { flex: 1, color: '#333', fontSize: 14, fontWeight: '500' },
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
    nextBtnWebDisabled: { opacity: 0.6 },

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
        ...(Platform.OS === 'web'
            ? { boxShadow: '0px 4px 16px rgba(0,0,0,0.18)' }
            : {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 8,
              }),
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
