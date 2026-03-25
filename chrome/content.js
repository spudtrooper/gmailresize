(() => {
  let timer = null;
  let lastWidth = null;

  function reportWidth() {
    const width = Math.max(
      window.innerWidth || 0,
      document.documentElement.clientWidth || 0,
    );
    if (!width || width === lastWidth) return;
    lastWidth = width;

    chrome.runtime.sendMessage({
      type: "gmail-width-report",
      width,
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
