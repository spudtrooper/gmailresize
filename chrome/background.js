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
  const current = await chrome.storage.sync.get(null);
  if (!current.rules) {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "gmail-width-report") {
    handleWidthReport(message).then(
      (result) => sendResponse({ ok: true, result }),
      (error) =>
        sendResponse({ ok: false, error: error.message || String(error) }),
    );
    return true;
  }
  if (message?.type === "get-settings") {
    getSettings().then((settings) => sendResponse({ ok: true, settings }));
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

async function handleWidthReport(message) {
  const settings = await getSettings();
  if (!settings.enabled) {
    return { skipped: "disabled" };
  }

  const width = Number(message.width);
  const requestedPageSize = pickPageSize(width, settings.rules);
  if (!requestedPageSize) {
    return { skipped: "no-matching-rule", width };
  }

  const state = await chrome.storage.local.get({
    lastAppliedPageSize: null,
    lastAppliedBucket: null,
    lastAppliedAt: 0,
  });

  const bucket = `${requestedPageSize}`;
  const now = Date.now();
  if (state.lastAppliedBucket === bucket && now - state.lastAppliedAt < 30000) {
    return { skipped: "recently-applied", requestedPageSize, width };
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    url: "https://mail.google.com/*",
  });
  const openerTabId = senderTabIdOrNull(message);

  const [existingSettingsTab] = await chrome.tabs.query({
    url: GMAIL_SETTINGS_URL + "*",
  });
  const reusingTab = !!existingSettingsTab;
  const settingsTab = existingSettingsTab
    ? existingSettingsTab
    : await chrome.tabs.create({
        url: GMAIL_SETTINGS_URL,
        active: false,
        openerTabId: openerTabId || tab?.id,
      });

  try {
    if (reusingTab) {
      await delay(settings.automationDelayMs);
    } else {
      await waitForTabComplete(settingsTab.id, 30000);
      await delay(settings.automationDelayMs);
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: settingsTab.id },
      func: automationScript,
      args: [requestedPageSize, settings.localeMode],
    });

    if (!result?.result?.ok) {
      throw new Error(result?.result?.error || "Automation failed");
    }

    await chrome.storage.local.set({
      lastAppliedPageSize: requestedPageSize,
      lastAppliedBucket: bucket,
      lastAppliedAt: Date.now(),
    });

    return { applied: true, requestedPageSize, width };
  } finally {
    if (!reusingTab && settingsTab?.id) {
      try {
        await chrome.tabs.remove(settingsTab.id);
      } catch (_) {}
    }
  }
}

function senderTabIdOrNull(message) {
  return Number.isInteger(message?.tabId) ? message.tabId : null;
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for Gmail settings tab to load"));
    }, timeoutMs);

    async function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
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
    if (localeMode !== "english") {
      return {
        ok: false,
        error: "This version only supports English Gmail settings labels.",
      };
    }

    await sleep(800);
    await openGeneralIfNeeded();
    const setResult = await setPageSize();
    if (!setResult.ok) return setResult;
    return await saveChanges();
  })();
}
