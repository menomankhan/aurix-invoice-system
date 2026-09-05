/*
  Standalone sign-off page — no login, no session. The sign token in the
  URL is the entire credential: it's a random UUID minted server-side and
  only ever reveals one specific person's own already-approved invoice.
*/
(function () {
  const params = new URLSearchParams(window.location.search);
  const signToken = params.get("token");

  const loadingState = document.getElementById("loadingState");
  const errorState = document.getElementById("errorState");
  const errorMessage = document.getElementById("errorMessage");
  const successState = document.getElementById("successState");
  const signContent = document.getElementById("signContent");
  const introText = document.getElementById("introText");
  const totalAmount = document.getElementById("totalAmount");
  const lineItemsTable = document.getElementById("lineItemsTable");
  const bankDetails = document.getElementById("bankDetails");
  const canvas = document.getElementById("signaturePad");
  const clearBtn = document.getElementById("clearSignatureBtn");
  const confirmBtn = document.getElementById("confirmSignBtn");
  const submitError = document.getElementById("submitError");

  function currency(n) {
    return "Rs " + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatRate(li) {
    return li.currency === "USD" ? "$" + (Number(li.rate) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : currency(li.rate);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str ?? "");
    return div.innerHTML;
  }

  async function callApi(action, payload) {
    let res;
    try {
      res = await fetch(window.AURIX_CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(Object.assign({ action: action }, payload)),
      });
    } catch (e) {
      throw new Error("Could not reach the server. Check your connection and try again.");
    }
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error("Unexpected response from the server.");
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  function showError(message) {
    loadingState.classList.add("hidden");
    signContent.classList.add("hidden");
    errorState.classList.remove("hidden");
    errorMessage.textContent = message;
  }

  // ============================== Signature pad ==============================
  // Only sized/scaled once, right when the canvas actually becomes visible —
  // calling this while hidden would read a 0 width and double-apply the DPI
  // scale transform if called again later.

  const ctx = canvas.getContext("2d");
  let hasDrawn = false;
  let drawing = false;

  function setupCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight || 180;
    canvas.width = cssWidth * ratio;
    canvas.height = cssHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#04153B";
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing = true;
    hasDrawn = true;
    confirmBtn.disabled = false;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }
  function moveDraw(e) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }
  function endDraw() {
    drawing = false;
  }

  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", moveDraw);
  window.addEventListener("mouseup", endDraw);
  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove", moveDraw, { passive: false });
  canvas.addEventListener("touchend", endDraw);

  clearBtn.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn = false;
    confirmBtn.disabled = true;
  });

  // ============================== Load invoice ==============================

  async function load() {
    errorState.classList.add("hidden");
    if (!signToken) {
      showError("This link is missing its sign token. Ask your admin to resend it.");
      return;
    }
    try {
      const inv = await callApi("getSignableInvoice", { signToken: signToken });

      introText.textContent = "Hi " + inv.fullName + ", here's your invoice for " + inv.month + ". Please review it carefully before signing.";
      totalAmount.textContent = currency(inv.total);

      const rows = inv.lineItems.map((li) => `
        <tr class="border-t border-white/5">
          <td class="py-2 pr-3 text-white/70 text-sm">${escapeHtml(li.client)}</td>
          <td class="py-2 pr-3 text-white/70 text-sm">${escapeHtml(li.endClient || "—")}</td>
          <td class="py-2 pr-3 text-white/70 text-sm">${escapeHtml(li.workType)}</td>
          <td class="py-2 pr-3 text-white/50 text-sm">${escapeHtml(li.description || "—")}</td>
          <td class="py-2 pr-3 text-right text-white/70 text-sm">${li.quantity}</td>
          <td class="py-2 pr-3 text-right text-white/70 text-sm">${formatRate(li)}</td>
          <td class="py-2 text-right font-semibold text-white text-sm">${currency(li.amount)}</td>
        </tr>
      `).join("");
      lineItemsTable.innerHTML = `
        <table class="w-full">
          <thead>
            <tr class="text-left text-white/30 text-[11px] uppercase tracking-widest">
              <th class="pb-2 pr-3 font-bold">Client</th>
              <th class="pb-2 pr-3 font-bold">End Client</th>
              <th class="pb-2 pr-3 font-bold">Work Type</th>
              <th class="pb-2 pr-3 font-bold">Description</th>
              <th class="pb-2 pr-3 font-bold text-right">Qty</th>
              <th class="pb-2 pr-3 font-bold text-right">Rate</th>
              <th class="pb-2 font-bold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      bankDetails.innerHTML = (inv.bankName || inv.bankAccountTitle || inv.bankAccountNumber)
        ? `<p><span class="text-white/40">Bank:</span> ${escapeHtml(inv.bankName || "—")}</p>
           <p><span class="text-white/40">Account Title:</span> ${escapeHtml(inv.bankAccountTitle || "—")}</p>
           <p><span class="text-white/40">Account Number:</span> ${escapeHtml(inv.bankAccountNumber || "—")}</p>`
        : `<p class="text-white/40">No bank details on file yet — contact your admin before signing.</p>`;

      loadingState.classList.add("hidden");
      signContent.classList.remove("hidden");
      setupCanvas(); // only now, with the canvas actually laid out at real size
    } catch (err) {
      showError(err.message || "Could not load this invoice.");
    }
  }

  confirmBtn.addEventListener("click", async () => {
    submitError.classList.add("hidden");
    if (!hasDrawn) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Signing…";
    try {
      const signatureImage = canvas.toDataURL("image/png");
      await callApi("submitSignature", { signToken: signToken, signatureImage: signatureImage });
      signContent.classList.add("hidden");
      successState.classList.remove("hidden");
    } catch (err) {
      submitError.textContent = err.message || "Could not save your signature. Please try again.";
      submitError.classList.remove("hidden");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirm & Sign";
    }
  });

  load();
  window.AurixSignPage = { reload: load }; // debug/testing hook
})();
