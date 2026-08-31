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
    const monthSelect = sub.querySelector(".monthSelect");
    const quantityInput = sub.querySelector(".quantityInput");
    const rateInput = sub.querySelector(".rateInput");
    const amountDisplay = sub.querySelector(".amountDisplay");
    const removeBtn = sub.querySelector(".removeSubLineItemBtn");

    // unique datalist id per sub-row so multiple rows don't collide
    const datalistId = "endClients_" + Math.random().toString(36).slice(2);
    endClientDatalist.id = datalistId;
    endClientInput.setAttribute("list", datalistId);

    fillSelect(monthSelect, monthOptions(12));
    monthSelect.value = currentMonthValue();

    function recalcAmount() {
      const qty = Number(quantityInput.value) || 0;
      const rate = Number(rateInput.value) || 0;
      amountDisplay.textContent = currency(qty * rate);
      recalcGroupSubtotal(group);
      recalcSubmissionTotal();
    }
    quantityInput.addEventListener("input", recalcAmount);
    rateInput.addEventListener("input", recalcAmount);

    removeBtn.addEventListener("click", () => {
      if (subContainer.children.length === 1) return; // always keep at least one line per client
      sub.remove();
      recalcGroupSubtotal(group);
      recalcSubmissionTotal();
    });

    subContainer.appendChild(sub);
    refreshSubLineItemOptions(sub, group);
    recalcAmount();
  }

  // ============================== Totals ==============================

  function recalcGroupSubtotal(group) {
    let total = 0;
    group.querySelectorAll(".sub-line-item").forEach((sub) => {
      const qty = Number(sub.querySelector(".quantityInput").value) || 0;
      const rate = Number(sub.querySelector(".rateInput").value) || 0;
      total += qty * rate;
    });
    group.querySelector(".groupSubtotal").textContent = currency(total);
  }

  function recalcSubmissionTotal() {
    let total = 0;
    container.querySelectorAll(".sub-line-item").forEach((sub) => {
      const qty = Number(sub.querySelector(".quantityInput").value) || 0;
      const rate = Number(sub.querySelector(".rateInput").value) || 0;
      total += qty * rate;
    });
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

        if (!workType || !month) {
          throw new Error("Every line needs a work type and month.");
        }
        if (quantity <= 0) {
          throw new Error("Quantity must be greater than zero on every line.");
        }

        items.push({ client, endClient, workType, description, month, quantity, rate });
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

  // start with one client group
  addClientGroup();
})();
