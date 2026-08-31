/*
  Aurix Invoice System — backend
  -------------------------------
  This is a container-bound Apps Script: open it from inside the
  "Aurix Invoices" Google Sheet (Extensions > Apps Script), so
  SpreadsheetApp.getActiveSpreadsheet() always refers to that sheet with
  no separate connection/credential step needed.

  Before deploying, replace JWT_SECRET below with the real value from
  credentials-DO-NOT-COMMIT.txt in the project folder.
*/

const JWT_SECRET = "PASTE_YOUR_JWT_SECRET_HERE";
const SESSION_SECONDS = 60 * 60 * 12; // 12-hour login session

// ============================== HTTP entry points ==============================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("No request body");
    const body = JSON.parse(e.postData.contents);
    let result;
    switch (body.action) {
      case "login": result = handleLogin(body); break;
      case "submit": result = handleSubmit(body); break;
      case "myInvoices": result = handleMyInvoices(body); break;
      case "adminInvoices": result = handleAdminInvoices(body); break;
      case "updateStatus": result = handleUpdateStatus(body); break;
      case "getClients": result = handleGetClients(body); break;
      case "addClient": result = handleAddClient(body); break;
      case "deleteClientRow": result = handleDeleteClientRow(body); break;
      case "getWorkTypes": result = handleGetWorkTypes(body); break;
      case "addWorkType": result = handleAddWorkType(body); break;
      case "deleteWorkType": result = handleDeleteWorkType(body); break;
      case "assignClientWorkType": result = handleAssignClientWorkType(body); break;
      case "unassignClientWorkType": result = handleUnassignClientWorkType(body); break;
      default: throw new Error("Unknown action");
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ContentService's TextOutput has no .setHeaders() method — Apps Script Web
// Apps can't set custom response headers at all. A successful /exec response
// gets a permissive CORS allowance from Google's own front end automatically;
// this doOptions() only exists so a stray preflight gets a 200 instead of a
// script-error page (which would have no CORS allowance).
function doOptions() {
  return ContentService.createTextOutput("");
}

// Apps Script Web Apps can't return a custom HTTP status code either — every
// response is HTTP 200, and failure is signaled by an `error` field in the
// JSON body. assets/api.js on the frontend checks for that field, not status.
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================== Action handlers ==============================

function handleLogin(body) {
  const username = body.username;
  const password = body.password;
  if (!username || !password) throw new Error("Invalid username or password");

  const user = findRow(readRows("Users"), "username", username);
  if (!user) throw new Error("Invalid username or password");
  if (String(user.active).toUpperCase() !== "TRUE") throw new Error("Invalid username or password");

  const computed = hashPassword(password, String(user.passwordSalt));
  if (!constantTimeEqual(computed, String(user.passwordHash))) throw new Error("Invalid username or password");

  const token = signToken({ sub: user.username, name: user.fullName, role: user.role });
  return { token: token, user: { username: user.username, fullName: user.fullName, role: user.role } };
}

function handleSubmit(body) {
  const auth = requireAuth(body);
  const lineItems = body.lineItems || [];
  if (lineItems.length === 0) throw new Error("No line items submitted");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date().toISOString();
    const prepared = lineItems.map(function (li) {
      const quantity = Number(li.quantity) || 0;
      const rate = Number(li.rate) || 0;
      return {
        id: Utilities.getUuid(),
        invoiceId: auth.username + "__" + li.month,
        username: auth.username,
        month: li.month,
        client: li.client || "",
        endClient: li.endClient || "",
        workType: li.workType || "",
        description: li.description || "",
        quantity: quantity,
        rate: rate,
        amount: Math.round(quantity * rate * 100) / 100,
        submittedAt: now,
      };
    });

    prepared.forEach(function (item) { appendRow("LineItems", item); });

    // Recompute the total for every distinct invoice touched by this submission —
    // usually just one, but a submission can span months in one sitting.
    const seen = {};
    prepared.forEach(function (item) {
      if (seen[item.invoiceId]) return;
      seen[item.invoiceId] = true;

      const total = readRows("LineItems")
        .filter(function (r) { return r.invoiceId === item.invoiceId; })
        .reduce(function (sum, r) { return sum + (Number(r.amount) || 0); }, 0);

      const existing = findRow(readRows("Invoices"), "id", item.invoiceId);

      upsertRow("Invoices", "id", {
        id: item.invoiceId,
        username: item.username,
        month: item.month,
        total: Math.round(total * 100) / 100,
        status: existing ? existing.status : "Submitted",
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      });
    });

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function handleMyInvoices(body) {
  const auth = requireAuth(body);
  const lineItems = readRows("LineItems").filter(function (r) { return r.username === auth.username; });
  const invoiceRecords = readRows("Invoices").filter(function (r) { return r.username === auth.username; });
  return { invoices: buildInvoiceList(lineItems, invoiceRecords, {}) };
}

function handleAdminInvoices(body) {
  requireAdmin(body);
  const lineItems = readRows("LineItems");
  const invoiceRecords = readRows("Invoices");
  const users = readRows("Users");

  const fullNameByUsername = {};
  users.forEach(function (u) { fullNameByUsername[u.username] = u.fullName; });

  return { invoices: buildInvoiceList(lineItems, invoiceRecords, fullNameByUsername) };
}

function handleUpdateStatus(body) {
  requireAdmin(body);
  const invoiceId = body.invoiceId;
  const status = body.status;
  const allowed = ["Submitted", "Approved", "Paid"];
  if (!invoiceId || allowed.indexOf(status) === -1) throw new Error("Invalid invoiceId or status");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const updated = updateFields("Invoices", "id", invoiceId, { status: status, updatedAt: new Date().toISOString() });
    if (!updated) throw new Error("Invoice not found");
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// Clients tab: one row per client (endClient blank) registers the client
// itself; one row per (client, endClient) pair registers an end-client
// suggestion under that client. Any logged-in user can read this list (the
// Submit form needs it); only admins can add or remove rows.

function handleGetClients(body) {
  requireAuth(body);
  const rows = readRows("Clients");

  const clients = [];
  const seen = {};
  rows.forEach(function (r) {
    if (r.client && !seen[r.client]) { seen[r.client] = true; clients.push(r.client); }
  });

  const endClients = {};
  rows.forEach(function (r) {
    if (!r.client || !r.endClient) return;
    if (!endClients[r.client]) endClients[r.client] = [];
    endClients[r.client].push(r.endClient);
  });

  // `rows` carries the real per-row id so the Admin panel can delete an
  // exact row; `clients`/`endClients` stay grouped for the Submit form.
  return {
    clients: clients,
    endClients: endClients,
    rows: rows.map(function (r) { return { id: r.id, client: r.client, endClient: r.endClient || "" }; }),
  };
}

function handleAddClient(body) {
  requireAdmin(body);
  const client = String(body.client || "").trim();
  const endClient = String(body.endClient || "").trim();
  if (!client) throw new Error("Client name is required");

  appendRow("Clients", { id: Utilities.getUuid(), client: client, endClient: endClient });
  return { success: true };
}

function handleDeleteClientRow(body) {
  requireAdmin(body);
  const id = body.id;
  if (!id) throw new Error("Missing id");

  const sheet = getSheet("Clients");
  const headers = getHeaders(sheet);
  const idIdx = headers.indexOf("id");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  throw new Error("Not found");
}

// WorkTypes tab: the master list of every work type across the business.
// ClientWorkTypes tab: (client, workType) pairs — which of those apply to
// a given client. A client with zero pairs falls back to the full master
// list (so nothing is ever blocked just because it hasn't been customized
// yet), matching how End Client suggestions degrade to free text.

function handleGetWorkTypes(body) {
  requireAuth(body);
  const masterRows = readRows("WorkTypes").filter(function (r) { return r.workType; });
  const master = masterRows.map(function (r) { return r.workType; });

  const byClient = {};
  readRows("ClientWorkTypes").forEach(function (r) {
    if (!r.client || !r.workType) return;
    if (master.indexOf(r.workType) === -1) return; // ignore pairs left over from a deleted work type
    if (!byClient[r.client]) byClient[r.client] = [];
    byClient[r.client].push(r.workType);
  });

  // `rows` carries the real per-row id so the Admin panel can delete an
  // exact master work type; `workTypes`/`byClient` stay as plain strings
  // for the Submit form.
  return {
    workTypes: master,
    byClient: byClient,
    rows: masterRows.map(function (r) { return { id: r.id, workType: r.workType }; }),
  };
}

function handleAddWorkType(body) {
  requireAdmin(body);
  const workType = String(body.workType || "").trim();
  if (!workType) throw new Error("Work type name is required");

  const exists = readRows("WorkTypes").some(function (r) { return r.workType === workType; });
  if (exists) throw new Error("That work type already exists");

  appendRow("WorkTypes", { id: Utilities.getUuid(), workType: workType });
  return { success: true };
}

function handleDeleteWorkType(body) {
  requireAdmin(body);
  const id = body.id;
  if (!id) throw new Error("Missing id");

  const sheet = getSheet("WorkTypes");
  const headers = getHeaders(sheet);
  const idIdx = headers.indexOf("id");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  throw new Error("Not found");
}

function handleAssignClientWorkType(body) {
  requireAdmin(body);
  const client = String(body.client || "").trim();
  const workType = String(body.workType || "").trim();
  if (!client || !workType) throw new Error("Client and work type are required");

  const already = readRows("ClientWorkTypes").some(function (r) { return r.client === client && r.workType === workType; });
  if (already) return { success: true };

  appendRow("ClientWorkTypes", { id: Utilities.getUuid(), client: client, workType: workType });
  return { success: true };
}

function handleUnassignClientWorkType(body) {
  requireAdmin(body);
  const client = String(body.client || "").trim();
  const workType = String(body.workType || "").trim();

  const sheet = getSheet("ClientWorkTypes");
  const headers = getHeaders(sheet);
  const clientIdx = headers.indexOf("client");
  const workTypeIdx = headers.indexOf("workType");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][clientIdx]) === client && String(data[i][workTypeIdx]) === workType) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { success: true }; // idempotent either way — "not assigned" is a fine end state
}

