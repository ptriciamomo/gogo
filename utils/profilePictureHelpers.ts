// utils/profilePictureHelpers.ts
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';

// Upload profile picture to Supabase Storage
export const uploadProfilePicture = async (imageUri: string, userId: string): Promise<string> => {
  try {
    console.log('=== UPLOADING PROFILE PICTURE ===');
    console.log('Starting upload for user:', userId);
    console.log('Image URI:', imageUri);
    console.log('Platform:', Platform.OS);

    // Create a unique filename
    const fileExt = imageUri.split('.').pop() || 'jpg';
    const fileName = `${userId}_${Date.now()}.${fileExt}`;

    console.log('Uploading file:', fileName);

    // Handle web platform differently - blob URLs need to be fetched
    if (Platform.OS === 'web') {
      console.log('Platform is web, handling blob URL...');
      
      // Check if it's a blob URL
      if (imageUri.startsWith('blob:')) {
        console.log('Detected blob URL, fetching blob...');
        
        // Fetch the blob
        const response = await fetch(imageUri);
        if (!response.ok) {
          throw new Error(`Failed to fetch blob: ${response.statusText}`);
        }
        
        let blob = await response.blob();
        console.log('Blob fetched, original size:', blob.size, 'bytes');
        console.log('Blob type:', blob.type);
        
        // Optimize image for WEB (resize and compress)
        try {
          const { optimizeImageForUpload } = await import('./imageOptimization.web');
          blob = await optimizeImageForUpload(blob);
          console.log('Blob optimized, new size:', blob.size, 'bytes');
        } catch (optimizeError) {
          console.warn('Image optimization failed, using original:', optimizeError);
          // Continue with original blob if optimization fails
        }
        
        // Detect content type from blob or default to jpeg
        let contentType = blob.type || 'image/jpeg';
        if (!contentType || contentType === 'application/octet-stream') {
          contentType = 'image/jpeg';
        }
        console.log('Using content type:', contentType);
        
        // Convert blob to ArrayBuffer then to Uint8Array for Supabase
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        console.log('Converted to Uint8Array, size:', uint8Array.length, 'bytes');
        
        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('profile-pictures')
          .upload(fileName, uint8Array, {
            contentType,
            upsert: true
          });
        
        if (error) {
          console.error('Upload error details:', error);
          throw error;
        }
        
        console.log('Upload successful, data:', data);
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('profile-pictures')
          .getPublicUrl(fileName);
        
        console.log('=== UPLOAD COMPLETE ===');
        console.log('Public URL:', urlData.publicUrl);
        return urlData.publicUrl;
      } else {
        // For web but not blob URL, throw error
        console.log('Web platform but not blob URL, cannot upload');
        throw new Error('Web platform requires blob URL for file uploads');
      }
    }

    // Mobile platform - use FileSystem to read file and upload
    console.log('Platform is mobile, using FileSystem...');
    
    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    console.log('File info:', fileInfo);
    
    if (!fileInfo.exists) {
      console.error('File does not exist at URI:', imageUri);
      throw new Error('File does not exist at URI: ' + imageUri);
    }
    
    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('File read as base64, length:', base64.length);
    
    if (base64.length < 1000) {
      console.error('File appears to be too small (base64 length: ' + base64.length + ')');
      throw new Error('File appears to be empty or corrupted');
    }
    
    // Detect file type from base64 header
    let contentType = 'image/jpeg';
    if (base64.startsWith('iVBORw0KGgoAAAANSUhEUg')) {
      contentType = 'image/png';
      console.log('Detected PNG file');
    } else {
      console.log('Detected JPEG file (or defaulting to JPEG)');
    }
    
    // Convert base64 to binary data for proper upload
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log('Binary data created, size:', bytes.length, 'bytes');
    
    // Upload binary data to Supabase Storage
    const { data, error } = await supabase.storage
      .from('profile-pictures')
      .upload(fileName, bytes, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw error;
    }

    console.log('Upload successful:', data);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-pictures')
      .getPublicUrl(fileName);

    console.log('Public URL:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    throw error;
  }
};

// Save profile picture URL to user's database record
export const saveProfilePictureUrl = async (userId: string, imageUrl: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('users')
      .update({ profile_picture_url: imageUrl })
      .eq('id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error saving profile picture URL:', error);
    throw error;
  }
};

// Get user's profile picture URL from database
export const getProfilePictureUrl = async (userId: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('profile_picture_url')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data?.profile_picture_url || null;
  } catch (error) {
    console.error('Error getting profile picture URL:', error);
    return null;
  }
};

// Complete function to upload and save profile picture
export const uploadAndSaveProfilePicture = async (imageUri: string, userId: string): Promise<string> => {
  try {
    // Upload image to storage
    const imageUrl = await uploadProfilePicture(imageUri, userId);
    
    // Save URL to database
    await saveProfilePictureUrl(userId, imageUrl);
    
    return imageUrl;
  } catch (error) {
    console.error('Error in uploadAndSaveProfilePicture:', error);
    throw error;
  }
};
