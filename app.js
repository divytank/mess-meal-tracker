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
const adminSection = document.getElementById("admin-section");
const googleLoginBtn = document.getElementById("googleLogin");
const logoutBtn = document.getElementById("logoutBtn");
const datePicker = document.getElementById("student-date-picker");
const userNameSpan = document.getElementById("user-name");

// Global Variables
let currentUser = null;
let isAdmin = false;

// Initialize App
initApp();

function initApp() {
  setupEventListeners();
  checkAuthState();
}

function setupEventListeners() {
  // Clear and re-add event listeners to prevent duplicates
  googleLoginBtn.replaceWith(googleLoginBtn.cloneNode(true));
  logoutBtn.replaceWith(logoutBtn.cloneNode(true));
  
  document.getElementById("googleLogin").addEventListener("click", handleGoogleLogin);
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  datePicker.addEventListener("change", loadStudentDailyData);
  
  // Set default date to today
  datePicker.value = new Date().toISOString().split('T')[0];
}

function checkAuthState() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      userNameSpan.textContent = user.displayName || "User";
      authContainer.style.display = "none";
      appContainer.style.display = "block";
      
      await handleUserDocument(user);
      await initMealSelection();
      
      if (isAdmin) {
        loadAdminDashboard();
        loadStudentDailyData();
      }
    } else {
      currentUser = null;
      authContainer.style.display = "block";
      appContainer.style.display = "none";
    }
  });
}

async function handleGoogleLogin() {
  try {
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    console.log("Login successful:", result.user.uid);
  } catch (error) {
    console.error("Login error:", error);
    showStatusMessage(`Login failed: ${error.message}`, "error");
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
    showStatusMessage("Logged out successfully", "success");
  } catch (error) {
    console.error("Logout error:", error);
    showStatusMessage("Logout failed. Please try again.", "error");
  }
}

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
  } else {
    await setDoc(userRef, {
      lastLogin: serverTimestamp()
    }, { merge: true });
  }
  
  isAdmin = (await getDoc(userRef)).data()?.isAdmin || false;
  adminSection.style.display = isAdmin ? "block" : "none";
}

async function initMealSelection() {
  const today = new Date().toISOString().split('T')[0];
  const docRef = doc(db, "daily_meals", today);
  
  try {
    const docSnap = await getDoc(docRef);
    const data = docSnap.exists() ? docSnap.data() : { date: today };
    
    renderMealCheckboxes(data);
    checkChangeWindow();
  } catch (error) {
    console.error("Error loading meal data:", error);
    showStatusMessage("Failed to load meal options", "error");
  }
}

function renderMealCheckboxes(data) {
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
}

async function handleMealSelectionChange(e) {
  const checkbox = e.target;
  const originalState = checkbox.checked;
  const mealType = checkbox.id.split('-')[0];
  
  if (!canChangeSelection()) {
    checkbox.checked = !originalState;
    showStatusMessage("Changes not allowed after 9 PM", "error");
    return;
  }
  
  try {
    checkbox.disabled = true;
    await updateMealSelection(mealType, checkbox.checked);
  } catch (error) {
    console.error("Update failed:", error);
    checkbox.checked = !originalState;
    showStatusMessage("Failed to update selection. Please try again.", "error");
  } finally {
    checkbox.disabled = !canChangeSelection();
  }
}

async function updateMealSelection(mealType, isSelected) {
  const today = new Date().toISOString().split('T')[0];
  const docRef = doc(db, "daily_meals", today);
  
  showStatusMessage("Updating your selection...", "info");
  
  try {
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
    
    showStatusMessage("Selection updated successfully!", "success");
  } catch (error) {
    console.error("Transaction error:", error);
    showStatusMessage(`Update failed: ${error.message}`, "error");
    throw error;
  }
}

// Admin Functions
async function loadAdminDashboard() {
  try {
    await loadDailySummary();
    await loadWeeklyTrend();
  } catch (error) {
    console.error("Admin dashboard error:", error);
    showStatusMessage("Failed to load admin data", "error");
  }
}

