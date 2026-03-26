const DEFAULTS = {
  rules: [
    { minHeight: 0, maxHeight: 699, pageSize: 10 },
    { minHeight: 700, maxHeight: 999, pageSize: 15 },
    { minHeight: 1000, maxHeight: 1999, pageSize: 25 },
    { minHeight: 2000, maxHeight: 100000, pageSize: 50 },
  ],
  pollIntervalSeconds: 20,
  automationDelayMs: 0,
  localeMode: "english",
  checkOnPageLoad: true,
};

const VALID_PAGE_SIZES = [10, 15, 25, 50, 100];
const rulesBody = document.getElementById("rulesBody");
const statusEl = document.getElementById("status");

function createRuleRow(rule = { minHeight: 0, maxHeight: 0, pageSize: 25 }) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="number" class="minHeight" min="0" value="${rule.minHeight}" /></td>
    <td><input type="number" class="maxHeight" min="0" value="${rule.maxHeight}" /></td>
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
  return [...rulesBody.querySelectorAll("tr")]
    .map((tr) => ({
      minHeight: Number(tr.querySelector(".minHeight").value),
      maxHeight: Number(tr.querySelector(".maxHeight").value),
      pageSize: Number(tr.querySelector(".pageSize").value),
    }))
    .sort((a, b) => a.minHeight - b.minHeight);
}

function validate(rules) {
  if (!rules.length) return "Add at least one rule.";
  for (const rule of rules) {
    if (
      !Number.isFinite(rule.minHeight) ||
      !Number.isFinite(rule.maxHeight) ||
      rule.minHeight > rule.maxHeight
    ) {
      return "Each rule must have a valid min/max height.";
    }
    if (!VALID_PAGE_SIZES.includes(rule.pageSize)) {
      return "Each rule must use a valid Gmail page size.";
    }
  }
  return null;
}

async function save() {
  const rules = getRulesFromUI().sort((a, b) => a.minHeight - b.minHeight);
  const error = validate(rules);
  if (error) {
    statusEl.textContent = error;
    return;
  }
  const settings = {
    rules,
    localeMode: "english",
    checkOnPageLoad: document.getElementById("checkOnPageLoad").checked,
    automationDelayMs:
      Number(document.getElementById("automationDelayMs").value) ||
      DEFAULTS.automationDelayMs,
  };
  await chrome.storage.sync.set(settings);
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
    createRuleRow({ minHeight: 0, maxHeight: 0, pageSize: 25 }),
  );
});
document.getElementById("save").addEventListener("click", save);
document.getElementById("reset").addEventListener("click", resetDefaults);

load();
