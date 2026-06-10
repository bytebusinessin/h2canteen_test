import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAbXKKPnO7iySUzcqGoZuGt-yxdX--1Heg",
  authDomain: "aromas-794de.firebaseapp.com",
  projectId: "aromas-794de",
  storageBucket: "aromas-794de.firebasestorage.app",
  messagingSenderId: "185704147372",
  appId: "1:185704147372:web:5ac631be45c85c7949b209"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);