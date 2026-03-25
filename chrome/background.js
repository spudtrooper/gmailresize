const DEFAULT_SETTINGS = {
  rules: [
    { minWidth: 0, maxWidth: 1399, pageSize: 10 },
    { minWidth: 1400, maxWidth: 1999, pageSize: 25 },
    { minWidth: 2000, maxWidth: 100000, pageSize: 50 },
  ],
  pollIntervalSeconds: 20,
  enabled: true,
  automationDelayMs: 1200,
  localeMode: "english",
};

const VALID_PAGE_SIZES = new Set([10, 15, 20, 25, 50, 100]);
const GMAIL_SETTINGS_URL = "https://mail.google.com/mail/u/0/#settings/general";

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[gmailresize] onInstalled: checking storage");
  const current = await chrome.storage.sync.get(null);
  if (!current.rules) {
    console.log("[gmailresize] onInstalled: no rules found, writing defaults", DEFAULT_SETTINGS);
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
  } else {
    console.log("[gmailresize] onInstalled: existing settings found", current);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[gmailresize] message received", message?.type, { tabId: sender.tab?.id });
  if (message?.type === "gmail-width-report") {
    handleWidthReport(message, sender.tab?.id).then(
      (result) => {
        console.log("[gmailresize] gmail-width-report result", result);
        sendResponse({ ok: true, result });
      },
      (error) => {
        console.error("[gmailresize] gmail-width-report error", error);
        sendResponse({ ok: false, error: error.message || String(error) });
      },
    );
    return true;
  }
  if (message?.type === "get-settings") {
    getSettings().then((settings) => {
      console.log("[gmailresize] get-settings result", settings);
      sendResponse({ ok: true, settings });
    });
    return true;
  }
});

async function getSettings() {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...current,
    rules: normalizeRules(current.rules || DEFAULT_SETTINGS.rules),
  };
}

function normalizeRules(rules) {
  return [...rules]
    .map((rule) => ({
      minWidth: Number(rule.minWidth),
      maxWidth: Number(rule.maxWidth),
      pageSize: Number(rule.pageSize),
    }))
    .filter(
      (rule) =>
        Number.isFinite(rule.minWidth) &&
        Number.isFinite(rule.maxWidth) &&
        VALID_PAGE_SIZES.has(rule.pageSize),
    )
    .sort((a, b) => a.minWidth - b.minWidth);
}

function pickPageSize(width, rules) {
  const match = rules.find(
    (rule) => width >= rule.minWidth && width <= rule.maxWidth,
  );
  return match ? match.pageSize : null;
}

let settingsAutomationActive = false;

