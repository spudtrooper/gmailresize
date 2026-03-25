const statusEl = document.getElementById("status");
const allButtons = document.querySelectorAll(".size-buttons button");

function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = "status" + (type ? ` ${type}` : "");
}

function setButtonsDisabled(disabled) {
  allButtons.forEach((b) => (b.disabled = disabled));
}

// Load checkOnPageLoad setting
chrome.storage.sync.get({ checkOnPageLoad: true }, ({ checkOnPageLoad }) => {
  document.getElementById("checkOnPageLoad").checked = checkOnPageLoad;
});

document.getElementById("checkOnPageLoad").addEventListener("change", (e) => {
  chrome.storage.sync.set({ checkOnPageLoad: e.target.checked });
});

allButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const pageSize = Number(btn.dataset.size);
    setStatus("Applying\u2026");
    setButtonsDisabled(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "force-page-size",
        pageSize,
      });
      if (response?.ok) {
        setStatus(`Applied: ${pageSize} rows`, "ok");
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
