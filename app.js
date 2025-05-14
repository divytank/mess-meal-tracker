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
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

// DOM Elements
const authContainer = document.getElementById("auth-container");
const appContainer = document.getElementById("app-container");
const adminSection = document.getElementById("admin-section");
const googleLoginBtn = document.getElementById("googleLogin");
const mealSelectionDiv = document.getElementById("meal-selection");
const datePicker = document.getElementById("student-date-picker");

// Global Variables
let currentUser = null;
let isAdmin = false;

// Initialize the application
function init() {
  setupEventListeners();
  checkAuthState();
}

// Set up event listeners
function setupEventListeners() {
  googleLoginBtn.addEventListener("click", handleGoogleLogin);
  datePicker.addEventListener("change", loadStudentDailyData);
}

// Check authentication state
function checkAuthState() {
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      authContainer.style.display = "none";
      appContainer.style.display = "block";
      checkAdminStatus(user.uid);
      initMealSelection();
    } else {
      currentUser = null;
      authContainer.style.display = "block";
      appContainer.style.display = "none";
    }
  });
}

// Handle Google login
async function handleGoogleLogin() {
  try {
    await auth.signInWithPopup(provider);
  } catch (error) {
    console.error("Login error:", error);
    alert("Login failed. Please try again.");
  }
}

// Check if user is admin
async function checkAdminStatus(userId) {
  const userDoc = await db.collection("users").doc(userId).get();
  isAdmin = userDoc.exists && userDoc.data().isAdmin;
  
  if (isAdmin) {
    adminSection.style.display = "block";
    loadAdminDashboard();
    // Set default date to today
    const today = new Date().toISOString().split("T")[0];
    datePicker.value = today;
    loadStudentDailyData();
  }
}

// Initialize meal selection UI
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
  
  mealSelectionDiv.innerHTML = html;
  
  // Add event listeners to checkboxes
  document.querySelectorAll(".meal-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", handleMealSelectionChange);
  });
  
  loadCurrentSelections();
}

// Load current meal selections
async function loadCurrentSelections() {
  const today = new Date().toISOString().split("T")[0];
  const docRef = db.collection("daily_meals").doc(today);
  const doc = await docRef.get();
  
  if (doc.exists) {
    const data = doc.data();
    const userId = currentUser.uid;
    
    document.getElementById("breakfast-check").checked = 
      data.breakfast?.students?.some(s => s.userId === userId) || false;
    document.getElementById("lunch-check").checked = 
      data.lunch?.students?.some(s => s.userId === userId) || false;
    document.getElementById("dinner-check").checked = 
      data.dinner?.students?.some(s => s.userId === userId) || false;
  }
  
  checkChangeWindow();
}

// Handle meal selection changes
async function handleMealSelectionChange(event) {
  const mealType = event.target.id.split("-")[0];
  const isSelected = event.target.checked;
  
  if (!canChangeSelection()) {
    event.target.checked = !isSelected;
    alert("Changes are only allowed before 9 PM for the next day.");
    return;
  }
  
  await updateMealSelection(mealType, isSelected);
}

// Check if changes are allowed (before 9 PM)
function canChangeSelection() {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setHours(21, 0, 0, 0); // 9 PM cutoff
  return now < cutoff;
}

// Update meal selection in Firestore
async function updateMealSelection(mealType, isSelected) {
  const today = new Date().toISOString().split("T")[0];
  const docRef = db.collection("daily_meals").doc(today);
  const userId = currentUser.uid;
  const userName = currentUser.displayName;
  
  try {
    await db.runTransaction(async transaction => {
      const doc = await transaction.get(docRef);
      const data = doc.exists ? doc.data() : { date: today };
      
      if (!data[mealType]) {
        data[mealType] = { count: 0, students: [] };
      }
      
      const mealData = data[mealType];
      const userIndex = mealData.students.findIndex(s => s.userId === userId);
      
      if (isSelected && userIndex === -1) {
        mealData.students.push({
          userId,
          name: userName,
          timestamp: new Date()
        });
        mealData.count++;
      } else if (!isSelected && userIndex !== -1) {
        mealData.students.splice(userIndex, 1);
        mealData.count--;
      }
      
      transaction.set(docRef, data);
    });
  } catch (error) {
    console.error("Transaction failed:", error);
    alert("Failed to update meal selection. Please try again.");
  }
}

