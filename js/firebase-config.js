// Import Firebase desde CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initializeFirestore, memoryLocalCache } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC5KoU8YyrSwRIjuhMczS8mnEBgMfDlrzc",
  authDomain: "plataforma-examenes-f2df9.firebaseapp.com",
  projectId: "plataforma-examenes-f2df9",
  storageBucket: "plataforma-examenes-f2df9.firebasestorage.app",
  messagingSenderId: "504614396126",
  appId: "1:504614396126:web:2d526051d5c7503e21224f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Firestore SIN persistencia (evita errores WebChannel)
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});
