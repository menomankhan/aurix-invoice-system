# Aurix Invoice System — Google Apps Script Setup Guide

This replaces the n8n-based backend with **Google Apps Script** — completely free (it's just a feature of your existing Google account, not a separate paid product), and the whole backend deploys as one script instead of building workflow diagrams by hand.

If you already imported the Google Sheet CSVs from before: good, nothing about the sheet's structure changed. **One thing did change** — the password hashing method, so the `Users` tab needs its `passwordHash` column refreshed. That's covered in Step 0.

---

## 0. Refresh the Users tab (only needed if you already imported the old CSV)

1. Open your **Aurix Invoices** Google Sheet.
2. Click the **Users** tab to select it.
3. **File → Import → Upload** → select `sheet-templates/Users.csv` from this project folder.
4. Under "Import location," choose **Replace current sheet**.
5. Click **Import data**.

Your team's usernames, temp passwords, and everything else are unchanged — only the (invisible to them) `passwordHash` values got refreshed to match the new backend.

If you haven't imported anything yet at all, just follow the original CSV-import steps for all three tabs (`Users.csv`, `LineItems.csv`, `Invoices.csv`) — same as before.

---

## 1. Open the Apps Script editor

1. In your **Aurix Invoices** Google Sheet, click **Extensions** in the menu bar → **Apps Script**.
2. A new tab opens — an empty code editor titled something like "Untitled project," with a file called `Code.gs` already open, containing a default `function myFunction() {}`.
3. Click inside that editor, select all the placeholder code (Ctrl/Cmd+A), and delete it.

## 2. Paste in the backend

1. Open [apps-script/Code.gs](apps-script/Code.gs) in this project folder — that's the entire backend, already fully written.
2. Copy its whole contents.
3. Paste it into the empty Apps Script editor (replacing what you deleted).
4. Near the top, find this line:
   ```js
   const JWT_SECRET = "PASTE_YOUR_JWT_SECRET_HERE";
   ```
   Open `credentials-DO-NOT-COMMIT.txt` in this project folder, copy the value after `JWT_SECRET=` on the first line, and paste it in place of `PASTE_YOUR_JWT_SECRET_HERE` (keep the quotes).
5. Click the **project name** at the top (default "Untitled project") and rename it to **Aurix Backend**.
6. Press **Ctrl/Cmd+S** (or the save icon) to save.

## 3. Deploy it as a Web App

1. Top right, click **Deploy → New deployment**.
2. Next to "Select type," click the gear icon ⚙️ and choose **Web app**.
3. Fill in:
   - **Description**: `Aurix backend v1` (anything, just a label for your reference)
   - **Execute as**: **Me** (your account) — this means the script always runs with your Google permissions, so users never need their own Google login to use it
   - **Who has access**: **Anyone**
4. Click **Deploy**.
5. Google will ask you to **authorize** the script the first time — click **Authorize access**, choose your Google account, and if you see a screen saying "Google hasn't verified this app," click **Advanced** → **Go to Aurix Backend (unsafe)** → **Allow**. This warning is normal for a private script only you deployed — it's not a red flag here, it's just what Google shows for any script that hasn't gone through their public-app review (which only matters for apps used by strangers).
6. After deploying, a **Web app URL** appears, ending in `/exec`. Click **Copy**.

## 4. Wire the URL into the frontend

1. Open [assets/config.js](assets/config.js) in this project.
2. Replace the placeholder with the URL you just copied:
   ```js
   window.AURIX_CONFIG = {
     APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycb.../exec",
     SESSION_KEY: "aurix_session",
   };
   ```

## 5. Test it

You can test locally before deploying anywhere:

1. Open `index.html` directly in your browser (double-click the file, or drag it into a browser tab).
2. Log in as `noman` with the temp password from `credentials-DO-NOT-COMMIT.txt`.
3. If it logs in and shows the app, the whole backend is working. If not, see Troubleshooting below.

---

## 6. Deploy the frontend to GitHub Pages

Unchanged from before:

1. Create a new **public** GitHub repository.
2. Push everything in this folder **except** `credentials-DO-NOT-COMMIT.txt` (already gitignored):
   ```bash
   git init
   git add .
   git commit -m "Aurix invoice system"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
3. In the repo's Settings → Pages, set Source to the `main` branch, root folder.
4. Your site is live at `https://<your-username>.github.io/<repo-name>/`.

## 7. Onboard the team

Send each person their username + temp password from `credentials-DO-NOT-COMMIT.txt` individually (not in a group chat).

For anyone new later, use [admin-tools/manage-users.html](admin-tools/manage-users.html) locally to generate their row, and paste it into the Users tab yourself — it's already updated to match this new backend.

---

## Updating the backend later

Whenever you edit `Code.gs` (say, to fix something), you need to **create a new deployment** for the change to take effect on the live URL:

1. In the Apps Script editor, make your change and save.
2. **Deploy → Manage deployments**.
3. Click the pencil (edit) icon on your existing deployment.
4. Under **Version**, choose **New version**.
5. Click **Deploy**.

The Web App URL stays the same — you don't need to update `config.js` again after the first time.

---

## Troubleshooting

**Login says "Could not reach the server"** → Double check `APPS_SCRIPT_URL` in `config.js` was pasted correctly and ends in `/exec` (not `/dev`). Also confirm the deployment's "Who has access" is set to **Anyone**, not "Only myself."

**Login says "Invalid username or password" even though you're sure it's right** → Make sure you did Step 0 (refreshed the Users tab with the new `Users.csv`) — old PBKDF2-based hashes won't match the new backend.

**"Authorization required" or a blank error** → The script needs to be authorized under your Google account once (Step 3.5). If you changed the script significantly, you may need to re-run a deployment and re-authorize.

**Changes to Code.gs don't seem to show up** → You need to create a **new version** under **Manage deployments** (see "Updating the backend later" above) — just saving the file isn't enough to update the live `/exec` URL.

**Someone sees data that isn't theirs** → This should never happen. Stop and check that `requireAuth`/`requireAdmin` in `Code.gs` weren't edited, and that every handler filters by `auth.username` before returning data. Treat this as urgent if it occurs.

---

## Update: Manage Clients and Work Types from the Admin view

Clients and work types used to be hardcoded in `assets/data.js` (needed a code change every time). They now both live in the Sheet, with Admin UI to manage them — no code changes ever needed for a new client or work type. Apply this before (or instead of) your first deployment:

1. **Add three tabs to your Google Sheet** (same pattern as before — **File → Import → Upload** → pick the file → **Insert new sheet** — repeat for each):
   - `sheet-templates/Clients.csv` — pre-filled with your existing 5 clients and Kratos's 3 end-clients.
   - `sheet-templates/WorkTypes.csv` — pre-filled with your existing 10 work types.
   - `sheet-templates/ClientWorkTypes.csv` — empty on purpose. Until you assign specific work types to a client, that client shows the full work type list by default, so nothing is blocked while you set this up gradually.
2. **Update the backend**: open **Extensions → Apps Script**, select all the existing code, delete it, and paste in the current [apps-script/Code.gs](apps-script/Code.gs) (your `JWT_SECRET` line needs the real value again — copy it from `credentials-DO-NOT-COMMIT.txt`).
3. **Deploy → Manage deployments** → pencil icon → **Version: New version** → **Deploy**.
4. Nothing else — the frontend already has both new Admin panels (collapsed by default — click **Show** on each).

**Manage Clients**: type a client name (and optionally an end-client under it), click **Add**. **Remove** deletes a single row — a client's "bare" row and its end-client rows are independent, so remove each one if you want a client fully gone.

**Manage Work Types**: the top section is your master list — add a new work type once, and it becomes available everywhere. The bottom section is per-client: pick a client from the dropdown, then check the exact work types that client actually does. A client with nothing checked keeps showing the full master list (the safe default) — checking anything switches that client to only those checked items, on the Submit form's Work Type dropdown, immediately.

---

## Update: Grouped submissions + Notes

The Submit form now works the way you'd expect for a real invoice: pick a client once, add as many lines as that client needs, then add another client if you have more — instead of repeating the client on every single row. There's also a Notes field at the bottom for anything that doesn't fit the form.

1. **Add a `notes` column to your existing `Invoices` tab**: open the sheet, click the first empty column's header cell in row 1, type `notes`. That's it — one new column header, no need to re-import anything. (If you haven't deployed at all yet, `sheet-templates/Invoices.csv` already includes it.)
2. **Update the backend**: same as always — paste the current [apps-script/Code.gs](apps-script/Code.gs) into the Apps Script editor (put your real `JWT_SECRET` back in), then **Deploy → Manage deployments → New version → Deploy**.
3. Nothing else — the new Submit form ships automatically with the frontend.

Notes accumulate across multiple submissions in the same month (each one timestamped) rather than overwriting each other, so nothing anyone writes is ever lost.

---

## Update: One submission per month + full admin editing

Now enforced: each person gets exactly one submission per month. Once they submit, trying to submit again for that month is refused with a clear message, until you open a one-time extra window for them from the Admin panel — which closes again automatically the moment they use it. You also now have full control to edit or delete any already-submitted line item.

1. **Add a `locked` column to your existing `Invoices` tab**: same as the `notes` column before — click the first empty column header in row 1, type `locked`. (Fresh setups already have it via `sheet-templates/Invoices.csv`.)
2. **Update the backend**: paste the current [apps-script/Code.gs](apps-script/Code.gs) into the Apps Script editor (real `JWT_SECRET` back in), then **Deploy → Manage deployments → New version → Deploy**.
3. Nothing else on the frontend side — it's already live once you push.

**What you'll see in Admin now:**
- Every invoice card shows either **🔒 Allow Resubmit** (they've used their one submission — click this to open exactly one more) or **🔓 Open** (they can still submit, either it's their first time this month or you just opened a slot for them).
- Every line item has **Edit** (turns that row into editable fields — client, end client, work type, description, qty, rate — with Save/Cancel) and **Delete** (asks to confirm, then removes it). Both instantly recalculate the invoice's total.

**Important nuance**: an existing invoice from before this update has no recorded lock state, so it defaults to **locked** the first time you see it (since it already has line items, meaning that person already submitted). If someone genuinely needs to add more for an old month, just click **Allow Resubmit** on it once.

---

## Update: Bank details, invoice generation, email, and signing

The full lifecycle is now **Submitted → Approved → Sent → Signed → Paid**. Once you approve an invoice, you can generate a proper invoice document, email it to that person, and they sign it (draw a signature) after reviewing the amounts and their bank details — only then can you mark it Paid. Every signed invoice is saved as a permanent PDF in your Drive.

This is the biggest update so far — more setup steps than usual, so follow them in order.

### 1. Add a new sheet tab

**File → Import → Upload** → `sheet-templates/Signatures.csv` → **Insert new sheet**. Leave it empty (headers only) — it fills up as invoices get signed.

### 2. Add 4 columns to your existing `Users` tab

Same pattern as `notes`/`locked` before — add these as new column headers in row 1: `email`, `bankName`, `bankAccountTitle`, `bankAccountNumber`. Leave the rows under them blank for now — you'll fill them in from the app itself in Step 6, not by typing into the sheet.

### 3. Update the backend code

Paste the current [apps-script/Code.gs](apps-script/Code.gs) into the Apps Script editor (real `JWT_SECRET` back in) and save — but **don't deploy yet**, do Step 4 first.

### 4. Build the invoice template (one-time, automatic)

You don't design this by hand — a function in the code builds it for you:

1. In the Apps Script editor, find the function dropdown at the top (next to Debug) — select **setupInvoiceTemplate**.
2. Click **Run** (▶️).
3. The first time, Google will ask you to authorize new permissions (this script now needs to touch Drive, Docs, and send email — that's expected, click through **Review permissions → your account → Advanced → Go to Aurix Backend (unsafe) → Allow**, same as the very first authorization you did).
4. Once it finishes, go to **View → Logs** (or press Ctrl/Cmd+Enter). You'll see a line like:
   ```
   Template created. Document ID: 1AbCdEfGhIjKlMnOpQrStUvWxYz...
   ```
   Copy that ID.
5. Back at the top of `Code.gs`, replace `PASTE_TEMPLATE_DOC_ID_HERE` with the ID you copied.
6. A new file called "Aurix Invoice Template" now exists in your Google Drive root — you can open it and adjust the wording/styling if you want (just don't remove or rename the `{{...}}` placeholder tags — those get filled in automatically).

### 5. Deploy

**Deploy → Manage deployments** → pencil icon → **New version** → **Deploy**.

### 6. Add everyone's email and bank details

In the app: **Admin → Manage Team → Show**. For each person, fill in their **Email**, **Bank Name**, **Account Title**, and **Account Number**, then click **Save** for that row. An email is required before you can send that person an invoice — everything else is optional but needed before they can actually get paid.

### 7. Try it once yourself before rolling it out

1. Get one of your own invoices to **Approved** status.
2. Click **Generate & Send for Signature** on it.
3. Check your email for the link, open it, review the amounts and bank details, draw a signature, click **Confirm & Sign**.
4. Back in Admin, that invoice should now show **Signed** with a **View Signed PDF** link, and a **Mark Paid** button.

**Where things live:**
- Signed PDFs are saved to a folder called **"Aurix Signed Invoices"** in your Drive — created automatically the first time someone signs. These are **private to your Drive account only**, never publicly shared (they contain bank account numbers), so the "View Signed PDF ↗" link in Admin only works when you're signed into the same Google account that owns the script.
- The sign-off page (`sign.html`) needs no login — the link itself, with its one-time token, is what grants access to that one specific invoice.
- Emails send via your own Google account's daily quota (Gmail accounts get a few hundred a day) — far more than a 10-person team will ever need in a day.

**A couple of deliberate design choices worth knowing:**
- The invoice document is built fresh at the moment someone signs, not when you click Send — so if you edit a line item after sending but before they've signed, they'll see the corrected numbers, not stale ones.
- You can't mark an invoice Paid until it's Signed — the backend enforces this even if something tries to skip a step.

---

## Update: USD line items with PKR conversion

Editors who bill in USD can now pick that per line item on the Submit form. The USD amount is converted to PKR using a rate you control from Admin — and that conversion is **locked in at the moment the line is submitted**, so changing the rate later never silently changes an already-submitted invoice's total.

### 1. Add a new sheet tab

**File → Import → Upload** → `sheet-templates/Settings.csv` → **Insert new sheet**. It comes with one seed row, `usdToPkrRate,280` — change `280` to today's real rate right away (you can also update it later from Admin, see Step 4).

### 2. Add 2 columns to your existing `LineItems` tab

Add these as new column headers in row 1: `currency`, `exchangeRate`. Leave existing rows blank under them — old line items are treated as PKR with a 1:1 rate automatically, nothing needs backfilling.

### 3. Update the backend code and redeploy

Paste the current [apps-script/Code.gs](apps-script/Code.gs) into the Apps Script editor (restore your real `JWT_SECRET` and `INVOICE_TEMPLATE_DOC_ID`), save, then **Deploy → Manage deployments** → pencil icon → **New version** → **Deploy**.

### 4. Set the real exchange rate

In the app: **Admin → Exchange Rate → Show**, enter the current 1 USD = ? PKR rate, click **Save**. You can come back and update this any time — it only affects lines submitted or added from that point forward.

**Where this shows up:**
- Submit form: each line now has a **Currency** field (PKR/USD) next to Rate. The Amount shown always updates live to the converted PKR figure as you type.
- My Invoices, Admin, the sign-off page, and the signed PDF all show the **Rate** column in whatever currency it was entered (e.g. `$50.00`), while **Amount** is always the PKR figure used for totals and payment.
- Admin's **+ Add Line** form (for adding a line item directly to someone's invoice) also has a Currency field, using the same locked-in-at-that-moment conversion.
