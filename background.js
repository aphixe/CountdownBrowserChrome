importScripts("shared.js");

const {
  SYNC_ALARM_NAME,
  SYNC_INTERVAL_MINUTES,
  getActiveSession,
  getProfile,
  loadSettings,
  syncSettingsWithFolder,
  startClock,
  stopClock
} = globalThis.CountDownPro;

let reconcileTimer = null;
let iconState = null;

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

function getAutoManagedSessions(settings) {
  return (settings.sessions || []).filter((session) => !session.endedAt && session.autoManaged);
}

function scheduleReconcile() {
  clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void reconcileAudioClock();
  }, 250);
}

async function hasAudibleTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.some((tab) => tab.audible);
}

async function reconcileAudioClock() {
  const settings = await loadSettings();
  const profile = getProfile(settings, settings.activeProfileId);
  const activeSession = getActiveSession(settings, profile.id);
  const autoManagedSessions = getAutoManagedSessions(settings);
  const audible = await hasAudibleTabs();

  if (audible) {
    for (const session of autoManagedSessions) {
      if (session.profileId !== profile.id) {
        await stopClock(session.profileId, { onlyIfAuto: true });
      }
    }

    if (!activeSession) {
      await startClock(profile.id, {
        source: "tab-audio",
        autoManaged: true
      });
    }
    await updateActionIcon(await loadSettings());
    return;
  }

  for (const session of autoManagedSessions) {
    await stopClock(session.profileId, { onlyIfAuto: true });
  }

  await updateActionIcon(await loadSettings());
}

async function ensureSyncAlarm() {
  await chrome.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES
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
  scheduleReconcile();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureSyncAlarm();
  scheduleReconcile();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    void runFolderSync();
  }
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if ("audible" in changeInfo || "status" in changeInfo || "mutedInfo" in changeInfo) {
    scheduleReconcile();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  scheduleReconcile();
});

chrome.tabs.onActivated.addListener(() => {
  scheduleReconcile();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes.activeProfileId || changes.sessions)) {
    scheduleReconcile();
  }
});

void loadSettings().then(updateActionIcon);
void ensureSyncAlarm();
void runFolderSync();
scheduleReconcile();
