// Import React and necessary hooks for state management
import React, { useState } from 'react';
// Import React Native components for building the UI
import {
  SafeAreaView,    // Provides safe area for notched devices
  ScrollView,      // Scrollable container for content
  View,            // Basic container component
  Text,            // Text display component
  TextInput,       // Input field component
  TouchableOpacity, // Touchable button component
  StyleSheet,      // For styling components
  Image,           // For profile pictures
  Alert,           // For showing alerts
} from 'react-native';
// Import icons from Expo vector icons library
import { Ionicons } from '@expo/vector-icons';
// Import Expo document picker for file selection
import * as DocumentPicker from 'expo-document-picker';
// Import Expo image picker for photo selection
import * as ImagePicker from 'expo-image-picker';
// Import task status service
import taskStatusService from './TaskStatusService';
// Import responsive utilities
import { responsive, rw, rh, rf, rp, rb } from '../utils/responsive';

// TypeScript interface defining the structure of a user
interface User {
  id: string;
  name: string;
  profilePicture: string;
  role: string;
  department: string;
}

// TypeScript interface defining the structure of a task
interface Task {
  id: string;
  description: string;
  completionDate: string;
  status: 'requested' | 'accepted' | 'in_progress' | 'revision' | 'completed';
}

// Main TaskReview component props
type TaskReviewProps = { 
  onBack?: () => void;
  onViewProfile?: () => void;
};

