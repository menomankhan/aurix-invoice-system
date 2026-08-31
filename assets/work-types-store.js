/*
  Shared, cached access to the Work Types list from the backend — mirrors
  clients-store.js. `byClient[client]` is only the work types customized
  for that client; the Submit form falls back to the full `workTypes`
  master list for any client that hasn't been customized yet.
*/
window.AurixWorkTypesStore = (function () {
  let cache = null;
  let pending = null;

  async function load(force) {
    if (cache && !force) return cache;
    if (pending && !force) return pending;

    pending = window.AurixApi.getWorkTypes().then((data) => {
      cache = { workTypes: data.workTypes || [], byClient: data.byClient || {}, rows: data.rows || [] };
      pending = null;
      return cache;
    }).catch((err) => {
      pending = null;
      throw err;
    });
    return pending;
  }

  function get() {
    return cache || { workTypes: [], byClient: {}, rows: [] };
  }

  function forClient(client) {
    const { workTypes, byClient } = get();
    const specific = byClient[client];
    return specific && specific.length > 0 ? specific : workTypes;
  }

  return { load, get, forClient };
})();
