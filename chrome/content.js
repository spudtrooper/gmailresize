(() => {
  let timer = null;
  let lastHeight = null;

  function reportHeight() {
    // Don't run on urls with #settings/ in them
    if (location.hash.includes("#settings/")) {
      console.log("Skipping height report on settings page");
      return;
    }

    const height = Math.max(
      window.innerHeight || 0,
      document.documentElement.clientHeight || 0,
    );
    if (!height || height === lastHeight) return;
    lastHeight = height;

    const currentRowCount = (() => {
      const dj = document.querySelector("span.Dj");
      if (!dj) return 0;
      const ts = dj.querySelectorAll("span.ts");
      if (ts.length < 2) return 0;
      const start = parseInt(ts[0].textContent, 10);
      const end = parseInt(ts[1].textContent, 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
      return end - start + 1;
    })();
    console.log(
      "[gmailresize:content] height",
      height,
      "currentRowCount",
      currentRowCount,
    );

    chrome.runtime.sendMessage({
      type: "gmail-height-report",
      height,
      currentRowCount,
      tabId: null,
    });
  }

  function scheduleReport() {
    clearTimeout(timer);
    timer = setTimeout(reportHeight, 800);
  }

  window.addEventListener("resize", scheduleReport, { passive: true });
  window.addEventListener("focus", scheduleReport, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleReport();
  });

  const observer = new MutationObserver(() => {
    if (location.href.includes("mail.google.com")) {
      scheduleReport();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  chrome.storage.sync.get({ checkOnPageLoad: true }, ({ checkOnPageLoad }) => {
    if (checkOnPageLoad) scheduleReport();
  });
})();
