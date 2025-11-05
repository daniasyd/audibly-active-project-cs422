// finishSet.js
document.addEventListener("DOMContentLoaded", () => {
  const name = sessionStorage.getItem("lastSetName") || "Untitled";
  const el = document.getElementById("finishSubtext");
  if (el) {
    el.innerHTML = `Set <strong>${name}</strong> is now finished. Wanna try it out?`;
  }
});
