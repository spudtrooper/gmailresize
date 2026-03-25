const DEFAULT_SETTINGS = {
  rules: [
    { minHeight: 0, maxHeight: 699, pageSize: 10 },
    { minHeight: 700, maxHeight: 999, pageSize: 15 },
    { minHeight: 1000, maxHeight: 1999, pageSize: 25 },
    { minHeight: 2000, maxHeight: 100000, pageSize: 50 },
  ],
  pollIntervalSeconds: 20,
  automationDelayMs: 1200,
  localeMode: "english",
  checkOnPageLoad: true,
};

const VALID_PAGE_SIZES = new Set([10, 15, 20, 25, 50, 100]);
const GMAIL_SETTINGS_URL = "https://mail.google.com/mail/u/0/#settings/general";

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[gmailresize] onInstalled: checking storage");
  const current = await chrome.storage.sync.get(null);
  if (!current.rules) {
    console.log(
      "[gmailresize] onInstalled: no rules found, writing defaults",
      DEFAULT_SETTINGS,
    );
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
  } else {
    console.log("[gmailresize] onInstalled: existing settings found", current);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[gmailresize] message received", message?.type, {
    tabId: sender.tab?.id,
  });
  if (message?.type === "gmail-height-report") {
    handleHeightReport(message, sender.tab?.id).then(
      (result) => {
        console.log("[gmailresize] gmail-height-report result", result);
        sendResponse({ ok: true, result });
      },
      (error) => {
        console.error("[gmailresize] gmail-height-report error", error);
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
  if (message?.type === "force-page-size") {
    handleForcePageSize(message).then(
      (result) => {
        console.log("[gmailresize] force-page-size result", result);
        sendResponse({ ok: true, result });
      },
      (error) => {
        console.error("[gmailresize] force-page-size error", error);
        sendResponse({ ok: false, error: error.message || String(error) });
      },
    );
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
      minHeight: Number(rule.minHeight),
      maxHeight: Number(rule.maxHeight),
      pageSize: Number(rule.pageSize),
    }))
    .filter(
      (rule) =>
        Number.isFinite(rule.minHeight) &&
        Number.isFinite(rule.maxHeight) &&
        VALID_PAGE_SIZES.has(rule.pageSize),
    )
    .sort((a, b) => a.minHeight - b.minHeight);
}

function pickPageSize(height, rules) {
  const match = rules.find(
    (rule) => height >= rule.minHeight && height <= rule.maxHeight,
  );
  return match ? match.pageSize : null;
}

let settingsAutomationActive = false;

async function handleHeightReport(message, senderTabId) {
  const url = message.url || "";
  console.log("[gmailresize] handleHeightReport", {
    height: message.height,
    senderTabId,
    url,
  });

  if (settingsAutomationActive) {
    console.log("[gmailresize] skipping: automation already in progress");
    return { skipped: "automation-in-progress" };
  }

  const settings = await getSettings();
  console.log("[gmailresize] current settings", settings);
  if (!settings.checkOnPageLoad) {
    console.log("[gmailresize] skipping: extension disabled");
    return { skipped: "disabled" };
  }

  const height = Number(message.height);
  const requestedPageSize = pickPageSize(height, settings.rules);
  console.log(
    "[gmailresize] height",
    height,
    "→ requestedPageSize",
    requestedPageSize,
  );
  if (!requestedPageSize) {
    console.log("[gmailresize] skipping: no matching rule for height", height);
    return { skipped: "no-matching-rule", height };
  }

  const currentRowCount = Number(message.currentRowCount) || 0;
  if (currentRowCount === requestedPageSize) {
    console.log("[gmailresize] skipping: row count already matches pageSize", {
      currentRowCount,
      requestedPageSize,
    });
    return {
      skipped: "row-count-matches",
      currentRowCount,
      requestedPageSize,
      height,
    };
  }
  console.log("[gmailresize] row count mismatch", {
    currentRowCount,
    requestedPageSize,
  });

  const state = await chrome.storage.local.get({
    lastAppliedPageSize: null,
    lastAppliedBucket: null,
    lastAppliedAt: 0,
  });
  console.log("[gmailresize] last applied state", state);

  const bucket = `${requestedPageSize}`;
  const now = Date.now();
  if (state.lastAppliedBucket === bucket && now - state.lastAppliedAt < 30000) {
    console.log("[gmailresize] skipping: recently applied", {
      bucket,
      age: now - state.lastAppliedAt,
    });
    return { skipped: "recently-applied", requestedPageSize, height };
  }

  const [activeGmailTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    url: "https://mail.google.com/*",
  });
  const gmailTabId = senderTabId ?? activeGmailTab?.id;
  console.log("[gmailresize] gmailTabId", gmailTabId, {
    senderTabId,
    activeGmailTabId: activeGmailTab?.id,
  });
  if (!gmailTabId) {
    console.warn("[gmailresize] skipping: no Gmail tab found");
    return { skipped: "no-gmail-tab" };
  }

  await runAutomation(url, gmailTabId, requestedPageSize, settings);

  await chrome.storage.local.set({
    lastAppliedPageSize: requestedPageSize,
    lastAppliedBucket: bucket,
    lastAppliedAt: Date.now(),
  });
  console.log(
    "[gmailresize] applied pageSize",
    requestedPageSize,
    "for height",
    height,
  );
  return { applied: true, requestedPageSize, height };
}

