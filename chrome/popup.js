const statusEl = document.getElementById("status");
const currentSettingEl = document.getElementById("current-page-size");
const allButtons = document.querySelectorAll(".size-buttons button");

function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = "status" + (type ? ` ${type}` : "");
}

function setButtonsDisabled(disabled) {
  allButtons.forEach((b) => (b.disabled = disabled));
}

function highlightCurrentSize(size) {
  allButtons.forEach((b) => {
    if (Number(b.dataset.size) === size) {
      b.disabled = true;
      b.classList.add("active");
    } else {
      b.disabled = false;
      b.classList.remove("active");
    }
  });
}

(async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "get-current-page-size",
    });
    if (response?.ok && response.currentRowCount) {
      currentSettingEl.textContent = `Current: ${response.currentRowCount} rows`;
      highlightCurrentSize(response.currentRowCount);
    }
  } catch (err) {
    console.log("[gmailresize:popup] could not get current page size", err);
  }
})();

allButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const pageSize = Number(btn.dataset.size);
    const url = location.href;
    setStatus("Applying\u2026");
    setButtonsDisabled(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "force-page-size",
        pageSize,
        url,
      });
      if (response?.ok) {
        setStatus(`Applied: ${pageSize} rows`, "ok");
        highlightCurrentSize(pageSize);
        currentSettingEl.textContent = `${pageSize}`;
      } else {
        setStatus(response?.error || "Failed", "error");
      }
    } catch (err) {
      setStatus(err.message || "Error", "error");
    } finally {
      setButtonsDisabled(false);
    }
  });
});
