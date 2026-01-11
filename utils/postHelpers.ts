// utils/postHelpers.ts
// Helper functions for managing user posts/works

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export interface Post {
  id: string;
  user_id: string;
  content: string | null;
  image_urls: string[];
  created_at: string;
  updated_at: string;
}

// Upload post image to Supabase Storage with hierarchical folder structure
export const uploadPostImage = async (imageUri: string, userId: string): Promise<string> => {
  try {
    // Get user's student ID number for folder structure
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('student_id_number')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      throw userError;
    }

    const studentId = userData?.student_id_number || 'unknown';
    
    // Create hierarchical folder structure: user-files/{userId}/{studentId}/filename
    const fileExt = imageUri.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const fileName = `user-files/${userId}/${studentId}/post_${timestamp}.${fileExt}`;

    console.log('Uploading post image to:', fileName);

    let uploadData: any;
    let uploadError: any;

    // Handle WEB platform with image optimization
    if (Platform.OS === 'web') {
      try {
        // Fetch the image (works for both blob: and http: URLs)
        const response = await fetch(imageUri);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        
        let blob = await response.blob();
        console.log('Post image fetched, original size:', blob.size, 'bytes');

        // Optimize image for WEB (resize and compress)
        try {
          const { optimizeImageForUpload } = await import('./imageOptimization.web');
          blob = await optimizeImageForUpload(blob);
          console.log('Post image optimized, new size:', blob.size, 'bytes');
        } catch (optimizeError) {
          console.warn('Post image optimization failed, using original:', optimizeError);
          // Continue with original blob if optimization fails
        }

        // Convert blob to File for Supabase upload
        const file = new File([blob], `post_${timestamp}.${fileExt}`, {
          type: blob.type || 'image/jpeg',
        });

        // Upload optimized file directly
        const uploadResult = await supabase.storage
          .from('post-images')
          .upload(fileName, file, {
            contentType: blob.type || 'image/jpeg',
            upsert: true,
          });

        uploadData = uploadResult.data;
        uploadError = uploadResult.error;
      } catch (webError) {
        console.error('WEB post upload error:', webError);
        uploadError = webError;
      }
    } else {
      // Mobile platform - use FormData approach (unchanged)
      const formData = new FormData();
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: `post_${timestamp}.${fileExt}`,
      } as any);

      const uploadResult = await supabase.storage
        .from('post-images')
        .upload(fileName, formData, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      uploadData = uploadResult.data;
      uploadError = uploadResult.error;
    }

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    console.log('Post image uploaded successfully:', uploadData);

    const { data: urlData } = supabase.storage
      .from('post-images')
      .getPublicUrl(fileName);

    console.log('Post image public URL:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error uploading post image:', error);
    throw error;
  }
};

// Create a new post in the database
export const createPost = async (userId: string, content: string, imageUrls: string[]): Promise<Post> => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content: content,
        image_urls: imageUrls,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Post;
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
};

// Get all posts for a specific user
export const getUserPosts = async (userId: string): Promise<Post[]> => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as Post[];
  } catch (error) {
    console.error('Error fetching user posts:', error);
    return [];
  }
};

// Update a post
export const updatePost = async (postId: string, userId: string, content: string, imageUrls: string[]): Promise<Post> => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .update({
        content: content,
        image_urls: imageUrls,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as Post;
  } catch (error) {
    console.error('Error updating post:', error);
    throw error;
  }
};

// Delete a post
export const deletePost = async (postId: string, userId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
};
