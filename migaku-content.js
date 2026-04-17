(() => {
  const REPORT_DELAY_MS = 150;
  let reportTimer = null;
  let lastPayload = "";

  function hasClassName(predicate) {
    const nodes = document.querySelectorAll("[class]");
    for (const node of nodes) {
      for (const className of node.classList) {
        if (predicate(className)) {
          return true;
        }
      }
    }
    return false;
  }

  function getPageState() {
    const isSummary = hasClassName((className) => className === "StudySummary__main" || className.startsWith("StudySummary__main"));
    const isHome = hasClassName((className) => className === "home");
    const isStudy = hasClassName((className) => className === "Study" || className.startsWith("Study__"));

    return {
      type: "migaku-page-state",
      url: window.location.href,
      isStudy,
      isSummary,
      isHome
    };
  }

  function sendPageState() {
    reportTimer = null;
    const payload = getPageState();
    const nextPayload = JSON.stringify(payload);
    if (nextPayload === lastPayload) {
      return;
    }
    lastPayload = nextPayload;
    void chrome.runtime.sendMessage(payload).catch(() => {});
  }

  function scheduleReport() {
    if (reportTimer) {
      clearTimeout(reportTimer);
    }
    reportTimer = setTimeout(sendPageState, REPORT_DELAY_MS);
  }

  function patchHistoryMethod(name) {
    const original = history[name];
    if (typeof original !== "function") {
      return;
    }
    history[name] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      scheduleReport();
      return result;
    };
  }

  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");

  const observer = new MutationObserver(() => {
    scheduleReport();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  window.addEventListener("load", scheduleReport);
  window.addEventListener("popstate", scheduleReport);
  document.addEventListener("readystatechange", scheduleReport);
  setInterval(scheduleReport, 2000);
  scheduleReport();
})();
