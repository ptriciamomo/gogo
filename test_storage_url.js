// Test script to check Supabase storage URLs
// Run this in your browser console to test if a Supabase URL is accessible

// Test URL from your images
const testUrl = "https://ednraiixtmzymowfwarh.supabase.co/storage/v1/object/public/task-uploads/4344f7dd-05dd-44db-87e1-074c7adf945b/1760884833485-bsci8woaf.pdf";

console.log("Testing Supabase storage URL:", testUrl);

// Test if the URL is accessible
fetch(testUrl)
  .then(response => {
    console.log("Response status:", response.status);
    console.log("Response headers:", response.headers);
    console.log("Content-Type:", response.headers.get('content-type'));
    console.log("Content-Length:", response.headers.get('content-length'));
    
    if (response.ok) {
      console.log("✅ URL is accessible");
      return response.blob();
    } else {
      console.log("❌ URL is not accessible");
      throw new Error(`HTTP ${response.status}`);
    }
  })
  .then(blob => {
    console.log("Blob size:", blob.size);
    console.log("Blob type:", blob.type);
    console.log("✅ File content received successfully");
  })
  .catch(error => {
    console.error("❌ Error accessing URL:", error);
  });
