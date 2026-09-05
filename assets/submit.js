(function () {
  if (!window.AurixSession) return;

  const container = document.getElementById("clientGroupsContainer");
  const groupTemplate = document.getElementById("clientGroupTemplate");
  const subTemplate = document.getElementById("subLineItemTemplate");
  const addGroupBtn = document.getElementById("addClientGroupBtn");
  const notesInput = document.getElementById("submissionNotes");
  const submitBtn = document.getElementById("submitBtn");
  const submitBtnText = document.getElementById("submitBtnText");
  const submitSpinner = document.getElementById("submitSpinner");
  const totalEl = document.getElementById("submissionTotal");
  const errorEl = document.getElementById("submitError");
  const successEl = document.getElementById("submitSuccess");

  const { monthOptions, currentMonthValue } = window.AURIX_DATA;

  function currency(n) {
    return "Rs " + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // A USD line's PKR equivalent uses whatever the admin's rate is right
  // now — this is just a live preview; the amount actually saved is locked
  // in server-side at the moment of submission, using the rate at that time.
  function lineAmount(sub) {
    const qty = Number(sub.querySelector(".quantityInput").value) || 0;
    const rate = Number(sub.querySelector(".rateInput").value) || 0;
    const curr = sub.querySelector(".currencySelect").value;
    const fx = curr === "USD" ? (window.AurixSettingsStore.get().usdToPkrRate || 1) : 1;
    return qty * rate * fx;
  }

  function fillSelect(select, options, placeholder) {
    select.innerHTML = "";
    if (placeholder) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = placeholder;
      select.appendChild(opt);
    }
    options.forEach((o) => {
      const opt = document.createElement("option");
      if (typeof o === "object") {
        opt.value = o.value;
        opt.textContent = o.label;
      } else {
        opt.value = o;
        opt.textContent = o;
      }
      select.appendChild(opt);
    });
  }

  // ============================== Client groups ==============================

  async function addClientGroup() {
    let clients = [];
    try {
      ({ clients } = await window.AurixClientsStore.load());
    } catch (err) {
      errorEl.textContent = "Could not load the client list — you can still fill in everything else.";
      errorEl.classList.remove("hidden");
    }
    try {
      await window.AurixWorkTypesStore.load();
    } catch (err) {
      errorEl.textContent = "Could not load the work type list — you can still fill in everything else.";
      errorEl.classList.remove("hidden");
    }

    const group = groupTemplate.content.firstElementChild.cloneNode(true);
    const clientSelect = group.querySelector(".groupClientSelect");
    const addSubBtn = group.querySelector(".addSubLineItemBtn");
    const removeGroupBtn = group.querySelector(".removeGroupBtn");
    const toggleGroupBtn = group.querySelector(".toggleGroupBtn");
    const groupBody = group.querySelector(".groupBody");
    const groupChevron = group.querySelector(".groupChevron");

    fillSelect(clientSelect, clients, "Select a client…");

    clientSelect.addEventListener("change", () => {
      group.querySelectorAll(".sub-line-item").forEach((sub) => refreshSubLineItemOptions(sub, group));
    });

    addSubBtn.addEventListener("click", () => addSubLineItem(group));

    removeGroupBtn.addEventListener("click", () => {
      if (container.children.length === 1) return; // always keep at least one client group
      group.remove();
      recalcSubmissionTotal();
    });

    toggleGroupBtn.addEventListener("click", () => {
      groupBody.classList.toggle("hidden");
      groupChevron.classList.toggle("rotate-90");
    });

    container.appendChild(group);
    addSubLineItem(group); // every new client starts with one line
  }

  function refreshSubLineItemOptions(sub, group) {
    const clientSelect = group.querySelector(".groupClientSelect");
    const endClientInput = sub.querySelector(".endClientInput");
    const endClientDatalist = sub.querySelector(".endClientDatalist");
    const workTypeSelect = sub.querySelector(".workTypeSelect");

    const { endClients } = window.AurixClientsStore.get();
    const suggestions = endClients[clientSelect.value] || [];
    endClientDatalist.innerHTML = "";
    suggestions.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      endClientDatalist.appendChild(opt);
    });

    const previousWorkType = workTypeSelect.value;
    const workTypeOptions = window.AurixWorkTypesStore.forClient(clientSelect.value);
    fillSelect(workTypeSelect, workTypeOptions, "Select work type…");
    workTypeSelect.value = workTypeOptions.includes(previousWorkType) ? previousWorkType : "";
  }

  // ============================== Sub-line-items ==============================

  function addSubLineItem(group) {
    const subContainer = group.querySelector(".subLineItemsContainer");
    const sub = subTemplate.content.firstElementChild.cloneNode(true);

    const endClientInput = sub.querySelector(".endClientInput");
    const endClientDatalist = sub.querySelector(".endClientDatalist");
    const workTypeSelect = sub.querySelector(".workTypeSelect");
    const monthSelect = sub.querySelector(".monthSelect");
    const quantityInput = sub.querySelector(".quantityInput");
    const currencySelect = sub.querySelector(".currencySelect");
    const rateInput = sub.querySelector(".rateInput");
    const amountDisplay = sub.querySelector(".amountDisplay");
    const removeBtn = sub.querySelector(".removeSubLineItemBtn");
    const toggleSubBtn = sub.querySelector(".toggleSubBtn");
    const subDetails = sub.querySelector(".subLineDetails");
    const subChevron = sub.querySelector(".subChevron");
    const summaryText = sub.querySelector(".summaryText");
    const summaryAmount = sub.querySelector(".summaryAmount");

    // unique datalist id per sub-row so multiple rows don't collide
    const datalistId = "endClients_" + Math.random().toString(36).slice(2);
    endClientDatalist.id = datalistId;
    endClientInput.setAttribute("list", datalistId);

    fillSelect(monthSelect, monthOptions(12));
    monthSelect.value = currentMonthValue();

    function updateSummary() {
      const workType = workTypeSelect.value;
      const endClient = endClientInput.value.trim();
      const qty = Number(quantityInput.value) || 0;
      const rate = Number(rateInput.value) || 0;
      const curr = currencySelect.value;

      const parts = [workType || "Select work type…"];
      if (endClient) parts.push(endClient);
      parts.push(`Qty ${qty} × ${curr === "USD" ? "$" + rate.toLocaleString() : currency(rate)}`);
      summaryText.textContent = parts.join(" · ");
      summaryAmount.textContent = currency(lineAmount(sub));
    }

    function recalcAmount() {
      amountDisplay.textContent = currency(lineAmount(sub));
      updateSummary();
      recalcGroupSubtotal(group);
      recalcSubmissionTotal();
    }
    quantityInput.addEventListener("input", recalcAmount);
    currencySelect.addEventListener("change", recalcAmount);
    rateInput.addEventListener("input", recalcAmount);
    endClientInput.addEventListener("input", updateSummary);
    workTypeSelect.addEventListener("change", updateSummary);

    removeBtn.addEventListener("click", () => {
      if (subContainer.children.length === 1) return; // always keep at least one line per client
      sub.remove();
      recalcGroupSubtotal(group);
      recalcSubmissionTotal();
    });

    toggleSubBtn.addEventListener("click", () => {
      subDetails.classList.toggle("hidden");
      subChevron.classList.toggle("rotate-90");
    });

    subContainer.appendChild(sub);
    refreshSubLineItemOptions(sub, group);
    recalcAmount();
  }

  // ============================== Totals ==============================

  function recalcGroupSubtotal(group) {
    const subs = group.querySelectorAll(".sub-line-item");
    let total = 0;
    subs.forEach((sub) => { total += lineAmount(sub); });
    group.querySelector(".groupSubtotal").textContent = currency(total);
    group.querySelector(".groupItemCount").textContent = `${subs.length} line${subs.length === 1 ? "" : "s"}`;
  }

  function recalcSubmissionTotal() {
    let total = 0;
    container.querySelectorAll(".sub-line-item").forEach((sub) => { total += lineAmount(sub); });
    totalEl.textContent = currency(total);
  }

  // ============================== Submit ==============================

  function collectLineItems() {
    const groups = Array.from(container.querySelectorAll(".client-group"));
    const items = [];
    for (const group of groups) {
      const client = group.querySelector(".groupClientSelect").value;
      if (!client) throw new Error("Every client group needs a client selected.");

      const subs = Array.from(group.querySelectorAll(".sub-line-item"));
      for (const sub of subs) {
        const endClient = sub.querySelector(".endClientInput").value.trim();
        const workType = sub.querySelector(".workTypeSelect").value;
        const description = sub.querySelector(".descriptionInput").value.trim();
        const month = sub.querySelector(".monthSelect").value;
        const quantity = Number(sub.querySelector(".quantityInput").value) || 0;
        const rate = Number(sub.querySelector(".rateInput").value) || 0;
        const currencyCode = sub.querySelector(".currencySelect").value;

        if (!workType || !month) {
          throw new Error("Every line needs a work type and month.");
        }
        if (quantity <= 0) {
          throw new Error("Quantity must be greater than zero on every line.");
        }

        items.push({ client, endClient, workType, description, month, quantity, rate, currency: currencyCode });
      }
    }
    if (items.length === 0) throw new Error("Add at least one line item first.");
    return items;
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtnText.classList.toggle("hidden", loading);
    submitSpinner.classList.toggle("hidden", !loading);
  }

  addGroupBtn.addEventListener("click", addClientGroup);

  submitBtn.addEventListener("click", async () => {
    errorEl.classList.add("hidden");
    successEl.classList.add("hidden");

    let items;
    try {
      items = collectLineItems();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove("hidden");
      return;
    }

    setLoading(true);
    try {
      await window.AurixApi.submitLineItems(items, notesInput.value.trim());
      successEl.textContent = "Submitted! Your invoice has been updated.";
      successEl.classList.remove("hidden");

      container.innerHTML = "";
      notesInput.value = "";
      addClientGroup();
      recalcSubmissionTotal();

      if (window.AurixMyInvoices) window.AurixMyInvoices.invalidate();
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong submitting your items.";
      errorEl.classList.remove("hidden");
    } finally {
      setLoading(false);
    }
  });

  // Warm the exchange-rate cache so the first USD line typed already shows
  // an accurate PKR preview instead of briefly assuming a 1:1 rate.
  window.AurixSettingsStore.load().catch(() => {});

  // start with one client group
  addClientGroup();
})();
