import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

export const config = {
    apiKey: "AIzaSyBP7BXunPg_brMRnPmZKMBYR6JM6loYMPE",
    authDomain: "dejaview-vr-tour.firebaseapp.com",
    projectId: "dejaview-vr-tour",
    storageBucket: "dejaview-vr-tour.firebasestorage.app",
    messagingSenderId: "965197167948",
    appId: "1:965197167948:web:795269e611c64edd83a3e9"
};
export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const $ = id => document.getElementById(id);
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
