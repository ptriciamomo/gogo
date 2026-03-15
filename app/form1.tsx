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

const MAROON = '#8B0000';

export default function Form1UploadScreen() {
    const router = useRouter();
    const { width: winW } = useWindowDimensions();
    const isMD = winW >= 600 && winW < 900;
    const isLG = winW >= 900;

    const [selectedFile, setSelectedFile] = useState<{ uri: string; fileName: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);

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
        console.log("Next button clicked");

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

            console.log("===== SUPABASE CONFIG DEBUG =====");
            console.log("supabaseUrl:", supabaseUrl);
            console.log("supabaseAnonKey:", supabaseAnonKey);
            console.log("EXPO_PUBLIC_SUPABASE_URL:", process.env.EXPO_PUBLIC_SUPABASE_URL);
            console.log("EXPO_PUBLIC_SUPABASE_ANON_KEY:", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
            console.log("=================================");

            let uploadError;

            if (Platform.OS === 'web') {
                console.log("WEB UPLOAD BLOCK ENTERED");

                const response = await fetch(selectedFile.uri);
                const blob = await response.blob();

                console.log("===== UPLOAD PAYLOAD DEBUG =====");
                console.log("fileName:", fileName);
                console.log("fileName type:", typeof fileName);
                console.log("fileName length:", fileName.length);
                console.log("blob size:", blob.size);
                console.log("blob type:", blob.type);
                console.log("=================================");

                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                console.log("===== AUTH SESSION DEBUG =====");
                console.log("session:", JSON.stringify(session, null, 2));
                console.log("sessionError:", sessionError);
                console.log("===============================");

                try {
                    const result = await supabase
                        .storage
                        .from(bucketName)
                        .upload(fileName, blob, {
                            upsert: true,
                        });

                    console.log("===== UPLOAD RESULT DEBUG =====");
                    console.log("Full result:", JSON.stringify(result, null, 2));
                    console.log("result.error:", result.error);
                    if (result.error) {
                        console.log("error.message:", result.error.message);
                        console.log("error.status:", result.error.status);
                        console.log("error.name:", result.error.name);
                        console.log("error.__isAuthError:", (result.error as any).__isAuthError);
                    }
                    console.log("===============================");

                    uploadError = result.error;
                } catch (err) {
                    console.log("Upload threw exception:", err);
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

            console.log('OCR Response:', ocrData);
            console.log("OCR finished");

            // Call Insert Function (Project A)
            console.log("Sending insert request...");
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

            console.log("Insert response received");
            console.log("Insert response status:", insertResponse.status);
            console.log("Insert response ok:", insertResponse.ok);

            // Force the response to resolve
            await insertResponse.text();
            console.log("Insert request finished");

            if (!insertResponse.ok) {
                Alert.alert('Failed to save student data.');
                setIsLoading(false);
                return;
            }

            // OCR and insert successful - automatically redirect to register_two
            console.log("Redirecting to register_two");
            shouldRedirect = true;
            setIsLoading(false);

            setTimeout(() => {
                router.push('/register_two');
            }, 0);
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
});
