(function () {
  if (!window.AurixSession || window.AurixSession.user.role !== "admin") return;

  const listEl = document.getElementById("adminInvoicesList");
  const emptyEl = document.getElementById("adminEmpty");
  const loadingEl = document.getElementById("adminLoading");
  const errorEl = document.getElementById("adminError");
  const grandTotalEl = document.getElementById("adminGrandTotal");
  const countEl = document.getElementById("adminInvoiceCount");

  const filterPerson = document.getElementById("filterPerson");
  const filterMonth = document.getElementById("filterMonth");
  const filterClient = document.getElementById("filterClient");
  const filterStatus = document.getElementById("filterStatus");

  const toggleManageClientsBtn = document.getElementById("toggleManageClients");
  const manageClientsBody = document.getElementById("manageClientsBody");
  const newClientNameInput = document.getElementById("newClientName");
  const newEndClientNameInput = document.getElementById("newEndClientName");
  const addClientBtn = document.getElementById("addClientBtn");
  const manageClientsErrorEl = document.getElementById("manageClientsError");
  const clientsTableEl = document.getElementById("clientsTable");
  const clientsEmptyEl = document.getElementById("clientsEmpty");

  const toggleManageWorkTypesBtn = document.getElementById("toggleManageWorkTypes");
  const manageWorkTypesBody = document.getElementById("manageWorkTypesBody");
  const newWorkTypeNameInput = document.getElementById("newWorkTypeName");
  const addWorkTypeBtn = document.getElementById("addWorkTypeBtn");
  const manageWorkTypesErrorEl = document.getElementById("manageWorkTypesError");
  const workTypesListEl = document.getElementById("workTypesList");
  const workTypesEmptyEl = document.getElementById("workTypesEmpty");
  const workTypeClientSelect = document.getElementById("workTypeClientSelect");
  const workTypeAssignmentsEl = document.getElementById("workTypeAssignments");

  const toggleManageTeamBtn = document.getElementById("toggleManageTeam");
  const manageTeamBody = document.getElementById("manageTeamBody");
  const manageTeamErrorEl = document.getElementById("manageTeamError");
  const teamMembersListEl = document.getElementById("teamMembersList");

  const toggleExchangeRateBtn = document.getElementById("toggleExchangeRate");
  const exchangeRateBody = document.getElementById("exchangeRateBody");
  const usdToPkrRateInput = document.getElementById("usdToPkrRateInput");
  const saveExchangeRateBtn = document.getElementById("saveExchangeRateBtn");
  const exchangeRateSavedNote = document.getElementById("exchangeRateSavedNote");
  const exchangeRateErrorEl = document.getElementById("exchangeRateError");

  const { formatMonth } = window.AURIX_DATA;

  let allInvoices = [];
  let activeTab = "new"; // "new" = everything before Paid; "paid" = the archive

  function currency(n) {
    return "Rs " + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // The Rate column shows what was actually entered, in whatever currency it
  // was entered in; the Amount column is always the converted PKR figure.
  function formatRate(li) {
    return li.currency === "USD" ? "$" + (Number(li.rate) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : currency(li.rate);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
  }

  function statusBadge(status) {
    const classes = {
      Paid: "aurix-badge-paid",
      Signed: "aurix-badge-signed",
      Sent: "aurix-badge-sent",
      Approved: "aurix-badge-approved",
    };
    return `<span class="aurix-badge ${classes[status] || "aurix-badge-submitted"}">${status}</span>`;
  }

  // Exactly one action per stage — Submitted -> Approved -> Sent -> Signed -> Paid.
  function renderInvoiceActions(inv) {
    if (inv.status === "Submitted") {
      return `<button data-action="Approved" class="statusBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-aurixblue hover:bg-aurixblue/10 transition">Approve</button>`;
    }
    if (inv.status === "Approved") {
      return `<button class="generateSendBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-aurixblue hover:bg-aurixblue/10 transition">Generate &amp; Send for Signature</button>`;
    }
    if (inv.status === "Sent") {
      return `
        <span class="text-white/30 text-xs italic">Waiting for signature…</span>
        <button class="generateSendBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-aurixblue hover:bg-aurixblue/10 transition">Resend Email</button>
      `;
    }
    if (inv.status === "Signed") {
      return `<button data-action="Paid" class="statusBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-green-500 hover:bg-green-500/10 transition">Mark Paid</button>`;
    }
    return ""; // Paid — nothing left to do
  }

  function populateFilters() {
    const people = [...new Map(allInvoices.map((i) => [i.username, i.fullName || i.username])).entries()];
    people.sort((a, b) => a[1].localeCompare(b[1]));
    filterPerson.innerHTML = `<option value="">All People</option>` +
      people.map(([username, name]) => `<option value="${escapeHtml(username)}">${escapeHtml(name)}</option>`).join("");

    const months = [...new Set(allInvoices.map((i) => i.month))].sort().reverse();
    filterMonth.innerHTML = `<option value="">All Months</option>` +
      months.map((m) => `<option value="${m}">${formatMonth(m)}</option>`).join("");

    const clients = new Set();
    allInvoices.forEach((i) => i.lineItems.forEach((li) => clients.add(li.client)));
    filterClient.innerHTML = `<option value="">All Clients</option>` +
      [...clients].sort().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  function renderLineItemsTable(lineItems) {
    const rows = lineItems.map((li) => `
      <tr class="border-t border-white/5" data-line-id="${escapeHtml(li.id)}">
        <td class="py-2.5 pr-4 text-white/70">${escapeHtml(li.client)}</td>
        <td class="py-2.5 pr-4 text-white/70">${escapeHtml(li.endClient || "—")}</td>
        <td class="py-2.5 pr-4 text-white/70">${escapeHtml(li.workType)}</td>
        <td class="py-2.5 pr-4 text-white/50">${escapeHtml(li.description || "—")}</td>
        <td class="py-2.5 pr-4 text-right text-white/70">${li.quantity}</td>
        <td class="py-2.5 pr-4 text-right text-white/70">${formatRate(li)}</td>
        <td class="py-2.5 pr-4 text-right font-semibold text-white">${currency(li.amount)}</td>
        <td class="py-2.5 pl-2 text-right whitespace-nowrap">
          <button class="editLineItemBtn text-white/30 hover:text-white transition text-xs font-bold mr-2">Edit</button>
          <button class="deleteLineItemBtn text-white/30 hover:text-red-400 transition text-xs font-bold">Delete</button>
        </td>
      </tr>
    `).join("");

    return `
      <div class="overflow-x-auto mt-4">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-white/30 text-[11px] uppercase tracking-widest">
              <th class="pb-2 pr-4 font-bold">Client</th>
              <th class="pb-2 pr-4 font-bold">End Client</th>
              <th class="pb-2 pr-4 font-bold">Work Type</th>
              <th class="pb-2 pr-4 font-bold">Description</th>
              <th class="pb-2 pr-4 font-bold text-right">Qty</th>
              <th class="pb-2 pr-4 font-bold text-right">Rate</th>
              <th class="pb-2 pr-4 font-bold text-right">Amount</th>
              <th class="pb-2 font-bold text-right"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderLineItemEditRow(row, li) {
    const { clients } = window.AurixClientsStore.get();
    const { workTypes } = window.AurixWorkTypesStore.get();
    const clientOptions = clients.includes(li.client) ? clients : [li.client, ...clients];
    const workTypeOptions = workTypes.includes(li.workType) ? workTypes : [li.workType, ...workTypes];

    row.innerHTML = `
      <td class="py-2 pr-2"><select class="editClient aurix-input rounded-lg px-2 py-1.5 text-xs w-full">${clientOptions.map((c) => `<option value="${escapeHtml(c)}" ${c === li.client ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></td>
      <td class="py-2 pr-2"><input type="text" class="editEndClient aurix-input rounded-lg px-2 py-1.5 text-xs w-full" value="${escapeHtml(li.endClient || "")}" /></td>
      <td class="py-2 pr-2"><select class="editWorkType aurix-input rounded-lg px-2 py-1.5 text-xs w-full">${workTypeOptions.map((w) => `<option value="${escapeHtml(w)}" ${w === li.workType ? "selected" : ""}>${escapeHtml(w)}</option>`).join("")}</select></td>
      <td class="py-2 pr-2"><input type="text" class="editDescription aurix-input rounded-lg px-2 py-1.5 text-xs w-full" value="${escapeHtml(li.description || "")}" /></td>
      <td class="py-2 pr-2"><input type="number" min="0" step="1" class="editQty aurix-input rounded-lg px-2 py-1.5 text-xs w-16 text-right" value="${li.quantity}" /></td>
      <td class="py-2 pr-2">
        <div class="flex flex-col gap-1">
          <select class="editCurrency aurix-input rounded-lg px-1.5 py-1 text-[10px] w-20">
            <option value="PKR" ${li.currency !== "USD" ? "selected" : ""}>PKR</option>
            <option value="USD" ${li.currency === "USD" ? "selected" : ""}>USD</option>
          </select>
          <input type="number" step="0.01" class="editRate aurix-input rounded-lg px-2 py-1.5 text-xs w-20 text-right" value="${li.rate}" />
        </div>
      </td>
      <td class="py-2 pr-4 text-right text-white/30 text-xs">recalculated on save</td>
      <td class="py-2 pl-2 text-right whitespace-nowrap">
        <button class="saveLineItemBtn text-aurixblue hover:text-white transition text-xs font-bold mr-2">Save</button>
        <button class="cancelLineItemBtn text-white/30 hover:text-white transition text-xs font-bold">Cancel</button>
      </td>
    `;

    row.querySelector(".cancelLineItemBtn").addEventListener("click", () => render());

    row.querySelector(".saveLineItemBtn").addEventListener("click", async () => {
      const saveBtn = row.querySelector(".saveLineItemBtn");
      saveBtn.disabled = true;
      saveBtn.textContent = "…";
      try {
        await window.AurixApi.adminUpdateLineItem({
          id: li.id,
          client: row.querySelector(".editClient").value,
          endClient: row.querySelector(".editEndClient").value.trim(),
          workType: row.querySelector(".editWorkType").value,
          description: row.querySelector(".editDescription").value.trim(),
          quantity: Number(row.querySelector(".editQty").value) || 0,
          rate: Number(row.querySelector(".editRate").value) || 0,
          currency: row.querySelector(".editCurrency").value,
        });
        await window.AurixAdmin.load();
      } catch (err) {
        errorEl.textContent = err.message || "Could not save that line item.";
        errorEl.classList.remove("hidden");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
    });
  }

  function getFiltered() {
    const person = filterPerson.value;
    const month = filterMonth.value;
    const client = filterClient.value;
    const status = filterStatus.value;

    return allInvoices
      .filter((inv) => !person || inv.username === person)
      .filter((inv) => !month || inv.month === month)
      .filter((inv) => !status || inv.status === status)
      .map((inv) => {
        if (!client) return inv;
        const matching = inv.lineItems.filter((li) => li.client === client);
        if (matching.length === 0) return null;
        return { ...inv, lineItems: matching, total: matching.reduce((s, li) => s + li.amount, 0) };
      })
      .filter(Boolean);
  }

  // Within the "New" tab, invoices are grouped by where they sit in the
  // Submitted -> Approved -> Sent -> Signed pipeline, since that's exactly
  // what determines what (if anything) you need to do with it. Paid lives
  // in its own tab entirely (see activeTab), not as a section here.
  const STAGES = [
    { status: "Submitted", label: "Needs Review" },
    { status: "Approved", label: "Ready to Send" },
    { status: "Sent", label: "Awaiting Signature" },
    { status: "Signed", label: "Ready to Pay" },
  ];

  function invoiceCardHtml(inv) {
    return `
      <div class="aurix-card rounded-2xl p-5" data-invoice-id="${escapeHtml(inv.invoiceId)}">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p class="font-bold">${escapeHtml(inv.fullName || inv.username)} <span class="text-white/30 font-normal">· ${formatMonth(inv.month)}</span></p>
            <p class="text-white/40 text-xs mt-0.5">${inv.lineItems.length} line item${inv.lineItems.length === 1 ? "" : "s"}</p>
          </div>
          <div class="flex items-center gap-3">
            ${statusBadge(inv.status)}
            ${inv.locked
              ? `<button class="resubmitBtn text-[11px] font-bold px-2.5 py-1 rounded-lg border border-white/10 hover:border-amber-400 hover:bg-amber-400/10 transition text-amber-400/80" title="They can't submit again for this month until you allow it">🔒 Allow Resubmit</button>`
              : `<span class="text-[11px] text-green-400/70 font-semibold" title="They can submit once more for this month">🔓 Open</span>`
            }
            <p class="font-bold text-lg">${currency(inv.total)}</p>
            <div class="flex items-center gap-2">
              ${renderInvoiceActions(inv)}
            </div>
          </div>
        </div>
        ${inv.pdfUrl ? `<p class="mt-2"><a href="${escapeHtml(inv.pdfUrl)}" target="_blank" rel="noopener" class="text-aurixblue hover:underline text-xs font-semibold">View Signed PDF ↗</a></p>` : ""}
        ${renderLineItemsTable(inv.lineItems)}
        ${inv.notes ? `<div class="mt-4 pt-4 border-t border-white/5"><p class="text-white/30 text-[11px] uppercase tracking-widest font-bold mb-1.5">Notes</p><p class="text-white/60 text-sm whitespace-pre-wrap">${escapeHtml(inv.notes)}</p></div>` : ""}
        <div class="mt-4 pt-4 border-t border-white/5 flex flex-wrap items-center gap-2">
          <button class="addLineBtn text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-aurixblue hover:bg-aurixblue/10 transition text-aurixblue/80">+ Add Line</button>
          <button class="addBonusBtn text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-green-400 hover:bg-green-400/10 transition text-green-400/80">+ Bonus</button>
          <button class="addAdjustmentBtn text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-amber-400 hover:bg-amber-400/10 transition text-amber-400/80">+ Adjustment</button>
          <button class="deleteInvoiceBtn text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-red-500 hover:bg-red-500/10 transition text-red-400/70 ml-auto">🗑 Delete Invoice</button>
        </div>
        <div class="addLineFormSlot mt-3" hidden></div>
      </div>
    `;
  }

  function render() {
    const filtered = getFiltered();
    const tabFiltered = activeTab === "paid"
      ? filtered.filter((inv) => inv.status === "Paid")
      : filtered.filter((inv) => inv.status !== "Paid");

    const grandTotal = tabFiltered.reduce((s, inv) => s + inv.total, 0);
    grandTotalEl.textContent = currency(grandTotal);
    countEl.textContent = `${tabFiltered.length} invoice${tabFiltered.length === 1 ? "" : "s"}`;

    if (tabFiltered.length === 0) {
      listEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");

    if (activeTab === "paid") {
      const sorted = [...tabFiltered].sort((a, b) => b.month.localeCompare(a.month) || (a.fullName || a.username).localeCompare(b.fullName || b.username));
      listEl.innerHTML = sorted.map(invoiceCardHtml).join("");
    } else {
      const byStatus = {};
      tabFiltered.forEach((inv) => { (byStatus[inv.status] = byStatus[inv.status] || []).push(inv); });

      // Any status outside the known pipeline (shouldn't happen, but data can
      // drift) still gets its own section rather than silently disappearing.
      const knownStatuses = STAGES.map((s) => s.status);
      const stages = STAGES.concat(
        Object.keys(byStatus)
          .filter((s) => knownStatuses.indexOf(s) === -1)
          .map((s) => ({ status: s, label: s }))
      );

      listEl.innerHTML = stages
        .filter((stage) => byStatus[stage.status] && byStatus[stage.status].length)
        .map((stage) => {
          const group = [...byStatus[stage.status]].sort((a, b) => b.month.localeCompare(a.month) || (a.fullName || a.username).localeCompare(b.fullName || b.username));
          const subtotal = group.reduce((s, inv) => s + inv.total, 0);
          return `
            <div data-stage="${escapeHtml(stage.status)}">
              <div class="flex items-center justify-between gap-3 px-1 py-2">
                <div class="flex items-center gap-2">
                  <h3 class="text-xs font-bold uppercase tracking-widest text-white/50">${escapeHtml(stage.label)}</h3>
                  <span class="text-white/30 text-xs font-semibold">${group.length}</span>
                </div>
                <p class="text-white/40 text-xs font-semibold">${currency(subtotal)}</p>
              </div>
              <div class="space-y-4">${group.map(invoiceCardHtml).join("")}</div>
            </div>
          `;
        })
        .join("");
    }

    listEl.querySelectorAll(".resubmitBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest("[data-invoice-id]");
        const inv = allInvoices.find((i) => i.invoiceId === card.dataset.invoiceId);
        if (!inv) return;
        btn.disabled = true;
        try {
          await window.AurixApi.grantResubmitSlot(inv.username, inv.month);
          inv.locked = false;
          render();
        } catch (err) {
          errorEl.textContent = err.message || "Could not open a resubmission slot.";
          errorEl.classList.remove("hidden");
          btn.disabled = false;
        }
      });
    });

    listEl.querySelectorAll(".editLineItemBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest("tr");
        const card = btn.closest("[data-invoice-id]");
        const inv = allInvoices.find((i) => i.invoiceId === card.dataset.invoiceId);
        const li = inv && inv.lineItems.find((x) => x.id === row.dataset.lineId);
        if (!li) return;
        renderLineItemEditRow(row, li);
      });
    });

    listEl.querySelectorAll(".deleteLineItemBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this line item? This cannot be undone.")) return;
        const row = btn.closest("tr");
        btn.disabled = true;
        try {
          await window.AurixApi.adminDeleteLineItem(row.dataset.lineId);
          await window.AurixAdmin.load();
        } catch (err) {
          errorEl.textContent = err.message || "Could not delete that line item.";
          errorEl.classList.remove("hidden");
          btn.disabled = false;
        }
      });
    });

    listEl.querySelectorAll(".statusBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest("[data-invoice-id]");
        const invoiceId = card.dataset.invoiceId;
        const status = btn.dataset.action;
        card.querySelectorAll(".statusBtn").forEach((b) => (b.disabled = true));
        try {
          await window.AurixApi.updateInvoiceStatus(invoiceId, status);
          const target = allInvoices.find((i) => i.invoiceId === invoiceId);
          if (target) target.status = status;
          render();
        } catch (err) {
          errorEl.textContent = err.message || "Could not update that invoice.";
          errorEl.classList.remove("hidden");
          card.querySelectorAll(".statusBtn").forEach((b) => (b.disabled = false));
        }
      });
    });

    listEl.querySelectorAll(".generateSendBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest("[data-invoice-id]");
        const invoiceId = card.dataset.invoiceId;
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Sending…";
        try {
          await window.AurixApi.generateAndSendInvoice(invoiceId);
          const target = allInvoices.find((i) => i.invoiceId === invoiceId);
          if (target) target.status = "Sent";
          render();
        } catch (err) {
          errorEl.textContent = err.message || "Could not send that invoice for signature.";
          errorEl.classList.remove("hidden");
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      });
    });

    listEl.querySelectorAll(".addLineBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest("[data-invoice-id]");
        const inv = allInvoices.find((i) => i.invoiceId === card.dataset.invoiceId);
        if (inv) openAddLineForm(card, inv, "line");
      });
    });

    listEl.querySelectorAll(".addBonusBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest("[data-invoice-id]");
        const inv = allInvoices.find((i) => i.invoiceId === card.dataset.invoiceId);
        if (inv) openAddLineForm(card, inv, "bonus");
      });
    });

    listEl.querySelectorAll(".addAdjustmentBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest("[data-invoice-id]");
        const inv = allInvoices.find((i) => i.invoiceId === card.dataset.invoiceId);
        if (inv) openAddLineForm(card, inv, "adjustment");
      });
    });

    listEl.querySelectorAll(".deleteInvoiceBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest("[data-invoice-id]");
        const inv = allInvoices.find((i) => i.invoiceId === card.dataset.invoiceId);
        if (!inv) return;
        const label = (inv.fullName || inv.username) + " · " + formatMonth(inv.month);
        if (!confirm(`Permanently delete ${label}'s invoice? This removes every line item on it and any signed PDF record. This cannot be undone.`)) return;
        btn.disabled = true;
        try {
          await window.AurixApi.adminDeleteInvoice(inv.invoiceId);
          await window.AurixAdmin.load();
        } catch (err) {
          errorEl.textContent = err.message || "Could not delete that invoice.";
          errorEl.classList.remove("hidden");
          btn.disabled = false;
        }
      });
    });
  }

  // Opens an inline form under an invoice card to add either a real line
  // item (mode "line") or a Bonus/Adjustment entry (client "—", a single
  // signed amount rather than qty × rate). Built with direct DOM
  // manipulation rather than a full render() so an in-progress edit isn't
  // clobbered by an unrelated action elsewhere on the page.
  async function openAddLineForm(card, inv, mode) {
    const slot = card.querySelector(".addLineFormSlot");
    if (mode === "line") {
      await Promise.all([window.AurixClientsStore.load(), window.AurixWorkTypesStore.load()]);
      const { clients } = window.AurixClientsStore.get();

      slot.innerHTML = `
        <div class="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="space-y-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Client</label>
              <select class="newLineClient aurix-input w-full rounded-lg px-3 py-2 text-sm">
                <option value="">Select a client…</option>
                ${clients.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
              </select>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">End Client</label>
              <input type="text" class="newLineEndClient aurix-input w-full rounded-lg px-3 py-2 text-sm" placeholder="Optional" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Work Type</label>
              <select class="newLineWorkType aurix-input w-full rounded-lg px-3 py-2 text-sm"><option value="">Select a client first…</option></select>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_1fr] gap-3">
            <div class="space-y-1 col-span-2 sm:col-span-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Description</label>
              <input type="text" class="newLineDescription aurix-input w-full rounded-lg px-3 py-2 text-sm" placeholder="Optional" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Qty</label>
              <input type="number" min="0" step="1" value="1" class="newLineQty aurix-input w-full rounded-lg px-3 py-2 text-sm" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Currency</label>
              <select class="newLineCurrency aurix-input w-full rounded-lg px-3 py-2 text-sm">
                <option value="PKR">PKR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Rate</label>
              <input type="number" step="0.01" value="0" class="newLineRate aurix-input w-full rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <p class="newLineError hidden text-red-400 text-xs font-medium"></p>
          <div class="flex items-center gap-3">
            <button class="saveNewLineBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-aurixblue hover:bg-aurixblue/10 transition">Add Line</button>
            <button class="cancelNewLineBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 transition">Cancel</button>
          </div>
        </div>
      `;

      const clientSelect = slot.querySelector(".newLineClient");
      const workTypeSelect = slot.querySelector(".newLineWorkType");
      const refreshWorkTypes = () => {
        if (!clientSelect.value) {
          workTypeSelect.innerHTML = `<option value="">Select a client first…</option>`;
          return;
        }
        const options = window.AurixWorkTypesStore.forClient(clientSelect.value);
        workTypeSelect.innerHTML = options.length
          ? options.map((w) => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join("")
          : `<option value="">No work types set up yet</option>`;
      };
      clientSelect.addEventListener("change", refreshWorkTypes);
      refreshWorkTypes();

      slot.querySelector(".cancelNewLineBtn").addEventListener("click", () => { slot.innerHTML = ""; slot.hidden = true; });

      slot.querySelector(".saveNewLineBtn").addEventListener("click", async () => {
        const formError = slot.querySelector(".newLineError");
        formError.classList.add("hidden");
        const client = clientSelect.value;
        const workType = workTypeSelect.value;
        if (!client || !workType) {
          formError.textContent = "Pick a client and work type.";
          formError.classList.remove("hidden");
          return;
        }
        const btn = slot.querySelector(".saveNewLineBtn");
        btn.disabled = true;
        btn.textContent = "Adding…";
        try {
          await window.AurixApi.adminAddLineItem({
            username: inv.username,
            month: inv.month,
            client: client,
            endClient: slot.querySelector(".newLineEndClient").value.trim(),
            workType: workType,
            description: slot.querySelector(".newLineDescription").value.trim(),
            quantity: Number(slot.querySelector(".newLineQty").value) || 0,
            rate: Number(slot.querySelector(".newLineRate").value) || 0,
            currency: slot.querySelector(".newLineCurrency").value,
          });
          await window.AurixAdmin.load();
        } catch (err) {
          formError.textContent = err.message || "Could not add that line.";
          formError.classList.remove("hidden");
          btn.disabled = false;
          btn.textContent = "Add Line";
        }
      });
    } else {
      // Bonus or Adjustment — a description plus one signed amount, not
      // tied to a real client's billable work.
      const label = mode === "bonus" ? "Bonus" : "Adjustment";
      slot.innerHTML = `
        <div class="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="space-y-1 sm:col-span-2">
              <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">${label} Description</label>
              <input type="text" class="newAdjDescription aurix-input w-full rounded-lg px-3 py-2 text-sm" placeholder="e.g. ${mode === "bonus" ? "Eid bonus" : "Correction for overbilled hours"}" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Amount (+/−)</label>
              <input type="number" step="0.01" value="0" class="newAdjAmount aurix-input w-full rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <p class="newAdjError hidden text-red-400 text-xs font-medium"></p>
          <div class="flex items-center gap-3">
            <button class="saveNewAdjBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-aurixblue hover:bg-aurixblue/10 transition">Add ${label}</button>
            <button class="cancelNewLineBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 transition">Cancel</button>
          </div>
        </div>
      `;

      slot.querySelector(".cancelNewLineBtn").addEventListener("click", () => { slot.innerHTML = ""; slot.hidden = true; });

      slot.querySelector(".saveNewAdjBtn").addEventListener("click", async () => {
        const formError = slot.querySelector(".newAdjError");
        formError.classList.add("hidden");
        const amount = Number(slot.querySelector(".newAdjAmount").value);
        if (!amount) {
          formError.textContent = "Enter a non-zero amount.";
          formError.classList.remove("hidden");
          return;
        }
        const btn = slot.querySelector(".saveNewAdjBtn");
        btn.disabled = true;
        btn.textContent = "Adding…";
        try {
          await window.AurixApi.adminAddLineItem({
            username: inv.username,
            month: inv.month,
            client: "—",
            endClient: "",
            workType: label,
            description: slot.querySelector(".newAdjDescription").value.trim(),
            quantity: 1,
            rate: amount,
          });
          await window.AurixAdmin.load();
        } catch (err) {
          formError.textContent = err.message || "Could not add that.";
          formError.classList.remove("hidden");
          btn.disabled = false;
          btn.textContent = "Add " + label;
        }
      });
    }

    slot.hidden = false;
  }

  function updateTabStyles() {
    document.querySelectorAll(".adminTabBtn").forEach((btn) => {
      const isActive = btn.dataset.tab === activeTab;
      btn.className = "adminTabBtn text-sm font-bold px-4 py-2 rounded-xl border transition " +
        (isActive
          ? "bg-aurixblue/15 border-aurixblue text-white"
          : "bg-white/[0.02] border-white/10 text-white/50 hover:text-white hover:border-white/20");
    });
  }

  document.querySelectorAll(".adminTabBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      updateTabStyles();
      render();
    });
  });
  updateTabStyles();

  [filterPerson, filterMonth, filterClient, filterStatus].forEach((el) => el.addEventListener("change", render));

  // ============================== Manage Clients ==============================

  function renderClientsTable(rawRows) {
    if (rawRows.length === 0) {
      clientsTableEl.innerHTML = "";
      clientsEmptyEl.classList.remove("hidden");
      return;
    }
    clientsEmptyEl.classList.add("hidden");

    const sorted = [...rawRows].sort((a, b) => a.client.localeCompare(b.client) || a.endClient.localeCompare(b.endClient));

    clientsTableEl.innerHTML = sorted.map((row) => `
      <div class="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-white/[0.02]" data-row-id="${escapeHtml(row.id)}">
        <p class="text-sm">
          <span class="font-semibold">${escapeHtml(row.client)}</span>
          ${row.endClient ? `<span class="text-white/40"> · ${escapeHtml(row.endClient)}</span>` : ""}
        </p>
        <button class="deleteClientRowBtn text-white/30 hover:text-red-400 transition text-xs font-bold">Remove</button>
      </div>
    `).join("");

    clientsTableEl.querySelectorAll(".deleteClientRowBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest("[data-row-id]");
        const id = row.dataset.rowId;
        btn.disabled = true;
        btn.textContent = "…";
        try {
          await window.AurixApi.deleteClientRow(id);
          await loadClients(true);
        } catch (err) {
          manageClientsErrorEl.textContent = err.message || "Could not remove that row.";
          manageClientsErrorEl.classList.remove("hidden");
          btn.disabled = false;
          btn.textContent = "Remove";
        }
      });
    });
  }

  async function loadClients(force) {
    const { rows } = await window.AurixClientsStore.load(force);
    renderClientsTable(rows);
  }

  toggleManageClientsBtn.addEventListener("click", () => {
    const isHidden = manageClientsBody.classList.contains("hidden");
    manageClientsBody.classList.toggle("hidden");
    toggleManageClientsBtn.textContent = isHidden ? "Hide" : "Show";
    if (isHidden) loadClients();
  });

  addClientBtn.addEventListener("click", async () => {
    manageClientsErrorEl.classList.add("hidden");
    const client = newClientNameInput.value.trim();
    const endClient = newEndClientNameInput.value.trim();
    if (!client) {
      manageClientsErrorEl.textContent = "Enter a client name first.";
      manageClientsErrorEl.classList.remove("hidden");
      return;
    }
    addClientBtn.disabled = true;
    try {
      await window.AurixApi.addClient(client, endClient);
      newClientNameInput.value = "";
      newEndClientNameInput.value = "";
      await loadClients(true);
    } catch (err) {
      manageClientsErrorEl.textContent = err.message || "Could not add that client.";
      manageClientsErrorEl.classList.remove("hidden");
    } finally {
      addClientBtn.disabled = false;
    }
  });

  // ============================== Manage Work Types ==============================

  function renderWorkTypesList(rows) {
    if (rows.length === 0) {
      workTypesListEl.innerHTML = "";
      workTypesEmptyEl.classList.remove("hidden");
      return;
    }
    workTypesEmptyEl.classList.add("hidden");

    const sorted = [...rows].sort((a, b) => a.workType.localeCompare(b.workType));
    workTypesListEl.innerHTML = sorted.map((row) => `
      <span class="inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold" data-row-id="${escapeHtml(row.id)}">
        ${escapeHtml(row.workType)}
        <button class="deleteWorkTypeBtn text-white/30 hover:text-red-400 transition leading-none text-sm" title="Remove">&times;</button>
      </span>
    `).join("");

    workTypesListEl.querySelectorAll(".deleteWorkTypeBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const chip = btn.closest("[data-row-id]");
        const id = chip.dataset.rowId;
        btn.disabled = true;
        try {
          await window.AurixApi.deleteWorkType(id);
          await loadWorkTypesPanel(true);
        } catch (err) {
          manageWorkTypesErrorEl.textContent = err.message || "Could not remove that work type.";
          manageWorkTypesErrorEl.classList.remove("hidden");
          btn.disabled = false;
        }
      });
    });
  }

  function renderWorkTypeClientOptions(clients) {
    const previousValue = workTypeClientSelect.value;
    workTypeClientSelect.innerHTML = `<option value="">Select a client…</option>` +
      [...clients].sort().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    workTypeClientSelect.value = clients.includes(previousValue) ? previousValue : "";
  }

  function renderWorkTypeAssignments() {
    const client = workTypeClientSelect.value;
    if (!client) {
      workTypeAssignmentsEl.innerHTML = `<p class="text-white/30 text-xs sm:col-span-2">Pick a client above to customize its work types.</p>`;
      return;
    }

    const { workTypes, byClient } = window.AurixWorkTypesStore.get();
    const assigned = new Set(byClient[client] || []);

    if (workTypes.length === 0) {
      workTypeAssignmentsEl.innerHTML = `<p class="text-white/30 text-xs sm:col-span-2">Add a work type above first.</p>`;
      return;
    }

    workTypeAssignmentsEl.innerHTML = workTypes.map((wt) => `
      <label class="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-white/[0.02] cursor-pointer">
        <input type="checkbox" class="workTypeCheckbox" value="${escapeHtml(wt)}" ${assigned.has(wt) ? "checked" : ""} />
        ${escapeHtml(wt)}
      </label>
    `).join("");

    workTypeAssignmentsEl.querySelectorAll(".workTypeCheckbox").forEach((box) => {
      box.addEventListener("change", async () => {
        box.disabled = true;
        try {
          if (box.checked) {
            await window.AurixApi.assignClientWorkType(client, box.value);
          } else {
            await window.AurixApi.unassignClientWorkType(client, box.value);
          }
          await window.AurixWorkTypesStore.load(true);
        } catch (err) {
          box.checked = !box.checked; // revert the visual toggle since the change didn't stick
          manageWorkTypesErrorEl.textContent = err.message || "Could not update that assignment.";
          manageWorkTypesErrorEl.classList.remove("hidden");
        } finally {
          box.disabled = false;
        }
      });
    });
  }

  async function loadWorkTypesPanel(force) {
    const [clientsData, workTypesData] = await Promise.all([
      window.AurixClientsStore.load(force),
      window.AurixWorkTypesStore.load(force),
    ]);
    renderWorkTypeClientOptions(clientsData.clients);
    renderWorkTypesList(workTypesData.rows);
    renderWorkTypeAssignments();
  }

  toggleManageWorkTypesBtn.addEventListener("click", () => {
    const isHidden = manageWorkTypesBody.classList.contains("hidden");
    manageWorkTypesBody.classList.toggle("hidden");
    toggleManageWorkTypesBtn.textContent = isHidden ? "Hide" : "Show";
    if (isHidden) loadWorkTypesPanel();
  });

  workTypeClientSelect.addEventListener("change", renderWorkTypeAssignments);

  addWorkTypeBtn.addEventListener("click", async () => {
    manageWorkTypesErrorEl.classList.add("hidden");
    const workType = newWorkTypeNameInput.value.trim();
    if (!workType) {
      manageWorkTypesErrorEl.textContent = "Enter a work type name first.";
      manageWorkTypesErrorEl.classList.remove("hidden");
      return;
    }
    addWorkTypeBtn.disabled = true;
    try {
      await window.AurixApi.addWorkType(workType);
      newWorkTypeNameInput.value = "";
      await loadWorkTypesPanel(true);
    } catch (err) {
      manageWorkTypesErrorEl.textContent = err.message || "Could not add that work type.";
      manageWorkTypesErrorEl.classList.remove("hidden");
    } finally {
      addWorkTypeBtn.disabled = false;
    }
  });

  // ============================== Manage Team ==============================

  function renderTeamMembers(members) {
    const sorted = [...members].sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username));
    teamMembersListEl.innerHTML = sorted.map((m) => `
      <div class="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3" data-username="${escapeHtml(m.username)}">
        <p class="text-sm font-bold">${escapeHtml(m.fullName || m.username)} <span class="text-white/30 font-normal text-xs">· ${escapeHtml(m.role)}</span></p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Email</label>
            <input type="email" class="teamEmailInput aurix-input w-full rounded-lg px-3 py-2 text-sm" placeholder="name@example.com" value="${escapeHtml(m.email)}" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Bank Name</label>
            <input type="text" class="teamBankNameInput aurix-input w-full rounded-lg px-3 py-2 text-sm" value="${escapeHtml(m.bankName)}" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Account Title</label>
            <input type="text" class="teamBankTitleInput aurix-input w-full rounded-lg px-3 py-2 text-sm" value="${escapeHtml(m.bankAccountTitle)}" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] font-bold uppercase tracking-widest text-white/30">Account Number</label>
            <input type="text" class="teamBankAccountInput aurix-input w-full rounded-lg px-3 py-2 text-sm" value="${escapeHtml(m.bankAccountNumber)}" />
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button class="saveTeamMemberBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-aurixblue hover:bg-aurixblue/10 transition">Save</button>
          <span class="teamSavedNote text-xs text-green-400 hidden">Saved</span>
        </div>
        <div class="flex items-center gap-2 pt-3 border-t border-white/5">
          <label class="text-[10px] font-bold uppercase tracking-widest text-white/30 whitespace-nowrap">Allow Resubmit For</label>
          <input type="month" class="resubmitMonthInput aurix-input rounded-lg px-2 py-1.5 text-sm" />
          <button class="resubmitTeamBtn text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-amber-400 hover:bg-amber-400/10 transition text-amber-400/80 whitespace-nowrap" title="Unlocks that month even if their invoice isn't showing below — e.g. after a test submission was deleted">🔒 Allow Resubmit</button>
          <span class="resubmitTeamNote text-xs hidden"></span>
        </div>
      </div>
    `).join("");

    teamMembersListEl.querySelectorAll(".saveTeamMemberBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest("[data-username]");
        const savedNote = card.querySelector(".teamSavedNote");
        savedNote.classList.add("hidden");
        btn.disabled = true;
        try {
          await window.AurixApi.updateTeamMember({
            username: card.dataset.username,
            email: card.querySelector(".teamEmailInput").value.trim(),
            bankName: card.querySelector(".teamBankNameInput").value.trim(),
            bankAccountTitle: card.querySelector(".teamBankTitleInput").value.trim(),
            bankAccountNumber: card.querySelector(".teamBankAccountInput").value.trim(),
          });
          savedNote.classList.remove("hidden");
        } catch (err) {
          manageTeamErrorEl.textContent = err.message || "Could not save that person's details.";
          manageTeamErrorEl.classList.remove("hidden");
        } finally {
          btn.disabled = false;
        }
      });
    });

    teamMembersListEl.querySelectorAll(".resubmitTeamBtn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest("[data-username]");
        const monthInput = card.querySelector(".resubmitMonthInput");
        const note = card.querySelector(".resubmitTeamNote");
        note.classList.add("hidden");
        if (!monthInput.value) {
          note.textContent = "Pick a month first.";
          note.className = "resubmitTeamNote text-xs text-red-400";
          return;
        }
        btn.disabled = true;
        try {
          await window.AurixApi.grantResubmitSlot(card.dataset.username, monthInput.value);
          note.textContent = "Unlocked — they can submit again for that month.";
          note.className = "resubmitTeamNote text-xs text-green-400";
        } catch (err) {
          note.textContent = err.message || "Could not unlock that month.";
          note.className = "resubmitTeamNote text-xs text-red-400";
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function loadTeamMembers() {
    manageTeamErrorEl.classList.add("hidden");
    try {
      const data = await window.AurixApi.getTeamMembers();
      renderTeamMembers((data && data.members) || []);
    } catch (err) {
      manageTeamErrorEl.textContent = err.message || "Could not load the team list.";
      manageTeamErrorEl.classList.remove("hidden");
    }
  }

  toggleManageTeamBtn.addEventListener("click", () => {
    const isHidden = manageTeamBody.classList.contains("hidden");
    manageTeamBody.classList.toggle("hidden");
    toggleManageTeamBtn.textContent = isHidden ? "Hide" : "Show";
    if (isHidden) loadTeamMembers();
  });

  async function loadExchangeRate() {
    exchangeRateErrorEl.classList.add("hidden");
    try {
      const data = await window.AurixSettingsStore.load(true);
      usdToPkrRateInput.value = data.usdToPkrRate;
    } catch (err) {
      exchangeRateErrorEl.textContent = err.message || "Could not load the exchange rate.";
      exchangeRateErrorEl.classList.remove("hidden");
    }
  }

  toggleExchangeRateBtn.addEventListener("click", () => {
    const isHidden = exchangeRateBody.classList.contains("hidden");
    exchangeRateBody.classList.toggle("hidden");
    toggleExchangeRateBtn.textContent = isHidden ? "Hide" : "Show";
    if (isHidden) loadExchangeRate();
  });

  saveExchangeRateBtn.addEventListener("click", async () => {
    exchangeRateSavedNote.classList.add("hidden");
    exchangeRateErrorEl.classList.add("hidden");
    const rate = Number(usdToPkrRateInput.value);
    if (!(rate > 0)) {
      exchangeRateErrorEl.textContent = "Enter a valid positive rate.";
      exchangeRateErrorEl.classList.remove("hidden");
      return;
    }
    saveExchangeRateBtn.disabled = true;
    try {
      await window.AurixApi.updateSettings({ usdToPkrRate: rate });
      window.AurixSettingsStore.invalidate();
      exchangeRateSavedNote.classList.remove("hidden");
    } catch (err) {
      exchangeRateErrorEl.textContent = err.message || "Could not save the exchange rate.";
      exchangeRateErrorEl.classList.remove("hidden");
    } finally {
      saveExchangeRateBtn.disabled = false;
    }
  });

  window.AurixAdmin = {
    async load() {
      loadingEl.classList.remove("hidden");
      errorEl.classList.add("hidden");

      try {
        const data = await window.AurixApi.getAdminInvoices();
        allInvoices = (data && data.invoices) || [];
        // Warm these so line-item edit dropdowns are ready; a failure here
        // shouldn't block showing invoices, editing would just degrade to
        // fewer dropdown options.
        window.AurixClientsStore.load().catch(() => {});
        window.AurixWorkTypesStore.load().catch(() => {});
        window.AurixSettingsStore.load().catch(() => {});
        populateFilters();
        render();
      } catch (err) {
        errorEl.textContent = err.message || "Could not load team invoices.";
        errorEl.classList.remove("hidden");
      } finally {
        loadingEl.classList.add("hidden");
      }
    },
  };
})();
