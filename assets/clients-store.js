/*
  Shared, cached access to the Clients list from the backend. Both the
  Submit form and the Admin "Manage Clients" panel read through this so
  they don't each make their own redundant fetch.
*/
window.AurixClientsStore = (function () {
  let cache = null;
  let pending = null;

  async function load(force) {
    if (cache && !force) return cache;
    if (pending && !force) return pending;

    pending = window.AurixApi.getClients().then((data) => {
      cache = { clients: data.clients || [], endClients: data.endClients || {}, rows: data.rows || [] };
      pending = null;
      return cache;
    }).catch((err) => {
      pending = null; // let the next call retry instead of staying stuck on one failure
      throw err;
    });
    return pending;
  }

  function get() {
    return cache || { clients: [], endClients: {}, rows: [] };
  }

  return { load, get };
})();
