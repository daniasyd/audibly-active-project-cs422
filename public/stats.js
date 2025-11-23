document.addEventListener("DOMContentLoaded", () => {
    // === PROFILE MENU LOGIC (same as other pages) ===
    const profileBtn = document.querySelector(".profile-btn");
    const profileMenu = document.getElementById("profileMenu");
    const logoutBtn = document.getElementById("logoutBtn");
  
    if (profileBtn && profileMenu && logoutBtn) {
      // Toggle dropdown
      profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        profileMenu.classList.toggle("hidden");
      });
  
      // Log out
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        localStorage.removeItem("token");
        sessionStorage.clear();
        window.location.href = "index.html";
      });
  
      // Close menu when clicking outside
      document.addEventListener("click", (e) => {
        if (!profileBtn.contains(e.target) && !profileMenu.contains(e.target)) {
          profileMenu.classList.add("hidden");
        }
      });
    }
  
    // === STATS DISPLAY LOGIC ===
    const STORAGE_KEY = "studySessions";
  
    const statTotalSessionsEl  = document.getElementById("statTotalSessions");
    const statTotalSessions2El = document.getElementById("statTotalSessions2");
    const statTotalCardsEl     = document.getElementById("statTotalCards");
    const statTotalCorrectEl   = document.getElementById("statTotalCorrect");
    const statAccuracyEl       = document.getElementById("statAccuracy");
    const statPomodoroEl       = document.getElementById("statPomodoroSessions");
    const recentListEl         = document.getElementById("statsRecentList");
  
    function loadSessions() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
  
    function formatDuration(secs) {
      secs = Math.max(0, Math.floor(secs || 0));
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      if (m === 0) return `${s}s`;
      return `${m}m ${s.toString().padStart(2, "0")}s`;
    }
  
    function renderStats() {
      const sessions = loadSessions();
  
      if (!sessions.length) {
        // Leave the "No sessions yet" message in place
        if (statTotalSessionsEl)  statTotalSessionsEl.textContent = "0";
        if (statTotalSessions2El) statTotalSessions2El.textContent = "0";
        if (statTotalCardsEl)     statTotalCardsEl.textContent = "0";
        if (statTotalCorrectEl)   statTotalCorrectEl.textContent = "0";
        if (statAccuracyEl)       statAccuracyEl.textContent = "0%";
        if (statPomodoroEl)       statPomodoroEl.textContent = "0";
        return;
      }
  
      const totalSessions = sessions.length;
      const totalCards    = sessions.reduce((sum, s) => sum + (s.total || 0), 0);
      const totalCorrect  = sessions.reduce((sum, s) => sum + (s.correct || 0), 0);
      const pomodoroCount = sessions.filter(s => s.mode === "pomodoro").length;
      const accuracy      = totalCards ? Math.round((totalCorrect / totalCards) * 100) : 0;
  
      if (statTotalSessionsEl)  statTotalSessionsEl.textContent  = String(totalSessions);
      if (statTotalSessions2El) statTotalSessions2El.textContent = String(totalSessions);
      if (statTotalCardsEl)     statTotalCardsEl.textContent     = String(totalCards);
      if (statTotalCorrectEl)   statTotalCorrectEl.textContent   = String(totalCorrect);
      if (statAccuracyEl)       statAccuracyEl.textContent       = `${accuracy}%`;
      if (statPomodoroEl)       statPomodoroEl.textContent       = String(pomodoroCount);
  
      // Recent sessions (newest first, up to 5)
      if (recentListEl) {
        recentListEl.innerHTML = "";
        const sorted = sessions
          .slice()
          .sort((a, b) => (b.ts || 0) - (a.ts || 0))
          .slice(0, 5);
  
        sorted.forEach((s) => {
          const li = document.createElement("li");
          li.className = "stats-item";
  
          const name = s.setName || "Untitled set";
          const correct = s.correct ?? 0;
          const total   = s.total ?? 0;
          const mode    = s.mode === "pomodoro" ? "Pomodoro" : "Normal";
          const dur     = formatDuration(s.durationSecs);
  
          li.textContent = `${name} — ${correct}/${total} recalled • ${dur} • ${mode}`;
          recentListEl.appendChild(li);
        });
      }
    }
  
    renderStats();
  });
  