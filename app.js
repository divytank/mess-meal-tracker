import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  onIdTokenChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  serverTimestamp,
  enableIndexedDbPersistence,
  waitForPendingWrites
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyA2kUqIt4TymFZuwqmYHAn84Q4YYLK2wL8",
  authDomain: "messmealtracker.firebaseapp.com",
  projectId: "messmealtracker",
  storageBucket: "messmealtracker.appspot.com",
  messagingSenderId: "757246309247",
  appId: "1:757246309247:web:ea397db27cc0486b19204a",
  measurementId: "G-5WDDFJEZ61"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// DOM Elements
const connectionStatus = document.getElementById("connection-status");
const connectionMessage = document.getElementById("connection-message");
const connectionBadge = document.getElementById("connection-badge");
const authContainer = document.getElementById("auth-container");
const appContainer = document.getElementById("app-container");
const authStatus = document.getElementById("auth-status");

// Connection State
let isOnline = navigator.onLine;
let firebaseConnected = false;
let authStateReady = false;

// Initialize App
initApp();

async function initApp() {
  setupConnectionMonitoring();
  enableOfflinePersistence();
  setupEventListeners();
}

function setupConnectionMonitoring() {
  // Browser connection events
  window.addEventListener('online', handleConnectionChange);
  window.addEventListener('offline', handleConnectionChange);
  
  // Firebase connection state
  const dbRef = doc(db, "connection", "status");
  
  getDoc(dbRef).then(() => {
    firebaseConnected = true;
    updateConnectionStatus();
  }).catch((error) => {
    console.error("Firebase connection test failed:", error);
    firebaseConnected = false;
    updateConnectionStatus();
  });

  // Auth state ready check
  const authCheck = onAuthStateChanged(auth, () => {
    authStateReady = true;
    authCheck(); // Unsubscribe
    updateConnectionStatus();
  });
}

function enableOfflinePersistence() {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn("Offline persistence already enabled in another tab");
    } else if (err.code == 'unimplemented') {
      console.warn("Offline persistence not available in this browser");
    }
  });
}

function handleConnectionChange() {
  isOnline = navigator.onLine;
  
  // Test Firebase connection when browser comes online
  if (isOnline) {
    const dbRef = doc(db, "connection", "status");
    getDoc(dbRef).then(() => {
      firebaseConnected = true;
      updateConnectionStatus();
    }).catch(() => {
      firebaseConnected = false;
      updateConnectionStatus();
    });
  } else {
    firebaseConnected = false;
    updateConnectionStatus();
  }
}

function updateConnectionStatus() {
  if (!authStateReady) {
    connectionStatus.style.display = "none";
    connectionBadge.textContent = "Loading...";
    connectionBadge.className = "badge bg-secondary";
    return;
  }

  if (isOnline && firebaseConnected) {
    // Fully connected
    connectionStatus.style.display = "none";
    connectionBadge.textContent = "Online";
    connectionBadge.className = "badge bg-success connected";
  } else if (!isOnline) {
    // Browser offline
    connectionMessage.innerHTML = `<i class="bi bi-wifi-off"></i> You're offline - working in limited mode`;
    connectionStatus.className = "alert alert-warning alert-dismissible fade show mb-3 disconnected";
    connectionStatus.style.display = "block";
    connectionBadge.textContent = "Offline";
    connectionBadge.className = "badge bg-danger disconnected";
  } else if (!firebaseConnected) {
    // Browser online but Firebase disconnected
    connectionMessage.innerHTML = `<i class="bi bi-cloud-slash"></i> Can't reach server - trying to reconnect...`;
    connectionStatus.className = "alert alert-warning alert-dismissible fade show mb-3 warning";
    connectionStatus.style.display = "block";
    connectionBadge.textContent = "Connecting...";
    connectionBadge.className = "badge bg-warning text-dark";
  }
}

function setupEventListeners() {
  // Google Login
  document.getElementById("googleLogin").addEventListener("click", async () => {
    authStatus.innerHTML = `<span class="loading-spinner"></span> Connecting...`;
    
    try {
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      authStatus.textContent = "";
    } catch (error) {
      console.error("Login error:", error);
      authStatus.innerHTML = `<div class="text-danger">Login failed: ${error.message}</div>`;
    }
  });

  // Logout
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      await signOut(auth);
      showAlert("Logged out successfully", "success");
    } catch (error) {
      console.error("Logout error:", error);
      showAlert("Logout failed. Please try again.", "error");
    }
  });
}

// ... (rest of your existing Firebase functions remain the same) ...

// Enhanced updateMealSelection with connection check
async function updateMealSelection(mealType, isSelected) {
  if (!firebaseConnected) {
    throw new Error("No connection to database. Please check your internet connection.");
  }

  const statusDiv = document.getElementById("update-status");
  statusDiv.innerHTML = `
    <div class="d-flex align-items-center text-info">
      <span class="loading-spinner"></span>
      <span class="ms-2">Updating your selection...</span>
    </div>
  `;

  try {
    // Wait for any pending writes to complete
    await waitForPendingWrites(db);
    
    const today = new Date().toISOString().split('T')[0];
    const docRef = doc(db, "daily_meals", today);
    
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      const data = docSnap.exists() ? docSnap.data() : { date: today };
      
      if (!data[mealType]) data[mealType] = { count: 0, students: [] };
      
      const userIndex = data[mealType].students.findIndex(s => s.userId === currentUser.uid);
      
      if (isSelected && userIndex === -1) {
        data[mealType].students.push({
          userId: currentUser.uid,
          name: currentUser.displayName,
          timestamp: serverTimestamp()
        });
        data[mealType].count++;
      } else if (!isSelected && userIndex !== -1) {
        data[mealType].students.splice(userIndex, 1);
        data[mealType].count--;
      }
      
      transaction.set(docRef, data);
    });
    
    statusDiv.innerHTML = `
      <div class="d-flex align-items-center text-success">
        <i class="bi bi-check-circle-fill"></i>
        <span class="ms-2">Selection updated successfully!</span>
      </div>
    `;
    setTimeout(() => statusDiv.innerHTML = '', 3000);
    
  } catch (error) {
    console.error("Update error:", error);
    statusDiv.innerHTML = `
      <div class="d-flex align-items-center text-danger">
        <i class="bi bi-exclamation-circle-fill"></i>
        <span class="ms-2">Failed to update: ${error.message}</span>
      </div>
    `;
    throw error;
  }
}

// Helper function to show alerts
function showAlert(message, type) {
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
  alertDiv.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  
  const container = document.querySelector(".container");
  container.prepend(alertDiv);
  
  setTimeout(() => {
    alertDiv.classList.remove("show");
    setTimeout(() => alertDiv.remove(), 150);
  }, 3000);
  }