async function runAutomation(url, gmailTabId, pageSize, settings) {
  settingsAutomationActive = true;
  console.log(
    "[gmailresize] navigating tab",
    gmailTabId,
    "to settings for pageSize",
    pageSize,
  );
  try {
    await chrome.tabs.update(gmailTabId, { url: GMAIL_SETTINGS_URL });
    console.log("[gmailresize] waiting for settings tab to load");
    //await waitForTabComplete(gmailTabId, 30000);
    console.log(
      "[gmailresize] settings tab loaded, waiting automationDelayMs",
      settings.automationDelayMs,
    );
    await delay(settings.automationDelayMs);
    await delay(1000);
    console.log(
      "[gmailresize] running automation script for pageSize",
      pageSize,
    );
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: gmailTabId },
      func: automationScript,
      args: [url, pageSize, settings.localeMode],
    });
    console.log("[gmailresize] automation script result", result?.result);

    if (!result?.result?.ok) {
      throw new Error(result?.result?.error || "Automation failed");
    }
  } finally {
    console.log("[gmailresize] clearing settingsAutomationActive");
    settingsAutomationActive = false;
  }
}

async function handleForcePageSize(message) {
  const url = message.url || "";
  console.log("[gmailresize] handleForcePageSize", {
    pageSize: message.pageSize,
  });
  const pageSize = Number(message.pageSize);
  if (!VALID_PAGE_SIZES.has(pageSize)) {
    throw new Error(`Invalid page size: ${pageSize}`);
  }
  if (settingsAutomationActive) {
    throw new Error("Settings automation already in progress");
  }
  const settings = await getSettings();
  console.log("[gmailresize] current settings", settings);
  const [activeGmailTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    url: "https://mail.google.com/*",
  });
  const gmailTabId = activeGmailTab?.id;
  console.log("[gmailresize] force-page-size: gmailTabId", gmailTabId);
  if (!gmailTabId) {
    throw new Error("No Gmail tab found. Open Gmail first.");
  }
  await runAutomation(url, gmailTabId, pageSize, settings);
  return { applied: true, pageSize };
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    console.log("[gmailresize] waitForTabComplete: watching tab", tabId);
    const timeout = setTimeout(() => {
      console.error(
        "[gmailresize] waitForTabComplete: timed out after",
        timeoutMs,
        "ms",
      );
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for Gmail settings tab to load"));
    }, timeoutMs);

    async function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId) {
        console.log(
          "[gmailresize] tab",
          tabId,
          "update:",
          changeInfo.status,
          changeInfo.url || "",
        );
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

function automationScript(url, targetPageSize, localeMode) {
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
      console.warn("[gmailresize:automation] could not find Save Changes button");
      // return { ok: false, error: "Could not find Save Changes button." };
    }
    await sleep(1500);
    return { ok: true };
  }

  return (async () => {
    console.log(
      "[gmailresize:automation] starting for pageSize",
      targetPageSize,
      "localeMode",
      localeMode,
    );

    if (localeMode !== "english") {
      console.error(
        "[gmailresize:automation] unsupported localeMode",
        localeMode,
      );
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
    // Return to url
    await sleep(500);
    console.log("[gmailresize:automation] returning to url", url);
    if (url) {
      window.location.href = url;
    }
    return saveResult;
  })();
}