// ============================== Shared helpers ==============================

function buildInvoiceList(lineItems, invoiceRecords, fullNameByUsername) {
  const byId = {};
  invoiceRecords.forEach(function (r) { byId[r.id] = r; });

  const grouped = {};
  lineItems.forEach(function (r) {
    if (!r.invoiceId) return;
    if (!grouped[r.invoiceId]) grouped[r.invoiceId] = [];
    grouped[r.invoiceId].push({
      client: r.client, endClient: r.endClient, workType: r.workType, description: r.description,
      quantity: Number(r.quantity) || 0, rate: Number(r.rate) || 0, amount: Number(r.amount) || 0,
    });
  });

  return Object.keys(grouped).map(function (invoiceId) {
    const rec = byId[invoiceId];
    const items = grouped[invoiceId];
    const username = rec ? rec.username : invoiceId.split("__")[0];
    const month = rec ? rec.month : invoiceId.split("__")[1];
    const entry = {
      invoiceId: invoiceId,
      username: username,
      month: month,
      lineItems: items,
      total: rec ? Number(rec.total) : items.reduce(function (s, li) { return s + li.amount; }, 0),
      status: rec ? rec.status : "Submitted",
    };
    if (fullNameByUsername && fullNameByUsername[username]) entry.fullName = fullNameByUsername[username];
    return entry;
  });
}

