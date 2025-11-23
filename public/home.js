// home.js
document.addEventListener("DOMContentLoaded", async () => {
  const recentBtn = document.getElementById("recentBtn");

  // Modal elements (same IDs/classes as sets.html so CSS matches)
  const modeOverlay = document.getElementById("modeOverlay");
  const modeNormalBtn = document.getElementById("modeNormalBtn");
  const modePomodoroBtn = document.getElementById("modePomodoroBtn");
  const modeBackBtn = document.getElementById("modeBackBtn");

  const pomodoroInfoBtn = document.getElementById("pomodoroInfoBtn");
  const pomodoroInfoModal = document.getElementById("pomodoroInfoModal");
  const pomodoroInfoClose = document.getElementById("pomodoroInfoClose");


  // NEW: Pomodoro mini-form pieces
  const pomodoroForm = document.getElementById("pomodoroForm");
  const pomodoroStartBtn = document.getElementById("pomodoroStartBtn");
  const pomodoroBackBtn = document.getElementById("pomodoroBackBtn");
  const workMinutesInput = document.getElementById("workMinutes");
  const restMinutesInput = document.getElementById("restMinutes");

  // The first row of buttons inside the modal (Normal / Pomodoro / Back)
  const modeButtonsRow = modeOverlay?.querySelector(".mode-buttons");

  let latestSet = null;

  function openModeModal(setObj) {
    latestSet = setObj || null;
    if (!modeOverlay) return;
    // ensure we start at the choice row, not the form
    pomodoroForm?.classList.add("hidden");
    modeButtonsRow?.classList.remove("hidden");

    modeOverlay.classList.remove("hidden");
    modeOverlay.setAttribute("aria-hidden", "false");
  }

  function closeModeModal() {
    if (!modeOverlay) return;
    modeOverlay.classList.add("hidden");
    modeOverlay.setAttribute("aria-hidden", "true");
  }

  // Dismiss on overlay click (but not clicking inside the modal)
  if (modeOverlay) {
    modeOverlay.addEventListener("click", (e) => {
      if (e.target === modeOverlay) closeModeModal();
    });
    // ESC to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modeOverlay.classList.contains("hidden")) {
        closeModeModal();
      }
    });
  }

  // Button handlers route to study.html with mode
  modeNormalBtn?.addEventListener("click", () => {
    if (!latestSet) return;
    const id = encodeURIComponent(latestSet.id || latestSet._id);
    window.location.href = `study.html?id=${id}&mode=normal`;
  });

  // CHANGED: Pomodoro now shows the mini form instead of navigating immediately
  modePomodoroBtn?.addEventListener("click", () => {
    if (!latestSet) return;
    modeButtonsRow?.classList.add("hidden");
    pomodoroForm?.classList.remove("hidden");
  });

  // NEW: Back from the pomodoro form to the three-button row
  pomodoroBackBtn?.addEventListener("click", () => {
    pomodoroForm?.classList.add("hidden");
    modeButtonsRow?.classList.remove("hidden");
  });

  // NEW: Start pomodoro with work/rest params
  pomodoroStartBtn?.addEventListener("click", () => {
    if (!latestSet) return;
    const id = encodeURIComponent(latestSet.id || latestSet._id);
    const work = Math.max(1, Math.min(180, parseInt(workMinutesInput?.value || "25", 10) || 25));
    const rest = Math.max(1, Math.min(120, parseInt(restMinutesInput?.value || "5", 10) || 5));
    window.location.href = `study.html?id=${id}&mode=pomodoro&work=${work}&rest=${rest}`;
  });

  modeBackBtn?.addEventListener("click", () => closeModeModal());

  function openPomodoroInfo() {
    if (!pomodoroInfoModal) return;
    pomodoroInfoModal.classList.remove("hidden");
    pomodoroInfoModal.setAttribute("aria-hidden", "false");
  }

  function closePomodoroInfo() {
    if (!pomodoroInfoModal) return;
    pomodoroInfoModal.classList.add("hidden");
    pomodoroInfoModal.setAttribute("aria-hidden", "true");
  }

  pomodoroInfoBtn?.addEventListener("click", (e) => {
    e.stopPropagation();   // don't trigger the Pomodoro button's main click
    e.preventDefault();
    openPomodoroInfo();
  });

  pomodoroInfoClose?.addEventListener("click", closePomodoroInfo);

  pomodoroInfoModal?.addEventListener("click", (e) => {
    if (e.target === pomodoroInfoModal) {
      closePomodoroInfo();
    }
  });


  // Default state
  recentBtn.textContent = "Loading…";

  try {
    const res = await fetch("/api/sets/mine", { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      recentBtn.textContent = "No recent set";
      recentBtn.classList.add("recent-btn");
      recentBtn.removeAttribute("href"); // disable nav
      return;
    }

    const data = await res.json();
    const sets = Array.isArray(data.sets) ? data.sets : [];

    if (sets.length === 0) {
      recentBtn.textContent = "No recent set";
      recentBtn.classList.add("recent-btn");
      recentBtn.removeAttribute("href");
      return;
    }

    // pick most recent by createdAt (fallback to last item)
    const latest =
      sets
        .slice()
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || sets[sets.length - 1];

    latestSet = latest;

    // Populate the button
    recentBtn.textContent = latest.name || "Untitled set";

    // Open the mode modal (like sets page) instead of navigating
    recentBtn.addEventListener("click", (e) => {
      e.preventDefault(); // prevent "#" jump
      openModeModal(latestSet);
    });
  } catch (err) {
    recentBtn.textContent = "No recent set";
    recentBtn.classList.add("recent-btn");
    recentBtn.removeAttribute("href");
  }
});

// === PROFILE MENU LOGIC ===
document.addEventListener("DOMContentLoaded", () => {
  const profileBtn = document.querySelector(".profile-btn");
  const menu = document.getElementById("profileMenu");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!profileBtn || !menu || !logoutBtn) return;

  // Toggle menu
  profileBtn.addEventListener("click", () => {
    menu.classList.toggle("hidden");
  });

  // Log out
  logoutBtn.addEventListener("click", () => {
    // DELETE user token/session from storage
    localStorage.removeItem("token");
    sessionStorage.clear();

    // Redirect to login
    window.location.href = "index.html";
  });

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!profileBtn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add("hidden");
    }
  });
});