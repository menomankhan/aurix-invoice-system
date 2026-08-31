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