async function handleWidthReport(message, senderTabId) {
  console.log("[gmailresize] handleWidthReport", { width: message.width, senderTabId });

  if (settingsAutomationActive) {
    console.log("[gmailresize] skipping: automation already in progress");
    return { skipped: "automation-in-progress" };
  }

  const settings = await getSettings();
  if (!settings.enabled) {
    console.log("[gmailresize] skipping: extension disabled");
    return { skipped: "disabled" };
  }

  const width = Number(message.width);
  const requestedPageSize = pickPageSize(width, settings.rules);
  console.log("[gmailresize] width", width, "→ requestedPageSize", requestedPageSize);
  if (!requestedPageSize) {
    console.log("[gmailresize] skipping: no matching rule for width", width);
    return { skipped: "no-matching-rule", width };
  }

  const currentRowCount = Number(message.currentRowCount) || 0;
  if (currentRowCount === requestedPageSize) {
    console.log("[gmailresize] skipping: row count already matches pageSize", { currentRowCount, requestedPageSize });
    return { skipped: "row-count-matches", currentRowCount, requestedPageSize, width };
  }
  console.log("[gmailresize] row count mismatch", { currentRowCount, requestedPageSize });

  const state = await chrome.storage.local.get({
    lastAppliedPageSize: null,
    lastAppliedBucket: null,
    lastAppliedAt: 0,
  });
  console.log("[gmailresize] last applied state", state);

  const bucket = `${requestedPageSize}`;
  const now = Date.now();
  if (state.lastAppliedBucket === bucket && now - state.lastAppliedAt < 30000) {
    console.log("[gmailresize] skipping: recently applied", { bucket, age: now - state.lastAppliedAt });
    return { skipped: "recently-applied", requestedPageSize, width };
  }

  const [activeGmailTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    url: "https://mail.google.com/*",
  });
  const gmailTabId = senderTabId ?? activeGmailTab?.id;
  console.log("[gmailresize] gmailTabId", gmailTabId, { senderTabId, activeGmailTabId: activeGmailTab?.id });
  if (!gmailTabId) {
    console.warn("[gmailresize] skipping: no Gmail tab found");
    return { skipped: "no-gmail-tab" };
  }

  settingsAutomationActive = true;
  console.log("[gmailresize] navigating tab", gmailTabId, "to settings");
  try {
    await chrome.tabs.update(gmailTabId, { url: GMAIL_SETTINGS_URL });
    console.log("[gmailresize] waiting for settings tab to load");
    //await waitForTabComplete(gmailTabId, 30000);
    console.log("[gmailresize] settings tab loaded, waiting automationDelayMs", settings.automationDelayMs);
    await delay(settings.automationDelayMs);
    await delay(1000);
    console.log("[gmailresize] running automation script for pageSize", requestedPageSize);
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: gmailTabId },
      func: automationScript,
      args: [requestedPageSize, settings.localeMode],
    });
    console.log("[gmailresize] automation script result", result?.result);

    if (!result?.result?.ok) {
      throw new Error(result?.result?.error || "Automation failed");
    }

    await chrome.storage.local.set({
      lastAppliedPageSize: requestedPageSize,
      lastAppliedBucket: bucket,
      lastAppliedAt: Date.now(),
    });
    console.log("[gmailresize] applied pageSize", requestedPageSize, "for width", width);

    return { applied: true, requestedPageSize, width };
  } finally {
    console.log("[gmailresize] clearing settingsAutomationActive");
    settingsAutomationActive = false;
  }
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    console.log("[gmailresize] waitForTabComplete: watching tab", tabId);
    const timeout = setTimeout(() => {
      console.error("[gmailresize] waitForTabComplete: timed out after", timeoutMs, "ms");
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for Gmail settings tab to load"));
    }, timeoutMs);

    async function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId) {
        console.log("[gmailresize] tab", tabId, "update:", changeInfo.status, changeInfo.url || "");
      }
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        console.log("[gmailresize] waitForTabComplete: tab", tabId, "complete");
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function automationScript(targetPageSize, localeMode) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function clickIfFound(predicate) {
    const el = Array.from(
      document.querySelectorAll('button, div[role="button"], span, a'),
    ).find(predicate);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }

  function getText(el) {
    return (el?.innerText || el?.textContent || "").trim();
  }

  async function openGeneralIfNeeded() {
    const headings = Array.from(
      document.querySelectorAll('h2, h3, [role="heading"]'),
    );
    if (headings.some((h) => /general/i.test(getText(h)))) return true;

    const clicked = clickIfFound((el) => /general/i.test(getText(el)));
    if (clicked) {
      await sleep(500);
      return true;
    }
    return false;
  }

  async function setPageSize() {
    const selects = Array.from(document.querySelectorAll("select"));
    let targetSelect = selects.find((select) => {
      const nearby = [
        select,
        select.parentElement,
        select.closest("tr"),
        select.closest("div"),
      ]
        .filter(Boolean)
        .map(getText)
        .join(" ");
      return /maximum page size/i.test(nearby);
    });

    if (!targetSelect) {
      const rows = Array.from(document.querySelectorAll("tr, div"));
      const row = rows.find(
        (node) =>
          /maximum page size/i.test(getText(node)) &&
          node.querySelector("select"),
      );
      targetSelect = row?.querySelector("select") || null;
    }

    if (!targetSelect) {
      return {
        ok: false,
        error:
          "Could not find the Maximum page size dropdown. Gmail UI may have changed.",
      };
    }

    const desired = String(targetPageSize);
    const option = Array.from(targetSelect.options).find(
      (opt) => opt.value === desired || getText(opt).includes(desired),
    );
    if (!option) {
      return {
        ok: false,
        error: `Could not find page size option ${targetPageSize}.`,
      };
    }

    targetSelect.value = option.value;
    targetSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(400);
    return { ok: true };
  }

  async function saveChanges() {
    const clicked = clickIfFound((el) => /save changes/i.test(getText(el)));
    if (!clicked) {
      return { ok: false, error: "Could not find Save Changes button." };
    }
    await sleep(1500);
    return { ok: true };
  }

  return (async () => {
    console.log("[gmailresize:automation] starting for pageSize", targetPageSize, "localeMode", localeMode);

    if (localeMode !== "english") {
      console.error("[gmailresize:automation] unsupported localeMode", localeMode);
      return {
        ok: false,
        error: "This version only supports English Gmail settings labels.",
      };
    }

    await sleep(800);
    console.log("[gmailresize:automation] opening General tab if needed");
    await openGeneralIfNeeded();
    console.log("[gmailresize:automation] setting page size");
    const setResult = await setPageSize();
    console.log("[gmailresize:automation] setPageSize result", setResult);
    if (!setResult.ok) return setResult;
    console.log("[gmailresize:automation] saving changes");
    const saveResult = await saveChanges();
    console.log("[gmailresize:automation] saveChanges result", saveResult);
    return saveResult;
  })();
}
