/**
 * WEB-only image optimization utilities
 * Compresses and resizes images before upload to reduce file size
 */

/**
 * Optimize image for WEB upload
 * Resizes large images and compresses them to reduce file size
 * @param blob - The image blob to optimize
 * @param maxWidth - Maximum width in pixels (default: 1920)
 * @param maxHeight - Maximum height in pixels (default: 1920)
 * @param quality - Compression quality 0-1 (default: 0.75)
 * @returns Optimized blob
 */
export async function optimizeImageForWeb(
  blob: Blob,
  maxWidth: number = 1920,
  maxHeight: number = 1920,
  quality: number = 0.75
): Promise<Blob> {
  try {
    // Create image from blob
    const imageBitmap = await createImageBitmap(blob);
    
    // Calculate new dimensions preserving aspect ratio
    let { width, height } = imageBitmap;
    const aspectRatio = width / height;
    
    if (width > maxWidth || height > maxHeight) {
      if (width > height) {
        width = Math.min(width, maxWidth);
        height = width / aspectRatio;
      } else {
        height = Math.min(height, maxHeight);
        width = height * aspectRatio;
      }
    }
    
    // Only optimize if image is actually larger than target
    if (width === imageBitmap.width && height === imageBitmap.height && quality >= 0.95) {
      imageBitmap.close();
      return blob; // Return original if no optimization needed
    }
    
    // Create canvas and draw resized image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      imageBitmap.close();
      throw new Error('Failed to get canvas context');
    }
    
    // Draw image to canvas with proper scaling
    ctx.drawImage(imageBitmap, 0, 0, width, height);
    imageBitmap.close();
    
    // Convert to blob with compression
    const optimizedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        },
        blob.type || 'image/jpeg', // Preserve original type or default to JPEG
        quality
      );
    });
    
    return optimizedBlob;
  } catch (error) {
    console.error('Error optimizing image:', error);
    // Return original blob if optimization fails
    return blob;
  }
}

/**
 * Convert HEIC/HEIF to JPEG on WEB (if needed)
 * Note: Browser support for HEIC is limited, this mainly handles conversion
 * @param blob - The image blob (potentially HEIC)
 * @returns Converted blob (JPEG) or original if not HEIC
 */
export async function convertHeicToJpeg(blob: Blob): Promise<Blob> {
  // Check if it's HEIC/HEIF format
  if (blob.type === 'image/heic' || blob.type === 'image/heif' || 
      blob.type === 'image/heif-sequence') {
    try {
      // Try to convert using canvas
      const imageBitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        imageBitmap.close();
        return blob; // Return original if conversion fails
      }
      
      ctx.drawImage(imageBitmap, 0, 0);
      imageBitmap.close();
      
      const jpegBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert HEIC to JPEG'));
            }
          },
          'image/jpeg',
          0.85 // Good quality for conversion
        );
      });
      
      return jpegBlob;
    } catch (error) {
      console.error('Error converting HEIC to JPEG:', error);
      return blob; // Return original if conversion fails
    }
  }
  
  return blob; // Return original if not HEIC
}

/**
 * Main function to optimize image for WEB upload
 * Handles resizing, compression, and format conversion
 * @param blob - The image blob to optimize
 * @returns Optimized blob ready for upload
 */
export async function optimizeImageForUpload(blob: Blob): Promise<Blob> {
  try {
    // First convert HEIC if needed
    let optimized = await convertHeicToJpeg(blob);
    
    // Then resize and compress
    optimized = await optimizeImageForWeb(optimized, 1920, 1920, 0.75);
    
    return optimized;
  } catch (error) {
    console.error('Error in optimizeImageForUpload:', error);
    return blob; // Return original if optimization fails
  }
}
