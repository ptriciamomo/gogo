import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import TermsAndConditions from '../app/TermsAndConditions';
import { responsive, rw, rh, rf, rp, rb } from '../utils/responsive';
import LocationService from './LocationService';
import LocationPromptModal from './LocationPromptModal';
import { supabase } from '../lib/supabase';

type FormData = {
  title: string;
  description: string[];
  selectedTypes: string[];
  isMeetup: boolean;
  meetupLocation: string;
  completionDate: string;
  completionTime: string;
};

type Props = {
  formData: FormData;
  onGoBack: () => void;
  /** NEW: parent provides this; it performs the Supabase insert and success handling */
  onConfirm: () => Promise<void> | void;
  /** NEW: cancellation info to show "No Runners Available" modal after success */
  pendingNoRunnerModal?: { commissionId: number; title: string } | null;
};

const formatCompletion = (d: string, t: string) => {
  if (!d || !t) return 'Not specified';
  try {
    const [mm, dd, yy] = d.split('/');
    const full = 2000 + parseInt(yy, 10);
    const date = new Date(full, parseInt(mm, 10) - 1, parseInt(dd, 10));
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} - ${t}`;
  } catch {
    return `${d} - ${t}`;
  }
};

const CommissionSummary: React.FC<Props> = ({ formData, onGoBack, onConfirm, pendingNoRunnerModal }) => {
  const router = useRouter();
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  
  // Location prompt modal state
  const [locationPromptVisible, setLocationPromptVisible] = useState(false);
  const [locationPromptLoading, setLocationPromptLoading] = useState(false);

  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const confirm = async () => {
    if (!agree) {
      Alert.alert('Error', 'Please agree to the Terms and Conditions.');
      return;
    }
    if (isPosting) return; // Prevent multiple clicks

    setIsPosting(true);

    // Check and update location before confirming
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated.');
        setIsPosting(false);
        return;
      }

      console.log('🔍 [Mobile Caller] Checking location status for user:', user.id);
      const locationStatus = await LocationService.checkLocationStatus(user.id);

      console.log('📍 [Mobile Caller] Location status:', locationStatus);

      // Show modal if location permission is not granted
      if (!locationStatus.hasPermission) {
        console.log('⚠️ [Mobile Caller] Location permission not granted, showing prompt modal');
        setLocationPromptVisible(true);
        setIsPosting(false);
        return; // Don't proceed with confirmation
      }

      // Always refresh location with current GPS before posting to ensure it's up-to-date
      console.log('🔄 [Mobile Caller] Refreshing location with current GPS before posting...');
      const locationResult = await LocationService.requestAndSaveLocation(user.id);
      
      if (!locationResult.success) {
        console.error('❌ [Mobile Caller] Failed to refresh location:', locationResult.error);
        Alert.alert('Location Error', locationResult.error || 'Failed to get current location. Please try again.');
        setIsPosting(false);
        return;
      }

      console.log('✅ [Mobile Caller] Location refreshed successfully, proceeding with commission posting');

      // Location is updated, proceed with confirmation
      try {
        await onConfirm();
        // Show success modal after confirmation succeeds
        setShowSuccessModal(true);
        setIsPosting(false);
      } catch (error) {
        console.error('[Mobile Caller] Error creating commission:', error);
        Alert.alert('Failed', (error as any)?.message ?? 'Could not post commission.');
        setIsPosting(false);
      }
    } catch (error) {
      console.error('[Mobile Caller] Error checking location:', error);
      Alert.alert('Error', 'Failed to verify location. Please try again.');
      setIsPosting(false);
    }
  };

  // Location prompt handlers
  const handleEnableLocation = async () => {
    setLocationPromptLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[Mobile Caller] No user found');
        setLocationPromptLoading(false);
        return;
      }

      console.log('🔄 [Mobile Caller] Requesting location permission and saving to database...');
      const result = await LocationService.requestAndSaveLocation(user.id);

      if (result.success) {
        console.log('✅ [Mobile Caller] Location enabled and saved successfully');
        setLocationPromptVisible(false);
        Alert.alert('Success', 'Location enabled successfully! Please click "Confirm Request" again to proceed.');
      } else {
        console.error('❌ [Mobile Caller] Failed to enable location:', result.error);
        Alert.alert(
          'Location Error',
          result.error || 'Failed to enable location. Please check your device settings and try again.'
        );
      }
    } catch (error) {
      console.error('[Mobile Caller] Error enabling location:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLocationPromptLoading(false);
    }
  };

  const handleCancelLocationPrompt = () => {
    setLocationPromptVisible(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Ionicons name="person" size={20} color="#8B2323" />
          <Text style={styles.headerTitle}>Commission Request Summary</Text>
        </View>
        <View style={styles.divider} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Commission Title:</Text>
            <Text style={styles.summaryValue}>{formData.title || ''}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Commission Description:</Text>
            <Text style={styles.summaryDescription as any}>{(formData as any).description || ''}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Commission Type:</Text>
            <Text style={styles.summaryValue}>
              {formData.selectedTypes && formData.selectedTypes.length ? formData.selectedTypes.join(', ') : ''}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Completion Date:</Text>
            <Text style={styles.summaryValue}>{formatCompletion(formData.completionDate, formData.completionTime)}</Text>
          </View>
          {formData.isMeetup && (
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Scheduled Meet-up:</Text>
              <Text style={styles.summaryValue}>{formData.meetupLocation || ''}</Text>
            </View>
          )}
        </View>

        <View style={styles.termsContainer}>
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => {
              if (!agree) setShowTerms(true);
              else setAgree(false);
            }}
          >
            <View style={[styles.checkbox, agree && styles.checkboxSelected]}>
              {agree && <Ionicons name="checkmark" size={12} color="white" />}
            </View>
            <View style={styles.termsTextContainer}>
              <Text style={styles.termsText}>I acknowledge that I have read and agree to GoBuddy's </Text>
              <TouchableOpacity onPress={() => setShowTerms(true)}>
                <Text style={styles.termsLink}>Terms and Conditions</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity
          style={[styles.confirmRequestButton, (!agree || isPosting) && styles.confirmRequestButtonDisabled]}
          onPress={confirm}
          disabled={!agree || isPosting}
        >
          <Text style={[styles.confirmRequestText, (!agree || isPosting) && styles.confirmRequestTextDisabled]}>
            {isPosting ? "Posting..." : "Confirm Request"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.goBackButton} onPress={onGoBack}>
          <Text style={styles.goBackText}>Go back and edit</Text>
        </TouchableOpacity>
      </View>

      {showTerms && (
        <TermsAndConditions
          onAgree={() => {
            setAgree(true);
            setShowTerms(false);
          }}
          onClose={() => setShowTerms(false)}
        />
      )}

      <LocationPromptModal
        visible={locationPromptVisible}
        onEnableLocation={handleEnableLocation}
        onCancel={handleCancelLocationPrompt}
        isLoading={locationPromptLoading}
      />

      {/* Custom Success Modal - matches web version design */}
      {showSuccessModal && (
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContainer}>
            <View style={styles.successModalContent}>
              <View style={styles.successIconContainer}>
                <Ionicons name="checkmark-circle" size={56} color="#10B981" />
              </View>
              <Text style={styles.successModalTitle}>Success</Text>
              <Text style={styles.successModalMessage}>Your commission has been posted.</Text>
              <TouchableOpacity
                style={styles.successModalButton}
                onPress={async () => {
                  setShowSuccessModal(false);
                  onGoBack(); // Close the summary modal
                  router.back(); // Navigate back to home
                  
                  // Show "No Runners Available" modal if cancellation was detected
                  // This happens after navigation, so the home page will receive it
                  if (pendingNoRunnerModal) {
                    console.log('[CALLER] Showing No Runners Available modal after Success modal');
                    // Small delay to ensure navigation completes
                    setTimeout(async () => {
                      const { noRunnersAvailableService } = await import('../services/NoRunnersAvailableService');
                      noRunnersAvailableService.notify({
                        type: 'commission',
                        commissionId: pendingNoRunnerModal.commissionId,
                        commissionTitle: pendingNoRunnerModal.title
                      });
                    }, 100);
                  }
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.successModalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0', width: '100%', height: '100%' },
  header: { backgroundColor: 'white', paddingHorizontal: rp(16), paddingTop: rp(16), paddingBottom: rp(12) },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: rp(12) },
  headerTitle: { fontSize: rf(16), fontWeight: '600', color: '#8B2323' },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginTop: rp(12) },
  scrollView: { flex: 1, backgroundColor: '#f0f0f0' },
  summaryCard: {
    backgroundColor: 'white',
    margin: rp(16),
    borderRadius: rb(8),
    borderWidth: 1,
    borderColor: '#8B2323',
    padding: rp(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryItem: { marginBottom: rp(12) },
  summaryLabel: { fontSize: rf(14), fontWeight: '600', color: '#8B2323', marginBottom: rp(4) },
  summaryValue: { fontSize: rf(14), color: '#8B2323', lineHeight: rf(20) },
  summaryDescription: { fontSize: rf(14), color: '#666', lineHeight: rf(20) },
  termsContainer: { margin: rp(16), marginTop: rp(8) },
  checkboxContainer: { flexDirection: 'row', alignItems: 'flex-start', gap: rp(8) },
  checkbox: {
    width: rw(4),
    height: rw(4),
    borderWidth: 1,
    borderColor: '#8B2323',
    borderRadius: rb(2),
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: rp(2),
  },
  checkboxSelected: { backgroundColor: '#8B2323' },
  termsTextContainer: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
  termsText: { fontSize: rf(12), color: '#666', lineHeight: rf(16) },
  termsLink: { fontSize: rf(12), color: '#8B2323', textDecorationLine: 'underline', lineHeight: rf(16) },
  actionButtonsContainer: { backgroundColor: 'white', padding: rp(16), gap: rp(12) },
  confirmRequestButton: {
    backgroundColor: '#8B2323',
    paddingVertical: rp(12),
    borderRadius: rb(6),
    alignItems: 'center',
    height: rh(6),
    justifyContent: 'center',
  },
  confirmRequestText: { color: 'white', fontSize: rf(15), fontWeight: '600' },
  confirmRequestButtonDisabled: { backgroundColor: '#ccc' },
  confirmRequestTextDisabled: { color: '#999' },
  goBackButton: {
    backgroundColor: 'white',
    paddingVertical: rp(12),
    borderRadius: rb(6),
    alignItems: 'center',
    height: rh(6),
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#8B2323',
  },
  goBackText: { color: '#8B2323', fontSize: rf(15), fontWeight: '600' },
  
  // Success Modal Styles (matching web version design)
  successModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  successModalContainer: {
    backgroundColor: 'white',
    borderRadius: rb(12),
    padding: rp(24),
    minWidth: rw(80),
    maxWidth: rw(90),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  successModalContent: {
    alignItems: 'center',
    width: '100%',
  },
  successIconContainer: {
    marginBottom: rp(16),
  },
  successModalTitle: {
    fontSize: rf(24),
    fontWeight: '700',
    color: '#10B981',
    marginBottom: rp(8),
  },
  successModalMessage: {
    fontSize: rf(16),
    color: '#374151',
    textAlign: 'center',
    marginBottom: rp(24),
    lineHeight: rf(22),
  },
  successModalButton: {
    backgroundColor: '#8B2323',
    borderRadius: rb(8),
    paddingVertical: rp(12),
    paddingHorizontal: rp(24),
    minWidth: rw(25),
  },
  successModalButtonText: {
    color: 'white',
    fontSize: rf(16),
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default CommissionSummary;
