// components/SubmitScheduleModal.tsx
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
    Alert,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions
} from 'react-native';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';

const MAROON = '#8B0000';

interface SubmitScheduleModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export default function SubmitScheduleModal({
    visible,
    onClose,
    onSuccess,
}: SubmitScheduleModalProps) {
    const { width: winW } = useWindowDimensions();
    const isMobile = winW < 600;

    const [selectedFile, setSelectedFile] = useState<{ uri: string; fileName: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    // Modal card max width
    const modalMaxWidth = isMobile ? winW - 32 : 500;

    const handleFileSelect = async () => {
        try {
            if (Platform.OS !== 'web') {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission needed', 'Photo library permission is required to choose a photo.');
                    return;
                }
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: Platform.OS === 'web',
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                setSelectedFile({
                    uri: asset.uri,
                    fileName: asset.fileName || `schedule-${Date.now()}.jpg`,
                });
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to select file. Please try again.');
        }
    };

    const handleClear = () => {
        setSelectedFile(null);
    };

    const handleSubmit = async () => {
        if (!selectedFile) {
            Alert.alert('Please upload your class schedule first.');
            return;
        }

        setIsLoading(true);

        try {
            // Upload to Supabase Storage
            const fileName = `${Date.now()}-${selectedFile.fileName}`;
            const bucketName = 'form1-verification';

            let uploadError;

            if (Platform.OS === 'web') {
                const response = await fetch(selectedFile.uri);
                const blob = await response.blob();

                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                if (sessionError) {
                    throw sessionError;
                }

                const result = await supabase
                    .storage
                    .from(bucketName)
                    .upload(fileName, blob, {
                        upsert: true,
                    });

                uploadError = result.error;
            } else {
                // Mobile upload logic (if needed)
                const formData = new FormData();
                formData.append('file', {
                    uri: selectedFile.uri,
                    type: 'image/jpeg',
                    name: selectedFile.fileName,
                } as any);

                const result = await supabase
                    .storage
                    .from(bucketName)
                    .upload(fileName, formData as any, {
                        upsert: true,
                    });

                uploadError = result.error;
            }

            if (uploadError) {
                Alert.alert('Upload failed.', uploadError.message || 'Please try again.');
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

            // Call Insert Function
            const insertResponse = await fetch(
                `${supabaseUrl}/functions/v1/insert-form1-data`,
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

            if (!insertResponse.ok) {
                Alert.alert('Failed to save student data.');
                setIsLoading(false);
                return;
            }

            // Success - show confirmation modal
            setIsLoading(false);
            setSelectedFile(null);
            setShowSuccessModal(true);
        } catch (error) {
            console.error('Error:', error);
            Alert.alert('Upload failed.', 'An error occurred. Please try again.');
            setIsLoading(false);
        }
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.backdrop}
                activeOpacity={1}
                onPress={onClose}
            >
                <View
                    style={[styles.modalCard, { maxWidth: modalMaxWidth }]}
                    onStartShouldSetResponder={() => true}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerContent}>
                            <Text style={styles.title}>Submit Your Class Schedule</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color={MAROON} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Content */}
                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        <View style={styles.instructionsContainer}>
                            <Text style={styles.instructionText}>
                                Upload your latest class schedule to continue using the app.
                            </Text>
                        </View>

                        <Text style={styles.label}>Upload your class schedule:</Text>

                        <TouchableOpacity
                            style={styles.fileInput}
                            onPress={handleFileSelect}
                            activeOpacity={0.9}
                        >
                            {selectedFile ? (
                                <View style={styles.fileRow}>
                                    <Image source={{ uri: selectedFile.uri }} style={styles.thumbnail} />
                                    <Text style={styles.fileName} numberOfLines={1}>
                                        {selectedFile.fileName}
                                    </Text>
                                    <TouchableOpacity onPress={handleClear}>
                                        <Ionicons name="close-circle" size={18} color={MAROON} />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <Text style={styles.placeholder}>Select file</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                            onPress={handleSubmit}
                            activeOpacity={0.9}
                            disabled={isLoading}
                        >
                            <Text style={styles.submitButtonText}>
                                {isLoading ? 'Processing...' : 'Submit'}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </TouchableOpacity>

            {/* Success Confirmation Modal */}
            <Modal
                transparent
                visible={showSuccessModal}
                animationType="fade"
                onRequestClose={() => {
                    setShowSuccessModal(false);
                    onClose();
                    if (onSuccess) {
                        onSuccess();
                    }
                }}
            >
                <View style={styles.successBackdrop}>
                    <View style={styles.successCard}>
                        <View style={styles.successIconWrap}>
                            <Ionicons name="checkmark-circle" size={44} color={MAROON} />
                        </View>
                        <Text style={styles.successTitle}>Schedule Submitted</Text>
                        <Text style={styles.successMessage}>
                            Your class schedule has been successfully submitted.
                        </Text>
                        <TouchableOpacity
                            onPress={() => {
                                setShowSuccessModal(false);
                                onClose();
                                if (onSuccess) {
                                    onSuccess();
                                }
                            }}
                            style={styles.successOkBtn}
                            activeOpacity={0.9}
                        >
                            <Text style={styles.successOkText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
    modalCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        width: '100%',
        maxHeight: '90%',
        ...(Platform.OS === 'web' ? { boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.15)' } : {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
        }),
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5C8C5',
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: MAROON,
        flex: 1,
    },
    closeButton: {
        padding: 4,
    },
    subtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 4,
    },
    content: {
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    instructionsContainer: {
        alignItems: 'center',
        marginBottom: 16,
        paddingHorizontal: 8,
    },
    instructionText: {
        fontSize: 13,
        color: '#000',
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 18,
    },
    label: {
        color: MAROON,
        fontWeight: '600',
        fontSize: 13,
        alignSelf: 'flex-start',
        marginTop: 8,
        marginBottom: 8,
    },
    fileInput: {
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
    placeholder: {
        color: '#666',
        fontSize: 14,
        alignSelf: 'center',
    },
    fileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    thumbnail: {
        width: 34,
        height: 34,
        borderRadius: 8,
    },
    fileName: {
        flex: 1,
        color: '#333',
        fontSize: 14,
        fontWeight: '500',
    },
    submitButton: {
        width: '100%',
        backgroundColor: MAROON,
        borderRadius: 8,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    },
    successBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
    successCard: {
        width: 400,
        maxWidth: '100%',
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 18,
        alignItems: 'center',
    },
    successIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 999,
        backgroundColor: '#F4E6E6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    successTitle: {
        color: MAROON,
        fontSize: 16,
        fontWeight: '900',
        marginBottom: 6,
    },
    successMessage: {
        color: '#531010',
        fontSize: 13,
        opacity: 0.9,
        marginBottom: 14,
        textAlign: 'center',
    },
    successOkBtn: {
        backgroundColor: MAROON,
        paddingVertical: 10,
        paddingHorizontal: 24,
        borderRadius: 10,
    },
    successOkText: {
        color: '#fff',
        fontWeight: '800',
    },
});
