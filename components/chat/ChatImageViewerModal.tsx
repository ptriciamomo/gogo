import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet, type ViewStyle, type ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ChatImageViewerModalProps {
  imageUri: string | null;
  onClose: () => void;
  onDownload: (fileUrl: string, fileName: string) => void;
}

export default function ChatImageViewerModal({
  imageUri,
  onClose,
  onDownload,
}: ChatImageViewerModalProps) {
  if (!imageUri) return null;

  return (
    <View style={styles.imageViewerModal as ViewStyle}>
      <TouchableOpacity
        style={styles.imageViewerBackground as ViewStyle}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.imageViewerContainer as ViewStyle}>
          <TouchableOpacity
            style={styles.imageViewerCloseButton as ViewStyle}
            onPress={onClose}
          >
            <Ionicons name="close" size={30} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.imageViewerDownloadButton as ViewStyle}
            onPress={() => {
              const fileName = `image_${Date.now()}.jpg`;
              onDownload(imageUri, fileName);
            }}
          >
            <Ionicons name="download" size={24} color="white" />
          </TouchableOpacity>
          <Image
            source={{ uri: imageUri }}
            style={styles.fullSizeImage as ImageStyle}
            resizeMode="contain"
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  imageViewerModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
  },
  imageViewerBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    padding: 20,
  },
  imageViewerCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 2001,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 10,
  },
  fullSizeImage: {
    width: '100%',
    height: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
  },
  imageViewerDownloadButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 2001,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 10,
  },
});