// Load admin dashboard
async function loadAdminDashboard() {
  await loadDailySummary();
  await loadWeeklyTrend();
}

// Load today's summary
async function loadDailySummary() {
  const today = new Date().toISOString().split("T")[0];
  const doc = await db.collection("daily_meals").doc(today).get();
  
  if (doc.exists) {
    const data = doc.data();
    document.querySelector("#today-summary tbody").innerHTML = `
      <tr><td>Breakfast</td><td>${data.breakfast?.count || 0}</td></tr>
      <tr><td>Lunch</td><td>${data.lunch?.count || 0}</td></tr>
      <tr><td>Dinner</td><td>${data.dinner?.count || 0}</td></tr>
    `;
  }
}

// Load weekly trend data
async function loadWeeklyTrend() {
  const weekDates = getWeekDates(new Date());
  const snapshot = await db.collection("daily_meals")
    .where("date", "in", weekDates)
    .get();
    
  const weeklyData = {};
  snapshot.forEach(doc => {
    weeklyData[doc.id] = doc.data();
  });
  
  // Prepare chart data
  const chartData = {
    labels: weekDates,
    datasets: [
      { label: "Breakfast", data: weekDates.map(d => weeklyData[d]?.breakfast?.count || 0) },
      { label: "Lunch", data: weekDates.map(d => weeklyData[d]?.lunch?.count || 0) },
      { label: "Dinner", data: weekDates.map(d => weeklyData[d]?.dinner?.count || 0) }
    ]
  };
  
  // Render chart
  const ctx = document.getElementById("weeklyChart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: chartData,
    options: { responsive: true }
  });
}

// Load student-wise daily data
async function loadStudentDailyData() {
  const selectedDate = datePicker.value;
  const container = document.getElementById("students-daily-data");
  container.innerHTML = "<p>Loading data...</p>";
  
  try {
    // Get all users
    const usersSnapshot = await db.collection("users").get();
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get meal data for selected date
    const mealDoc = await db.collection("daily_meals").doc(selectedDate).get();
    const mealData = mealDoc.exists ? mealDoc.data() : null;
    
    if (!mealData) {
      container.innerHTML = "<p>No data available for this date.</p>";
      return;
    }
    
    // Generate HTML table
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
      const breakfastAttended = mealData.breakfast?.students?.some(s => s.userId === user.id) || false;
      const lunchAttended = mealData.lunch?.students?.some(s => s.userId === user.id) || false;
      const dinnerAttended = mealData.dinner?.students?.some(s => s.userId === user.id) || false;
      
      html += `
        <tr>
          <td>${user.name || "Unknown"}</td>
          <td>${breakfastAttended ? "✓" : "✗"}</td>
          <td>${lunchAttended ? "✓" : "✗"}</td>
          <td>${dinnerAttended ? "✓" : "✗"}</td>
        </tr>
      `;
    });
    
    html += "</tbody></table>";
    container.innerHTML = html;
    
  } catch (error) {
    console.error("Error loading student data:", error);
    container.innerHTML = "<p class='text-danger'>Failed to load data. Please try again.</p>";
  }
}

// Helper function to get week dates
function getWeekDates(date) {
  const day = date.getDay();
  const startDate = new Date(date);
  startDate.setDate(date.getDate() - day);
  
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

// Check change window and update UI
function checkChangeWindow() {
  const canChange = canChangeSelection();
  document.getElementById("cutoff-time").textContent = canChange ? 
    "Changes allowed until 9 PM" : "Changes locked until tomorrow";
  
  document.querySelectorAll(".meal-checkbox").forEach(checkbox => {
    checkbox.disabled = !canChange;
  });
}

// Initialize the application
init();
