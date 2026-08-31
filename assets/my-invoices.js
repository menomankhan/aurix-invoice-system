(function () {
  if (!window.AurixSession) return;

  const currentMonthEl = document.getElementById("myInvoicesCurrentMonth");
  const listEl = document.getElementById("myInvoicesList");
  const emptyEl = document.getElementById("myInvoicesEmpty");
  const loadingEl = document.getElementById("myInvoicesLoading");
  const errorEl = document.getElementById("myInvoicesError");

  const { formatMonth, currentMonthValue } = window.AURIX_DATA;

  function currency(n) {
    return "Rs " + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function statusBadge(status) {
    const cls = status === "Paid" ? "aurix-badge-paid" : status === "Approved" ? "aurix-badge-approved" : "aurix-badge-submitted";
    return `<span class="aurix-badge ${cls}">${status}</span>`;
  }

  function renderCurrentMonth(invoices) {
    const thisMonth = currentMonthValue();
    const inv = invoices.find((i) => i.month === thisMonth);
    currentMonthEl.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <p class="text-white/40 text-xs uppercase tracking-widest font-bold">${formatMonth(thisMonth)} — Running Total</p>
          <p class="text-2xl font-bold mt-1">${currency(inv ? inv.total : 0)}</p>
        </div>
        ${inv ? statusBadge(inv.status) : `<span class="text-white/30 text-sm">Nothing submitted yet</span>`}
      </div>
      ${inv && inv.locked ? `<p class="text-amber-400/70 text-xs mt-3 pt-3 border-t border-white/5">You've already submitted for this month. Ask your admin if you need to submit again.</p>` : ""}
    `;
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
  }

  function renderInvoices(invoices) {
    if (invoices.length === 0) {
      emptyEl.classList.remove("hidden");
      listEl.innerHTML = "";
      return;
    }
    emptyEl.classList.add("hidden");

    const sorted = [...invoices].sort((a, b) => b.month.localeCompare(a.month));
    listEl.innerHTML = sorted.map((inv) => `
      <div class="aurix-card rounded-2xl p-5">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-bold">${formatMonth(inv.month)}</p>
            <p class="text-white/40 text-xs mt-0.5">${inv.lineItems.length} line item${inv.lineItems.length === 1 ? "" : "s"}</p>
          </div>
          <div class="flex items-center gap-3">
            ${statusBadge(inv.status)}
            <p class="font-bold text-lg">${currency(inv.total)}</p>
          </div>
        </div>
        ${renderLineItemsTable(inv.lineItems)}
        ${inv.notes ? `<div class="mt-4 pt-4 border-t border-white/5"><p class="text-white/30 text-[11px] uppercase tracking-widest font-bold mb-1.5">Notes</p><p class="text-white/60 text-sm whitespace-pre-wrap">${escapeHtml(inv.notes)}</p></div>` : ""}
      </div>
    `).join("");
  }

  window.AurixMyInvoices = {
    async load() {
      loadingEl.classList.remove("hidden");
      errorEl.classList.add("hidden");
      listEl.innerHTML = "";
      emptyEl.classList.add("hidden");

      try {
        const data = await window.AurixApi.getMyInvoices();
        const invoices = (data && data.invoices) || [];
        renderCurrentMonth(invoices);
        renderInvoices(invoices);
      } catch (err) {
        errorEl.textContent = err.message || "Could not load your invoices.";
        errorEl.classList.remove("hidden");
      } finally {
        loadingEl.classList.add("hidden");
      }
    },
    invalidate() {
      // Refresh quietly so the data's ready next time this view is opened.
      this.load();
    },
  };
})();
