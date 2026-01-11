import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

// Helper function to get MIME type from file extension
const getMimeType = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'txt':
      return 'text/plain';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
};

interface UseFileDownloadRunnerReturn {
  handleDownloadFile: (fileUrl: string, fileName: string) => Promise<void>;
  downloadToGallery: (fileUrl: string, fileName: string) => Promise<void>;
  shareFile: (fileUrl: string, fileName: string) => Promise<void>;
}

export function useFileDownloadRunner(): UseFileDownloadRunnerReturn {
  // Function to download image to gallery
  const downloadToGallery = async (fileUrl: string, fileName: string) => {
    try {
      // Web: Use browser download
      if (Platform.OS === 'web') {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      // Native mobile: Check if it's an image
      const isImage = /\.(jpg|jpeg|png|gif|bmp)$/i.test(fileName);
      if (!isImage) {
        Alert.alert('Error', 'Only images can be saved to gallery.');
        return;
      }

      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Media library permission is required to save images.');
        return;
      }

      // Download the file using fetch and new FileSystem API
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      // Get the file as arrayBuffer and convert to base64 (React Native compatible)
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192; // Process in chunks to avoid stack overflow
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64Data = btoa(binary);

      // Write file using new FileSystem API
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Save to gallery
      await MediaLibrary.saveToLibraryAsync(fileUri);
      Alert.alert('Success', 'Image saved to gallery successfully!');
    } catch (error) {
      console.error('Gallery save error:', error);
      Alert.alert('Error', 'Failed to save image to gallery. Please try again.');
    }
  };

  // Function to share file
  const shareFile = async (fileUrl: string, fileName: string) => {
    try {
      // Web: Use browser download (Web Share API requires HTTPS and user gesture)
      if (Platform.OS === 'web') {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      // Native mobile: Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device.');
        return;
      }

      // Download the file using fetch and new FileSystem API
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      // Get the file as arrayBuffer and convert to base64 (React Native compatible)
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192; // Process in chunks to avoid stack overflow
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64Data = btoa(binary);

      // Write file using new FileSystem API
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Share the file
      await Sharing.shareAsync(fileUri, {
        mimeType: getMimeType(fileName),
        dialogTitle: `Share ${fileName}`,
      });
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to share file. Please try again.');
    }
  };

  // Function to download and save files
  const handleDownloadFile = async (fileUrl: string, fileName: string) => {
    try {
      // Web: Directly trigger browser download
      if (Platform.OS === 'web') {
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        return;
      }

      // Native mobile: Show options dialog
      Alert.alert('Download', 'Choose how to save the file:', [
        {
          text: 'Save to Gallery (Images only)',
          onPress: () => downloadToGallery(fileUrl, fileName),
        },
        {
          text: 'Share File',
          onPress: () => shareFile(fileUrl, fileName),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download file. Please try again.');
    }
  };

  return {
    handleDownloadFile,
    downloadToGallery,
    shareFile,
  };
}

