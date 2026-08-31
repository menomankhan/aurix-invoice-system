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

  const { formatMonth } = window.AURIX_DATA;

  let allInvoices = [];

  function currency(n) {
    return "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
  }

  function statusBadge(status) {
    const cls = status === "Paid" ? "aurix-badge-paid" : status === "Approved" ? "aurix-badge-approved" : "aurix-badge-submitted";
    return `<span class="aurix-badge ${cls}">${status}</span>`;
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
      <tr class="border-t border-white/5">
        <td class="py-2.5 pr-4 text-white/70">${escapeHtml(li.client)}</td>
        <td class="py-2.5 pr-4 text-white/70">${escapeHtml(li.endClient || "—")}</td>
        <td class="py-2.5 pr-4 text-white/70">${escapeHtml(li.workType)}</td>
        <td class="py-2.5 pr-4 text-white/50">${escapeHtml(li.description || "—")}</td>
        <td class="py-2.5 pr-4 text-right text-white/70">${li.quantity}</td>
        <td class="py-2.5 pr-4 text-right text-white/70">${currency(li.rate)}</td>
        <td class="py-2.5 text-right font-semibold text-white">${currency(li.amount)}</td>
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
              <th class="pb-2 font-bold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
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

  function render() {
    const filtered = getFiltered();
    const grandTotal = filtered.reduce((s, inv) => s + inv.total, 0);
    grandTotalEl.textContent = currency(grandTotal);
    countEl.textContent = `${filtered.length} invoice${filtered.length === 1 ? "" : "s"}`;

    if (filtered.length === 0) {
      listEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");

    const sorted = [...filtered].sort((a, b) => b.month.localeCompare(a.month) || (a.fullName || a.username).localeCompare(b.fullName || b.username));

    listEl.innerHTML = sorted.map((inv) => `
      <div class="aurix-card rounded-2xl p-5" data-invoice-id="${escapeHtml(inv.invoiceId)}">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p class="font-bold">${escapeHtml(inv.fullName || inv.username)} <span class="text-white/30 font-normal">· ${formatMonth(inv.month)}</span></p>
            <p class="text-white/40 text-xs mt-0.5">${inv.lineItems.length} line item${inv.lineItems.length === 1 ? "" : "s"}</p>
          </div>
          <div class="flex items-center gap-3">
            ${statusBadge(inv.status)}
            <p class="font-bold text-lg">${currency(inv.total)}</p>
            <div class="flex items-center gap-2">
              <button data-action="Approved" class="statusBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-aurixblue hover:bg-aurixblue/10 transition disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:bg-transparent disabled:cursor-not-allowed" ${inv.status === "Approved" ? "disabled" : ""}>Approve</button>
              <button data-action="Paid" class="statusBtn text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-green-500 hover:bg-green-500/10 transition disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:bg-transparent disabled:cursor-not-allowed" ${inv.status === "Paid" ? "disabled" : ""}>Mark Paid</button>
            </div>
          </div>
        </div>
        ${renderLineItemsTable(inv.lineItems)}
      </div>
    `).join("");

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
  }

  [filterPerson, filterMonth, filterClient, filterStatus].forEach((el) => el.addEventListener("change", render));

  window.AurixAdmin = {
    async load() {
      loadingEl.classList.remove("hidden");
      errorEl.classList.add("hidden");

      try {
        const data = await window.AurixApi.getAdminInvoices();
        allInvoices = (data && data.invoices) || [];
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
