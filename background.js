importScripts("shared.js");

const {
  SYNC_ALARM_NAME,
  SYNC_INTERVAL_MINUTES,
  formatElapsedCounter,
  getActiveSession,
  getAnkiConnectStatus,
  invokeAnkiConnect,
  getTodayStats,
  getProfile,
  loadSettings,
  saveSettings,
  syncSettingsWithFolder,
  startClock,
  stopClock
} = globalThis.CountDownPro;

let reconcileTimer = null;
let iconState = null;
let ankiReviewTimer = null;
let badgeIntervalId = null;
const migakuTabStates = new Map();
const BADGE_ALARM_NAME = "badge-tick";
const BADGE_INTERVAL_MINUTES = 1;
const ANKI_REVIEW_ALARM_NAME = "anki-review-tick";
const ANKI_REVIEW_INTERVAL_MINUTES = 0.5;
const ANKI_REVIEW_POLL_MS = 4000;
const MIGAKU_STUDY_PROFILE_ID = "anki-migaku";
const MIGAKU_STUDY_ORIGIN = "https://study.migaku.com";
const MIGAKU_STUDY_SOURCE = "migaku-study-page";
const ANKI_REVIEW_SOURCE = "anki-connect-review";
const AUDIO_SOURCE = "tab-audio";
const ANKI_AUTO_PROFILE_OVERRIDE_ID = "anki-review";
const MIGAKU_AUTO_PROFILE_OVERRIDE_ID = "migaku-review";

function drawEmojiIcon(emoji, size) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");

  context.clearRect(0, 0, size, size);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${Math.floor(size * 0.82)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  context.fillText(emoji, size / 2, size / 2 + size * 0.04);

  return context.getImageData(0, 0, size, size);
}

async function updateActionIcon(settings) {
  const profile = getProfile(settings, settings.activeProfileId);
  const activeSession = getActiveSession(settings, profile.id);
  const nextState = activeSession ? "running" : "idle";

  if (nextState === iconState) {
    return;
  }

  iconState = nextState;

  if (nextState === "running") {
    const emoji = "⌛️";
    await chrome.action.setIcon({
      imageData: {
        16: drawEmojiIcon(emoji, 16),
        32: drawEmojiIcon(emoji, 32),
        48: drawEmojiIcon(emoji, 48),
        128: drawEmojiIcon(emoji, 128)
      }
    });
    return;
  }

  await chrome.action.setIcon({
    path: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png"
    }
  });
}

