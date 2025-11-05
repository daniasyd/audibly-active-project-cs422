// create.js
document.addEventListener("DOMContentLoaded", () => {
  const addBtn = document.getElementById("addCardBtn");
  const list = document.getElementById("qaList");
  const tpl = document.getElementById("qaTemplate");
  const finishBtn = document.querySelector(".finish-btn");
  const setNameEl = document.getElementById("setName");

  // Add new card
  addBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (!tpl || !list) return;

    const node = tpl.content.firstElementChild.cloneNode(true);

    node.querySelectorAll(".qa-input").forEach(inp => (inp.value = ""));
    list.appendChild(node);

    // render icons for new trash button
    if (window.lucide?.createIcons) lucide.createIcons();

    // focus new question
    const firstInput = node.querySelector(".qa-input");
    if (firstInput) firstInput.focus();

    node.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Delete card (event delegation)
  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".delete-btn");
    if (!btn) return;
    const row = btn.closest(".qa-row");
    if (row) row.remove();
  });

  // Finish: save set then go to finishSet.html
  finishBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const name = (setNameEl?.value || "").trim();
    if (!name) {
      alert("Please enter a name for your set.");
      setNameEl?.focus();
      return;
    }

    // collect all QA rows
    const rows = Array.from(list.querySelectorAll(".qa-row"));
    const cards = rows.map(row => {
      const inputs = row.querySelectorAll(".qa-input");
      const q = (inputs[0]?.value || "").trim();
      const a = (inputs[1]?.value || "").trim();
      return { q, a };
    });

    try {
      const res = await fetch("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cards })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.message || "Could not save set.");
        return;
      }

      // save set name for finish screen
      sessionStorage.setItem("lastSetName", name);
      window.location.href = "finishSet.html";
    } catch (err) {
      alert("Network error. Is the server running?");
    }
  });
});
