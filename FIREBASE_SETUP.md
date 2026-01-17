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

## Step 4: Verify Configuration

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

