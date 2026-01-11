import { Platform, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../lib/supabase';

interface UseFileUploadProps {
  conversationId: string | string[] | undefined;
  user: any;
  currentMessage: string;
  setCurrentMessage: (text: string) => void;
  scrollToBottom: () => void;
}

interface UseFileUploadReturn {
  handleSendMessage: () => Promise<void>;
  handlePickImage: () => Promise<void>;
  handlePickDocument: () => Promise<void>;
  handleAttachment: () => void;
  handleCamera: () => Promise<void>;
}

export const useFileUpload = ({
  conversationId,
  user,
  currentMessage,
  setCurrentMessage,
  scrollToBottom,
}: UseFileUploadProps): UseFileUploadReturn => {
  // Function to handle sending a new message
  const handleSendMessage = async () => {
    if (currentMessage.trim()) {
      try {
        // Send message directly to Supabase
        await supabase
          .from('messages')
          .insert({
            conversation_id: (conversationId as string) || '',
            sender_id: user?.id,
            message_type: 'text',
            message_text: currentMessage.trim(),
          });

        setCurrentMessage('');

        // Scroll to bottom after sending message
        setTimeout(() => {
          scrollToBottom();
        }, 100);
      } catch (e) {
        console.warn('Failed to send message:', e);
      }
    }
  };

  // Function to handle attachment action - shows options for file or image
  const handleAttachment = () => {
    Alert.alert(
      'Select Attachment',
      'Choose what you want to attach',
      [
        {
          text: 'Choose from Gallery',
          onPress: handlePickImage,
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

        // Upload image to Supabase Storage
        try {
          console.log('Starting image upload to Supabase Storage...', asset.uri);

          // Create a unique filename in user's folder
          const fileName = `user-files/${user?.id || 'anonymous'}/${Date.now()}_${asset.fileName || 'image.jpg'}`;
          console.log('Uploading to filename:', fileName);

          let uploadData: any;
          let uploadError: any;

          // Handle WEB platform with image optimization
          if (Platform.OS === 'web') {
            try {
              // Fetch the image (works for both blob: and http: URLs)
              const response = await fetch(asset.uri);
              if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
              }
              
              let blob = await response.blob();
              console.log('Image fetched, original size:', blob.size, 'bytes');

              // Optimize image for WEB (resize and compress)
              try {
                const { optimizeImageForUpload } = await import('../../utils/imageOptimization.web');
                blob = await optimizeImageForUpload(blob);
                console.log('Image optimized, new size:', blob.size, 'bytes');
              } catch (optimizeError) {
                console.warn('Image optimization failed, using original:', optimizeError);
                // Continue with original blob if optimization fails
              }

              // Convert blob to File for Supabase upload
              const file = new File([blob], asset.fileName || `image_${Date.now()}.jpg`, {
                type: blob.type || 'image/jpeg',
              });

              // Upload optimized file directly
              const uploadResult = await supabase.storage
                .from('chat-files')
                .upload(fileName, file, {
                  contentType: blob.type || 'image/jpeg',
                });

              uploadData = uploadResult.data;
              uploadError = uploadResult.error;
            } catch (webError) {
              console.error('WEB upload error:', webError);
              uploadError = webError;
            }
          } else {
            // Mobile platform - use FormData approach (unchanged)
            const formData = new FormData();
            formData.append('file', {
              uri: asset.uri,
              type: 'image/jpeg',
              name: asset.fileName || `image_${Date.now()}.jpg`,
            } as any);

            console.log('Uploading image with FormData to:', fileName);

            const uploadResult = await supabase.storage
              .from('chat-files')
              .upload(fileName, formData, {
                contentType: 'image/jpeg',
              });

            uploadData = uploadResult.data;
            uploadError = uploadResult.error;
          }

          if (uploadError) {
            console.error('Failed to upload image:', uploadError);
            Alert.alert('Error', `Failed to upload image: ${uploadError.message}`);
            return;
          }

          console.log('Upload successful:', uploadData);

          // Get the public URL
          const { data: urlData } = supabase.storage
            .from('chat-files')
            .getPublicUrl(fileName);

          console.log('Public URL generated:', urlData.publicUrl);

          // Get file metadata to get actual file size
          const { data: fileInfo } = await supabase.storage
            .from('chat-files')
            .list(`user-files/${user?.id || 'anonymous'}/`, {
              search: uploadData.path.split('/').pop()
            });

          const actualFileSize = fileInfo?.[0]?.metadata?.size || asset.fileSize || 0;
          console.log('File info from storage:', fileInfo);
          console.log('Asset fileSize:', asset.fileSize);
          console.log('Actual file size from storage:', actualFileSize);

          // Send message with the public URL
          await supabase
            .from('messages')
            .insert({
              conversation_id: (conversationId as string) || '',
              sender_id: user?.id,
              message_type: 'image',
              message_text: '',
              file_url: urlData.publicUrl,
              file_name: asset.fileName || `image_${Date.now()}.jpg`,
              file_type: 'image/jpeg',
              file_size: actualFileSize,
            });

          console.log('Image message saved to database successfully');
        } catch (e) {
          console.error('Failed to send image:', e);
          Alert.alert('Error', 'Failed to send image. Please try again.');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select image. Please try again.');
      console.error('Image picker error:', error);
    }
  };

  // Function to pick document/file
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];

        // Upload document to Supabase Storage (web vs mobile)
        try {
          const fileName = `user-files/${user?.id || 'anonymous'}/${Date.now()}_${asset.name}`;

          if (Platform.OS === 'web') {
            // On web, upload a Blob directly
            const resp = await fetch(asset.uri);
            const blob = await resp.blob();
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('chat-files')
              .upload(fileName, blob, { contentType: asset.mimeType || 'application/octet-stream' });
            if (uploadError) {
              console.error('Failed to upload document (web):', uploadError);
              Alert.alert('Error', `Failed to upload document: ${uploadError.message}`);
              return;
            }
            const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(fileName);
            const publicUrl = urlData.publicUrl;
            const size = asset.size || blob.size || 0;
            const isImage = (asset.mimeType || '').startsWith('image/');
            await supabase.from('messages').insert({
              conversation_id: (conversationId as string) || '',
              sender_id: user?.id,
              message_type: isImage ? 'image' : 'file',
              message_text: '',
              file_url: publicUrl,
              file_name: asset.name,
              file_type: asset.mimeType || 'application/octet-stream',
              file_size: size,
            });
          } else {
            // React Native path (existing)
            const formData = new FormData();
            formData.append('file', {
              uri: asset.uri,
              type: asset.mimeType || 'application/octet-stream',
              name: asset.name,
            } as any);
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('chat-files')
              .upload(fileName, formData, { contentType: asset.mimeType || 'application/octet-stream' });
            if (uploadError) {
              console.error('Failed to upload document:', uploadError);
              Alert.alert('Error', `Failed to upload document: ${uploadError.message}`);
              return;
            }
            const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(fileName);
            const { data: fileInfo } = await supabase.storage
              .from('chat-files')
              .list(`user-files/${user?.id || 'anonymous'}/`, { search: uploadData.path.split('/').pop() });
            const actualFileSize = fileInfo?.[0]?.metadata?.size || asset.size || 0;
            await supabase.from('messages').insert({
              conversation_id: (conversationId as string) || '',
              sender_id: user?.id,
              message_type: 'file',
              message_text: '',
              file_url: urlData.publicUrl,
              file_name: asset.name,
              file_type: asset.mimeType || 'application/octet-stream',
              file_size: actualFileSize,
            });
          }
        } catch (e) {
          console.error('Failed to send document:', e);
          Alert.alert('Error', 'Failed to send document. Please try again.');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select file. Please try again.');
      console.error('Document picker error:', error);
    }
  };

  // Function to handle camera capture
  const handleCamera = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];

        // Upload image to Supabase Storage
        try {
          console.log('Starting camera image upload to Supabase Storage...', asset.uri);

          // Create a unique filename in user's folder
          const fileName = `user-files/${user?.id || 'anonymous'}/${Date.now()}_${asset.fileName || 'camera_photo.jpg'}`;
          console.log('Uploading to filename:', fileName);

          // For React Native, we'll use a FormData approach that works reliably
          const formData = new FormData();
          formData.append('file', {
            uri: asset.uri,
            type: 'image/jpeg',
            name: asset.fileName || `camera_photo_${Date.now()}.jpg`,
          } as any);

          console.log('Uploading camera image with FormData to:', fileName);

          // Upload to Supabase Storage using FormData
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('chat-files')
            .upload(fileName, formData, {
              contentType: 'image/jpeg',
            });

          if (uploadError) {
            console.error('Failed to upload camera image:', uploadError);
            Alert.alert('Error', `Failed to upload camera image: ${uploadError.message}`);
            return;
          }

          console.log('Camera image upload successful:', uploadData);

          // Get the public URL
          const { data: urlData } = supabase.storage
            .from('chat-files')
            .getPublicUrl(fileName);

          const publicUrl = urlData.publicUrl;
          console.log('Camera image public URL:', publicUrl);

          // Get file metadata to get actual file size
          const { data: fileInfo } = await supabase.storage
            .from('chat-files')
            .list(`user-files/${user?.id || 'anonymous'}/`, {
              search: uploadData.path.split('/').pop()
            });

          const actualFileSize = fileInfo?.[0]?.metadata?.size || asset.fileSize || 0;
          console.log('Actual file size from storage:', actualFileSize);

          // Send message with image attachment to Supabase
          const { data: messageData, error: messageError } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              sender_id: user?.id,
              message_text: '',
              message_type: 'image',
              file_url: publicUrl,
              file_name: asset.fileName || `camera_photo_${Date.now()}.jpg`,
              file_type: 'image/jpeg',
              file_size: actualFileSize,
            })
            .select()
            .single();

          if (messageError) {
            console.error('Failed to send camera image message:', messageError);
            Alert.alert('Error', 'Failed to send camera image. Please try again.');
            return;
          }

          console.log('Camera image message sent successfully:', messageData);

        } catch (uploadError) {
          console.error('Camera image upload error:', uploadError);
          Alert.alert('Error', 'Failed to upload camera image. Please try again.');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo. Please try again.');
      console.error('Camera error:', error);
    }
  };

  return {
    handleSendMessage,
    handlePickImage,
    handlePickDocument,
    handleAttachment,
    handleCamera,
  };
};

