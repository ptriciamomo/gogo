import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

interface ErrandRateAndFeedbackModalWebProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  taskTitle?: string;
  callerName?: string;
  errandId?: number;
  buddycallerId?: string;
}

const ErrandRateAndFeedbackModalWeb: React.FC<ErrandRateAndFeedbackModalWebProps> = ({
  visible,
  onClose,
  onSubmit,
  taskTitle,
  callerName,
  errandId,
  buddycallerId,
}) => {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [hoveredRating, setHoveredRating] = useState(0);
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

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Error', 'Please select a rating before submitting.');
      return;
    }

    if (!errandId || !buddycallerId) {
      Alert.alert('Error', 'Missing errand or caller information.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Get current user (BuddyRunner)
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Save rating and feedback to database
      const { error: insertError } = await supabase
        .from('rate_and_feedback')
        .insert({
          errand_id: errandId,
          buddycaller_id: buddycallerId,
          buddyrunner_id: user.id,
          rater_id: user.id, // BuddyRunner is the rater
          rating: rating,
          feedback: feedback.trim() || null,
        });

      if (insertError) {
        console.error('Error saving rating:', insertError);
        throw insertError;
      }

      // Call the onSubmit callback
      onSubmit();
      
      // Reset form
      setRating(0);
      setFeedback('');
      setHoveredRating(0);
      
      Alert.alert('Success', 'Thank you for your feedback!');
    } catch (error) {
      console.error('Error submitting rating:', error);
      Alert.alert('Error', 'Failed to submit rating. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset form
    setRating(0);
    setFeedback('');
    setHoveredRating(0);
    onClose();
  };

  const renderStars = () => {
    const stars = [];
    const currentRating = hoveredRating || rating;

    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity
          key={i}
          style={styles.starButton}
          onPress={() => handleStarPress(i)}
          onPressIn={() => handleStarHover(i)}
          onPressOut={handleStarLeave}
          activeOpacity={0.7}
        >
          <Ionicons
            name={i <= currentRating ? 'star' : 'star-outline'}
            size={32}
            color={i <= currentRating ? '#FFD700' : '#D1D5DB'}
          />
        </TouchableOpacity>
      );
    }

    return stars;
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      
      <TouchableWithoutFeedback onPress={() => {
        // Prevent modal from closing when clicking inside
      }}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
            <Text style={styles.title}>Rate Your Experience</Text>
          </View>
          
          <View style={styles.content}>
            <Text style={styles.subtitle}>
              How was your experience working with {callerName} on &quot;{taskTitle}&quot;?
            </Text>
            
            <View style={styles.starsContainer}>
              {renderStars()}
            </View>
            
            <Text style={styles.ratingText}>
              {rating === 0 ? 'Click a star to rate' : 
               rating === 1 ? 'Very Poor' :
               rating === 2 ? 'Poor' :
               rating === 3 ? 'Good' :
               rating === 4 ? 'Very Good' : 'Excellent'}
            </Text>

            <View style={styles.feedbackContainer}>
              <Text style={styles.feedbackLabel}>Write your feedback (optional)</Text>
              <TextInput
                style={styles.feedbackInput}
                placeholder="Share your thoughts about this experience..."
                value={feedback}
                onChangeText={setFeedback}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
                returnKeyType="done"
                blurOnSubmit={true}
              />
              <Text style={styles.characterCount}>{feedback.length}/500</Text>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={handleClose}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.submitButton, (rating === 0 || isSubmitting) && styles.submitButtonDisabled]} 
              onPress={handleSubmit}
              activeOpacity={0.8}
              disabled={rating === 0 || isSubmitting}
            >
              <Text style={[styles.submitButtonText, (rating === 0 || isSubmitting) && styles.submitButtonTextDisabled]}>
                {isSubmitting ? 'Submitting...' : 'Submit Review'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
    width: '100%',
    height: '100%',
    pointerEvents: 'auto',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    position: 'absolute',
    zIndex: 10000,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    pointerEvents: 'auto',
  },
  header: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    marginTop: 8,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  feedbackContainer: {
    width: '100%',
  },
  feedbackLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: '#374151',
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: '#F9FAFB',
    resizeMode: 'none',
  },
  characterCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#8B0000',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButtonTextDisabled: {
    color: '#9CA3AF',
  },
});

export default ErrandRateAndFeedbackModalWeb;

