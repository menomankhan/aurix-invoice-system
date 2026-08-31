/*
  Static dropdown data for the submission form.
  Edit this file any time you add a client, end client, or work type —
  no backend change needed, it's just used to render the form.
*/
window.AURIX_DATA = {
  CLIENTS: [
    "Rachad — Kratos Marketing",
    "Bypith",
    "Freedom Accelerator",
    "Podcutz",
    "Noman Akram",
  ],

  // End-client suggestions per client. Anything not listed here just gets
  // a free-text field with no suggestions — add more arrays as you learn
  // the end-client names for those accounts.
  END_CLIENTS: {
    "Rachad — Kratos Marketing": ["Pranav", "OB Lux Properties", "Mohamed Essmat"],
  },

  WORK_TYPES: [
    "Clipping — English",
    "Clipping + Captions — Arabic",
    "Thumbnail",
    "Editing",
    "Hook",
    "Bridge",
    "Body",
    "Long-Form",
    "Fixed Monthly Pay",
    "Other",
  ],

  STATUSES: ["Submitted", "Approved", "Paid"],
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
