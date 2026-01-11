// utils/supabaseHelpers.ts
// This file contains all the functions to save and get user data from the database
// It also handles uploading images to Supabase Storage

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';

// USER REGISTRATION FUNCTION
// This function creates a new user account and saves their information to the database
// What it does:
// 1. Creates a login account (email + password)
// 2. Saves user details (name, role, student ID, etc.) to the database
// 3. Returns success or error message
export const registerUser = async (userData: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  studentId?: string;
  course?: string;
  phone?: string;
}) => {
  try {
    // Check if this email is associated with a blocked user
    const { data: blockedUser, error: blockedError } = await supabase
      .from('users')
      .select('is_blocked')
      .eq('email', userData.email)
      .single();

    if (blockedError && blockedError.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw blockedError;
    }

    if (blockedUser && blockedUser.is_blocked) {
      throw new Error('This email is associated with a blocked account and cannot be used for registration');
    }

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email,
      password: userData.password,
    });

    if (authError) throw authError;

    if (!authData.user) throw new Error('No user created');

    // 2. Create user profile
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email: userData.email,
        first_name: userData.firstName,
        last_name: userData.lastName,
        role: userData.role,
        student_id: userData.studentId,
        course: userData.course,
        phone_number: userData.phone,
        created_at: new Date().toISOString(),
      });

    if (profileError) throw profileError;

    return { success: true, user: authData.user };
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
};

// GET USER PROFILE FUNCTION
// This function gets the current logged-in user's information from the database
// What it does:
// 1. Checks who is currently logged in
// 2. Gets their profile information (name, email, role, etc.)
// 3. Returns the user's data or null if not found
export const getCurrentUserProfile = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return profile;
  } catch (error) {
    console.error('Get profile error:', error);
    return null;
  }
};

// UPDATE USER PROFILE FUNCTION
// This function updates a user's information in the database
// What it does:
// 1. Takes the new information to update (name, course, phone, profile picture)
// 2. Saves the changes to the database
// 3. Returns success or error message
export const updateUserProfile = async (updates: {
  first_name?: string;
  last_name?: string;
  course?: string;
  phone_number?: string;
  profile_image_url?: string;
}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Update profile error:', error);
    throw error;
  }
};

// CREATE CONVERSATION FUNCTION
// This function creates a new chat conversation between users
// What it does:
// 1. Takes a list of user IDs who will be in the chat
// 2. Creates a new conversation in the database
// 3. Returns the conversation details
export const createConversation = async (participantIds: string[]) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        participant_ids: participantIds,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Create conversation error:', error);
    throw error;
  }
};

