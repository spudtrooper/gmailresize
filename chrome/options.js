const DEFAULTS = {
  rules: [
    { minWidth: 0, maxWidth: 1399, pageSize: 10 },
    { minWidth: 1400, maxWidth: 1999, pageSize: 25 },
    { minWidth: 2000, maxWidth: 100000, pageSize: 50 },
  ],
  enabled: true,
  automationDelayMs: 1200,
  localeMode: "english",
};

const VALID_PAGE_SIZES = [10, 15, 20, 25, 50, 100];
const rulesBody = document.getElementById("rulesBody");
const statusEl = document.getElementById("status");

function createRuleRow(rule = { minWidth: 0, maxWidth: 0, pageSize: 25 }) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="number" class="minWidth" min="0" value="${rule.minWidth}" /></td>
    <td><input type="number" class="maxWidth" min="0" value="${rule.maxWidth}" /></td>
    <td>
      <select class="pageSize">
        ${VALID_PAGE_SIZES.map((size) => `<option value="${size}" ${size === rule.pageSize ? "selected" : ""}>${size}</option>`).join("")}
      </select>
    </td>
    <td><button class="removeRule">Remove</button></td>
  `;
  tr.querySelector(".removeRule").addEventListener("click", () => tr.remove());
  return tr;
}

async function load() {
  const current = await chrome.storage.sync.get({
    ...DEFAULTS,
    checkOnPageLoad: true,
  });
  document.getElementById("checkOnPageLoad").checked = current.checkOnPageLoad;
  document.getElementById("automationDelayMs").value =
    current.automationDelayMs;
  rulesBody.innerHTML = "";
  (current.rules || DEFAULTS.rules).forEach((rule) =>
    rulesBody.appendChild(createRuleRow(rule)),
  );
}

function getRulesFromUI() {
  return [...rulesBody.querySelectorAll("tr")].map((tr) => ({
    minWidth: Number(tr.querySelector(".minWidth").value),
    maxWidth: Number(tr.querySelector(".maxWidth").value),
    pageSize: Number(tr.querySelector(".pageSize").value),
  }));
}

function validate(rules) {
  if (!rules.length) return "Add at least one rule.";
  for (const rule of rules) {
    if (
      !Number.isFinite(rule.minWidth) ||
      !Number.isFinite(rule.maxWidth) ||
      rule.minWidth > rule.maxWidth
    ) {
      return "Each rule must have a valid min/max width.";
    }
    if (!VALID_PAGE_SIZES.includes(rule.pageSize)) {
      return "Each rule must use a valid Gmail page size.";
    }
  }
  return null;
}

async function save() {
  const rules = getRulesFromUI().sort((a, b) => a.minWidth - b.minWidth);
  const error = validate(rules);
  if (error) {
    statusEl.textContent = error;
    return;
  }

  await chrome.storage.sync.set({
    checkOnPageLoad: document.getElementById("checkOnPageLoad").checked,
    automationDelayMs:
      Number(document.getElementById("automationDelayMs").value) ||
      DEFAULTS.automationDelayMs,
    rules,
    localeMode: "english",
  });
  statusEl.textContent = "Saved.";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2000);
}

async function resetDefaults() {
  await chrome.storage.sync.set(DEFAULTS);
  await load();
  statusEl.textContent = "Reset to defaults.";
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2000);
}

document.getElementById("addRule").addEventListener("click", () => {
  rulesBody.appendChild(
    createRuleRow({ minWidth: 0, maxWidth: 0, pageSize: 25 }),
  );
});
document.getElementById("save").addEventListener("click", save);
document.getElementById("reset").addEventListener("click", resetDefaults);

load();
