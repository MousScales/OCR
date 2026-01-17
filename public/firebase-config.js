// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAIwXiqg4oo-lWsZa5zBDFViMSZ1lLyE7o",
  authDomain: "ocrr-b4765.firebaseapp.com",
  projectId: "ocrr-b4765",
  storageBucket: "ocrr-b4765.firebasestorage.app",
  messagingSenderId: "314006504305",
  appId: "1:314006504305:web:e2accd95fcc2d182236cd0",
  measurementId: "G-Z5L66PQNYY"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  window.firebaseApp = firebase.app();
  window.firestore = firebase.firestore();
  window.firebaseStorage = firebase.storage();
  console.log('✅ Firebase initialized');
} else {
  console.error('❌ Firebase SDK not loaded');
}

