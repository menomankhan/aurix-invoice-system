/*
  Single Apps Script endpoint, dispatched by an `action` field in the JSON
  body. Deliberately sends NO custom headers (Authorization, Content-Type)
  so the browser treats this as a "simple request" and skips the CORS
  preflight — Apps Script Web Apps can't reliably answer that preflight.
  The session token travels inside the JSON body instead of a header.

  Apps Script also can't return a custom HTTP status code, so failure is
  always signaled by an `error` field in the (still HTTP 200) response body.
*/
window.AurixApi = (function () {
  const { APPS_SCRIPT_URL } = window.AURIX_CONFIG;

  async function call(action, payload) {
    const session = window.AurixAuth.get();
    const body = Object.assign(
      { action: action, token: session ? session.token : undefined },
      payload || {}
    );

    let res;
    try {
      res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error("Could not reach the server. Check your connection and try again.");
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error("Unexpected response from the server.");
    }

    if (data && data.error) {
      if (/session|token/i.test(data.error)) window.AurixAuth.clear();
      throw new Error(data.error);
    }

    return data;
  }

  return {
    login(username, password) {
      return call("login", { username, password });
    },
    submitLineItems(lineItems, notes) {
      return call("submit", { lineItems, notes });
    },
    getMyInvoices() {
      return call("myInvoices", {});
    },
    getAdminInvoices() {
      return call("adminInvoices", {});
    },
    updateInvoiceStatus(invoiceId, status) {
      return call("updateStatus", { invoiceId, status });
    },
    getClients() {
      return call("getClients", {});
    },
    addClient(client, endClient) {
      return call("addClient", { client, endClient });
    },
    deleteClientRow(id) {
      return call("deleteClientRow", { id });
    },
    getWorkTypes() {
      return call("getWorkTypes", {});
    },
    addWorkType(workType) {
      return call("addWorkType", { workType });
    },
    deleteWorkType(id) {
      return call("deleteWorkType", { id });
    },
    assignClientWorkType(client, workType) {
      return call("assignClientWorkType", { client, workType });
    },
    unassignClientWorkType(client, workType) {
      return call("unassignClientWorkType", { client, workType });
    },
    grantResubmitSlot(username, month) {
      return call("grantResubmitSlot", { username, month });
    },
    adminUpdateLineItem(fields) {
      return call("adminUpdateLineItem", fields);
    },
    adminDeleteLineItem(id) {
      return call("adminDeleteLineItem", { id });
    },
    adminAddLineItem(fields) {
      return call("adminAddLineItem", fields);
    },
    adminDeleteInvoice(invoiceId) {
      return call("adminDeleteInvoice", { invoiceId });
    },
    getTeamMembers() {
      return call("getTeamMembers", {});
    },
    updateTeamMember(fields) {
      return call("updateTeamMember", fields);
    },
    generateAndSendInvoice(invoiceId) {
      return call("generateAndSendInvoice", { invoiceId });
    },
  };
})();