function formatBadgeText(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  if (safeSeconds <= 0) {
    return "";
  }
  if (safeSeconds < 60) {
    return `${safeSeconds}s`;
  }
  const totalMinutes = Math.floor(safeSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0 || hours >= 10) {
    return `${hours}h`;
  }
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function formatBadgeTitle(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  if (safeSeconds <= 0) {
    return "CountDown Pro";
  }
  if (safeSeconds < 60) {
    return `${formatElapsedCounter(safeSeconds)} tracked`;
  }
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m tracked`;
  }
  if (minutes === 0) {
    return `${hours}h tracked`;
  }
  return `${hours}h ${minutes}m tracked`;
}

async function updateActionBadge(settings) {
  const profile = getProfile(settings, settings.activeProfileId);
  const activeSession = getActiveSession(settings, profile.id);

  if (!activeSession) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "CountDown Pro" });
    return;
  }

  const today = getTodayStats(settings, profile.id, new Date());
  const badgeText = formatBadgeText(today.totalSeconds);

  await chrome.action.setBadgeBackgroundColor({ color: "#1f2937" });
  await chrome.action.setBadgeText({ text: badgeText });
  await chrome.action.setTitle({ title: formatBadgeTitle(today.totalSeconds) });
}

function stopBadgeTicker() {
  if (badgeIntervalId) {
    clearInterval(badgeIntervalId);
    badgeIntervalId = null;
  }
}

function startBadgeTicker() {
  if (badgeIntervalId) {
    return;
  }

  badgeIntervalId = setInterval(() => {
    void loadSettings().then(updateActionBadge);
  }, 1000);
}

function syncBadgeTicker(settings) {
  const profile = getProfile(settings, settings.activeProfileId);
  const activeSession = getActiveSession(settings, profile.id);

  if (activeSession) {
    startBadgeTicker();
    return;
  }

  stopBadgeTicker();
}

function getAutoManagedSessions(settings, source = "") {
  return (settings.sessions || []).filter((session) => {
    if (session.endedAt || !session.autoManaged) {
      return false;
    }
    if (source && session.source !== source) {
      return false;
    }
    return true;
  });
}

function scheduleReconcile() {
  clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void reconcileState();
  }, 250);
}

function clearAnkiReviewLoop() {
  if (ankiReviewTimer) {
    clearTimeout(ankiReviewTimer);
    ankiReviewTimer = null;
  }
}

async function scheduleAnkiReviewLoop(delayMs = ANKI_REVIEW_POLL_MS) {
  clearAnkiReviewLoop();
  const settings = await loadSettings();
  if (!settings.ankiConnectEnabled) {
    return;
  }

  ankiReviewTimer = setTimeout(() => {
    ankiReviewTimer = null;
    void (async () => {
      await reconcileState();
      await scheduleAnkiReviewLoop(ANKI_REVIEW_POLL_MS);
    })();
  }, delayMs);
}

function isMigakuStudyUrl(urlString) {
  if (!urlString) {
    return false;
  }
  try {
    const url = new URL(urlString);
    return url.origin === MIGAKU_STUDY_ORIGIN;
  } catch {
    return false;
  }
}

function isActiveMigakuStudyState(state) {
  return Boolean(state && state.isStudy && !state.isSummary && !state.isHome);
}

async function hasAudibleTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.some((tab) => tab.audible && !isMigakuStudyUrl(tab.url));
}

async function hasMigakuStudyTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.some((tab) => isMigakuStudyUrl(tab.url) && isActiveMigakuStudyState(migakuTabStates.get(tab.id)));
}

async function getAnkiReviewState(settings) {
  const connectionStatus = await getAnkiConnectStatus(settings);
  if (!connectionStatus.ok) {
    return {
      connected: false,
      reviewing: false,
      card: null
    };
  }

  try {
    const card = await invokeAnkiConnect(settings, "guiCurrentCard");
    return {
      connected: true,
      reviewing: Boolean(card && card.cardId),
      card: card || null
    };
  } catch {
    return {
      connected: false,
      reviewing: false,
      card: null
    };
  }
}

async function reconcileAutoProfile() {
  const settings = await loadSettings();
  const hasStudyTab = await hasMigakuStudyTabs();
  const ankiReview = await getAnkiReviewState(settings);
  const nextOverrideId = ankiReview.reviewing
    ? ANKI_AUTO_PROFILE_OVERRIDE_ID
    : (hasStudyTab ? MIGAKU_AUTO_PROFILE_OVERRIDE_ID : "");

  if (nextOverrideId) {
    if (settings.activeProfileId !== MIGAKU_STUDY_PROFILE_ID) {
      await saveSettings({
        ...settings,
        autoProfilePreviousId: settings.autoProfilePreviousId || settings.activeProfileId,
        autoProfileOverrideId: nextOverrideId,
        activeProfileId: MIGAKU_STUDY_PROFILE_ID
      });
      return;
    }

    if (settings.autoProfileOverrideId !== nextOverrideId) {
      await saveSettings({
        ...settings,
        autoProfileOverrideId: nextOverrideId,
        autoProfilePreviousId: settings.autoProfilePreviousId
      });
    }
    return;
  }

  if (settings.autoProfileOverrideId === ANKI_AUTO_PROFILE_OVERRIDE_ID || settings.autoProfileOverrideId === MIGAKU_AUTO_PROFILE_OVERRIDE_ID) {
    const fallbackId = settings.autoProfilePreviousId && settings.profiles.some((profile) => profile.id === settings.autoProfilePreviousId)
      ? settings.autoProfilePreviousId
      : settings.profiles[0].id;
    await saveSettings({
      ...settings,
      activeProfileId: fallbackId,
      autoProfileOverrideId: "",
      autoProfilePreviousId: ""
    });
  }
}

async function reconcileState() {
  await reconcileAutoProfile();
  await reconcileMigakuStudyClock();
  await reconcileAudioClock();
  await reconcileAnkiReviewClock();
}

async function reconcileMigakuStudyClock() {
  const settings = await loadSettings();
  const migakuManagedSessions = getAutoManagedSessions(settings, MIGAKU_STUDY_SOURCE);
  const hasStudyTab = await hasMigakuStudyTabs();

  if (!hasStudyTab) {
    for (const session of migakuManagedSessions) {
      await stopClock(session.profileId, {
        sessionId: session.id,
        onlyIfAuto: true,
        onlyIfSource: MIGAKU_STUDY_SOURCE
      });
    }

    const nextSettings = await loadSettings();
    await updateActionIcon(nextSettings);
    await updateActionBadge(nextSettings);
    return;
  }

  for (const session of migakuManagedSessions) {
    if (session.profileId !== MIGAKU_STUDY_PROFILE_ID) {
      await stopClock(session.profileId, {
        sessionId: session.id,
        onlyIfAuto: true,
        onlyIfSource: MIGAKU_STUDY_SOURCE
      });
    }
  }

  const migakuSession = getActiveSession(settings, MIGAKU_STUDY_PROFILE_ID);
  if (!migakuSession) {
    await startClock(MIGAKU_STUDY_PROFILE_ID, {
      source: MIGAKU_STUDY_SOURCE,
      autoManaged: true
    });
  }

  const nextSettings = await loadSettings();
  await updateActionIcon(nextSettings);
  await updateActionBadge(nextSettings);
}

async function reconcileAudioClock() {
  const settings = await loadSettings();
  const profile = getProfile(settings, settings.activeProfileId);
  const activeSession = getActiveSession(settings, profile.id);
  const audioManagedSessions = getAutoManagedSessions(settings, AUDIO_SOURCE);

  if (!settings.autoClockOnAudio) {
    for (const session of audioManagedSessions) {
      await stopClock(session.profileId, { sessionId: session.id, onlyIfAuto: true, onlyIfSource: AUDIO_SOURCE });
    }

    const nextSettings = await loadSettings();
    await updateActionIcon(nextSettings);
    await updateActionBadge(nextSettings);
    return;
  }

  const audible = await hasAudibleTabs();

  if (audible) {
    for (const session of audioManagedSessions) {
      if (session.profileId !== profile.id) {
        await stopClock(session.profileId, {
          sessionId: session.id,
          onlyIfAuto: true,
          onlyIfSource: AUDIO_SOURCE
        });
      }
    }

    if (!activeSession) {
      await startClock(profile.id, {
        source: AUDIO_SOURCE,
        autoManaged: true
      });
    }
    const nextSettings = await loadSettings();
    await updateActionIcon(nextSettings);
    await updateActionBadge(nextSettings);
    return;
  }

  for (const session of audioManagedSessions) {
    await stopClock(session.profileId, {
      sessionId: session.id,
      onlyIfAuto: true,
      onlyIfSource: AUDIO_SOURCE
    });
  }

  const nextSettings = await loadSettings();
  await updateActionIcon(nextSettings);
  await updateActionBadge(nextSettings);
}

async function reconcileAnkiReviewClock() {
  const settings = await loadSettings();
  const ankiManagedSessions = getAutoManagedSessions(settings, ANKI_REVIEW_SOURCE);
  const reviewState = await getAnkiReviewState(settings);

  if (!reviewState.reviewing) {
    for (const session of ankiManagedSessions) {
      await stopClock(session.profileId, {
        sessionId: session.id,
        onlyIfAuto: true,
        onlyIfSource: ANKI_REVIEW_SOURCE
      });
    }

    const nextSettings = await loadSettings();
    await updateActionIcon(nextSettings);
    await updateActionBadge(nextSettings);
    return;
  }

  for (const session of ankiManagedSessions) {
    if (session.profileId !== MIGAKU_STUDY_PROFILE_ID) {
      await stopClock(session.profileId, {
        sessionId: session.id,
        onlyIfAuto: true,
        onlyIfSource: ANKI_REVIEW_SOURCE
      });
    }
  }

  const ankiSession = getActiveSession(settings, MIGAKU_STUDY_PROFILE_ID);
  if (!ankiSession) {
    await startClock(MIGAKU_STUDY_PROFILE_ID, {
      source: ANKI_REVIEW_SOURCE,
      autoManaged: true
    });
  }

  const nextSettings = await loadSettings();
  await updateActionIcon(nextSettings);
  await updateActionBadge(nextSettings);
}

async function ensureSyncAlarm() {
  await chrome.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES
  });
}

async function ensureBadgeAlarm() {
  await chrome.alarms.create(BADGE_ALARM_NAME, {
    periodInMinutes: BADGE_INTERVAL_MINUTES
  });
}

async function ensureAnkiReviewAlarm() {
  await chrome.alarms.create(ANKI_REVIEW_ALARM_NAME, {
    periodInMinutes: ANKI_REVIEW_INTERVAL_MINUTES
  });
}

async function runFolderSync() {
  const settings = await loadSettings();
  if (!settings.syncEnabled || !settings.syncFolderName) {
    return;
  }

  try {
    await syncSettingsWithFolder();
  } catch (error) {
    await chrome.storage.local.set({
      lastFolderSyncAt: new Date().toISOString(),
      lastFolderSyncStatus: error && error.message ? error.message : "Folder sync failed."
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureSyncAlarm();
  void ensureAnkiReviewAlarm();
  void scheduleAnkiReviewLoop(1000);
  scheduleReconcile();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureSyncAlarm();
  void ensureAnkiReviewAlarm();
  void scheduleAnkiReviewLoop(1000);
  scheduleReconcile();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    void runFolderSync();
    return;
  }
  if (alarm.name === BADGE_ALARM_NAME) {
    void reconcileState();
    void loadSettings().then(updateActionBadge);
    return;
  }
  if (alarm.name === ANKI_REVIEW_ALARM_NAME) {
    void reconcileState();
    void scheduleAnkiReviewLoop(1000);
  }
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if ("audible" in changeInfo || "status" in changeInfo || "mutedInfo" in changeInfo || "url" in changeInfo) {
    if (changeInfo.url && !isMigakuStudyUrl(changeInfo.url)) {
      migakuTabStates.delete(_tabId);
    }
    scheduleReconcile();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  migakuTabStates.delete(tabId);
  scheduleReconcile();
});

chrome.tabs.onActivated.addListener(() => {
  scheduleReconcile();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (
    changes.activeProfileId ||
    changes.sessions ||
    changes.autoClockOnAudio ||
    changes.ankiConnectEnabled ||
    changes.ankiConnectHost ||
    changes.ankiConnectPort ||
    changes.autoProfileOverrideId ||
    changes.autoProfilePreviousId
  )) {
    scheduleReconcile();
    void loadSettings().then(syncBadgeTicker);
    if (changes.ankiConnectEnabled || changes.ankiConnectHost || changes.ankiConnectPort) {
      if (changes.ankiConnectEnabled && !changes.ankiConnectEnabled.newValue) {
        clearAnkiReviewLoop();
      } else {
        void scheduleAnkiReviewLoop(500);
      }
    }
    void loadSettings().then(updateActionBadge);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "migaku-page-state" || !sender.tab || typeof sender.tab.id !== "number") {
    return false;
  }

  migakuTabStates.set(sender.tab.id, {
    url: message.url || sender.tab.url || "",
    isStudy: Boolean(message.isStudy),
    isSummary: Boolean(message.isSummary),
    isHome: Boolean(message.isHome)
  });
  scheduleReconcile();
  return false;
});

void loadSettings().then((settings) => {
  syncBadgeTicker(settings);
  void updateActionIcon(settings);
  void updateActionBadge(settings);
});
void ensureSyncAlarm();
void ensureBadgeAlarm();
void ensureAnkiReviewAlarm();
void scheduleAnkiReviewLoop(1000);
void runFolderSync();
scheduleReconcile();
