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
  where,
  query,
  getDocs,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase configuration
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
const mealSelectionDiv = document.getElementById("meal-selection");
const datePicker = document.getElementById("student-date-picker");
const studentDataContainer = document.getElementById("students-daily-data");

// Global Variables
let currentUser = null;
let isAdmin = false;

// Initialize application
function initApp() {
  setupEventListeners();
  checkAuthState();
  // Set default date to today
  datePicker.value = new Date().toISOString().split('T')[0];
}

// Event Listeners
function setupEventListeners() {
  googleLoginBtn.addEventListener("click", handleGoogleLogin);
  datePicker.addEventListener("change", loadStudentDailyData);
}

// Authentication State Observer
function checkAuthState() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      authContainer.style.display = "none";
      appContainer.style.display = "block";
      await checkAdminStatus(user.uid);
      initMealSelection();
    } else {
      currentUser = null;
      authContainer.style.display = "block";
      appContainer.style.display = "none";
    }
  });
}

// Google Sign-In
async function handleGoogleLogin() {
  try {
    const result = await signInWithPopup(auth, provider);
    // Check if new user and create document
    const userDoc = await getDoc(doc(db, "users", result.user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, "users", result.user.uid), {
        name: result.user.displayName,
        email: result.user.email,
        isAdmin: false,
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error("Login error:", error);
    alert("Login failed. Please try again.");
  }
}

// Check Admin Status
async function checkAdminStatus(userId) {
  const userDoc = await getDoc(doc(db, "users", userId));
  isAdmin = userDoc.exists() && userDoc.data().isAdmin;
  
  if (isAdmin) {
    adminSection.style.display = "block";
    loadAdminDashboard();
    loadStudentDailyData();
  } else {
    adminSection.style.display = "none";
  }
}

// Meal Selection System
function initMealSelection() {
  const meals = ["Breakfast", "Lunch", "Dinner"];
  let html = "";
  
  meals.forEach(meal => {
    html += `
      <div class="meal-option">
        <input type="checkbox" id="${meal.toLowerCase()}-check" class="meal-checkbox">
        <label for="${meal.toLowerCase()}-check">${meal}</label>
      </div>
    `;
  });
  
  mealSelectionDiv.innerHTML = html;
  
  // Add event listeners
  document.querySelectorAll(".meal-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", handleMealSelection);
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
async function handleMealSelection(e) {
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
  studentDataContainer.innerHTML = "<div class='loading'>Loading data...</div>";
  
  try {
    const [usersSnapshot, mealDoc] = await Promise.all([
      getDocs(collection(db, "users")),
      getDoc(doc(db, "daily_meals", selectedDate))
    ]);
    
    const users = usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const mealData = mealDoc.exists() ? mealDoc.data() : null;
    
    if (!mealData) {
      studentDataContainer.innerHTML = "<div class='no-data'>No data available for this date</div>";
      return;
    }
    
    renderStudentDataTable(users, mealData);
  } catch (error)
