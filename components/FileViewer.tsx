import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

interface FileViewerProps {
  visible: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  fileType: string;
}

const FileViewer: React.FC<FileViewerProps> = ({
  visible,
  onClose,
  fileUrl,
  fileName,
  fileType,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canViewInline, setCanViewInline] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    console.log('FileViewer - Component mounted/updated:', { visible, fileUrl, fileName, fileType });
    if (visible && fileUrl) {
      setLoading(true);
      setError(null);
      setShowFallback(false);
      console.log('FileViewer - Platform:', Platform.OS);
      console.log('FileViewer - File details:', { fileUrl, fileName, fileType });
      
      // Check if this might be a mobile-uploaded file by examining the URL pattern
      const isMobileUploaded = fileUrl.includes('task-uploads') && (
        fileUrl.includes('anonymous') || 
        fileUrl.includes('timestamp') ||
        fileType === 'unknown' ||
        fileType === 'application/octet-stream'
      );
      
      if (isMobileUploaded) {
        console.log('FileViewer - Detected potential mobile-uploaded file');
      }
      
      // DEEPER DEBUG: Check file accessibility
      console.log('=== DEEPER FILE DEBUG START ===');
      console.log('File URL:', fileUrl);
      console.log('File Name:', fileName);
      console.log('File Type:', fileType);
      console.log('Platform:', Platform.OS);
      console.log('URL includes task-uploads:', fileUrl.includes('task-uploads'));
      console.log('URL includes supabase:', fileUrl.includes('supabase'));
      console.log('URL protocol:', fileUrl.split('://')[0]);
      console.log('URL domain:', fileUrl.split('://')[1]?.split('/')[0]);
      console.log('URL path:', fileUrl.split('://')[1]?.split('/').slice(1).join('/'));
      console.log('=== DEEPER FILE DEBUG END ===');
      
      // Test file accessibility immediately
      testFileAccessibility();
      
      checkFileType();
    }
  }, [visible, fileUrl, fileType]);

  const testFileAccessibility = async () => {
    try {
      console.log('=== TESTING FILE ACCESSIBILITY ===');
      console.log('Testing URL:', fileUrl);
      
      // Test with HEAD request to check if file is accessible
      const response = await fetch(fileUrl, { 
        method: 'HEAD',
        mode: 'cors'
      });
      
      console.log('File accessibility response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok
      });
      
      if (!response.ok) {
        console.error('File is not accessible:', response.status, response.statusText);
        setError(`File not accessible: ${response.status} ${response.statusText}`);
        setLoading(false);
        return;
      }
      
      console.log('File is accessible!');
      
    } catch (error) {
      console.error('Error testing file accessibility:', error);
      setError(`Error accessing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  const loadPdfAsBlob = async () => {
    try {
      console.log('=== LOADING PDF AS BLOB ===');
      console.log('Fetching PDF from URL:', fileUrl);
      
      const response = await fetch(fileUrl, {
        mode: 'cors',
        headers: {
          'Accept': 'application/pdf,*/*'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      console.log('PDF blob created:', blob);
      
      // Create object URL from blob
      const blobUrl = URL.createObjectURL(blob);
      console.log('Blob URL created:', blobUrl);
      
      // Update the iframe src to use the blob URL
      const iframe = document.querySelector('iframe');
      if (iframe) {
        iframe.src = blobUrl;
        console.log('Updated iframe src to blob URL');
      }
      
      setLoading(false);
      
    } catch (error) {
      console.error('Error loading PDF as blob:', error);
      setError(`Failed to load PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  const loadImageAsBlob = async () => {
    try {
      console.log('=== LOADING IMAGE AS BLOB ===');
      console.log('Fetching image from URL:', fileUrl);
      
      const response = await fetch(fileUrl, {
        mode: 'cors',
        headers: {
          'Accept': 'image/*,*/*'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      console.log('Image blob created:', blob);
      
      // Create object URL from blob
      const blobUrl = URL.createObjectURL(blob);
      console.log('Blob URL created:', blobUrl);
      
      // Update the img src to use the blob URL
      const img = document.querySelector('img');
      if (img) {
        img.src = blobUrl;
        console.log('Updated img src to blob URL');
      }
      
      setLoading(false);
      
    } catch (error) {
      console.error('Error loading image as blob:', error);
      setError(`Failed to load image: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  const checkFileType = () => {
    const lowerType = fileType.toLowerCase();
    const lowerName = fileName.toLowerCase();
    
    // Check if file can be viewed inline - prioritize file extension over MIME type
    const isImage = lowerName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/) || 
                   lowerType.startsWith('image/');
    const isPdf = lowerName.endsWith('.pdf') || 
                 lowerType === 'application/pdf';
    const isText = lowerName.match(/\.(txt|md|json|xml|csv)$/) || 
                  lowerType.startsWith('text/');
    
    // Additional check for mobile-uploaded files that might have incorrect MIME types
    const isDocument = lowerName.match(/\.(doc|docx|pdf|xls|xlsx|ppt|pptx)$/);
    
    setCanViewInline(!!(isImage || isPdf || isText || isDocument));
    setLoading(false);
    
    console.log('FileViewer - File type check:', {
      fileName,
      fileType,
      lowerType,
      lowerName,
      isImage,
      isPdf,
      isText,
      isDocument,
      canViewInline: isImage || isPdf || isText || isDocument
    });
  };


  const handleDownload = async () => {
    try {
      setLoading(true);
      console.log('Downloading file:', { fileUrl, fileName, fileType });
      
      // For web, use the same simple approach as mobile
      if (Platform.OS === 'web') {
        try {
          // First, try to fetch the file to check if it's accessible
          const response = await fetch(fileUrl, { method: 'HEAD' });
          console.log('File accessibility check:', { status: response.status, headers: response.headers });
          
          if (response.ok) {
            // File is accessible, try to download with proper headers
            // For mobile-uploaded files, we need to add proper content-type headers
            const downloadUrl = fileUrl + (fileUrl.includes('?') ? '&' : '?') + 
              `download=${encodeURIComponent(fileName)}&filename=${encodeURIComponent(fileName)}&t=${Date.now()}`;
            
            console.log('Web download - trying URL with filename parameters');
            
            // Try to open the URL directly
            window.open(downloadUrl, '_blank');
            console.log('Web download - opened URL successfully');
          } else {
            console.error('File not accessible:', response.status);
            // For mobile-uploaded files, try a different approach
            const retryUrl = fileUrl + (fileUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
            window.open(retryUrl, '_blank');
            console.log('Web download - fallback to original URL with cache-busting');
          }
          
        } catch (linkError) {
          console.error('Web download failed:', linkError);
          
          // Fallback to original URL with cache-busting for mobile-uploaded files
          try {
            const fallbackUrl = fileUrl + (fileUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
            window.open(fallbackUrl, '_blank');
            console.log('Web download - fallback to original URL with cache-busting');
          } catch (fallbackError) {
            console.error('Web download fallback failed:', fallbackError);
            alert('Cannot download this file. This might be a mobile-uploaded file that needs to be re-uploaded. Please try again or contact support.');
          }
        }
      } else {
        // For mobile, try to download with proper filename
        try {
          // First try to download with filename in URL parameters
          const downloadUrl = fileUrl + (fileUrl.includes('?') ? '&' : '?') + 
            `download=${encodeURIComponent(fileName)}&filename=${encodeURIComponent(fileName)}`;
          
          const canOpen = await Linking.canOpenURL(downloadUrl);
          if (canOpen) {
            await Linking.openURL(downloadUrl);
            console.log('Download opened with filename:', fileName);
          } else {
            // Fallback to original URL
            await Linking.openURL(fileUrl);
            console.log('Download opened with original URL');
          }
        } catch (linkError) {
          console.error('Linking failed:', linkError);
          Alert.alert('Error', 'Cannot open this file type on this device');
        }
      }
    } catch (err) {
      console.error('Download failed:', err);
      Alert.alert('Error', 'Failed to download file');
    } finally {
      setLoading(false);
    }
  };

  const renderFileContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B0000" />
          <Text style={styles.loadingText}>Loading file...</Text>
        </View>
      );
    }

    // For mobile, show fallback message if file can't be displayed inline
    if (Platform.OS !== 'web' && (showFallback || error)) {
      return (
        <View style={styles.unsupportedContainer}>
          <Ionicons name="document" size={64} color="#6b7280" />
          <Text style={styles.unsupportedTitle}>File Preview Not Available</Text>
          <Text style={styles.unsupportedText}>
            This file type cannot be previewed. You can download it to view with an external application.
          </Text>
          <TouchableOpacity 
            style={styles.downloadButton} 
            onPress={() => {
              console.log('Main download button pressed');
              handleDownload();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="download" size={20} color="#fff" />
            <Text style={styles.downloadButtonText}>Download File</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton} 
            onPress={() => {
              console.log('Retry/Download button pressed');
              handleDownload();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>Download Instead</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const lowerType = fileType.toLowerCase();
    const lowerName = fileName.toLowerCase();

    // Image files - prioritize file extension over MIME type
    if (lowerName.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/) || lowerType.startsWith('image/')) {
      console.log('=== RENDERING IMAGE DEBUG ===');
      console.log('File URL:', fileUrl);
      console.log('File Name:', fileName);
      console.log('Lower Type:', lowerType);
      console.log('Lower Name:', lowerName);
      console.log('Platform:', Platform.OS);
      console.log('=== END RENDERING IMAGE DEBUG ===');
      
      if (Platform.OS === 'web') {
        return (
          <ScrollView style={styles.fileContent} contentContainerStyle={styles.imageContainer}>
            <img
              src={fileUrl}
              alt={fileName}
              style={styles.image}
              onLoad={() => {
                console.log('=== IMAGE LOAD SUCCESS ===');
                console.log('Image loaded successfully for URL:', fileUrl);
                console.log('Image name:', fileName);
                console.log('=== END IMAGE LOAD SUCCESS ===');
                setLoading(false);
              }}
              onError={(e) => {
                console.error('=== IMAGE LOAD ERROR ===');
                console.error('Image load error:', e);
                console.error('Image URL that failed:', fileUrl);
                console.error('Image name:', fileName);
                console.error('Error event:', e);
                console.error('=== END IMAGE LOAD ERROR ===');
                
                // Try blob-based approach as fallback
                console.log('=== TRYING BLOB-BASED IMAGE RENDERING ===');
                loadImageAsBlob();
              }}
            />
          </ScrollView>
        );
      } else {
        return (
          <ScrollView style={styles.fileContent} contentContainerStyle={styles.imageContainer}>
            <Image
              source={{ uri: fileUrl }}
              style={styles.image}
              onLoad={() => {
                console.log('Image loaded successfully on mobile');
                setLoading(false);
              }}
              onError={(e) => {
                console.error('Image load error on mobile:', e);
                setShowFallback(true);
                setLoading(false);
              }}
              resizeMode="contain"
            />
          </ScrollView>
        );
      }
    }

    // PDF files - prioritize file extension over MIME type
    if (lowerName.endsWith('.pdf') || lowerType === 'application/pdf') {
      console.log('=== RENDERING PDF DEBUG ===');
      console.log('File URL:', fileUrl);
      console.log('File Name:', fileName);
      console.log('Lower Type:', lowerType);
      console.log('Lower Name:', lowerName);
      console.log('Platform:', Platform.OS);
      console.log('=== END RENDERING PDF DEBUG ===');
      
      if (Platform.OS === 'web') {
        // For web, use blob-based approach to avoid CORS issues
        return (
          <View style={styles.fileContent}>
            <iframe
              src={fileUrl}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                minHeight: '600px'
              }}
              onLoad={() => {
                console.log('=== PDF LOAD SUCCESS ===');
                console.log('PDF loaded successfully for URL:', fileUrl);
                console.log('PDF name:', fileName);
                console.log('=== END PDF LOAD SUCCESS ===');
                setLoading(false);
              }}
              onError={() => {
                console.error('=== PDF LOAD ERROR ===');
                console.error('PDF load error for URL:', fileUrl);
                console.error('PDF name:', fileName);
                console.error('=== END PDF LOAD ERROR ===');
                
                // Try blob-based approach as fallback
                console.log('=== TRYING BLOB-BASED PDF RENDERING ===');
                loadPdfAsBlob();
              }}
            />
          </View>
        );
      } else {
        return (
          <WebView
            source={{ uri: fileUrl }}
            style={styles.webView}
            onLoadEnd={() => {
              console.log('PDF loaded successfully on mobile');
              setLoading(false);
            }}
            onError={() => {
              console.error('PDF load error on mobile');
              setShowFallback(true);
              setLoading(false);
            }}
            startInLoadingState={true}
            scalesPageToFit={true}
          />
        );
      }
    }

    // Text files - prioritize file extension over MIME type
    if (lowerName.match(/\.(txt|md|json|xml|csv)$/) || lowerType.startsWith('text/')) {
      if (Platform.OS === 'web') {
        return (
          <WebView
            source={{ uri: fileUrl }}
            style={styles.webView}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setError('Failed to load text file');
              setLoading(false);
            }}
          />
        );
      } else {
        // For mobile, show fallback for text files
        return (
          <View style={styles.unsupportedContainer}>
            <Ionicons name="document" size={64} color="#6b7280" />
            <Text style={styles.unsupportedTitle}>File Preview Not Available</Text>
            <Text style={styles.unsupportedText}>
              This file type cannot be previewed. You can download it to view with an external application.
            </Text>
            {/* Only show download button for mobile - web has it in header */}
            {(typeof window === 'undefined' || Platform.OS === 'ios' || Platform.OS === 'android') && (
              <TouchableOpacity 
                style={styles.downloadButton} 
                onPress={() => {
                  console.log('Text file download button pressed');
                  handleDownload();
                }}
                activeOpacity={0.7}
                onPressIn={() => console.log('Text file download button pressed IN')}
                onPressOut={() => console.log('Text file download button pressed OUT')}
              >
                <Ionicons name="download" size={20} color="#fff" />
                <Text style={styles.downloadButtonText}>Download File</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      }
    }

    // Unsupported file types - show download option
    console.log('=== UNSUPPORTED FILE DEBUG ===');
    console.log('File URL:', fileUrl);
    console.log('File Name:', fileName);
    console.log('File Type:', fileType);
    console.log('Lower Type:', lowerType);
    console.log('Lower Name:', lowerName);
    console.log('Platform:', Platform.OS);
    console.log('=== END UNSUPPORTED FILE DEBUG ===');
    
    return (
      <View style={styles.unsupportedContainer}>
        <Ionicons name="document" size={64} color="#6b7280" />
        <Text style={styles.unsupportedTitle}>File Preview Not Available</Text>
        <Text style={styles.unsupportedText}>
          This file type cannot be previewed. This might be a mobile-uploaded file that needs to be downloaded to view properly.
        </Text>
        {/* Only show download button for mobile - web has it in header */}
        {(typeof window === 'undefined' || Platform.OS === 'ios' || Platform.OS === 'android') && (
          <TouchableOpacity 
            style={styles.downloadButton} 
            onPress={() => {
              console.log('Unsupported file download button pressed');
              handleDownload();
            }}
            activeOpacity={0.7}
            onPressIn={() => console.log('Unsupported file download button pressed IN')}
            onPressOut={() => console.log('Unsupported file download button pressed OUT')}
          >
            <Ionicons name="download" size={20} color="#fff" />
            <Text style={styles.downloadButtonText}>Download File</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  console.log('FileViewer - Rendering component:', { visible, loading, error, canViewInline });
  
  // For web, use a different approach since Modal might not handle clicks properly
  if (typeof window !== 'undefined' && Platform.OS !== 'ios' && Platform.OS !== 'android') {
    if (!visible) return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          backgroundColor: 'white',
          width: '90%',
          height: '90%',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}>
            <button 
              style={{
                padding: '8px',
                marginRight: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '24px'
              }}
              onClick={() => {
                console.log('WEB: Close button clicked');
                onClose();
              }}
            >
              ✕
            </button>
            <div style={{ flex: 1, marginRight: '8px' }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#111827' }}>
                {fileName}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                {fileType}
              </div>
            </div>
            <button 
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#8B0000',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer'
              }}
              onClick={() => {
                console.log('WEB: Download button clicked');
                handleDownload();
              }}
            >
              ⬇ Download
            </button>
          </div>
          
          {/* Content */}
          <div style={{ flex: 1, position: 'relative' }}>
            {renderFileContent()}
            
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={() => {
              console.log('Close button pressed');
              onClose();
            }}
            activeOpacity={0.7}
            onPressIn={() => console.log('Close button pressed IN')}
            onPressOut={() => console.log('Close button pressed OUT')}
          >
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
          {/* Debug: Simple clickable div for web */}
          {typeof window !== 'undefined' && Platform.OS !== 'ios' && Platform.OS !== 'android' && (
            <div 
              style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: 40, 
                height: 40, 
                backgroundColor: 'rgba(255,0,0,0.3)', 
                zIndex: 1000,
                cursor: 'pointer'
              }}
              onClick={() => {
                console.log('DEBUG: Simple div close clicked');
                onClose();
              }}
            >
              <span style={{ color: 'white', fontSize: '12px' }}>X</span>
            </div>
          )}
          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {fileName}
            </Text>
            <Text style={styles.subtitle}>{fileType}</Text>
          </View>
          <TouchableOpacity 
            style={styles.downloadButton} 
            onPress={() => {
              console.log('Header download button pressed');
              handleDownload();
            }}
            activeOpacity={0.7}
            onPressIn={() => console.log('Header download button pressed IN')}
            onPressOut={() => console.log('Header download button pressed OUT')}
          >
            <Ionicons name="download" size={20} color="#fff" />
          </TouchableOpacity>
          {/* Debug: Simple clickable div for web download */}
          {typeof window !== 'undefined' && Platform.OS !== 'ios' && Platform.OS !== 'android' && (
            <div 
              style={{ 
                position: 'absolute', 
                top: 0, 
                right: 0, 
                width: 60, 
                height: 40, 
                backgroundColor: 'rgba(0,255,0,0.3)', 
                zIndex: 1000,
                cursor: 'pointer'
              }}
              onClick={() => {
                console.log('DEBUG: Simple div download clicked');
                handleDownload();
              }}
            >
              <span style={{ color: 'white', fontSize: '12px' }}>DL</span>
            </div>
          )}
        </View>

        {/* File Content */}
        <View style={styles.content}>
          {renderFileContent()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  closeButton: {
    padding: 8,
    marginRight: 8,
    zIndex: 999,
    elevation: 999,
  },
  titleContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B0000',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    zIndex: 999,
    elevation: 999,
  },
  downloadButtonText: {
    color: '#fff',
    fontWeight: '500',
    marginLeft: 4,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#8B0000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '500',
  },
  fileContent: {
    flex: 1,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    width: '100%',
    height: 'auto',
  },
  webView: {
    flex: 1,
  },
  pdfIframe: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
  },
  unsupportedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  unsupportedTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  unsupportedText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
});

export default FileViewer;
