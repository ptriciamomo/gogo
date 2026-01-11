# Student ID Image Upload Setup Instructions

## 1. Create Supabase Storage Bucket

You need to create a storage bucket in your Supabase dashboard:

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project: `ednraiixtmzymowfwarh`
3. Navigate to **Storage** in the left sidebar
4. Click **"New bucket"**
5. Set the bucket name to: `student-ids`
6. Make it **Public** (so images can be accessed via URL)
7. Set file size limit to: `5MB`
8. Allowed MIME types: `image/jpeg`, `image/png`, `image/jpg`
9. Click **"Create bucket"**

## 2. Set Storage Policies

After creating the bucket, you need to set up Row Level Security (RLS) policies:

1. In the Storage section, click on your `student-ids` bucket
2. Go to the **"Policies"** tab
3. Click **"New Policy"**
4. Create these policies:

### Policy 1: Allow authenticated users to upload
- **Policy name**: `Allow authenticated uploads`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
((bucket_id = 'student-ids'::text) AND (auth.role() = 'authenticated'::text))
```

### Policy 2: Allow public access to read files
- **Policy name**: `Allow public read access`
- **Target roles**: `public`
- **Policy definition**:
```sql
(bucket_id = 'student-ids'::text)
```

## 3. Test the Implementation

Once the bucket is set up, you can test the image upload functionality:

1. Start your app: `npm start`
2. Go through the registration flow
3. On the ID upload screen, try uploading an image
4. Complete the registration process
5. Check your Supabase dashboard to see if the image was uploaded and the `id_image_path` was saved in the users table

## 4. Verify Database Integration

After a successful registration with image upload:

1. Go to your Supabase dashboard
2. Navigate to **Table Editor** → **users**
3. Find the newly created user
4. Check that the `id_image_path` column contains the path to the uploaded image
5. The path should look like: `student_id_[user_id]_[timestamp].jpg`

## 5. Troubleshooting

If you encounter issues:

1. **Upload fails**: Check that the storage bucket exists and policies are set correctly
2. **Database not updated**: Verify that the user registration completes successfully
3. **Image not accessible**: Ensure the bucket is public and the file path is correct

## Files Modified

The following files were updated to implement image upload functionality:

- `utils/supabaseHelpers.ts` - Added image upload helper functions
- `app/id.tsx` - Updated to upload images to Supabase Storage
- `app/account_confirm.tsx` - Updated to use the new upload helper
- `scripts/setup-storage.js` - Setup script for storage bucket (optional)

## How It Works

1. User selects/takes a photo on the ID upload screen
2. Image is uploaded to Supabase Storage bucket `student-ids`
3. The storage path is saved in the registration state
4. During final registration, the image path is saved to the `id_image_path` column in the users table
5. The image can be accessed via the public URL from Supabase Storage
