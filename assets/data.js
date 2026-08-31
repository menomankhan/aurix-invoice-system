/*
  Static dropdown data for the submission form.
  Clients/end-clients and work types are NOT here anymore — the admin
  manages both from the Admin view (see assets/clients-store.js and
  assets/work-types-store.js).
*/
window.AURIX_DATA = {
  // Full lifecycle: Submitted -> Approved -> Sent -> Signed -> Paid.
  STATUSES: ["Submitted", "Approved", "Sent", "Signed", "Paid"],
};

// Returns "2026-08" for the current month (used as the default selection
// and as the key the backend groups invoices by).
window.AURIX_DATA.currentMonthValue = function () {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Turns "2026-08" into "August 2026" for display.
window.AURIX_DATA.formatMonth = function (value) {
  if (!value) return "";
  const [y, m] = value.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

// Builds the last N months (including current) as { value, label } pairs
// for the month dropdown.
window.AURIX_DATA.monthOptions = function (count = 12) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value, label: window.AURIX_DATA.formatMonth(value) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
};
