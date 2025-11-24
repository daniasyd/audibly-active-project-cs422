// create.js
document.addEventListener("DOMContentLoaded", async () => {
  const addBtn = document.getElementById("addCardBtn");
  const list = document.getElementById("qaList");
  const tpl = document.getElementById("qaTemplate");
  const finishBtn = document.querySelector(".finish-btn");
  const setNameEl = document.getElementById("setName");
  const setDescEl = document.getElementById("setDesc");
  const pageTitle = document.querySelector(".create-title"); 

  // 1. CHECK THE URL FOR AN ID
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get("edit");
  const isEditMode = !!editId;

  // Helper: Add a row to the screen (with optional text)
  function addRow(qText = "", aText = "") {
    if (!tpl || !list) return;
    const node = tpl.content.firstElementChild.cloneNode(true);
    
    // Find inputs and fill them if we have text
    const inputs = node.querySelectorAll(".qa-input");
    if (inputs[0]) inputs[0].value = qText;
    if (inputs[1]) inputs[1].value = aText;

    list.appendChild(node);
    
    // Refresh icons for the trash button
    if (window.lucide?.createIcons) lucide.createIcons();
  }

  // 2. IF EDIT MODE: FETCH DATA AND FILL INPUTS
  if (isEditMode) {
    if (pageTitle) pageTitle.textContent = "Edit Set";
    finishBtn.textContent = "Save Changes";

    try {
      const res = await fetch("/api/sets/mine");
      const data = await res.json();
      const targetSet = (data.sets || []).find(s => String(s.id) === String(editId));

      if (targetSet) {
        setNameEl.value = targetSet.name || "";
        if (setDescEl) setDescEl.value = targetSet.description || "";

        list.innerHTML = ""; // Clear default

        if (targetSet.cards && targetSet.cards.length > 0) {
          targetSet.cards.forEach(card => addRow(card.q, card.a));
        } else {
          addRow();
        }
      } else {
        alert("Set not found.");
      }
    } catch (err) {
      console.error("Error loading set:", err);
      alert("Could not load set data.");
    }
  } else {
    // NOT EDIT MODE: Just add one empty row to start
    addRow();
  }

  // --- Event Listeners ---

  addBtn.addEventListener("click", (e) => {
    e.preventDefault();
    addRow();
    list.lastElementChild.scrollIntoView({ behavior: "smooth" });
  });

  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".delete-btn");
    if (btn) btn.closest(".qa-row")?.remove();
  });

  // === SAVE / FINISH LOGIC ===
  finishBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const name = (setNameEl?.value || "").trim();
    const description = (setDescEl?.value || "").trim();

    if (!name) {
      alert("Please enter a name for your set.");
      setNameEl?.focus();
      return;
    }

    // Scrape all the rows from the screen
    const rows = Array.from(list.querySelectorAll(".qa-row"));
    const cards = rows.map(row => {
      const inputs = row.querySelectorAll(".qa-input");
      return { 
        q: (inputs[0]?.value || "").trim(), 
        a: (inputs[1]?.value || "").trim() 
      };
    }).filter(c => c.q || c.a); // Remove completely empty rows

    // === NEW CHECK: STOP IF NO CARDS ===
    if (cards.length === 0) {
      alert("Please add at least one flashcard before saving.");
      return; 
    }
    // ==================================

    // Decide URL and Method based on mode
    let url = "/api/sets";
    let method = "POST";

    if (isEditMode) {
      url = `/api/sets/${editId}`;
      method = "PUT"; 
    }

    try {
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, cards })
      });
      
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.message || "Error saving set.");
        return;
      }

      sessionStorage.setItem("lastSetName", name);
      window.location.href = "finishSet.html";
    } catch (err) {
      console.error(err);
      alert("Network error.");
    }
  });
});