// GET USER CONVERSATIONS FUNCTION
// This function gets all chat conversations for a specific user
// What it does:
// 1. Takes a user ID
// 2. Finds all conversations that include this user
// 3. Returns a list of conversations with their messages
export const getUserConversations = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        messages (
          id,
          content,
          created_at,
          sender_id
        )
      `)
      .contains('participant_ids', [userId])
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Get conversations error:', error);
    return [];
  }
};

// SEND MESSAGE FUNCTION
// This function sends a message in a chat conversation
// What it does:
// 1. Takes the conversation ID, message text, and sender ID
// 2. Saves the message to the database
// 3. Updates the conversation's last activity time
export const sendMessage = async (conversationId: string, content: string, senderId: string) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        created_at: new Date().toISOString(),
      });

    if (error) throw error;

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    return data;
  } catch (error) {
    console.error('Send message error:', error);
    throw error;
  }
};

// SEND SYSTEM MESSAGE FUNCTION
// This function sends a system message when commission is accepted
// What it does:
// 1. Takes conversation ID, caller name, runner name, and commission title
// 2. Creates a system message confirming commission acceptance
// 3. Returns the message data
export const sendCommissionAcceptanceMessage = async (
  conversationId: string, 
  callerName: string, 
  runnerName: string, 
  commissionTitle: string,
  senderId: string // The user who accepted the commission
) => {
  try {
    const systemMessage = `Commission "${commissionTitle}" accepted by ${runnerName}`;
    
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId, // Use the user who accepted the commission
        message_text: systemMessage,
        message_type: 'system',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ 
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    return data;
  } catch (error) {
    console.error('Send commission acceptance message error:', error);
    throw error;
  }
};

// GET CONVERSATION MESSAGES FUNCTION
// This function gets all messages in a specific conversation
// What it does:
// 1. Takes a conversation ID
// 2. Gets all messages in that conversation
// 3. Returns them in order (oldest first)
export const getConversationMessages = async (conversationId: string) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Get messages error:', error);
    return [];
  }
};

// GET ALL USERS FUNCTION
// This function gets a list of all users in the app
// What it does:
// 1. Gets basic information about all users (name, email, role)
// 2. Sorts them by first name
// 3. Used for showing user lists in messaging
export const getAllUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, role')
      .order('first_name');

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Get users error:', error);
    return [];
  }
};

// UPLOAD IMAGE FUNCTION
// This function uploads images (like student ID photos) to Supabase Storage
// What it does:
// 1. Takes a photo file from the user's device
// 2. Converts it to the right format for storage
// 3. Uploads it to Supabase Storage (like Google Drive)
// 4. Returns a URL that can be used to display the image
// 
// UI Usage:
// - Used when user takes/selects a photo for their student ID
// - The photo gets saved and can be viewed later
export const uploadImageToStorage = async (fileUri: string, fileName: string, bucketName: string = 'student-ids') => {
  try {
    console.log('=== UPLOADING TO SUPABASE STORAGE ===');
    console.log('File URI:', fileUri);
    console.log('File Name:', fileName);
    console.log('Bucket Name:', bucketName);
    console.log('Platform:', Platform.OS);
    
    // Get current user to ensure we're authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Not authenticated:', authError);
      throw new Error('User not authenticated');
    }
    console.log('User authenticated:', user.id);
    
    // Handle web platform differently - blob URLs need to be fetched
    if (Platform.OS === 'web') {
      console.log('Platform is web, handling blob URL...');
      
      // Check if it's a blob URL
      if (fileUri.startsWith('blob:')) {
        console.log('Detected blob URL, fetching blob...');
        
        // Fetch the blob
        const response = await fetch(fileUri);
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
          .from(bucketName)
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
          .from(bucketName)
          .getPublicUrl(fileName);
        
        console.log('=== UPLOAD COMPLETE ===');
        console.log('Public URL:', urlData.publicUrl);
        
        return { 
          success: true, 
          path: urlData.publicUrl,
          publicUrl: urlData.publicUrl
        };
      } else {
        // For web but not blob URL, try to read as file
        console.log('Web platform but not blob URL, attempting file read...');
        throw new Error('Web platform requires blob URL for file uploads');
      }
    }
    
    // Mobile platform - use FileSystem
    console.log('Platform is mobile, using FileSystem...');
    
    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    console.log('File info:', fileInfo);
    console.log('File URI type:', typeof fileUri);
    console.log('File URI starts with:', fileUri.substring(0, 50));
    
    if (!fileInfo.exists) {
      console.error('File does not exist at URI:', fileUri);
      throw new Error('File does not exist at URI: ' + fileUri);
    }
    
    console.log('File size from FileSystem:', fileInfo.size);
    console.log('File modification time:', fileInfo.modificationTime);
    
    // Read file as base64 first to ensure we have valid data
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('File read as base64, length:', base64.length);
    console.log('Base64 preview (first 100 chars):', base64.substring(0, 100));
    
    if (base64.length < 1000) {
      console.error('File appears to be too small (base64 length: ' + base64.length + ')');
      console.error('This suggests the file is empty or corrupted');
      throw new Error('File appears to be empty or corrupted (base64 length: ' + base64.length + ')');
    }
    
    // Detect file type from base64 header
    let contentType = 'image/jpeg'; // default
    let fileExtension = '.jpg';
    
    if (base64.startsWith('iVBORw0KGgoAAAANSUhEUg')) {
      contentType = 'image/png';
      fileExtension = '.png';
      console.log('Detected PNG file');
    } else if (base64.startsWith('/9j/4AAQSkZJRgABAQAAAQABAAD') || base64.startsWith('/9j/4AAQSkZJRgABAQAASABIAAD')) {
      contentType = 'image/jpeg';
      fileExtension = '.jpg';
      console.log('Detected JPEG file');
    } else {
      console.log('Unknown file type, defaulting to JPEG');
      console.log('Base64 starts with:', base64.substring(0, 50));
    }
    
    // Update filename to match detected type
    const originalFileName = fileName;
    if (!fileName.toLowerCase().endsWith(fileExtension)) {
      fileName = fileName.replace(/\.[^/.]+$/, fileExtension);
      console.log('Updated filename from', originalFileName, 'to', fileName);
    }
    
    // Convert base64 to binary data for proper upload
    console.log('Converting base64 to binary data...');
    
    // Convert base64 string to Uint8Array (binary data)
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log('Binary data created, size:', bytes.length, 'bytes');
    
    // Upload binary data to Supabase Storage
    console.log('Attempting binary upload with:', {
      bucketName,
      fileName,
      contentType,
      fileSize: fileInfo.size,
      base64Length: base64.length,
      binarySize: bytes.length
    });
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, bytes, {
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
      .from(bucketName)
      .getPublicUrl(fileName);
    
    console.log('=== UPLOAD COMPLETE ===');
    console.log('Public URL:', urlData.publicUrl);
    
    return { 
      success: true, 
      path: urlData.publicUrl, // Store the public URL as the path
      publicUrl: urlData.publicUrl // Same as path for public URLs
    };
  } catch (error) {
    console.error('=== STORAGE ERROR ===', error);
    throw error;
  }
};

// Upload image to Supabase Storage and get public URL
export const uploadImageToSupabaseStorage = async (fileUri: string, fileName: string, bucketName: string = 'student-ids') => {
  try {
    console.log('=== UPLOADING TO SUPABASE STORAGE ===');
    console.log('File URI:', fileUri);
    console.log('File Name:', fileName);
    
    // Get current user to ensure we're authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Not authenticated:', authError);
      throw new Error('User not authenticated');
    }
    console.log('User authenticated:', user.id);
    
    // Upload file directly using file URI (React Native compatible)
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileUri, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (error) throw error;
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);
    
    console.log('=== UPLOAD COMPLETE ===');
    console.log('Public URL:', urlData.publicUrl);
    
    return { 
      success: true, 
      path: data.path, // Storage path
      publicUrl: urlData.publicUrl // Public URL for accessing the image
    };
  } catch (error) {
    console.error('=== STORAGE UPLOAD ERROR ===', error);
    throw error;
  }
};

// UPDATE USER ID IMAGE FUNCTION
// This function saves the student ID photo URL to the user's profile
// What it does:
// 1. Takes a user ID and the photo URL
// 2. Updates the user's profile with the photo URL
// 3. This allows the photo to be displayed later
export const updateUserIdImage = async (userId: string, imagePath: string) => {
  try {
    const { error } = await supabase
      .from('users')
      .update({ id_image_path: imagePath })
      .eq('id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Update ID image error:', error);
    throw error;
  }
};

// CONVERT IMAGE DATA FUNCTION
// This function converts image data to a format that can be displayed
// What it does:
// 1. Takes image data in different formats
// 2. Converts it to a URL that can be used in the app
// 3. Handles both base64 data and regular URLs
export const convertBase64ToUrl = (base64DataUrl: string): string => {
  try {
    // If it's already a proper URL, return it as-is
    if (base64DataUrl.startsWith('http')) {
      return base64DataUrl;
    }
    
    // If it's a data URL, return it as-is for React Native Image components
    if (base64DataUrl.startsWith('data:image/')) {
      return base64DataUrl;
    }
    
    // If it's just base64 data, create a data URL
    if (base64DataUrl && !base64DataUrl.startsWith('http')) {
      return `data:image/jpeg;base64,${base64DataUrl}`;
    }
    
    return base64DataUrl;
  } catch (error) {
    console.error('Error converting base64 to URL:', error);
    return base64DataUrl; // Return original if conversion fails
  }
};

// GET USER ID IMAGE FUNCTION
// This function gets the student ID photo URL for a specific user
// What it does:
// 1. Takes a user ID
// 2. Gets their student ID photo URL from the database
// 3. Returns the URL so the photo can be displayed
export const getUserIdImageUrl = async (userId: string): Promise<string | null> => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id_image_path')
      .eq('id', userId)
      .single();

    if (error) throw error;
    
    if (!user?.id_image_path) return null;
    
    return convertBase64ToUrl(user.id_image_path);
  } catch (error) {
    console.error('Get user ID image URL error:', error);
    return null;
  }
};

// MIGRATE OLD IMAGE DATA FUNCTION
// This function converts old image data to the new format
// What it does:
// 1. Takes old image data that was stored incorrectly
// 2. Converts it to the proper format
// 3. Uploads it to Supabase Storage
// 4. Updates the user's profile with the new URL
export const migrateBase64ToStorage = async (base64Data: string, userId: string, bucketName: string = 'student-ids'): Promise<string | null> => {
  try {
    console.log('=== MIGRATING BASE64 TO STORAGE ===');
    
    // Extract base64 data from data URL if needed
    let base64String = base64Data;
    if (base64Data.startsWith('data:image/')) {
      base64String = base64Data.split(',')[1];
    }
    
    // Generate unique filename
    const fileName = `student_id_${userId}_${Date.now()}.jpg`;
    
    // Create a temporary file from base64 data
    const tempFileUri = `${FileSystem.cacheDirectory}temp_${fileName}`;
    await FileSystem.writeAsStringAsync(tempFileUri, base64String, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    // Upload the temporary file to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, tempFileUri, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    // Clean up temporary file
    await FileSystem.deleteAsync(tempFileUri, { idempotent: true });
    
    if (error) throw error;
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);
    
    console.log('=== MIGRATION COMPLETE ===');
    console.log('New Public URL:', urlData.publicUrl);
    
    // Update the user's record with the new URL
    await updateUserIdImage(userId, urlData.publicUrl);
    
    return urlData.publicUrl;
  } catch (error) {
    console.error('=== MIGRATION ERROR ===', error);
    throw error;
  }
};

// Simple upload without temporary files (alternative approach)
export const uploadImageSimple = async (fileUri: string, fileName: string, bucketName: string = 'student-ids') => {
  try {
    console.log('=== SIMPLE UPLOAD ===');
    console.log('File URI:', fileUri);
    console.log('File Name:', fileName);
    
    // Get current user to ensure we're authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Not authenticated:', authError);
      throw new Error('User not authenticated');
    }
    
    // Upload file directly using file URI
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileUri, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (error) {
      console.error('Upload error:', error);
      throw error;
    }
    
    console.log('Simple upload successful:', data);
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);
    
    return urlData.publicUrl;
  } catch (error) {
    console.error('Simple upload failed:', error);
    throw error;
  }
};

// UPLOAD IMAGE IMMEDIATELY FUNCTION
// This function uploads an image right when the user selects it
// What it does:
// 1. Takes a photo file and user ID
// 2. Uploads the photo immediately (not waiting for form submission)
// 3. Returns the photo URL
// 
// UI Usage:
// - Alternative to the main upload function
// - Can be used for instant photo uploads
export const uploadImageImmediately = async (fileUri: string, userId: string, bucketName: string = 'student-ids') => {
  try {
    console.log('=== IMMEDIATE UPLOAD ===');
    console.log('File URI:', fileUri);
    console.log('User ID:', userId);
    
    // Generate filename
    const timestamp = Date.now();
    const fileName = `student_id_${userId}_${timestamp}.jpg`;
    
    // Use the simple upload function
    const result = await uploadImageSimple(fileUri, fileName, bucketName);
    
    if (result) {
      console.log('Immediate upload successful:', result);
      return result;
    }
    
    return null;
  } catch (error) {
    console.error('Immediate upload failed:', error);
    throw error;
  }
};

// TEST BUCKET FUNCTION
// This function tests if the image storage is working correctly
// What it does:
// 1. Creates a small test file
// 2. Tries to upload it to Supabase Storage
// 3. Tries to download it back
// 4. Cleans up the test file
// 5. Returns success or error
export const testBucketUpload = async () => {
  try {
    console.log('=== TESTING BUCKET UPLOAD ===');
    
    // Create a simple test file
    const testContent = 'This is a test file for bucket verification';
    const testFileName = `test_${Date.now()}.txt`;
    
    // Upload test file
    const { data, error } = await supabase.storage
      .from('student-ids')
      .upload(testFileName, testContent, {
        contentType: 'text/plain',
        upsert: true
      });
    
    if (error) {
      console.error('Test upload error:', error);
      return { success: false, error };
    }
    
    console.log('Test upload successful:', data);
    
    // Try to download the test file
    const { data: downloadData, error: downloadError } = await supabase.storage
      .from('student-ids')
      .download(testFileName);
    
    if (downloadError) {
      console.error('Test download error:', downloadError);
      return { success: false, error: downloadError };
    }
    
    // Clean up test file
    await supabase.storage
      .from('student-ids')
      .remove([testFileName]);
    
    console.log('Bucket test successful!');
    return { success: true };
    
  } catch (error) {
    console.error('Bucket test failed:', error);
    return { success: false, error };
  }
};

// LOGOUT USER FUNCTION
// This function logs out the current user
// What it does:
// 1. Signs out the user from the app
// 2. Clears their login session
// 3. Returns success or error
export const logoutUser = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};
// POST/WORK FUNCTIONS
