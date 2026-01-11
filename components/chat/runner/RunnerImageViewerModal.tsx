import React from 'react';
import { View, TouchableOpacity, Image, type ViewStyle, type ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RunnerImageViewerModalProps {
  styles: any;
  imageUri: string | null;
  onClose: () => void;
  onDownload: (fileUrl: string, fileName: string) => void;
}

export function RunnerImageViewerModal({
  styles,
  imageUri,
  onClose,
  onDownload,
}: RunnerImageViewerModalProps) {
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

