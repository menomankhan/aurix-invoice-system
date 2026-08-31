(function () {
  if (!window.AurixSession) return;

  const container = document.getElementById("lineItemsContainer");
  const template = document.getElementById("lineItemTemplate");
  const addBtn = document.getElementById("addLineItemBtn");
  const submitBtn = document.getElementById("submitBtn");
  const submitBtnText = document.getElementById("submitBtnText");
  const submitSpinner = document.getElementById("submitSpinner");
  const totalEl = document.getElementById("submissionTotal");
  const errorEl = document.getElementById("submitError");
  const successEl = document.getElementById("submitSuccess");

  const { CLIENTS, END_CLIENTS, WORK_TYPES, monthOptions, currentMonthValue } = window.AURIX_DATA;

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

  function addLineItem() {
    const node = template.content.firstElementChild.cloneNode(true);

    const clientSelect = node.querySelector(".clientSelect");
    const endClientInput = node.querySelector(".endClientInput");
    const endClientDatalist = node.querySelector(".endClientDatalist");
    const workTypeSelect = node.querySelector(".workTypeSelect");
    const monthSelect = node.querySelector(".monthSelect");
    const quantityInput = node.querySelector(".quantityInput");
    const rateInput = node.querySelector(".rateInput");
    const amountDisplay = node.querySelector(".amountDisplay");
    const removeBtn = node.querySelector(".removeLineItemBtn");

    fillSelect(clientSelect, CLIENTS, "Select a client…");
    fillSelect(workTypeSelect, WORK_TYPES, "Select work type…");
    fillSelect(monthSelect, monthOptions(12));
    monthSelect.value = currentMonthValue();

    // unique datalist id per row so multiple rows don't collide
    const datalistId = "endClients_" + Math.random().toString(36).slice(2);
    endClientDatalist.id = datalistId;
    endClientInput.setAttribute("list", datalistId);

    function refreshEndClientSuggestions() {
      const suggestions = END_CLIENTS[clientSelect.value] || [];
      endClientDatalist.innerHTML = "";
      suggestions.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        endClientDatalist.appendChild(opt);
      });
    }
    clientSelect.addEventListener("change", refreshEndClientSuggestions);
    refreshEndClientSuggestions();

    function recalcAmount() {
      const qty = Number(quantityInput.value) || 0;
      const rate = Number(rateInput.value) || 0;
      amountDisplay.textContent = currency(qty * rate);
      recalcSubmissionTotal();
    }
    quantityInput.addEventListener("input", recalcAmount);
    rateInput.addEventListener("input", recalcAmount);

    removeBtn.addEventListener("click", () => {
      if (container.children.length === 1) return; // always keep at least one row
      node.remove();
      recalcSubmissionTotal();
    });

    container.appendChild(node);
    recalcAmount();
  }

  function recalcSubmissionTotal() {
    let total = 0;
    container.querySelectorAll(".line-item").forEach((row) => {
      const qty = Number(row.querySelector(".quantityInput").value) || 0;
      const rate = Number(row.querySelector(".rateInput").value) || 0;
      total += qty * rate;
    });
    totalEl.textContent = currency(total);
  }

  function collectLineItems() {
    const rows = Array.from(container.querySelectorAll(".line-item"));
    const items = [];
    for (const row of rows) {
      const client = row.querySelector(".clientSelect").value;
      const endClient = row.querySelector(".endClientInput").value.trim();
      const workType = row.querySelector(".workTypeSelect").value;
      const description = row.querySelector(".descriptionInput").value.trim();
      const month = row.querySelector(".monthSelect").value;
      const quantity = Number(row.querySelector(".quantityInput").value) || 0;
      const rate = Number(row.querySelector(".rateInput").value) || 0;

      if (!client || !workType || !month) {
        throw new Error("Every line item needs a client, work type, and month.");
      }
      if (quantity <= 0) {
        throw new Error("Quantity must be greater than zero on every line item.");
      }

      items.push({ client, endClient, workType, description, month, quantity, rate });
    }
    if (items.length === 0) throw new Error("Add at least one line item first.");
    return items;
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtnText.classList.toggle("hidden", loading);
    submitSpinner.classList.toggle("hidden", !loading);
  }

  addBtn.addEventListener("click", addLineItem);

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
      await window.AurixApi.submitLineItems(items);
      successEl.textContent = "Submitted! Your invoice has been updated.";
      successEl.classList.remove("hidden");

      container.innerHTML = "";
      addLineItem();
      recalcSubmissionTotal();

      if (window.AurixMyInvoices) window.AurixMyInvoices.invalidate();
    } catch (err) {
      errorEl.textContent = err.message || "Something went wrong submitting your items.";
      errorEl.classList.remove("hidden");
    } finally {
      setLoading(false);
    }
  });

  // start with one row
  addLineItem();
})();
