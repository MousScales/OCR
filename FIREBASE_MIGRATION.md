# Firebase Migration Guide

This document tracks the migration from Supabase to Firebase.

## Completed
- ✅ Firebase configuration added to section-view.html
- ✅ Firebase SDKs loaded (Firestore and Storage)

## In Progress
- 🔄 Migrating section-view.js to use Firebase
- ⏳ Migrating index.html to use Firebase
- ⏳ Migrating main.html to use Firebase

## Firebase Setup Required

1. Enable Firestore Database:
   - Go to Firebase Console → Firestore Database
   - Click "Create database"
   - Start in test mode (we'll add security rules later)
   - Choose a location

2. Enable Firebase Storage:
   - Go to Firebase Console → Storage
   - Click "Get started"
   - Start in test mode
   - Use same location as Firestore

3. Security Rules (to be added):
   - Firestore: Allow read/write for now (we'll restrict later)
   - Storage: Allow read/write for now (we'll restrict later)

## Data Structure

The `documents` collection in Firestore will have the same structure as Supabase:
- id (auto-generated)
- name (string)
- type (string)
- size (number)
- section (string: 'poa', 'section2', 'section3')
- file_path (string, path in Firebase Storage)
- analysis_data (object/JSON)
- created_at (timestamp)
- updated_at (timestamp)

