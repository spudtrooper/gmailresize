const statusEl = document.getElementById("status");
const allButtons = document.querySelectorAll(".size-buttons button");

function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = "status" + (type ? ` ${type}` : "");
}

function setButtonsDisabled(disabled) {
  allButtons.forEach((b) => (b.disabled = disabled));
}

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