function requireAuth(body) {
  const payload = verifyToken(body.token);
  return { username: payload.sub, fullName: payload.name, role: payload.role };
}

function requireAdmin(body) {
  const auth = requireAuth(body);
  if (auth.role !== "admin") throw new Error("Admins only");
  return auth;
}

function findRow(rows, column, value) {
  return rows.find(function (r) { return String(r[column]) === String(value); });
}

// ============================== Sheet access ==============================
// Every write forces the cells to Plain Text format first — otherwise Sheets'
// automatic type detection can silently reinterpret a value like "2026-08" as
// an actual date, corrupting month-based grouping. Reads always run Number()
// on numeric-looking fields, so this is safe either way.

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("Sheet not found: " + name);
  return sheet;
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function readRows(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = {};
    headers.forEach(function (h, idx) { row[h] = values[i][idx]; });
    rows.push(row);
  }
  return rows;
}

function rowValuesFor(headers, obj) {
  return headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ""; });
}

function appendRow(sheetName, obj) {
  const sheet = getSheet(sheetName);
  const headers = getHeaders(sheet);
  const rowNum = sheet.getLastRow() + 1;
  const range = sheet.getRange(rowNum, 1, 1, headers.length);
  range.setNumberFormat("@");
  range.setValues([rowValuesFor(headers, obj)]);
}

