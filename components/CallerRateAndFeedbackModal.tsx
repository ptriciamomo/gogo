import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Alert,
    ActivityIndicator,
    TouchableWithoutFeedback,
    Keyboard,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { supabase } from '../lib/supabase';

interface CallerRateAndFeedbackModalProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: () => void;
    taskTitle: string;
    runnerName: string;
    commissionId: number;
    buddyrunnerId: string;
}

const CallerRateAndFeedbackModal: React.FC<CallerRateAndFeedbackModalProps> = ({
    visible,
    onClose,
    onSubmit,
    taskTitle,
    runnerName,
    commissionId,
    buddyrunnerId,
}) => {
    const router = useRouter();
    const pathname = usePathname();
    const [rating, setRating] = useState(0);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [feedback, setFeedback] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleStarPress = (starRating: number) => {
        setRating(starRating);
    };

    const handleStarHover = (starRating: number) => {
        setHoveredRating(starRating);
    };

    const handleStarLeave = () => {
        setHoveredRating(0);
    };

    const getRatingText = (rating: number) => {
        switch (rating) {
            case 1: return 'Very Poor';
            case 2: return 'Poor';
            case 3: return 'Good';
            case 4: return 'Very Good';
            case 5: return 'Excellent';
            default: return '';
        }
    };

    const handleSubmit = async () => {
        if (rating === 0) {
            Alert.alert('Error', 'Please select a rating before submitting.');
            return;
        }

        setIsSubmitting(true);
        try {
            // Get current user (BuddyCaller)
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                throw new Error('User not authenticated');
            }

            // Insert rating and feedback into database
            const { error } = await supabase
                .from('rate_and_feedback')
                .insert({
                    commission_id: commissionId,
                    buddycaller_id: user.id,
                    buddyrunner_id: buddyrunnerId,
                    rater_id: user.id, // BuddyCaller is the rater
                    rating: rating,
                    feedback: feedback.trim() || null,
                });

            if (error) {
                console.error('Error submitting rating:', error);
                Alert.alert('Error', 'Failed to submit rating. Please try again.');
                return;
            }

            Alert.alert('Success', 'Thank you for your feedback!');
            onSubmit();
            
            // Only redirect to home if not already there (mobile only)
            if (Platform.OS !== 'web') {
                if (pathname !== '/buddycaller/home') {
                    router.replace("/buddycaller/home");
                }
            }
        } catch (error) {
            console.error('Error submitting rating:', error);
            Alert.alert('Error', 'Failed to submit rating. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setRating(0);
        setHoveredRating(0);
        setFeedback('');
        onClose();
        
        // Only redirect to home if not already there (mobile only)
        if (Platform.OS !== 'web') {
            if (pathname !== '/buddycaller/home') {
                router.replace("/buddycaller/home");
            }
        }
    };

    const dismissKeyboard = () => {
        Keyboard.dismiss();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <View style={styles.overlay}>
                <TouchableWithoutFeedback onPress={dismissKeyboard}>
                    <View style={styles.modalContainer}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Rate Your Experience</Text>
                        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.content}>
                        <Text style={styles.question}>
                            How was your experience working with {runnerName} on "{taskTitle}"?
                        </Text>

                        <View style={styles.starsContainer}>
                            {Array.from({ length: 5 }, (_, index) => {
                                const starRating = index + 1;
                                const isActive = starRating <= (hoveredRating || rating);
                                
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        onPress={() => handleStarPress(starRating)}
                                        onPressIn={() => handleStarHover(starRating)}
                                        onPressOut={handleStarLeave}
                                        style={styles.starButton}
                                    >
                                        <Ionicons
                                            name="star"
                                            size={32}
                                            color={isActive ? '#FFD700' : '#E0E0E0'}
                                        />
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {rating > 0 && (
                            <Text style={styles.ratingText}>{getRatingText(rating)}</Text>
                        )}

                        <View style={styles.feedbackContainer}>
                            <Text style={styles.feedbackLabel}>Write your feedback (optional)</Text>
                            <TextInput
                                style={styles.feedbackInput}
                                value={feedback}
                                onChangeText={setFeedback}
                                placeholder="Share your thoughts about the experience..."
                                multiline
                                numberOfLines={4}
                                maxLength={500}
                            />
                            <Text style={styles.characterCount}>
                                {feedback.length}/500
                            </Text>
                        </View>
                    </View>

                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={handleClose}
                            disabled={isSubmitting}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                            style={[styles.submitButton, rating === 0 && styles.submitButtonDisabled]}
                            onPress={handleSubmit}
                            disabled={isSubmitting || rating === 0}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.submitButtonText}>Submit Review</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                    </View>
                </TouchableWithoutFeedback>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        width: '90%',
        maxWidth: 400,
        maxHeight: '80%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333333',
    },
    closeButton: {
        padding: 4,
    },
    content: {
        padding: 20,
    },
    question: {
        fontSize: 16,
        color: '#333333',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 22,
    },
    starsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 10,
    },
    starButton: {
        padding: 4,
        marginHorizontal: 2,
    },
    ratingText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333333',
        textAlign: 'center',
        marginBottom: 20,
    },
    feedbackContainer: {
        marginTop: 10,
    },
    feedbackLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333333',
        marginBottom: 8,
    },
    feedbackInput: {
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        color: '#333333',
        textAlignVertical: 'top',
        minHeight: 80,
    },
    characterCount: {
        fontSize: 12,
        color: '#666666',
        textAlign: 'right',
        marginTop: 4,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 20,
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#666666',
    },
    submitButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#8B0000',
        alignItems: 'center',
    },
    submitButtonDisabled: {
        backgroundColor: '#CCCCCC',
    },
    submitButtonText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#FFFFFF',
    },
});

export default CallerRateAndFeedbackModal;