async function loadDailySummary() {
  const today = new Date().toISOString().split('T')[0];
  const docSnap = await getDoc(doc(db, "daily_meals", today));
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    document.querySelector("#today-summary tbody").innerHTML = `
      <tr><td>Breakfast</td><td>${data.breakfast?.count || 0}</td></tr>
      <tr><td>Lunch</td><td>${data.lunch?.count || 0}</td></tr>
      <tr><td>Dinner</td><td>${data.dinner?.count || 0}</td></tr>
    `;
  }
}

async function loadWeeklyTrend() {
  const weekDates = getWeekDates(new Date());
  const q = query(
    collection(db, "daily_meals"),
    where("date", "in", weekDates)
  );
  const querySnapshot = await getDocs(q);
  const weeklyData = {};
  
  querySnapshot.forEach(doc => {
    weeklyData[doc.id] = doc.data();
  });
  
  renderWeeklyChart(weekDates, weeklyData);
}

async function loadStudentDailyData() {
  const selectedDate = datePicker.value;
  const container = document.getElementById("students-daily-data");
  container.innerHTML = "<div class='loading'>Loading data...</div>";
  
  try {
    const [usersSnapshot, mealDoc] = await Promise.all([
      getDocs(collection(db, "users")),
      getDoc(doc(db, "daily_meals", selectedDate))
    ]);
    
    const users = usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const mealData = mealDoc.exists() ? mealDoc.data() : null;
    
    if (!mealData) {
      container.innerHTML = "<div class='no-data'>No data available for this date</div>";
      return;
    }
    
    renderStudentData(users, mealData, container);
  } catch (error) {
    console.error("Error loading student data:", error);
    container.innerHTML = "<div class='error'>Failed to load data</div>";
  }
}

// Helper Functions
function renderWeeklyChart(labels, data) {
  const ctx = document.getElementById("weeklyChart").getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Breakfast', data: labels.map(d => data[d]?.breakfast?.count || 0), backgroundColor: '#4285F4' },
        { label: 'Lunch', data: labels.map(d => data[d]?.lunch?.count || 0), backgroundColor: '#34A853' },
        { label: 'Dinner', data: labels.map(d => data[d]?.dinner?.count || 0), backgroundColor: '#EA4335' }
      ]
    },
    options: { responsive: true }
  });
}

function renderStudentData(users, mealData, container) {
  let html = `
    <table class="table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Breakfast</th>
          <th>Lunch</th>
          <th>Dinner</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  users.forEach(user => {
    const breakfastStatus = mealData.breakfast?.students?.some(s => s.userId === user.id) ? '✓' : '✗';
    const lunchStatus = mealData.lunch?.students?.some(s => s.userId === user.id) ? '✓' : '✗';
    const dinnerStatus = mealData.dinner?.students?.some(s => s.userId === user.id) ? '✓' : '✗';
    
    html += `
      <tr>
        <td>${user.name || user.email}</td>
        <td class="${breakfastStatus === '✓' ? 'text-success' : 'text-danger'}">${breakfastStatus}</td>
        <td class="${lunchStatus === '✓' ? 'text-success' : 'text-danger'}">${lunchStatus}</td>
        <td class="${dinnerStatus === '✓' ? 'text-success' : 'text-danger'}">${dinnerStatus}</td>
      </tr>
    `;
  });
  
  html += "</tbody></table>";
  container.innerHTML = html;
}

function getWeekDates(date) {
  const day = date.getDay();
  const startDate = new Date(date);
  startDate.setDate(date.getDate() - day);
  
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

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

function showStatusMessage(message, type) {
  const statusDiv = document.getElementById("update-status");
  statusDiv.innerHTML = `<div class="status-${type}">${message}</div>`;
  
  if (type !== "error") {
    setTimeout(() => statusDiv.innerHTML = '', 3000);
  }
}
