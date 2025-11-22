document.addEventListener("DOMContentLoaded", async () => {
    // === PROFILE MENU LOGIC ===
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
        e.preventDefault();              // stop form submit / default behavior
        e.stopPropagation();

        // clear any auth-ish data
        localStorage.removeItem("token");
        sessionStorage.clear();

        // redirect to login page
        window.location.href = "index.html";
        });

        // Close menu when clicking outside
        document.addEventListener("click", (e) => {
        if (!profileBtn.contains(e.target) && !profileMenu.contains(e.target)) {
            profileMenu.classList.add("hidden");
        }
        });
    }
});