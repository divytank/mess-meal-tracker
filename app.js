import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  onAuthStateChanged,
  signOut
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
  serverTimestamp
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
const authContainer = document.getElementById("auth-container");
const appContainer = document.getElementById("app-container");
const googleLoginBtn = document.getElementById("googleLogin");
const logoutBtn = document.getElementById("logoutBtn"); // Add this button to your HTML

// Global Variables
let currentUser = null;
let isAdmin = false;

// Initialize App
initApp();

function initApp() {
  // Clear any existing listeners
  googleLoginBtn.replaceWith(googleLoginBtn.cloneNode(true));
  if (logoutBtn) logoutBtn.replaceWith(logoutBtn.cloneNode(true));

  // Set up auth state listener
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      authContainer.style.display = "none";
      appContainer.style.display = "block";
      
      // Debug log
      console.log("User authenticated:", user.uid);
      
      // Check/create user document
      await handleUserDocument(user);
      
      // Initialize meal selection
      await initMealSelection();
    } else {
      currentUser = null;
      authContainer.style.display = "block";
      appContainer.style.display = "none";
      console.log("User signed out");
    }
  });

  // Set up login button
  document.getElementById("googleLogin").addEventListener("click", handleGoogleLogin);
  
  // Set up logout button if exists
  if (logoutBtn) {
    document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  }
}

// Google Login Handler (Fixed)
async function handleGoogleLogin() {
  try {
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    console.log("Login successful:", result.user.uid);
  } catch (error) {
    console.error("Login error:", error.code, error.message);
    showAlert(`Login failed: ${error.message}`, "error");
  }
}

// Logout Handler
async function handleLogout() {
  try {
    await signOut(auth);
    showAlert("Logged out successfully", "success");
  } catch (error) {
    console.error("Logout error:", error);
    showAlert("Logout failed", "error");
  }
}

// Create/update user document
async function handleUserDocument(user) {
  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);
  
  if (!docSnap.exists()) {
    await setDoc(userRef, {
      name: user.displayName,
      email: user.email,
      isAdmin: false,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp()
    });
    console.log("New user document created");
  } else {
    await setDoc(userRef, {
      lastLogin: serverTimestamp()
    }, { merge: true });
  }
  
  // Check admin status
  isAdmin = (await getDoc(userRef)).data()?.isAdmin || false;
  console.log("Admin status:", isAdmin);
}

// Meal Selection System (Fixed Persistence)
async function initMealSelection() {
  const today = new Date().toISOString().split('T')[0];
  const docRef = doc(db, "daily_meals", today);
  
  try {
    const docSnap = await getDoc(docRef);
    const data = docSnap.exists() ? docSnap.data() : { date: today };
    
    // Initialize checkboxes
    const meals = ["breakfast", "lunch", "dinner"];
    let html = '';
    
    meals.forEach(meal => {
      const isChecked = data[meal]?.students?.some(s => s.userId === currentUser.uid) || false;
      html += `
        <div class="form-check form-switch mb-3">
          <input class="form-check-input meal-checkbox" type="checkbox" 
                 id="${meal}-check" ${isChecked ? 'checked' : ''}>
          <label class="form-check-label" for="${meal}-check">
            ${meal.charAt(0).toUpperCase() + meal.slice(1)}
          </label>
        </div>
      `;
    });
    
    document.getElementById("meal-selection").innerHTML = html;
    
    // Add event listeners
    document.querySelectorAll(".meal-checkbox").forEach(checkbox => {
      checkbox.addEventListener("change", handleMealSelectionChange);
    });
    
    checkChangeWindow();
    console.log("Meal selection initialized");
  } catch (error) {
    console.error("Error initializing meal selection:", error);
    showAlert("Failed to load meal options", "error");
  }
}

// Handle meal selection changes (Fixed)
async function handleMealSelectionChange(e) {
  const mealType = e.target.id.split('-')[0];
  const isSelected = e.target.checked;
  
  if (!canChangeSelection()) {
    e.target.checked = !isSelected;
    showAlert("Changes not allowed after 9 PM", "error");
    return;
  }
  
  try {
    await updateMealSelection(mealType, isSelected);
    showAlert("Selection updated!", "success");
  } catch (error) {
    console.error("Update failed:", error);
    e.target.checked = !isSelected; // Revert UI on failure
    showAlert("Failed to update selection", "error");
  }
}

// Update meal selection in Firestore (Fixed)
async function updateMealSelection(mealType, isSelected) {
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
    console.log("Meal selection updated:", mealType, isSelected);
  });
}

// Helper Functions
function canChangeSelection() {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setHours(21, 0, 0, 0); // 9 PM cutoff
  return now < cutoff;
}

function checkChangeWindow() {
  const canChange = canChangeSelection();
  document.getElementById("cutoff-time").textContent = canChange ?
    "Changes allowed until 9 PM" : "Changes locked for today";
  
  document.querySelectorAll(".meal-checkbox").forEach(cb => {
    cb.disabled = !canChange;
  });
}

function showAlert(message, type) {
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;
  document.body.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 3000);
}
