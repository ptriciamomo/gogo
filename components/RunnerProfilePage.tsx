import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Image,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { responsive, rw, rh, rf, rp, rb } from '../utils/responsive';

interface RunnerProfilePageProps {
  runner: {
    id: string;
    name: string;
    profilePicture: string;
    role: string;
    status: 'Available' | 'Busy' | 'Offline';
    works: Array<{
      id: string;
      title: string;
      image: string;
      category: string;
    }>;
    reviews: Array<{
      id: string;
      reviewerName: string;
      reviewerImage: string;
      rating: number;
      comment: string;
      date: string;
    }>;
  };
  onBack: () => void;
  onRequest: () => void;
  onReport: () => void;
}

const RunnerProfilePage: React.FC<RunnerProfilePageProps> = ({
  runner,
  onBack,
  onRequest,
  onReport,
}) => {
  const [selectedTab, setSelectedTab] = useState<'All' | 'Images'>('All');
  const [showReportForm, setShowReportForm] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [reportData, setReportData] = useState({
    reason: '',
    description: '',
    selectedReason: '',
  });

  const reportReasons = [
    'Inappropriate Behavior',
    'Spam or Scam',
    'Fake Profile',
    'Harassment',
    'Poor Service Quality',
    'Payment Issues',
    'Other'
  ];

  const handleReportPress = () => {
    setShowReportForm(true);
  };

  const handleSelectReason = (reason: string) => {
    setReportData(prev => ({ ...prev, selectedReason: reason }));
    setShowDropdown(false);
  };

  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const handleSubmitReport = () => {
    if (!reportData.selectedReason) {
      Alert.alert('Error', 'Please select a reason for reporting.');
      return;
    }
    
    if (!reportData.description.trim()) {
      Alert.alert('Error', 'Please provide a description of the issue.');
      return;
    }

    // Here you would typically send the report to your backend
    console.log('Report submitted:', {
      runnerId: runner.id,
      runnerName: runner.name,
      reason: reportData.selectedReason,
      description: reportData.description,
      timestamp: new Date().toISOString()
    });

    Alert.alert(
      'Report Submitted',
      'Thank you for your report. We will review it and take appropriate action.',
      [
        {
          text: 'OK',
          onPress: () => {
            setShowReportForm(false);
            setShowDropdown(false);
            setReportData({ reason: '', description: '', selectedReason: '' });
            onReport(); // Call the original onReport function if needed
          }
        }
      ]
    );
  };

  const handleCancelReport = () => {
    setShowReportForm(false);
    setShowDropdown(false);
    setReportData({ reason: '', description: '', selectedReason: '' });
  };

  const renderWorkItem = (work: any) => (
    <View key={work.id} style={styles.workItem}>
      <Image source={{ uri: work.image }} style={styles.workImage} />
    </View>
  );

  const renderReview = (review: any) => (
    <View key={review.id} style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewerInfo}>
          <View style={styles.reviewerImage}>
            <Text style={styles.reviewerInitials}>
              {review.reviewerName.split(' ').map((n: string) => n[0]).join('')}
            </Text>
          </View>
          <View>
            <Text style={styles.reviewerName}>{review.reviewerName}</Text>
            <View style={styles.starsContainer}>
              {[...Array(5)].map((_, index) => (
                <Ionicons
                  key={index}
                  name="star"
                  size={12}
                  color={index < review.rating ? "#FFD700" : "#DDD"}
                />
              ))}
            </View>
          </View>
        </View>
        <Text style={styles.reviewDate}>{review.date}</Text>
      </View>
      <Text style={styles.reviewComment}>{review.comment}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Profile Section */}
      <View style={styles.profileSection}>
        <View style={styles.profilePictureContainer}>
          <Image source={{ uri: runner.profilePicture }} style={styles.profilePicture} />
          {/* Add devil horns decoration */}
          <View style={styles.devilHorns}>
            <Ionicons name="triangle" size={16} color="#8B2323" />
          </View>
        </View>
        
        <Text style={styles.runnerName}>{runner.name}</Text>
        <Text style={styles.runnerRole}>{runner.role}</Text>
        
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={onRequest}>
            <Ionicons name="chatbubble" size={20} color="white" />
            <Text style={styles.actionButtonText}>Request</Text>
          </TouchableOpacity>
          
          <View style={styles.statusContainer}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={[
              styles.statusText,
              { color: runner.status === 'Available' ? '#00FF00' : '#FF0000' }
            ]}>
              {runner.status}
            </Text>
          </View>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleReportPress}>
            <Ionicons name="flag" size={20} color="white" />
            <Text style={styles.actionButtonText}>Report</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* Works Section */}
        <View style={styles.worksSection}>
          <Text style={styles.sectionTitle}>Works</Text>
          
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, selectedTab === 'All' && styles.activeTab]}
              onPress={() => setSelectedTab('All')}
            >
              <Text style={[
                styles.tabText,
                selectedTab === 'All' && styles.activeTabText
              ]}>
                All
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.tab, selectedTab === 'Images' && styles.activeTab]}
              onPress={() => setSelectedTab('Images')}
            >
              <Text style={[
                styles.tabText,
                selectedTab === 'Images' && styles.activeTabText
              ]}>
                Images
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.worksGrid}>
            {runner.works.map(renderWorkItem)}
          </View>
        </View>

        {/* Reviews Section */}
        <View style={styles.reviewsSection}>
          <View style={styles.reviewsHeader}>
            <Ionicons name="document-text" size={20} color="#8B2323" />
            <Text style={styles.sectionTitle}>Reviews</Text>
          </View>
          
          <View style={styles.reviewsContainer}>
            {runner.reviews.map(renderReview)}
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="home" size={24} color="white" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="notifications" size={24} color="white" />
          <View style={styles.notificationDot} />
          <Text style={styles.navText}>Notifications</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="person" size={24} color="white" />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Report Form Modal */}
      <Modal
        visible={showReportForm}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancelReport}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Runner</Text>
              <TouchableOpacity onPress={handleCancelReport} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#8B2323" />
              </TouchableOpacity>
            </View>

            <TouchableWithoutFeedback onPress={() => {
              setShowDropdown(false);
              dismissKeyboard();
            }}>
              <View style={styles.formContent}>
                <Text style={styles.formLabel}>Report {runner.name}</Text>
                
                <Text style={styles.sectionLabel}>Reason for reporting:</Text>
                <View style={styles.dropdownContainer}>
                  <TouchableOpacity style={styles.dropdownButton} onPress={toggleDropdown}>
                    <Text style={[
                      styles.dropdownButtonText,
                      !reportData.selectedReason && styles.placeholderText
                    ]}>
                      {reportData.selectedReason || 'Select a reason...'}
                    </Text>
                    <Ionicons 
                      name={showDropdown ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color="#8B2323" 
                    />
                  </TouchableOpacity>
                  
                  {showDropdown && (
                    <View style={styles.dropdownList}>
                      <ScrollView 
                        style={styles.dropdownScrollView}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled={true}
                      >
                        {reportReasons.map((reason, index) => (
                          <TouchableOpacity
                            key={index}
                            style={[
                              styles.dropdownItem,
                              reportData.selectedReason === reason && styles.selectedDropdownItem,
                              index === reportReasons.length - 1 && styles.lastDropdownItem
                            ]}
                            onPress={() => handleSelectReason(reason)}
                          >
                            <Text style={[
                              styles.dropdownItemText,
                              reportData.selectedReason === reason && styles.selectedDropdownItemText
                            ]}>
                              {reason}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <Text style={styles.sectionLabel}>Additional details:</Text>
                <TextInput
                  style={styles.descriptionInput}
                  placeholder="Please describe the issue in detail..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={4}
                  value={reportData.description}
                  onChangeText={(text) => setReportData(prev => ({ ...prev, description: text }))}
                  returnKeyType="done"
                  onSubmitEditing={dismissKeyboard}
                />
              </View>
            </TouchableWithoutFeedback>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelReport}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitButton} onPress={handleSubmitReport}>
                <Text style={styles.submitButtonText}>Submit Report</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    backgroundColor: '#8B2323',
    paddingTop: rp(8),
    paddingBottom: rp(12),
    paddingHorizontal: rp(16),
  },
  backButton: {
    padding: rp(4),
  },
  profileSection: {
    backgroundColor: '#8B2323',
    alignItems: 'center',
    paddingVertical: rp(20),
  },
  profilePictureContainer: {
    position: 'relative',
    marginBottom: rp(12),
  },
  profilePicture: {
    width: rw(80),
    height: rw(80),
    borderRadius: rw(40),
    borderWidth: rp(3),
    borderColor: 'white',
  },
  devilHorns: {
    position: 'absolute',
    top: rp(-5),
    left: '50%',
    marginLeft: rp(-8),
  },
  runnerName: {
    fontSize: rf(24),
    fontWeight: '600',
    color: 'white',
    marginBottom: rp(4),
  },
  runnerRole: {
    fontSize: rf(16),
    color: 'white',
    marginBottom: rp(12),
  },
  statusContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  statusLabel: {
    fontSize: rf(12),
    color: 'white',
    marginBottom: rp(4),
  },
  statusText: {
    fontSize: rf(16),
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: rp(20),
  },
  actionButton: {
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: rf(12),
    marginTop: rp(4),
  },
  content: {
    flex: 1,
    paddingHorizontal: rp(16),
  },
  worksSection: {
    paddingVertical: rp(20),
  },
  sectionTitle: {
    fontSize: rf(18),
    fontWeight: '600',
    color: '#8B2323',
    marginBottom: rp(16),
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: rp(16),
  },
  tab: {
    paddingHorizontal: rp(16),
    paddingVertical: rp(8),
    borderRadius: rb(20),
    backgroundColor: '#8B2323',
    marginRight: rp(8),
  },
  activeTab: {
    backgroundColor: 'white',
  },
  tabText: {
    color: 'white',
    fontSize: rf(14),
    fontWeight: '500',
  },
  activeTabText: {
    color: '#8B2323',
  },
  worksGrid: {
    flexDirection: 'row',
    gap: rp(12),
  },
  workItem: {
    width: rw(80),
    height: rw(80),
    borderRadius: rb(8),
    overflow: 'hidden',
  },
  workImage: {
    width: '100%',
    height: '100%',
  },
  reviewsSection: {
    paddingBottom: rp(20),
  },
  reviewsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: rp(16),
  },
  reviewsContainer: {
    gap: rp(12),
  },
  reviewCard: {
    backgroundColor: 'white',
    borderRadius: rb(8),
    padding: rp(12),
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rp(8),
  },
  reviewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewerImage: {
    width: rw(32),
    height: rw(32),
    borderRadius: rw(16),
    backgroundColor: '#C8C8C8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: rp(8),
  },
  reviewerInitials: {
    color: 'white',
    fontSize: rf(10),
    fontWeight: '600',
  },
  reviewerName: {
    fontSize: rf(14),
    fontWeight: '600',
    color: '#333',
  },
  starsContainer: {
    flexDirection: 'row',
    marginTop: rp(2),
  },
  reviewDate: {
    fontSize: rf(12),
    color: '#666',
  },
  reviewComment: {
    fontSize: rf(14),
    color: '#333',
    lineHeight: 20,
  },
  bottomNav: {
    backgroundColor: '#8B2323',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: rp(12),
    paddingBottom: rp(20),
  },
  navItem: {
    alignItems: 'center',
    position: 'relative',
  },
  navText: {
    color: 'white',
    fontSize: rf(12),
    marginTop: rp(4),
  },
  notificationDot: {
    position: 'absolute',
    top: rp(-2),
    right: rp(-2),
    width: rw(8),
    height: rw(8),
    borderRadius: rw(4),
    backgroundColor: '#FF0000',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: rp(20),
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: rb(16),
    width: '100%',
    maxWidth: rw(400),
    maxHeight: '90%',
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: rp(20),
    paddingVertical: rp(16),
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: rf(18),
    fontWeight: '600',
    color: '#8B2323',
  },
  closeButton: {
    padding: rp(4),
  },
  formContent: {
    padding: rp(20),
    flex: 1,
  },
  formLabel: {
    fontSize: rf(16),
    fontWeight: '600',
    color: '#333',
    marginBottom: rp(16),
  },
  sectionLabel: {
    fontSize: rf(14),
    fontWeight: '500',
    color: '#666',
    marginBottom: rp(8),
    marginTop: rp(16),
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
    borderRadius: rb(8),
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#F9F9F9',
    marginBottom: rp(8),
  },
  dropdownButtonText: {
    fontSize: rf(14),
    color: '#333',
    flex: 1,
  },
  placeholderText: {
    color: '#999',
  },
  dropdownContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  dropdownScrollView: {
    maxHeight: rh(200),
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: rb(8),
    borderWidth: 1,
    borderColor: '#E0E0E0',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    zIndex: 9999,
  },
  dropdownItem: {
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  selectedDropdownItem: {
    backgroundColor: '#8B2323',
  },
  dropdownItemText: {
    fontSize: rf(14),
    color: '#333',
  },
  selectedDropdownItemText: {
    color: 'white',
    fontWeight: '500',
  },
  lastDropdownItem: {
    borderBottomWidth: 0,
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: rb(8),
    paddingHorizontal: rp(12),
    paddingVertical: rp(12),
    fontSize: rf(14),
    color: '#333',
    textAlignVertical: 'top',
    minHeight: rh(100),
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: rp(20),
    paddingVertical: rp(16),
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: rp(12),
  },
  cancelButton: {
    flex: 1,
    paddingVertical: rp(12),
    borderRadius: rb(8),
    borderWidth: 1,
    borderColor: '#8B2323',
    backgroundColor: 'white',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: rf(14),
    fontWeight: '500',
    color: '#8B2323',
  },
  submitButton: {
    flex: 1,
    paddingVertical: rp(12),
    borderRadius: rb(8),
    backgroundColor: '#8B2323',
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: rf(14),
    fontWeight: '500',
    color: 'white',
  },
});

export default RunnerProfilePage;
