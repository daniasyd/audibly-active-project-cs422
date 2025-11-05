// home.js
document.addEventListener("DOMContentLoaded", async () => {
  const recentBtn = document.getElementById("recentBtn");

  // Modal elements (same IDs/classes as sets.html so CSS/styles.js match)
  const modeOverlay     = document.getElementById("modeOverlay");
  const modeNormalBtn   = document.getElementById("modeNormalBtn");
  const modePomodoroBtn = document.getElementById("modePomodoroBtn");
  const modeBackBtn     = document.getElementById("modeBackBtn");

  let latestSet = null;

  function openModeModal(setObj) {
    latestSet = setObj || null;
    if (!modeOverlay) return;
    modeOverlay.classList.remove("hidden");
    modeOverlay.setAttribute("aria-hidden", "false");
  }
  function closeModeModal() {
    if (!modeOverlay) return;
    modeOverlay.classList.add("hidden");
    modeOverlay.setAttribute("aria-hidden", "true");
    // keep latestSet cached; we only reset if you’d like
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
  modePomodoroBtn?.addEventListener("click", () => {
    if (!latestSet) return;
    const id = encodeURIComponent(latestSet.id || latestSet._id);
    window.location.href = `study.html?id=${id}&mode=pomodoro`;
  });
  modeBackBtn?.addEventListener("click", () => closeModeModal());

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
