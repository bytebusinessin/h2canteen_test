import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAs_Cfj9lZOk67hSsQ92V7nCk_uLe76g9k",
  authDomain: "aromas-kitchen-android.firebaseapp.com",
  projectId: "aromas-kitchen-android",
  storageBucket: "aromas-kitchen-android.firebasestorage.app",
  messagingSenderId: "90063514909",
  appId: "1:90063514909:web:8a15d4a3dbbea580fe05f4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);