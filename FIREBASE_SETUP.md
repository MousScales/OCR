# Firebase Setup Instructions

## Prerequisites
- Firebase project created at https://console.firebase.google.com
- Project ID: `ocrr-b4765`

## Step 1: Enable Firestore Database

1. Go to Firebase Console → Firestore Database
2. Click "Create database"
3. Choose "Start in test mode" (we'll add security rules later)
4. Select a location (choose closest to your users)
5. Click "Enable"

## Step 2: Enable Firebase Storage

1. Go to Firebase Console → Storage
2. Click "Get started"
3. Choose "Start in test mode"
4. Use the same location as Firestore
5. Click "Done"

## Step 3: Security Rules (Initial - Test Mode)

### Firestore Rules
Go to Firestore Database → Rules and use:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /documents/{documentId} {
      allow read, write: if true; // Allow all for now
    }
  }
}
```

### Storage Rules
Go to Storage → Rules and use:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true; // Allow all for now
    }
  }
}
```

**Note:** These are permissive rules for testing. In production, you should add proper authentication and authorization.

## Step 4: Create Firestore Index (REQUIRED)

Firestore requires a composite index for queries that filter by one field and order by another. 

**Option 1: Click the link in the error message**
When you see the error, click the link provided in the console. It will take you directly to the Firebase Console to create the index.

**Option 2: Create manually**
1. Go to Firebase Console → Firestore Database → Indexes
2. Click "Create Index"
3. Collection ID: `documents`
4. Fields to index:
   - `section` (Ascending)
   - `created_at` (Descending)
5. Click "Create"

**Note:** Index creation can take a few minutes. The app will work with localStorage fallback while the index is being created.

## Step 5: Configure CORS for Firebase Storage (IMPORTANT!)

Firebase Storage requires CORS configuration for web uploads/downloads. Use one of these methods:

### Method 1: Using gsutil (Recommended)

1. **Install Google Cloud SDK**:
   - Download from: https://cloud.google.com/sdk/docs/install
   - Or use: `curl https://sdk.cloud.google.com | bash`

2. **Authenticate**:
   ```bash
   gcloud auth login
   gcloud config set project ocrr-b4765
   ```

3. **Create CORS config file** (`cors.json`):
   ```json
   [
     {
       "origin": ["*"],
       "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
       "maxAgeSeconds": 3600,
       "responseHeader": ["Content-Type", "Authorization"]
     }
   ]
   ```

4. **Apply CORS**:
   ```bash
   gsutil cors set cors.json gs://ocrr-b4765.firebasestorage.app
   ```

### Method 2: Firebase Console (Alternative)

1. Go to Firebase Console → Storage
2. Click on the three dots menu → "Edit CORS configuration"
3. Add the CORS rules manually

**For production**, restrict origins to your actual domains:
```json
[
  {
    "origin": ["https://ocr-mu-seven.vercel.app", "https://yourdomain.com"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization"]
  }
]
```

## Step 6: Verify Configuration

The Firebase configuration is already set in:
- `public/section-view.html`
- Will be added to `public/index.html` and `public/main.html`

Configuration:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAIwXiqg4oo-lWsZa5zBDFViMSZ1lLyE7o",
  authDomain: "ocrr-b4765.firebaseapp.com",
  projectId: "ocrr-b4765",
  storageBucket: "ocrr-b4765.firebasestorage.app",
  messagingSenderId: "314006504305",
  appId: "1:314006504305:web:e2accd95fcc2d182236cd0",
  measurementId: "G-Z5L66PQNYY"
};
```

## Data Structure

The `documents` collection in Firestore will have:
- `id` (auto-generated document ID)
- `name` (string) - document filename
- `type` (string) - MIME type
- `size` (number) - file size in bytes
- `section` (string) - 'poa', 'section2', or 'section3'
- `file_path` (string) - path in Firebase Storage
- `analysis_data` (object) - analysis results
- `created_at` (timestamp) - creation date
- `updated_at` (timestamp) - last update date

## Migration Status

- ✅ `section-view.html` - Migrated to Firebase
- ✅ `section-view.js` - Migrated to Firebase
- ⏳ `index.html` - In progress
- ⏳ `main.html` - In progress
- ⏳ `server.js` - To be checked

## Testing

After setup:
1. Upload a document through the app
2. Check Firebase Console → Firestore Database → documents collection
3. Check Firebase Console → Storage → files should appear
4. Verify documents load correctly in the app
5. Test PDF download functionality - it should work without CORS errors

## Troubleshooting

### CORS Errors
If you see CORS errors when downloading PDFs:
- The code now uses Firebase Storage SDK methods (`getBytes()`, `getBlob()`) which should work without CORS configuration
- If errors persist, configure CORS for Firebase Storage (see Step 4 in the original setup)
- Make sure Firebase Storage security rules allow read access

### Index Errors
- The code now sorts in memory, so index errors should not occur
- If you see index errors, click the link in the error message to create the index automatically