function upsertRow(sheetName, matchColumn, obj) {
  const sheet = getSheet(sheetName);
  const headers = getHeaders(sheet);
  const matchIdx = headers.indexOf(matchColumn);
  const data = sheet.getDataRange().getValues();

  let foundRowNum = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][matchIdx]) === String(obj[matchColumn])) { foundRowNum = i + 1; break; }
  }

  const rowNum = foundRowNum === -1 ? sheet.getLastRow() + 1 : foundRowNum;
  const range = sheet.getRange(rowNum, 1, 1, headers.length);
  range.setNumberFormat("@");
  range.setValues([rowValuesFor(headers, obj)]);
}

function updateFields(sheetName, matchColumn, matchValue, fields) {
  const sheet = getSheet(sheetName);
  const headers = getHeaders(sheet);
  const matchIdx = headers.indexOf(matchColumn);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][matchIdx]) === String(matchValue)) {
      Object.keys(fields).forEach(function (key) {
        const idx = headers.indexOf(key);
        if (idx === -1) return;
        const cell = sheet.getRange(i + 1, idx + 1);
        cell.setNumberFormat("@");
        cell.setValue(fields[key]);
      });
      return true;
    }
  }
  return false;
}

// ============================== Crypto ==============================
// HMAC-SHA512 (single round, salted) for password storage — Apps Script has
// no built-in PBKDF2, and a hand-rolled iterative version isn't something
// that can be test-executed before shipping, so this deliberately simpler,
// verifiable primitive was chosen instead. A hand-crafted HS256 JWT is used
// for session tokens, built the same way on every request.

function bytesToHex(bytes) {
  return bytes.map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"); }).join("");
}

function hashPassword(password, salt) {
  const sig = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_512, password, salt);
  return bytesToHex(sig);
}

function base64urlFromString(str) {
  return Utilities.base64EncodeWebSafe(str, Utilities.Charset.UTF_8).replace(/=+$/, "");
}

function base64urlFromBytes(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

function base64urlDecodeToString(str) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(str)).getDataAsString("UTF-8");
}

function signToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = Object.assign({}, payload, { iat: now, exp: now + SESSION_SECONDS });

  const headerB64 = base64urlFromString(JSON.stringify(header));
  const payloadB64 = base64urlFromString(JSON.stringify(fullPayload));
  const signingInput = headerB64 + "." + payloadB64;

  const sigBytes = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, signingInput, JWT_SECRET);
  return signingInput + "." + base64urlFromBytes(sigBytes);
}

function verifyToken(token) {
  if (!token) throw new Error("Missing token");
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [headerB64, payloadB64, sig] = parts;

  const signingInput = headerB64 + "." + payloadB64;
  const expectedSigBytes = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, signingInput, JWT_SECRET);
  const expectedSig = base64urlFromBytes(expectedSigBytes);
  if (!constantTimeEqual(sig, expectedSig)) throw new Error("Invalid token");

  const payload = JSON.parse(base64urlDecodeToString(payloadB64));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Session expired");
  return payload;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