const TaskReview: React.FC<TaskReviewProps> = ({ onBack, onViewProfile }) => {
  // Mock user data - in real app, this would come from props or state management
  const caller: User = {
    id: 'caller-1',
    name: 'Yu Jimin',
    profilePicture: 'https://via.placeholder.com/40x40/8B2323/FFFFFF?text=YJ',
    role: 'BuddyCaller',
    department: 'CHSE',
  };

  // Mock task data - in real app, this would come from props or state management
  const task: Task = {
    id: 'task-1',
    description: "Hi! I'm looking for someone who can take high-quality photos during our student organization's event. It'll be held outdoors, and I need someone who can capture candid and posed shots.",
    completionDate: 'July 10, 2025 - 3:00 PM',
    status: 'requested',
  };

  // State hook to manage selected file/image
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // State hook to manage task status from TaskStatusService
  const [currentTaskStatus, setCurrentTaskStatus] = useState<'requested' | 'accepted' | 'in_progress' | 'revision' | 'completed'>(
    taskStatusService.getStatus()
  );

  // Subscribe to task status changes
  React.useEffect(() => {
    const handleStatusChange = (status: 'requested' | 'accepted' | 'in_progress' | 'revision' | 'completed') => {
      setCurrentTaskStatus(status);
    };

    taskStatusService.onStatusChange(handleStatusChange);

    // Cleanup listener on component unmount
    return () => {
      taskStatusService.offStatusChange(handleStatusChange);
    };
  }, []);

  // Function to handle file/image selection
  const handleFileSelection = () => {
    // Check if invoice has been accepted (status is 'in_progress' or beyond)
    if (currentTaskStatus === 'requested' || currentTaskStatus === 'accepted') {
      Alert.alert(
        'Upload Not Available',
        'Please wait for the caller to accept the invoice before you can upload files.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    Alert.alert(
      'Select Upload Type',
      'Choose what you want to upload',
      [
        {
          text: 'Choose from Gallery',
          onPress: handlePickImage,
        },
        {
          text: 'Take Photo',
          onPress: handleTakePhoto,
        },
        {
          text: 'Choose File',
          onPress: handlePickDocument,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  // Function to pick image from gallery
  const handlePickImage = async () => {
    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Media library permission is required to select photos.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedImage(asset.uri);
        setSelectedFile(null); // Clear file selection
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select image. Please try again.');
      console.error('Image picker error:', error);
    }
  };

  // Function to take photo with camera
  const handleTakePhoto = async () => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Camera permission is required to take photos.');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedImage(asset.uri);
        setSelectedFile(null); // Clear file selection
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo. Please try again.');
      console.error('Camera error:', error);
    }
  };

  // Function to pick document/file
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // Allow all file types
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedFile(asset.name);
        setSelectedImage(null); // Clear image selection
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select file. Please try again.');
      console.error('Document picker error:', error);
    }
  };

  // Function to handle file/image submission
  const handleSubmit = () => {
    // Check if invoice has been accepted (status is 'in_progress' or beyond)
    if (currentTaskStatus === 'requested' || currentTaskStatus === 'accepted') {
      Alert.alert(
        'Submit Not Available',
        'Please wait for the caller to accept the invoice before you can submit files.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    if (!selectedFile && !selectedImage) {
      Alert.alert('Error', 'Please select a file or image to upload.');
      return;
    }

    const uploadType = selectedImage ? 'image' : 'file';
    const uploadName = selectedImage ? 'image' : selectedFile;

    Alert.alert(
      `Submit ${uploadType === 'image' ? 'Image' : 'File'}`,
      `Are you sure you want to submit this ${uploadType}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Submit', 
          onPress: () => {
            // Here you would typically upload the file/image and update task status
            console.log(`${uploadType} submitted:`, uploadName);
            Alert.alert('Success', `${uploadType === 'image' ? 'Image' : 'File'} submitted successfully!`);
            setSelectedFile(null);
            setSelectedImage(null);
            
            // Update task status to revision after file submission
            taskStatusService.submitFile();
          }
        }
      ]
    );
  };

  // Function to render progress bar
  const renderProgressBar = () => {
    const stages = [
      { key: 'requested', label: 'Requested' },
      { key: 'accepted', label: 'Accepted' },
      { key: 'in_progress', label: 'In Progress' },
      { key: 'revision', label: 'Revision' },
      { key: 'completed', label: 'Completed' },
    ];

    // Function to check if a stage should be completed (red with checkmark)
    const isStageCompleted = (stageKey: string) => {
      switch (currentTaskStatus) {
        case 'requested':
          return stageKey === 'requested';
        case 'accepted':
          return stageKey === 'requested' || stageKey === 'accepted';
        case 'in_progress':
          return stageKey === 'requested' || stageKey === 'accepted' || stageKey === 'in_progress';
        case 'revision':
          return stageKey === 'requested' || stageKey === 'accepted' || stageKey === 'in_progress';
        case 'completed':
          return stageKey === 'requested' || stageKey === 'accepted' || stageKey === 'in_progress' || stageKey === 'revision' || stageKey === 'completed';
        default:
          return false;
      }
    };

    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          {stages.map((stage, index) => {
            const isCompleted = isStageCompleted(stage.key);
            return (
              <View key={stage.key} style={styles.progressStage}>
                <View style={[
                  styles.progressCircle,
                  isCompleted ? styles.progressCircleActive : styles.progressCircleInactive
                ]}>
                  {isCompleted && <Ionicons name="checkmark" size={12} color="white" />}
                </View>
                <Text style={[
                  styles.progressLabel,
                  isCompleted ? styles.progressLabelActive : styles.progressLabelInactive
                ]}>
                  {stage.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#8B2323" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Task Review</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Caller Information Card */}
        <View style={styles.callerCard}>
          <View style={styles.callerInfo}>
            <View style={styles.callerProfilePicture}>
              <Text style={styles.profileInitials}>YJ</Text>
            </View>
            <View style={styles.callerDetails}>
              <Text style={styles.callerName}>{caller.name}</Text>
              <Text style={styles.callerRole}>{caller.department}</Text>
              <Text style={styles.callerDepartment}>{caller.role}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onViewProfile} style={styles.viewProfileButton}>
            <Text style={styles.viewProfileText}>View Profile</Text>
            <Ionicons name="chevron-forward" size={16} color="#8B2323" />
          </TouchableOpacity>
        </View>

        {/* Task Progress Section */}
        <View style={styles.taskCard}>
          <Text style={styles.sectionTitle}>Task Progress</Text>
          {renderProgressBar()}
          
          {/* Note */}
          <View style={styles.noteContainer}>
            <Text style={styles.noteText}>
              {currentTaskStatus === 'requested' 
                ? "Note: Please wait for the BuddyCaller's response to your request."
                : currentTaskStatus === 'accepted'
                ? "Note: The invoice has been accepted. You can now start working on the task."
                : currentTaskStatus === 'in_progress'
                ? "Note: The invoice has been accepted. You can now start working on the task and upload your completed work."
                : currentTaskStatus === 'revision'
                ? "Note: After uploading the revised file, please wait for the BuddyCaller's feedback or approval before marking the commission as completed."
                : "Note: Task completed successfully!"
              }
            </Text>
          </View>

          {/* Task Details */}
          <View style={styles.taskDetailsSection}>
            <Text style={styles.sectionTitle}>Task Details</Text>
            
            <View style={styles.taskDetailItem}>
              <Text style={styles.taskDetailLabel}>Commission Description:</Text>
              <Text style={styles.taskDetailValue}>{task.description}</Text>
            </View>
            
            <View style={styles.taskDetailItem}>
              <Text style={styles.taskDetailLabel}>Completion Date:</Text>
              <Text style={styles.taskDetailValue}>{task.completionDate}</Text>
            </View>
          </View>

          {/* Upload File/Image Section */}
          <View style={styles.uploadSection}>
            <Text style={styles.uploadLabel}>Upload File/Image:</Text>
            
            {/* Show selected image preview */}
            {selectedImage && (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
                <TouchableOpacity 
                  style={styles.removeImageButton}
                  onPress={() => setSelectedImage(null)}
                >
                  <Ionicons name="close-circle" size={24} color="#8B2323" />
                </TouchableOpacity>
              </View>
            )}
            
            {/* Show selected file name */}
            {selectedFile && (
              <View style={styles.filePreviewContainer}>
                <Ionicons name="document" size={20} color="#8B2323" />
                <Text style={styles.filePreviewText}>{selectedFile}</Text>
                <TouchableOpacity 
                  style={styles.removeFileButton}
                  onPress={() => setSelectedFile(null)}
                >
                  <Ionicons name="close-circle" size={20} color="#8B2323" />
                </TouchableOpacity>
              </View>
            )}
            
            {/* Upload button */}
            <TouchableOpacity 
              style={[
                styles.uploadButton,
                (currentTaskStatus === 'requested' || currentTaskStatus === 'accepted') && styles.uploadButtonDisabled
              ]}
              onPress={handleFileSelection}
              disabled={currentTaskStatus === 'requested' || currentTaskStatus === 'accepted'}
            >
              <Ionicons 
                name="cloud-upload" 
                size={20} 
                color={(currentTaskStatus === 'requested' || currentTaskStatus === 'accepted') ? '#999' : '#8B2323'} 
              />
              <Text style={[
                styles.uploadButtonText,
                (currentTaskStatus === 'requested' || currentTaskStatus === 'accepted') && styles.uploadButtonTextDisabled
              ]}>
                {currentTaskStatus === 'requested' || currentTaskStatus === 'accepted' 
                  ? 'Upload Disabled - Wait for Invoice Acceptance'
                  : selectedFile || selectedImage 
                    ? 'Change Selection' 
                    : 'Select File or Image'
                }
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.submitContainer}>
        <TouchableOpacity 
          style={[
            styles.submitButton,
            (currentTaskStatus === 'requested' || currentTaskStatus === 'accepted') && styles.submitButtonDisabled
          ]}
          onPress={handleSubmit}
          disabled={currentTaskStatus === 'requested' || currentTaskStatus === 'accepted'}
        >
          <Text style={[
            styles.submitButtonText,
            (currentTaskStatus === 'requested' || currentTaskStatus === 'accepted') && styles.submitButtonTextDisabled
          ]}>
            {currentTaskStatus === 'requested' || currentTaskStatus === 'accepted' 
              ? 'Submit Disabled - Wait for Invoice Acceptance'
              : 'Submit'
            }
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// Styles for the TaskReview component
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  
  // Header section styling
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  
  backButton: {
    padding: rp(4),
  },
  
  headerTitle: {
    fontSize: rf(18),
    fontWeight: '600',
    color: '#8B2323',
  },
  
  headerSpacer: {
    width: rw(32),
  },
  
  // Content container
  content: {
    flex: 1,
    paddingHorizontal: rp(16),
  },
  
  // Caller information card
  callerCard: {
    backgroundColor: 'white',
    borderRadius: rb(8),
    borderWidth: 1,
    borderColor: '#8B2323',
    padding: rp(16),
    marginTop: rp(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  callerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  
  callerProfilePicture: {
    width: rw(40),
    height: rw(40),
    borderRadius: rw(20),
    backgroundColor: '#C8C8C8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: rp(12),
  },
  
  profileInitials: {
    color: 'white',
    fontSize: rf(14),
    fontWeight: '600',
  },
  
  callerDetails: {
    flex: 1,
  },
  
  callerName: {
    fontSize: rf(16),
    fontWeight: '600',
    color: '#8B2323',
    marginBottom: rp(2),
  },
  
  callerRole: {
    fontSize: rf(12),
    color: '#666',
    marginBottom: rp(1),
  },
  
  callerDepartment: {
    fontSize: rf(12),
    color: '#666',
  },
  
  viewProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  viewProfileText: {
    fontSize: rf(12),
    color: '#8B2323',
    marginRight: rp(4),
  },
  
  // Task card
  taskCard: {
    backgroundColor: 'white',
    borderRadius: rb(8),
    borderWidth: 1,
    borderColor: '#8B2323',
    padding: rp(16),
    marginTop: rp(16),
    marginBottom: rp(20),
  },
  
  sectionTitle: {
    fontSize: rf(16),
    fontWeight: '600',
    color: '#8B2323',
    marginBottom: rp(16),
  },
  
  // Progress bar
  progressContainer: {
    marginBottom: rp(16),
  },
  
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rp(12),
  },
  
  progressStage: {
    alignItems: 'center',
    flex: 1,
  },
  
  progressCircle: {
    width: rw(24),
    height: rw(24),
    borderRadius: rw(12),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: rp(4),
  },
  
  progressCircleActive: {
    backgroundColor: '#8B2323',
  },
  
  progressCircleInactive: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#8B2323',
  },
  
  progressLabel: {
    fontSize: rf(10),
    textAlign: 'center',
    fontWeight: '500',
  },
  
  progressLabelActive: {
    color: '#8B2323',
  },
  
  progressLabelInactive: {
    color: '#999',
  },
  
  // Note container
  noteContainer: {
    backgroundColor: '#FFF5F5',
    borderRadius: rb(6),
    padding: rp(12),
    marginBottom: rp(20),
  },
  
  noteText: {
    fontSize: rf(12),
    color: '#8B2323',
    lineHeight: rf(16),
  },
  
  // Task details section
  taskDetailsSection: {
    marginBottom: rp(20),
  },
  
  taskDetailItem: {
    marginBottom: rp(12),
  },
  
  taskDetailLabel: {
    fontSize: rf(12),
    fontWeight: '600',
    color: '#8B2323',
    marginBottom: rp(4),
  },
  
  taskDetailValue: {
    fontSize: rf(14),
    color: '#333',
    lineHeight: rf(18),
  },
  
  // Upload section
  uploadSection: {
    marginBottom: rp(16),
  },
  
  uploadLabel: {
    fontSize: rf(12),
    fontWeight: '600',
    color: '#8B2323',
    marginBottom: rp(8),
  },
  
  // Image preview styles
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: rp(12),
    alignItems: 'center',
  },
  
  imagePreview: {
    width: rw(200),
    height: rw(150),
    borderRadius: rb(8),
    borderWidth: 2,
    borderColor: '#8B2323',
  },
  
  removeImageButton: {
    position: 'absolute',
    top: rp(-8),
    right: rp(-8),
    backgroundColor: 'white',
    borderRadius: rw(12),
  },
  
  // File preview styles
  filePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: rb(6),
    paddingHorizontal: rp(12),
    paddingVertical: rp(8),
    marginBottom: rp(12),
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  
  filePreviewText: {
    flex: 1,
    fontSize: rf(14),
    color: '#333',
    marginLeft: rp(8),
  },
  
  removeFileButton: {
    marginLeft: rp(8),
  },
  
  // Upload button styles
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#8B2323',
    borderRadius: rb(6),
    paddingHorizontal: rp(16),
    paddingVertical: rp(12),
    backgroundColor: 'white',
  },
  
  uploadButtonText: {
    fontSize: rf(14),
    fontWeight: '600',
    color: '#8B2323',
    marginLeft: rp(8),
  },
  
  uploadButtonDisabled: {
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
  },
  
  uploadButtonTextDisabled: {
    color: '#999',
  },
  
  // Submit container
  submitContainer: {
    paddingHorizontal: rp(16),
    paddingVertical: rp(16),
    paddingBottom: rp(20),
  },
  
  submitButton: {
    backgroundColor: '#8B2323',
    borderRadius: rb(8),
    paddingVertical: rp(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  submitButtonText: {
    color: 'white',
    fontSize: rf(16),
    fontWeight: '600',
  },
  
  submitButtonDisabled: {
    backgroundColor: '#E0E0E0',
  },
  
  submitButtonTextDisabled: {
    color: '#999',
  },
});

export default TaskReview;
