(function () {
  // Already logged in? skip straight to the app.
  if (window.AurixAuth.isLoggedIn()) {
    window.location.href = "app.html";
    return;
  }

  const form = document.getElementById("loginForm");
  const errorEl = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");
  const btnText = document.getElementById("loginBtnText");
  const spinner = document.getElementById("loginSpinner");

  function setLoading(loading) {
    btn.disabled = loading;
    btnText.classList.toggle("hidden", loading);
    spinner.classList.toggle("hidden", !loading);
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    if (!username || !password) return;

    setLoading(true);
    try {
      const data = await window.AurixApi.login(username, password);
      if (!data || !data.token || !data.user) {
        throw new Error("Unexpected response from the server.");
      }
      window.AurixAuth.save({ token: data.token, user: data.user });
      window.location.href = "app.html";
    } catch (err) {
      showError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  });
})();
