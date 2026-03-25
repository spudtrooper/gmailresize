(() => {
  let timer = null;
  let lastWidth = null;

  function reportWidth() {
    // Don't run on urls with #settings/ in them
    if (location.hash.includes("#settings/")) {
      console.log("Skipping width report on settings page");
      return;
    }

    const width = Math.max(
      window.innerWidth || 0,
      document.documentElement.clientWidth || 0,
    );
    if (!width || width === lastWidth) return;
    lastWidth = width;

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
    console.log("[gmailresize:content] width", width, "currentRowCount", currentRowCount);

    chrome.runtime.sendMessage({
      type: "gmail-width-report",
      width,
      currentRowCount,
      tabId: null,
    });
  }

  function scheduleReport() {
    clearTimeout(timer);
    timer = setTimeout(reportWidth, 800);
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
  scheduleReport();
})();
