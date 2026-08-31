/*
  App shell: auth guard, nav rendering, view switching.
  The Submit / My Invoices / Admin logic each live in their own file
  (submit.js, my-invoices.js, admin.js) and hook into window.AurixViews.
*/
window.AurixSession = window.AurixAuth.requireAuth();

if (window.AurixSession) {
  const { user } = window.AurixSession;

  document.getElementById("navUserName").textContent = user.fullName || user.username;
  document.getElementById("navUserRole").textContent = user.role === "admin" ? "Admin" : "Team Member";

  if (user.role === "admin") {
    document.querySelectorAll("[data-admin-only]").forEach((el) => el.classList.remove("hidden"));
  }

  document.getElementById("logoutBtn").addEventListener("click", () => {
    window.AurixAuth.logout();
  });

  window.AurixViews = {
    current: null,
    show(name) {
      if (name === "admin" && user.role !== "admin") name = "submit";
      this.current = name;

      document.querySelectorAll(".view").forEach((el) => el.classList.add("hidden"));
      const target = document.getElementById(`view-${name}`);
      if (target) target.classList.remove("hidden");

      document.querySelectorAll("[data-view]").forEach((el) => {
        el.classList.toggle("active", el.dataset.view === name);
      });

      window.location.hash = name;

      if (name === "my-invoices" && window.AurixMyInvoices) window.AurixMyInvoices.load();
      if (name === "admin" && window.AurixAdmin) window.AurixAdmin.load();
    },
  };

  document.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      window.AurixViews.show(el.dataset.view);
    });
  });

  const initialView = (window.location.hash || "#submit").replace("#", "");
  window.AurixViews.show(initialView || "submit");
}
