// sets.js (final cleaned-up version)
document.addEventListener("DOMContentLoaded", async () => {
  // ---- DOM hooks (robust to minor ID/class differences in your snapshot) ----
  const recentBtn =
    document.getElementById("recentSetBtn");

  const listEl =
    document.getElementById("allSets") ||
    document.getElementById("setsList") ||
    document.querySelector(".sets-list");

  let emptyEl =
    document.getElementById("allSetsEmpty") ||
    document.getElementById("emptySetsText") ||
    null;

  const addSetBtn = document.getElementById("addSetBtn");

    // --- at top, after your DOM hooks ---
    let selectedSet = null;

    // Modal elements
    const modeOverlay = document.getElementById("modeOverlay");
    const modeNormalBtn = document.getElementById("modeNormalBtn");
    const modePomodoroBtn = document.getElementById("modePomodoroBtn");
    const modeBackBtn = document.getElementById("modeBackBtn");

    // Extra Pomodoro form elements
    const pomodoroForm     = document.getElementById("pomodoroForm");
    const workMinutesInput = document.getElementById("workMinutes");
    const restMinutesInput = document.getElementById("restMinutes");
    const pomodoroStartBtn = document.getElementById("pomodoroStartBtn");
    const pomodoroBackBtn  = document.getElementById("pomodoroBackBtn");

    // The original 3 buttons container (so we can hide/show it)
    // If your three buttons are the only children inside .mode-modal,
    // just grab the container that wraps them. Here we target by IDs:
    const modeButtonsRow = document.querySelector(".mode-buttons");


    function openModeModal(setObj) {
    selectedSet = setObj || null;
    if (!modeOverlay) return;
    modeOverlay.classList.remove("hidden");
    modeOverlay.setAttribute("aria-hidden", "false");
    }

    function closeModeModal() {
    if (!modeOverlay) return;
    modeOverlay.classList.add("hidden");
    modeOverlay.setAttribute("aria-hidden", "true");
    selectedSet = null;
    }

    // Dismiss on overlay click (but not when clicking the inner modal)
    if (modeOverlay) {
    modeOverlay.addEventListener("click", (e) => {
        if (e.target === modeOverlay) closeModeModal();
    });
    // Escape key to close
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modeOverlay.classList.contains("hidden")) {
        closeModeModal();
        }
    });
    }

    // when opening the modal you saved selectedSet = s;
    modeNormalBtn.addEventListener("click", () => {
    if (!selectedSet) return;
    window.location.href = `study.html?id=${encodeURIComponent(selectedSet.id || selectedSet._id)}&mode=normal`;
    });
    
    modePomodoroBtn?.addEventListener("click", () => {
      // Hide the 3-choice row; show the form
      modeButtonsRow?.classList.add("hidden");
      pomodoroForm?.classList.remove("hidden");
    });

    pomodoroStartBtn?.addEventListener("click", () => {
      if (!selectedSet) return;
      const id = encodeURIComponent(selectedSet.id || selectedSet._id);

      // read + validate times
      const work = Math.max(1, Math.min(180, parseInt(workMinutesInput?.value || "25", 10) || 25));
      const rest = Math.max(1, Math.min(120, parseInt(restMinutesInput?.value || "5", 10) || 5));

      window.location.href = `study.html?id=${id}&mode=pomodoro&work=${work}&rest=${rest}`;
    });

    pomodoroBackBtn?.addEventListener("click", () => {
      // Show the 3-choice row; hide the form
      pomodoroForm?.classList.add("hidden");
      modeButtonsRow?.classList.remove("hidden");
    });

    if (modeBackBtn) {
    modeBackBtn.addEventListener("click", () => closeModeModal());
    }


  // ---- small helpers (consistent color + id getter) ----
  
  const colorForIndex = (i) => {
    const hue = (i * 37) % 360;   // spread nicely around the wheel
    const sat = 70;
    const light = 78;             // pastel tone
    return `hsl(${hue} ${sat}% ${light}%)`;
  };

  const applyColor = (el, hsl) => {
    if (!el) return;
    el.style.backgroundColor = hsl;
    el.style.borderColor = hsl;
    el.style.color = "#000";
  };

  const getSetId = (s) => s?.id ?? s?._id ?? s?.slug ?? null;

  const refreshIcons = () => {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  };

  const setEmptyMessage = (msg) => {
    if (!listEl) return;
    // ensure a placeholder exists
    if (!emptyEl) {
      emptyEl = document.createElement("p");
      emptyEl.id = "allSetsEmpty";
      emptyEl.className = "empty-text";
      listEl.appendChild(emptyEl);
    }
    emptyEl.textContent = msg;
  };

  // ---- Recent button refresh after deletions ----
  const refreshRecent = (remainingSorted) => {
    if (!recentBtn) return;
    if (!remainingSorted.length) {
      recentBtn.textContent = "No recent set";
      recentBtn.disabled = true;
      return;
    }
    const latest = remainingSorted[0];
    const latestCount = Array.isArray(latest.cards) ? latest.cards.length : 0;
    recentBtn.textContent = `${latest.name || "Untitled"} | ${latestCount} ${latestCount === 1 ? "card" : "cards"}`;
    recentBtn.disabled = false;
    recentBtn.onclick = () => {
      openModeModal(latest);
    };
    applyColor(recentBtn, colorForIndex(0));
  };

  // ---- Render list with right-side trash buttons ----
  const renderAllSets = (sorted) => {
    if (!listEl) return;

    // clear placeholder + list content
    if (emptyEl && emptyEl.parentNode === listEl) {
      emptyEl.remove();
    }
    listEl.innerHTML = "";

    sorted.forEach((s, idx) => {
      const count = Array.isArray(s.cards) ? s.cards.length : 0;

      // wrapper so the trash can sit at the far right
      const row = document.createElement("div");
      row.className = "set-item"; // styled in styles.css

      // main clickable button
      const btn = document.createElement("button");
      btn.className = "set-btn";
      btn.textContent = `${s.name || "Untitled"} | ${count} ${count === 1 ? "card" : "cards"}`;
      applyColor(btn, colorForIndex(idx + 1)); // keep recent distinct as index 0
      btn.addEventListener("click", () => {
        openModeModal(s);
      });

      // right-side trash (with confirm)
      const trash = document.createElement("button");
      trash.className = "set-trash";
      trash.innerHTML = '<i data-lucide="trash-2" class="trash-icon"></i>';
      trash.addEventListener("click", async (e) => {
        e.stopPropagation();
        const name = s.name || "this set";
        const ok = confirm(`Are you sure you want to delete "${name}"?`);
        if (!ok) return;

        const id = getSetId(s);
        if (!id) {
          alert("Cannot delete: no set id found.");
          return;
        }

        try {
          const res = await fetch(`/api/sets/${encodeURIComponent(id)}`, { method: "DELETE" });
          if (!res.ok) {
            alert("Failed to delete set.");
            return;
          }

          // Remove from in-memory array and UI
          const idxInSorted = sorted.findIndex(x => getSetId(x) === id);
          if (idxInSorted >= 0) sorted.splice(idxInSorted, 1);

          row.remove();

          // If now empty, show placeholder
          if (!sorted.length) {
            setEmptyMessage("No sets yet");
          }

          // Update recent if we removed the latest
          refreshRecent(sorted);

          alert(`"${name}" deleted.`);
        } catch (err) {
          console.error(err);
          alert("Error deleting set.");
        }
      });

      row.appendChild(btn);
      row.appendChild(trash);
      listEl.appendChild(row);
    });

    refreshIcons();
  };

  // ---- Fetch and initial render ----
  try {
    const res = await fetch("/api/sets/mine", { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      if (recentBtn) {
        recentBtn.textContent = "No recent set";
        recentBtn.disabled = true;
      }
      setEmptyMessage("No sets yet");
      return;
    }

    const payload = await res.json();
    const sets = Array.isArray(payload?.sets) ? payload.sets
                : Array.isArray(payload)      ? payload
                : [];

    if (!sets.length) {
      if (recentBtn) {
        recentBtn.textContent = "No recent set";
        recentBtn.disabled = true;
      }
      setEmptyMessage("No sets yet");
      return;
    }

    // newest-first by createdAt
    const sorted = sets.slice().sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

    // Recent
    refreshRecent(sorted);

    // All sets
    renderAllSets(sorted);
  } catch (err) {
    console.error(err);
    if (recentBtn) {
      recentBtn.textContent = "No recent set";
      recentBtn.disabled = true;
    }
    setEmptyMessage("No sets yet");
  }

  // "+" button -> create set
  if (addSetBtn) {
    addSetBtn.addEventListener("click", () => {
      window.location.href = "create.html";
    });
  }

    // === PROFILE MENU LOGIC ===
  const profileBtn = document.querySelector(".profile-btn");
  const menu = document.getElementById("profileMenu");
  const logoutBtn = document.getElementById("logoutBtn");

  if (profileBtn && menu && logoutBtn) {
    // Toggle menu
    profileBtn.addEventListener("click", () => {
      menu.classList.toggle("hidden");
    });

    // Log out
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("token");
      sessionStorage.clear();
      window.location.href = "index.html";
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!profileBtn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.add("hidden");
      }
    });
  }
});
