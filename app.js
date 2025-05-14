import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  onAuthStateChanged 
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

// Firebase Config
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
const datePicker = document.getElementById("student-date-picker");

// Global Variables
let currentUser = null;
let isAdmin = false;

// Initialize App
initApp();

function initApp() {
  // Set up auth state listener
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      authContainer.style.display = "none";
      appContainer.style.display = "block";
      
      // Check/create user document
      await handleUserDocument(user);
      
      // Initialize meal selection
      initMealSelection();
    } else {
      currentUser = null;
      authContainer.style.display = "block";
      appContainer.style.display = "none";
    }
  });

  // Set up login button
  googleLoginBtn.addEventListener("click", handleGoogleLogin);
  
  // Set up date picker for admin
  datePicker.addEventListener("change", loadStudentDailyData);
  
  // Set default date to today
  datePicker.value = new Date().toISOString().split('T')[0];
}

// Google Login Handler
async function handleGoogleLogin() {
  try {
    const result = await signInWithPopup(auth, provider);
    console.log("User logged in:", result.user);
  } catch (error) {
    console.error("Login error:", error);
    alert(`Login failed: ${error.message}`);
  }
}

// Create user document if doesn't exist
async function handleUserDocument(user) {
  const userRef = doc(db, "users", user.uid);
  const docSnap = await getDoc(userRef);
  
  if (!docSnap.exists()) {
    await setDoc(userRef, {
      name: user.displayName,
      email: user.email,
      isAdmin: false, // Set to true manually for admin users
      createdAt: serverTimestamp()
    });
  }
  
  // Check admin status
  isAdmin = docSnap.data()?.isAdmin || false;
  adminSection.style.display = isAdmin ? "block" : "none";
  
  if (isAdmin) {
    loadAdminDashboard();
    loadStudentDailyData();
  }
}

// Meal Selection System
function initMealSelection() {
  const meals = ["Breakfast", "Lunch", "Dinner"];
  let html = "";
  
  meals.forEach(meal => {
    html += `
      <div class="form-check form-switch mb-3">
        <input class="form-check-input meal-checkbox" type="checkbox" id="${meal.toLowerCase()}-check">
        <label class="form-check-label" for="${meal.toLowerCase()}-check">${meal}</label>
      </div>
    `;
  });
  
  document.getElementById("meal-selection").innerHTML = html;
  
  // Add event listeners
  document.querySelectorAll(".meal-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", handleMealSelectionChange);
  });
  
  loadCurrentSelections();
}

// Load current selections
async function loadCurrentSelections() {
  const today = new Date().toISOString().split('T')[0];
  const docRef = doc(db, "daily_meals", today);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    document.getElementById("breakfast-check").checked = 
      data.breakfast?.students?.some(s => s.userId === currentUser.uid) || false;
    document.getElementById("lunch-check").checked = 
      data.lunch?.students?.some(s => s.userId === currentUser.uid) || false;
    document.getElementById("dinner-check").checked = 
      data.dinner?.students?.some(s => s.userId === currentUser.uid) || false;
  }
  
  checkChangeWindow();
}

// Handle meal selection changes
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
    showAlert("Failed to update selection", "error");
  }
}

// Update meal selection in Firestore
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
  });
}

// Admin Dashboard Functions
async function loadAdminDashboard() {
  await loadDailySummary();
  await loadWeeklyTrend();
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

function renderWeeklyChart(labels, data) {
  const ctx = document.getElementById("weeklyChart").getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Breakfast', data: labels.map(d => data[d]?.breakfast?.count || 0) },
        { label: 'Lunch', data: labels.map(d => data[d]?.lunch?.count || 0) },
        { label: 'Dinner', data: labels.map(d => data[d]?.dinner?.count || 0) }
      ]
    },
    options: { responsive: true }
  });
}

// Student Daily Data
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
    console.error("Error loading data:", error);
    container.innerHTML = `<div class='error'>Error: ${error.message}</div>`;
  }
}

function renderStudentData(users, mealData, container) {
  let html = `
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Student Name</th>
          <th>Breakfast</th>
          <th>Lunch</th>
          <th>Dinner</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  users.forEach(user => {
    html += `
      <tr>
        <td>${user.name || user.email}</td>
        <td>${mealData.breakfast?.students?.some(s => s.userId === user.id) ? '✓' : '✗'}</td>
        <td>${mealData.lunch?.students?.some(s => s.userId === user.id) ? '✓' : '✗'}</td>
        <td>${mealData.dinner?.students?.some(s => s.userId === user.id) ? '✓' : '✗'}</td>
      </tr>
    `;
  });
  
  html += "</tbody></table>";
  container.innerHTML = html;
}

// Helper Functions
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

function showAlert(message, type) {
  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;
  document.body.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 3000);
}
