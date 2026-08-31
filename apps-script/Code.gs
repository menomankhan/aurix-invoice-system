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

// Run setupInvoiceTemplate() once (Apps Script editor → select it from the
// function dropdown → Run), then copy the Document ID it logs in here.
const INVOICE_TEMPLATE_DOC_ID = "PASTE_TEMPLATE_DOC_ID_HERE";
const SIGNED_INVOICES_FOLDER_NAME = "Aurix Signed Invoices";
const FRONTEND_BASE_URL = "https://menomankhan.github.io/aurix-invoice-system";

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
      case "grantResubmitSlot": result = handleGrantResubmitSlot(body); break;
      case "adminUpdateLineItem": result = handleAdminUpdateLineItem(body); break;
      case "adminDeleteLineItem": result = handleAdminDeleteLineItem(body); break;
      case "getTeamMembers": result = handleGetTeamMembers(body); break;
      case "updateTeamMember": result = handleUpdateTeamMember(body); break;
      case "generateAndSendInvoice": result = handleGenerateAndSendInvoice(body); break;
      case "getSignableInvoice": result = handleGetSignableInvoice(body); break;
      case "submitSignature": result = handleSubmitSignature(body); break;
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
    // A person gets exactly one submission per month; refuse the whole request
    // up front (before writing anything) if any month it touches is already
    // locked, rather than silently accepting a partial submission.
    const invoiceIdsTouched = [];
    const seenIds = {};
    lineItems.forEach(function (li) {
      const id = auth.username + "__" + li.month;
      if (!seenIds[id]) { seenIds[id] = true; invoiceIdsTouched.push(id); }
    });
    const existingInvoices = readRows("Invoices");
    for (let i = 0; i < invoiceIdsTouched.length; i++) {
      const existing = findRow(existingInvoices, "id", invoiceIdsTouched[i]);
      if (existing && isLocked(existing)) {
        throw new Error("You've already submitted for " + existing.month + ". Ask your admin to open another submission window.");
      }
    }

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

    const submissionNote = String(body.notes || "").trim();

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

      // Notes accumulate across submissions (timestamped) rather than overwrite,
      // so nothing said in an earlier note for this invoice is ever lost.
      let notes = existing ? String(existing.notes || "") : "";
      if (submissionNote) {
        const stamp = new Date().toLocaleString();
        notes = notes ? (notes + "\n\n[" + stamp + "] " + submissionNote) : ("[" + stamp + "] " + submissionNote);
      }

      upsertRow("Invoices", "id", {
        id: item.invoiceId,
        username: item.username,
        month: item.month,
        total: Math.round(total * 100) / 100,
        status: existing ? existing.status : "Submitted",
        notes: notes,
        locked: true, // consumes this month's one submission (or an admin-granted extra slot)
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
  return { invoices: buildInvoiceList(lineItems, invoiceRecords, {}, buildPdfUrlMap()) };
}

function handleAdminInvoices(body) {
  requireAdmin(body);
  const lineItems = readRows("LineItems");
  const invoiceRecords = readRows("Invoices");
  const users = readRows("Users");

  const fullNameByUsername = {};
  users.forEach(function (u) { fullNameByUsername[u.username] = u.fullName; });

  return { invoices: buildInvoiceList(lineItems, invoiceRecords, fullNameByUsername, buildPdfUrlMap()) };
}

// Latest signed PDF per invoice, so both My Invoices and Admin can show a
// "View Signed PDF" link once one exists.
function buildPdfUrlMap() {
  const map = {};
  readRows("Signatures").forEach(function (r) {
    if (r.invoiceId && r.status === "Signed" && r.pdfUrl) map[r.invoiceId] = r.pdfUrl;
  });
  return map;
}

// The full lifecycle is Submitted -> Approved -> Sent -> Signed -> Paid.
// This action only ever drives the two manual steps (Approve, Mark Paid) —
// Sent/Signed are set exclusively by handleGenerateAndSendInvoice and
// handleSubmitSignature, since those states mean something real actually
// happened (an email went out, a signature was captured), not just an
// admin's manual say-so.
function handleUpdateStatus(body) {
  requireAdmin(body);
  const invoiceId = body.invoiceId;
  const status = body.status;
  const allowed = ["Submitted", "Approved", "Paid"];
  if (!invoiceId || allowed.indexOf(status) === -1) throw new Error("Invalid invoiceId or status");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const current = findRow(readRows("Invoices"), "id", invoiceId);
    if (!current) throw new Error("Invoice not found");
    if (status === "Paid" && current.status !== "Signed") {
      throw new Error("This invoice must be signed before it can be marked Paid.");
    }
    updateFields("Invoices", "id", invoiceId, { status: status, updatedAt: new Date().toISOString() });
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// Users tab gains email/bank columns, editable only by the admin (team
// members never see or touch this themselves). Passwords are never
// touched by this pair of actions.
function handleGetTeamMembers(body) {
  requireAdmin(body);
  const users = readRows("Users");
  return {
    members: users.map(function (u) {
      return {
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        active: String(u.active).toUpperCase() === "TRUE",
        email: u.email || "",
        bankName: u.bankName || "",
        bankAccountTitle: u.bankAccountTitle || "",
        bankAccountNumber: u.bankAccountNumber || "",
      };
    }),
  };
}

function handleUpdateTeamMember(body) {
  requireAdmin(body);
  const username = String(body.username || "").trim();
  if (!username) throw new Error("Missing username");

  const updated = updateFields("Users", "username", username, {
    email: String(body.email || "").trim(),
    bankName: String(body.bankName || "").trim(),
    bankAccountTitle: String(body.bankAccountTitle || "").trim(),
    bankAccountNumber: String(body.bankAccountNumber || "").trim(),
  });
  if (!updated) throw new Error("User not found");
  return { success: true };
}

// Kicks off the sign-off flow: records a one-time sign token (separate from
// login JWTs — this one is the entire auth for the two public actions
// below) and emails the team member a link. The actual invoice document
// isn't built yet at this point — it's built fresh at the moment they sign,
// off whatever the live data says then, so an admin edit made after sending
// but before signing is never missed.
function handleGenerateAndSendInvoice(body) {
  requireAdmin(body);
  const invoiceId = body.invoiceId;
  if (!invoiceId) throw new Error("Missing invoiceId");

  const invoice = findRow(readRows("Invoices"), "id", invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  // Approved -> first send. Sent -> this is a resend (e.g. the first email
  // attempt failed after the status had already flipped, or they just want
  // to re-send the link) — both are valid entry points.
  if (invoice.status !== "Approved" && invoice.status !== "Sent") {
    throw new Error("Only an Approved (or already-Sent) invoice can be sent for signature");
  }

  const user = findRow(readRows("Users"), "username", invoice.username);
  if (!user || !user.email) throw new Error("This person has no email on file yet — add it in Manage Team first.");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Reuse the existing pending sign link on a resend instead of minting a
    // new one and orphaning whatever link might already be out there.
    const existingPending = readRows("Signatures").find(function (r) {
      return r.invoiceId === invoiceId && r.status === "Pending";
    });
    const signToken = existingPending ? existingPending.signToken : Utilities.getUuid();
    if (!existingPending) {
      appendRow("Signatures", {
        id: Utilities.getUuid(),
        invoiceId: invoiceId,
        username: invoice.username,
        signToken: signToken,
        status: "Pending",
        sentAt: new Date().toISOString(),
        signedAt: "",
        pdfUrl: "",
      });
    }

    const signUrl = FRONTEND_BASE_URL + "/sign.html?token=" + encodeURIComponent(signToken);
    const monthLabel = formatMonthLabel(invoice.month);

    // Send BEFORE flipping the status — if this throws, the invoice stays
    // exactly where it was so the admin can just click the button again,
    // instead of silently getting stuck saying "Sent" with nothing mailed.
    MailApp.sendEmail({
      to: user.email,
      subject: "Aurix — please review and sign your invoice for " + monthLabel,
      htmlBody:
        "<p>Hi " + escapeHtmlForEmail(user.fullName) + ",</p>" +
        "<p>Your invoice for <strong>" + escapeHtmlForEmail(monthLabel) + "</strong> has been approved. " +
        "Please review the line items and your bank details, then sign to confirm everything is correct:</p>" +
        "<p><a href=\"" + signUrl + "\">Review &amp; sign your invoice</a></p>" +
        "<p>If anything looks wrong, contact Noman directly before signing — don't sign an invoice you haven't checked.</p>" +
        "<p>— Aurix Productions</p>",
    });

    updateFields("Invoices", "id", invoiceId, { status: "Sent", updatedAt: new Date().toISOString() });

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// Public (no login) — the sign token itself is the only credential here,
// so treat it like a password: it's a random UUID, not guessable, and this
// action only ever reveals one specific person's own already-approved data.
function handleGetSignableInvoice(body) {
  const signToken = body.signToken;
  if (!signToken) throw new Error("Missing sign token");

  const sig = findRow(readRows("Signatures"), "signToken", signToken);
  if (!sig) throw new Error("This link isn't valid. Ask your admin to resend it.");
  if (String(sig.status) !== "Pending") throw new Error("This invoice has already been signed.");

  const invoice = findRow(readRows("Invoices"), "id", sig.invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  const user = findRow(readRows("Users"), "username", sig.username);

  const lineItems = readRows("LineItems")
    .filter(function (r) { return r.invoiceId === sig.invoiceId; })
    .map(function (r) {
      return {
        client: r.client, endClient: r.endClient, workType: r.workType, description: r.description,
        quantity: Number(r.quantity) || 0, rate: Number(r.rate) || 0, amount: Number(r.amount) || 0,
      };
    });

  return {
    fullName: user ? user.fullName : sig.username,
    month: formatMonthLabel(invoice.month),
    lineItems: lineItems,
    total: Number(invoice.total) || 0,
    bankName: (user && user.bankName) || "",
    bankAccountTitle: (user && user.bankAccountTitle) || "",
    bankAccountNumber: (user && user.bankAccountNumber) || "",
  };
}

// Public (no login) — builds the actual signed PDF at this moment (not at
// send time), embeds the drawn signature image, saves it privately to
// Drive (never public-link-shared, since it carries a bank account
// number), and marks both the Signatures row and the Invoice itself as
// Signed.
function handleSubmitSignature(body) {
  const signToken = body.signToken;
  const signatureImage = body.signatureImage;
  if (!signToken || !signatureImage) throw new Error("Missing token or signature");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sig = findRow(readRows("Signatures"), "signToken", signToken);
    if (!sig) throw new Error("This link isn't valid.");
    if (String(sig.status) !== "Pending") throw new Error("This invoice has already been signed.");

    const invoice = findRow(readRows("Invoices"), "id", sig.invoiceId);
    if (!invoice) throw new Error("Invoice not found.");
    const user = findRow(readRows("Users"), "username", sig.username);
    const lineItems = readRows("LineItems").filter(function (r) { return r.invoiceId === sig.invoiceId; });

    const pdfUrl = generateSignedInvoicePdf(invoice, user, lineItems, signatureImage);

    updateFields("Signatures", "signToken", signToken, {
      status: "Signed",
      signedAt: new Date().toISOString(),
      pdfUrl: pdfUrl,
    });
    updateFields("Invoices", "id", sig.invoiceId, { status: "Signed", updatedAt: new Date().toISOString() });

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function generateSignedInvoicePdf(invoice, user, lineItems, signatureImageDataUrl) {
  const fullName = user ? user.fullName : invoice.username;
  const monthLabel = formatMonthLabel(invoice.month);
  const total = Number(invoice.total) || 0;

  const templateFile = DriveApp.getFileById(INVOICE_TEMPLATE_DOC_ID);
  const copyFile = templateFile.makeCopy("Aurix Invoice — " + fullName + " — " + monthLabel);
  const doc = DocumentApp.openById(copyFile.getId());
  const docBody = doc.getBody();

  docBody.replaceText("{{fullName}}", fullName);
  docBody.replaceText("{{month}}", monthLabel);
  docBody.replaceText("{{invoiceId}}", invoice.id);
  docBody.replaceText("{{total}}", "Rs " + total.toLocaleString());
  docBody.replaceText("{{bankName}}", (user && user.bankName) || "—");
  docBody.replaceText("{{bankAccountTitle}}", (user && user.bankAccountTitle) || "—");
  docBody.replaceText("{{bankAccountNumber}}", (user && user.bankAccountNumber) || "—");
  docBody.replaceText("{{dateGenerated}}", Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy"));

  const tableData = [["Client", "End Client", "Work Type", "Description", "Qty", "Rate", "Amount"]];
  lineItems.forEach(function (li) {
    tableData.push([
      li.client, li.endClient || "—", li.workType, li.description || "—",
      String(li.quantity), "Rs " + (Number(li.rate) || 0).toLocaleString(), "Rs " + (Number(li.amount) || 0).toLocaleString(),
    ]);
  });
  insertAtPlaceholder(docBody, "{{LINE_ITEMS_TABLE}}", function (index) {
    docBody.insertTable(index, tableData);
  });

  const imageBytes = Utilities.base64Decode(String(signatureImageDataUrl).split(",").pop());
  const imageBlob = Utilities.newBlob(imageBytes, "image/png", "signature.png");
  insertAtPlaceholder(docBody, "{{SIGNATURE}}", function (index) {
    docBody.insertImage(index, imageBlob).setWidth(180).setHeight(70);
  });

  doc.saveAndClose();

  const pdfBlob = DriveApp.getFileById(copyFile.getId()).getAs(MimeType.PDF);
  const folder = getOrCreateSignedInvoicesFolder();
  const pdfFile = folder.createFile(pdfBlob).setName("Aurix Invoice — " + fullName + " — " + monthLabel + ".pdf");

  // The Doc copy was only scratch space to build the PDF from — discard it,
  // keep just the PDF as the permanent record.
  DriveApp.getFileById(copyFile.getId()).setTrashed(true);

  return pdfFile.getUrl();
}

function insertAtPlaceholder(docBody, placeholder, insertFn) {
  const found = docBody.findText(placeholder);
  if (!found) return;
  const element = found.getElement();
  const parent = element.getParent();
  const index = docBody.getChildIndex(parent);
  insertFn(index);
  parent.removeFromParent();
}

function getOrCreateSignedInvoicesFolder() {
  const existing = DriveApp.getFoldersByName(SIGNED_INVOICES_FOLDER_NAME);
  if (existing.hasNext()) return existing.next();
  return DriveApp.createFolder(SIGNED_INVOICES_FOLDER_NAME);
}

function formatMonthLabel(monthValue) {
  const parts = String(monthValue).split("-");
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMMM yyyy");
}

function escapeHtmlForEmail(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Run this ONCE from the Apps Script editor (select "setupInvoiceTemplate"
// from the function dropdown at the top, click Run) to build the invoice
// template Doc. Copy the Document ID it logs (View → Logs, or Ctrl/Cmd+Enter)
// into INVOICE_TEMPLATE_DOC_ID at the top of this file, then redeploy.
function setupInvoiceTemplate() {
  const doc = DocumentApp.create("Aurix Invoice Template");
  const body = doc.getBody();
  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(50).setMarginRight(50);

  const brandBlue = "#0745E0";
  const darkText = "#0D1B3E";

  body.appendParagraph("AURIX PRODUCTIONS").setFontSize(20).setBold(true).setForegroundColor(darkText);
  body.appendParagraph("Creating Systems that Sustain").setFontSize(9).setForegroundColor("#888888");
  body.appendParagraph("");
  body.appendParagraph("INVOICE").setFontSize(16).setBold(true).setForegroundColor(brandBlue);
  body.appendParagraph("Invoice ID: {{invoiceId}}").setFontSize(10);
  body.appendParagraph("Period: {{month}}").setFontSize(10);
  body.appendParagraph("Generated: {{dateGenerated}}").setFontSize(10);
  body.appendParagraph("");
  body.appendParagraph("Team Member: {{fullName}}").setFontSize(12).setBold(true);
  body.appendParagraph("");
  body.appendParagraph("{{LINE_ITEMS_TABLE}}").setFontSize(10);
  body.appendParagraph("");
  body.appendParagraph("Total Due: {{total}}").setFontSize(13).setBold(true).setForegroundColor(brandBlue);
  body.appendParagraph("");
  body.appendParagraph("Payment Details").setFontSize(12).setBold(true);
  body.appendParagraph("Bank Name: {{bankName}}").setFontSize(10);
  body.appendParagraph("Account Title: {{bankAccountTitle}}").setFontSize(10);
  body.appendParagraph("Account Number: {{bankAccountNumber}}").setFontSize(10);
  body.appendParagraph("");
  body.appendParagraph("By signing below, I confirm the amounts and payment details above are correct.").setFontSize(9).setItalic(true);
  body.appendParagraph("");
  body.appendParagraph("Signature:").setFontSize(10).setBold(true);
  body.appendParagraph("{{SIGNATURE}}").setFontSize(10);
  body.appendParagraph("Signed on: {{dateGenerated}}").setFontSize(9).setForegroundColor("#888888");

  doc.saveAndClose();
  Logger.log("Template created. Document ID: " + doc.getId());
  Logger.log("Copy this ID into INVOICE_TEMPLATE_DOC_ID at the top of Code.gs, then redeploy.");
  return doc.getId();
}

// Unlocks exactly one more submission for a person+month that's already
// locked (or that never existed, in which case there's nothing to unlock —
// their next submission is already free since no invoice exists yet). Submit
// re-locks it automatically the moment that slot gets used.
function handleGrantResubmitSlot(body) {
  requireAdmin(body);
  const username = String(body.username || "").trim();
  const month = String(body.month || "").trim();
  if (!username || !month) throw new Error("Missing username or month");

  const invoiceId = username + "__" + month;
  const updated = updateFields("Invoices", "id", invoiceId, { locked: false });
  if (!updated) throw new Error("That person hasn't submitted anything for that month yet — nothing to unlock.");
  return { success: true };
}

function handleAdminUpdateLineItem(body) {
  requireAdmin(body);
  const id = body.id;
  if (!id) throw new Error("Missing id");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const row = findRow(readRows("LineItems"), "id", id);
    if (!row) throw new Error("Line item not found");

    const quantity = Number(body.quantity);
    const rate = Number(body.rate);
    if (!(quantity >= 0) || !(rate >= 0)) throw new Error("Quantity and rate must be valid numbers");

    const client = String(body.client || "").trim();
    const workType = String(body.workType || "").trim();
    if (!client || !workType) throw new Error("Client and work type are required");

    updateFields("LineItems", "id", id, {
      client: client,
      endClient: String(body.endClient || "").trim(),
      workType: workType,
      description: String(body.description || "").trim(),
      quantity: quantity,
      rate: rate,
      amount: Math.round(quantity * rate * 100) / 100,
    });

    recomputeInvoiceTotal(row.invoiceId);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function handleAdminDeleteLineItem(body) {
  requireAdmin(body);
  const id = body.id;
  if (!id) throw new Error("Missing id");

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const row = findRow(readRows("LineItems"), "id", id);
    if (!row) throw new Error("Line item not found");

    deleteRowById("LineItems", id);
    recomputeInvoiceTotal(row.invoiceId);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function recomputeInvoiceTotal(invoiceId) {
  const total = readRows("LineItems")
    .filter(function (r) { return r.invoiceId === invoiceId; })
    .reduce(function (sum, r) { return sum + (Number(r.amount) || 0); }, 0);
  updateFields("Invoices", "id", invoiceId, { total: Math.round(total * 100) / 100, updatedAt: new Date().toISOString() });
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
  if (!deleteRowById("Clients", id)) throw new Error("Not found");
  return { success: true };
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
  if (!deleteRowById("WorkTypes", id)) throw new Error("Not found");
  return { success: true };
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

function buildInvoiceList(lineItems, invoiceRecords, fullNameByUsername, pdfUrlByInvoiceId) {
  const byId = {};
  invoiceRecords.forEach(function (r) { byId[r.id] = r; });

  const grouped = {};
  lineItems.forEach(function (r) {
    if (!r.invoiceId) return;
    if (!grouped[r.invoiceId]) grouped[r.invoiceId] = [];
    grouped[r.invoiceId].push({
      id: r.id, client: r.client, endClient: r.endClient, workType: r.workType, description: r.description,
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
      notes: rec ? String(rec.notes || "") : "",
      locked: rec ? isLocked(rec) : false,
      pdfUrl: (pdfUrlByInvoiceId && pdfUrlByInvoiceId[invoiceId]) || "",
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

// An Invoices row with no recorded `locked` value is an older row from
// before this feature existed — since it already has line items, that
// means a submission already happened, so it defaults to locked rather
// than silently letting a second submission through.
function isLocked(invoiceRow) {
  if (invoiceRow.locked === true) return true;
  if (invoiceRow.locked === false) return false;
  const s = String(invoiceRow.locked || "").toUpperCase();
  if (s === "FALSE") return false;
  return true;
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

function deleteRowById(sheetName, id) {
  const sheet = getSheet(sheetName);
  const headers = getHeaders(sheet);
  const idIdx = headers.indexOf("id");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(id)) {
      sheet.deleteRow(i + 1);
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
