# Task Uploads Storage Setup Instructions

## 1. Create Supabase Storage Bucket

You need to create a new storage bucket in your Supabase dashboard for task uploads:

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project: `ednraiixtmzymowfwarh`
3. Navigate to **Storage** in the left sidebar
4. Click **"New bucket"**
5. Set the bucket name to: `task-uploads`
6. Make it **Public** (so files can be accessed via URL)
7. Set file size limit to: `50MB` (larger limit for various file types)
8. **Leave "Allowed MIME types" empty** (this allows all file types)
9. Click **"Create bucket"**

## 2. Set Storage Policies

After creating the bucket, you need to set up Row Level Security (RLS) policies:

1. In the Storage section, click on your `task-uploads` bucket
2. Go to the **"Policies"** tab
3. Click **"New Policy"**
4. Create these policies:

### Policy 1: Allow authenticated users to upload
- **Policy name**: `Allow authenticated uploads`
- **Target roles**: `authenticated`
- **Policy definition**:
```sql
((bucket_id = 'task-uploads'::text) AND (auth.role() = 'authenticated'::text))
```

### Policy 2: Allow public access to read files
- **Policy name**: `Allow public read access`
- **Target roles**: `public`
- **Policy definition**:
```sql
(bucket_id = 'task-uploads'::text)
```

## 3. Test the Implementation

Once the bucket is set up, you can test the file upload functionality:

1. Start your app: `npm start`
2. Go to the Task Progress page
3. Try uploading different file types (images, PDFs, documents, etc.)
4. Try pasting links
5. Check your Supabase dashboard to see if files were uploaded

## 4. Verify Database Integration

After a successful file upload:

1. Go to your Supabase dashboard
2. Navigate to **Table Editor** → **task_progress**
3. Find the commission record
4. Check that the `file_url`, `file_type`, `file_size`, and `uploaded_at` columns are populated
5. The `file_url` should point to the uploaded file in the `task-uploads` bucket

## 5. Supported File Types

This bucket supports ALL file types including:
- Images: JPG, PNG, GIF, WebP, etc.
- Documents: PDF, DOC, DOCX, TXT, etc.
- Videos: MP4, AVI, MOV, etc.
- Archives: ZIP, RAR, 7Z, etc.
- Code files: JS, TS, PY, etc.
- And any other file type

## 6. File Organization

Files will be stored with the following structure:
- Path: `task_uploads/{commission_id}-{timestamp}.{extension}`
- Example: `task_uploads/123-1703123456789.pdf`
- Example: `task_uploads/123-1703123456789.jpg`
