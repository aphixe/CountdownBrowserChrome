(function () {
  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const DEFAULT_PROFILES = [
    { id: "activate-immersion", name: "Activate Immersion", superGoalMinutes: 30 },
    { id: "passive-immersion", name: "Passive Immersion", superGoalMinutes: 30 },
    { id: "anki-migaku", name: "Anki/Migaku", superGoalMinutes: 30 }
  ];

  const DEFAULT_SETTINGS = {
    activeProfileId: DEFAULT_PROFILES[0].id,
    dayStart: "07:00",
    dayEnd: "23:00",
    syncFolderName: "",
    syncEnabled: false,
    lastFolderSyncAt: "",
    lastFolderSyncStatus: "",
    autoProfileOverrideId: "",
    autoProfilePreviousId: "",
    profiles: DEFAULT_PROFILES,
    sessions: []
  };

  const SYNC_FILE_NAMES = {
    "activate-immersion": "active.csv",
    "passive-immersion": "passive.csv",
    "anki-migaku": "anki.csv"
  };
  const SYNC_ALARM_NAME = "folder-sync";
  const SYNC_INTERVAL_MINUTES = 5;
  const DIRECTORY_DB_NAME = "countdown-pro-sync";
  const DIRECTORY_STORE_NAME = "handles";
  const DIRECTORY_HANDLE_KEY = "sync-folder";

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function parseTimeString(value) {
    const [hoursText, minutesText] = value.split(":");
    return {
      hours: Number(hoursText),
      minutes: Number(minutesText)
    };
  }

  function applyTime(date, timeString) {
    const next = new Date(date);
    const { hours, minutes } = parseTimeString(timeString);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  function addCalendarDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function getWindowForDate(date, settings) {
    const start = applyTime(date, settings.dayStart);
    let end = applyTime(date, settings.dayEnd);
    if (end <= start) {
      end.setDate(end.getDate() + 1);
    }
    return { start, end };
  }

  function getTrackingWindowForDate(date, settings) {
    const anchor = applyTime(date, settings.dayStart);
    const start = date < anchor ? addCalendarDays(anchor, -1) : anchor;
    const end = addCalendarDays(start, 1);
    return { start, end };
  }

  function getTrackingWindowForDayKey(dayKey, settings) {
    const start = applyTime(parseDayKey(dayKey), settings.dayStart);
    const end = addCalendarDays(start, 1);
    return { start, end };
  }

  function getTrackingDayKey(date, settings) {
    const currentWindow = getTrackingWindowForDate(date, settings);
    return formatDayKey(currentWindow.start);
  }

  function formatDayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDayKey(dayKey) {
    const [year, month, day] = dayKey.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function getProfile(settings, profileId) {
    return settings.profiles.find((profile) => profile.id === profileId) || settings.profiles[0];
  }

  function normalizeSettings(raw) {
    const defaults = cloneDefaults();
    const settings = {
      ...defaults,
      ...raw
    };

    settings.dayStart = typeof settings.dayStart === "string" ? settings.dayStart : defaults.dayStart;
    settings.dayEnd = typeof settings.dayEnd === "string" ? settings.dayEnd : defaults.dayEnd;
    settings.syncFolderName = typeof settings.syncFolderName === "string" ? settings.syncFolderName : "";
    settings.syncEnabled = Boolean(settings.syncEnabled);
    settings.lastFolderSyncAt = typeof settings.lastFolderSyncAt === "string" ? settings.lastFolderSyncAt : "";
    settings.lastFolderSyncStatus = typeof settings.lastFolderSyncStatus === "string" ? settings.lastFolderSyncStatus : "";
    settings.autoProfileOverrideId = typeof settings.autoProfileOverrideId === "string" ? settings.autoProfileOverrideId : "";
    settings.autoProfilePreviousId = typeof settings.autoProfilePreviousId === "string" ? settings.autoProfilePreviousId : "";
    settings.profiles = Array.isArray(settings.profiles) && settings.profiles.length
      ? settings.profiles.map((profile, index) => ({
          id: profile.id || `profile-${index + 1}`,
          name: profile.name || `Profile ${index + 1}`,
          superGoalMinutes: Number(profile.superGoalMinutes) > 0 ? Number(profile.superGoalMinutes) : 30
        }))
      : defaults.profiles;
    for (const defaultProfile of DEFAULT_PROFILES) {
      if (!settings.profiles.some((profile) => profile.id === defaultProfile.id)) {
        settings.profiles.push({ ...defaultProfile });
      }
    }
    settings.sessions = Array.isArray(settings.sessions) ? settings.sessions.filter(Boolean) : [];

    if (!settings.profiles.some((profile) => profile.id === settings.activeProfileId)) {
      settings.activeProfileId = settings.profiles[0].id;
    }

    return settings;
  }

  async function loadSettings() {
    const result = await chrome.storage.local.get(DEFAULT_SETTINGS);
    return normalizeSettings(result);
  }

  async function saveSettings(settings) {
    const normalized = normalizeSettings(settings);
    await chrome.storage.local.set(normalized);
    return normalized;
  }

  function formatDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function formatGoalMinutes(minutes) {
    if (minutes % 60 === 0) {
      return `${minutes / 60}h`;
    }
    return `${minutes}m`;
  }

  function slugifyProfileName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `profile-${Date.now()}`;
  }

  function getActiveSession(settings, profileId) {
    return settings.sessions.find((session) => session.profileId === profileId && !session.endedAt) || null;
  }

  function splitSessionByDay(startMs, endMs, settings) {
    const chunks = [];
    const startWindow = getTrackingWindowForDate(new Date(startMs), settings);
    let cursor = new Date(startWindow.start);

    while (cursor.getTime() < endMs) {
      const start = cursor;
      const end = addCalendarDays(start, 1);
      const chunkStart = Math.max(startMs, start.getTime());
      const chunkEnd = Math.min(endMs, end.getTime());

      if (chunkEnd > chunkStart) {
        chunks.push({
          dayKey: formatDayKey(start),
          durationSeconds: Math.floor((chunkEnd - chunkStart) / 1000)
        });
      }

      cursor = addCalendarDays(cursor, 1);
    }

    return chunks;
  }

  function getProfileSessions(settings, profileId, now = new Date()) {
    return settings.sessions
      .filter((session) => session.profileId === profileId)
      .map((session) => ({
        ...session,
        endedAt: session.endedAt || now.toISOString()
      }));
  }

  function buildDailyTotals(settings, profileId, now = new Date()) {
    const totals = {};
    for (const session of getProfileSessions(settings, profileId, now)) {
      const startMs = new Date(session.startedAt).getTime();
      const endMs = new Date(session.endedAt).getTime();

      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        continue;
      }

      for (const chunk of splitSessionByDay(startMs, endMs, settings)) {
        totals[chunk.dayKey] = (totals[chunk.dayKey] || 0) + chunk.durationSeconds;
      }
    }
    return totals;
  }

  function buildCalendarDayTotals(settings, profileId, now = new Date()) {
    const totals = {};
    for (const session of getProfileSessions(settings, profileId, now)) {
      const startDate = new Date(session.startedAt);
      const endDate = new Date(session.endedAt);
      const startMs = startDate.getTime();
      const endMs = endDate.getTime();

      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        continue;
      }

      const dayKey = formatDayKey(startDate);
      totals[dayKey] = (totals[dayKey] || 0) + Math.floor((endMs - startMs) / 1000);
    }
    return totals;
  }

  function getTodayStats(settings, profileId, now = new Date()) {
    const dayKey = getTrackingDayKey(now, settings);
    const totals = buildDailyTotals(settings, profileId, now);
    return {
      dayKey,
      totalSeconds: totals[dayKey] || 0
    };
  }

  function getYearTotalSeconds(settings, profileId, year, now = new Date()) {
    const totals = buildDailyTotals(settings, profileId, now);
    return Object.entries(totals).reduce((sum, [dayKey, seconds]) => {
      const date = parseDayKey(dayKey);
      return date.getFullYear() === year ? sum + seconds : sum;
    }, 0);
  }

  function getDayTimeLeftSeconds(settings, now = new Date()) {
    const dayKey = getTrackingDayKey(now, settings);
    const anchorDate = parseDayKey(dayKey);
    const { start, end } = getWindowForDate(anchorDate, settings);

    if (now < start) {
      return Math.floor((end.getTime() - start.getTime()) / 1000);
    }

    if (now >= end) {
      return 0;
    }

    return Math.floor((end.getTime() - now.getTime()) / 1000);
  }

  function getStreakStats(settings, profileId, now = new Date()) {
    const totals = buildCalendarDayTotals(settings, profileId, now);
    const profile = getProfile(settings, profileId);
    const goalSeconds = profile.superGoalMinutes * 60;
    const completedDays = Object.keys(totals)
      .filter((dayKey) => totals[dayKey] >= goalSeconds)
      .sort();

    let longestStreak = 0;
    let currentStreak = 0;
    let running = 0;
    let previousDate = null;

    for (const dayKey of completedDays) {
      const currentDate = parseDayKey(dayKey);
      if (!previousDate) {
        running = 1;
      } else {
        const diffDays = Math.round((currentDate.getTime() - previousDate.getTime()) / 86400000);
        running = diffDays === 1 ? running + 1 : 1;
      }

      previousDate = currentDate;
      longestStreak = Math.max(longestStreak, running);
    }

    const latestCompletedDay = completedDays[completedDays.length - 1];
    if (latestCompletedDay) {
      const todayKey = formatDayKey(now);
      const yesterdayKey = formatDayKey(addCalendarDays(parseDayKey(todayKey), -1));

      if (latestCompletedDay >= yesterdayKey) {
        let targetDate = parseDayKey(latestCompletedDay);
        while (totals[formatDayKey(targetDate)] >= goalSeconds) {
          currentStreak += 1;
          targetDate = addCalendarDays(targetDate, -1);
        }
      }
    }

    return { currentStreak, longestStreak };
  }

  async function startClock(profileId, options = {}) {
    const settings = await loadSettings();
    if (getActiveSession(settings, profileId)) {
      return settings;
    }

    settings.activeProfileId = profileId;
    settings.sessions.push({
      id: crypto.randomUUID(),
      profileId,
      startedAt: new Date().toISOString(),
      endedAt: null,
      source: options.source || "manual",
      autoManaged: Boolean(options.autoManaged)
    });

    return saveSettings(settings);
  }

  async function stopClock(profileId, options = {}) {
    const settings = await loadSettings();
    const activeSession = getActiveSession(settings, profileId);
    if (!activeSession) {
      return settings;
    }

    if (options.onlyIfAuto && !activeSession.autoManaged) {
      return settings;
    }

    activeSession.endedAt = new Date().toISOString();
    return saveSettings(settings);
  }

  function parseCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === '"') {
        const nextCharacter = line[index + 1];
        if (inQuotes && nextCharacter === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (character === "," && !inQuotes) {
        values.push(current);
        current = "";
        continue;
      }

      current += character;
    }

    values.push(current);
    return values.map((value) => value.trim());
  }

  function parseFlexibleTime(value) {
    const parts = String(value || "").trim().split(":").map(Number);
    if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) {
      return null;
    }

    return {
      hours: parts[0],
      minutes: parts[1],
      seconds: parts[2] || 0
    };
  }

  function createLocalDate(dateText, timeText) {
    const dateParts = String(dateText || "").split("-").map(Number);
    const timeParts = parseFlexibleTime(timeText);

    if (dateParts.length !== 3 || dateParts.some((part) => !Number.isFinite(part)) || !timeParts) {
      return null;
    }

    return new Date(
      dateParts[0],
      dateParts[1] - 1,
      dateParts[2],
      timeParts.hours,
      timeParts.minutes,
      timeParts.seconds,
      0
    );
  }

  function parseImportedSessions(csvText, profileId) {
    const lines = String(csvText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return { sessions: [], goalMinutes: null };
    }

    const header = parseCsvLine(lines[0]);
    const columnIndex = Object.fromEntries(header.map((name, index) => [name, index]));
    const requiredColumns = ["date", "start_time", "duration_seconds"];

    for (const column of requiredColumns) {
      if (!(column in columnIndex)) {
        throw new Error(`Missing required column: ${column}`);
      }
    }

    const sessions = [];
    const goalSecondsSeen = [];

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
      const row = parseCsvLine(lines[lineIndex]);
      const dateText = row[columnIndex.date];
      const startText = row[columnIndex.start_time];
      const endText = columnIndex.end_time !== undefined ? row[columnIndex.end_time] : "";
      const durationText = row[columnIndex.duration_seconds];
      const goalText = columnIndex.goal_seconds !== undefined ? row[columnIndex.goal_seconds] : "";

      const startDate = createLocalDate(dateText, startText);
      const durationSeconds = Math.max(0, Number(durationText) || 0);
      if (!startDate || durationSeconds <= 0) {
        continue;
      }

      let endDate = createLocalDate(dateText, endText);
      if (!endDate || endDate <= startDate) {
        endDate = new Date(startDate.getTime() + durationSeconds * 1000);
      }

      sessions.push({
        id: crypto.randomUUID(),
        profileId,
        startedAt: startDate.toISOString(),
        endedAt: endDate.toISOString()
      });

      const goalSeconds = Number(goalText);
      if (Number.isFinite(goalSeconds) && goalSeconds > 0) {
        goalSecondsSeen.push(goalSeconds);
      }
    }

    const goalMinutes = goalSecondsSeen.length ? Math.max(1, Math.round(goalSecondsSeen[0] / 60)) : null;
    return { sessions, goalMinutes };
  }

  function mergeImportedSessions(existingSessions, importedSessions) {
    const seen = new Set(
      existingSessions.map((session) => `${session.profileId}|${session.startedAt}|${session.endedAt || ""}`)
    );
    const merged = [...existingSessions];
    let importedCount = 0;

    for (const session of importedSessions) {
      const key = `${session.profileId}|${session.startedAt}|${session.endedAt || ""}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(session);
      importedCount += 1;
    }

    return { merged, importedCount };
  }

  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  function formatCsvDate(date) {
    return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
  }

  function formatCsvTime(date, includeSeconds = true) {
    const hours = padNumber(date.getHours());
    const minutes = padNumber(date.getMinutes());
    const seconds = padNumber(date.getSeconds());
    return includeSeconds ? `${hours}:${minutes}:${seconds}` : `${hours}:${minutes}`;
  }

  function escapeCsvValue(value) {
    const text = String(value ?? "");
    if (!/[",\n]/.test(text)) {
      return text;
    }
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  function buildExportCsv(settings, profileId) {
    const profile = getProfile(settings, profileId);
    const goalSeconds = profile.superGoalMinutes * 60;
    const sessions = (settings.sessions || [])
      .filter((session) => session.profileId === profileId)
      .filter((session) => session.startedAt && session.endedAt)
      .slice()
      .sort((left, right) => new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime());

    const lines = [
      "date,start_time,end_time,duration_seconds,goal_seconds,label"
    ];

    for (const session of sessions) {
      const startDate = new Date(session.startedAt);
      const endDate = new Date(session.endedAt);

      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
        continue;
      }

      const durationSeconds = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
      const row = [
        formatCsvDate(startDate),
        formatCsvTime(startDate),
        formatCsvTime(endDate),
        durationSeconds,
        goalSeconds,
        ""
      ].map(escapeCsvValue).join(",");

      lines.push(row);
    }

    return lines.join("\r\n");
  }

  function openDirectoryDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DIRECTORY_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DIRECTORY_STORE_NAME)) {
          db.createObjectStore(DIRECTORY_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Failed to open sync folder database."));
    });
  }

  async function withDirectoryStore(mode, callback) {
    const db = await openDirectoryDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DIRECTORY_STORE_NAME, mode);
      const store = transaction.objectStore(DIRECTORY_STORE_NAME);
      const request = callback(store);

      transaction.oncomplete = () => {
        db.close();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("Directory handle transaction failed."));
      };

      if (!request) {
        resolve(undefined);
        return;
      }

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Directory handle request failed."));
    });
  }

  async function saveSyncFolderHandle(handle) {
    await withDirectoryStore("readwrite", (store) => store.put(handle, DIRECTORY_HANDLE_KEY));
  }

  async function clearSyncFolderHandle() {
    await withDirectoryStore("readwrite", (store) => store.delete(DIRECTORY_HANDLE_KEY));
  }

  async function getSyncFolderHandle() {
    return withDirectoryStore("readonly", (store) => store.get(DIRECTORY_HANDLE_KEY));
  }

  async function verifyReadWritePermission(handle, prompt = false) {
    if (!handle || typeof handle.queryPermission !== "function") {
      return false;
    }

    const options = { mode: "readwrite" };
    let permission = await handle.queryPermission(options);
    if (permission === "granted") {
      return true;
    }

    if (!prompt || typeof handle.requestPermission !== "function") {
      return false;
    }

    permission = await handle.requestPermission(options);
    return permission === "granted";
  }

  async function readCsvFileFromDirectory(directoryHandle, fileName) {
    try {
      const fileHandle = await directoryHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return file.text();
    } catch (error) {
      if (error && error.name === "NotFoundError") {
        return "";
      }
      throw error;
    }
  }

  async function writeCsvFileToDirectory(directoryHandle, fileName, text) {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async function syncSettingsWithFolder(options = {}) {
    const directoryHandle = options.directoryHandle || await getSyncFolderHandle();
    if (!directoryHandle) {
      throw new Error("No sync folder selected.");
    }

    const hasPermission = await verifyReadWritePermission(directoryHandle, Boolean(options.promptForPermission));
    if (!hasPermission) {
      throw new Error("Folder permission is missing.");
    }

    let settings = await loadSettings();
    const imports = [];
    let foundExistingCsv = false;

    for (const [profileId, fileName] of Object.entries(SYNC_FILE_NAMES)) {
      const csvText = await readCsvFileFromDirectory(directoryHandle, fileName);
      if (!csvText.trim()) {
        continue;
      }

      foundExistingCsv = true;
      const { sessions, goalMinutes } = parseImportedSessions(csvText, profileId);
      const mergedResult = mergeImportedSessions(settings.sessions || [], sessions);
      settings.sessions = mergedResult.merged;

      const profile = settings.profiles.find((candidate) => candidate.id === profileId);
      if (profile && goalMinutes) {
        profile.superGoalMinutes = goalMinutes;
      }

      imports.push({
        profileId,
        fileName,
        importedCount: mergedResult.importedCount
      });
    }

    settings.syncEnabled = true;
    settings.syncFolderName = directoryHandle.name || settings.syncFolderName || "";
    settings.lastFolderSyncAt = new Date().toISOString();

    if (foundExistingCsv) {
      settings = await saveSettings(settings);
    }

    for (const [profileId, fileName] of Object.entries(SYNC_FILE_NAMES)) {
      const csvText = buildExportCsv(settings, profileId);
      await writeCsvFileToDirectory(directoryHandle, fileName, csvText);
    }

    settings.lastFolderSyncStatus = foundExistingCsv
      ? "Loaded data from sync folder and saved the latest state."
      : "Saved data to sync folder.";
    settings = await saveSettings(settings);

    return {
      mode: foundExistingCsv ? "loaded" : "saved",
      settings,
      imports
    };
  }

  root.CountDownPro = {
    SYNC_ALARM_NAME,
    SYNC_FILE_NAMES,
    SYNC_INTERVAL_MINUTES,
    DEFAULT_PROFILES,
    buildDailyTotals,
    buildExportCsv,
    clearSyncFolderHandle,
    createLocalDate,
    formatDuration,
    formatGoalMinutes,
    getActiveSession,
    getDayTimeLeftSeconds,
    getProfile,
    getSyncFolderHandle,
    getStreakStats,
    getTodayStats,
    getTrackingDayKey,
    getTrackingWindowForDate,
    getTrackingWindowForDayKey,
    getWindowForDate,
    getYearTotalSeconds,
    loadSettings,
    mergeImportedSessions,
    normalizeSettings,
    parseCsvLine,
    parseImportedSessions,
    readCsvFileFromDirectory,
    saveSettings,
    saveSyncFolderHandle,
    slugifyProfileName,
    startClock,
    stopClock,
    syncSettingsWithFolder,
    verifyReadWritePermission,
    writeCsvFileToDirectory
  };
})();
