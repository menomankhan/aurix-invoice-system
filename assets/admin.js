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

  const { formatMonth } = window.AURIX_DATA;

  let allInvoices = [];

  function currency(n) {
    return "Rs " + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
        ${inv.notes ? `<div class="mt-4 pt-4 border-t border-white/5"><p class="text-white/30 text-[11px] uppercase tracking-widest font-bold mb-1.5">Notes</p><p class="text-white/60 text-sm whitespace-pre-wrap">${escapeHtml(inv.notes)}</p></div>` : ""}
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
