// tabs
const tabButtons = document.querySelectorAll(".tab-button");
const panels = document.querySelectorAll(".tab-panel");
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    panels.forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// helpers
const setStatus = (el, msg, type = "") => {
  el.textContent = msg || "";
  el.classList.remove("error", "success");
  if (type) el.classList.add(type);
};

// forms
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginStatus = document.getElementById("loginStatus");
const signupStatus = document.getElementById("signupStatus");

// login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus(loginStatus, "");
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!username || !password) {
    return setStatus(loginStatus, "Please enter username and password.", "error");
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return setStatus(loginStatus, data.message || "Login failed.", "error");
    }
    setStatus(loginStatus, "Logged in!", "success");
    window.location.href = "home.html";
  } catch {
    setStatus(loginStatus, "Network error. Is the server running?", "error");
  }
});

// signup
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus(signupStatus, "");
  const username = document.getElementById("signupUsername").value.trim();
  const password = document.getElementById("signupPassword").value;

  if (!username || !password) {
    return setStatus(signupStatus, "Please enter username and password.", "error");
  }

  try {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return setStatus(signupStatus, data.message || "Signup failed.", "error");
    }
    setStatus(signupStatus, "Account created! Redirecting…", "success");
    window.location.href = "home.html";
  } catch {
    setStatus(signupStatus, "Network error. Is the server running?", "error");
  }
});
