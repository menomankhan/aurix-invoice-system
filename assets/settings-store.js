/*
  Shared, cached access to system settings (currently just the USD->PKR
  exchange rate) — mirrors clients-store.js. Submit and Admin's "Add Line"
  form both need the live rate for an accurate running total as someone
  types; invalidate() is called after Admin saves a new rate so the next
  read picks it up instead of serving a stale cache.
*/
window.AurixSettingsStore = (function () {
  let cache = null;
  let pending = null;

  async function load(force) {
    if (cache && !force) return cache;
    if (pending && !force) return pending;

    pending = window.AurixApi.getSettings().then((data) => {
      cache = { usdToPkrRate: Number(data.usdToPkrRate) || 1 };
      pending = null;
      return cache;
    }).catch((err) => {
      pending = null;
      throw err;
    });
    return pending;
  }

  function get() {
    return cache || { usdToPkrRate: 1 };
  }

  function invalidate() {
    cache = null;
  }

  return { load, get, invalidate };
})();
