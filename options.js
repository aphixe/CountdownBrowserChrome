const {
  buildExportCsv,
  getAnkiConnectStatus,
  getProfile,
  loadSettings,
  normalizeProfileColor,
  normalizeSettings,
  parseImportedSessions,
  saveSettings,
  slugifyProfileName,
} = window.CountDownPro;

const dayStartInput = document.getElementById("dayStartInput");
const dayEndInput = document.getElementById("dayEndInput");
const weekStartDaySelect = document.getElementById("weekStartDaySelect");
const profileGoalSelect = document.getElementById("profileGoalSelect");
const superGoalHoursInput = document.getElementById("superGoalHoursInput");
const superGoalMinutesInput = document.getElementById("superGoalMinutesInput");
const profilesList = document.getElementById("profilesList");
const addProfileButton = document.getElementById("addProfileButton");
const saveButton = document.getElementById("saveButton");
const saveStatus = document.getElementById("saveStatus");
const importProfileSelect = document.getElementById("importProfileSelect");
const csvFileInput = document.getElementById("csvFileInput");
const importButton = document.getElementById("importButton");
const importStatus = document.getElementById("importStatus");
const exportProfileSelect = document.getElementById("exportProfileSelect");
const exportButton = document.getElementById("exportButton");
const exportStatus = document.getElementById("exportStatus");
const ankiConnectEnabledInput = document.getElementById("ankiConnectEnabledInput");
const ankiConnectHostInput = document.getElementById("ankiConnectHostInput");
const ankiConnectPortInput = document.getElementById("ankiConnectPortInput");
const ankiConnectIndicator = document.getElementById("ankiConnectIndicator");
const ankiConnectIndicatorText = document.getElementById("ankiConnectIndicatorText");
const ankiConnectStatus = document.getElementById("ankiConnectStatus");
const testAnkiConnectButton = document.getElementById("testAnkiConnectButton");
const autoExportEnabledInput = document.getElementById("autoExportEnabledInput");
const syncServerFields = document.getElementById("syncServerFields");
const csvSyncServerUrlInput = document.getElementById("csvSyncServerUrlInput");
const csvSyncTokenInput = document.getElementById("csvSyncTokenInput");
const autoExportStatus = document.getElementById("autoExportStatus");
const testSyncServerButton = document.getElementById("testSyncServerButton");
const exportAllNowButton = document.getElementById("exportAllNowButton");

let draftSettings = null;
let ankiStatusRequestId = 0;
let ankiSettingsSaveTimeoutId = null;

function setStatus(message) {
  saveStatus.textContent = message;
}

function setImportStatus(message) {
  importStatus.textContent = message;
}

function setExportStatus(message) {
  exportStatus.textContent = message;
}

function setAnkiStatus(message) {
  ankiConnectStatus.textContent = message;
}

function setAutoExportStatus(message) {
  autoExportStatus.textContent = message;
}

function setAnkiIndicator(state, text) {
  ankiConnectIndicator.classList.remove("is-connected", "is-disconnected", "is-disabled", "is-checking");
  ankiConnectIndicator.classList.add(`is-${state}`);
  ankiConnectIndicatorText.textContent = text;
}

function renderCsvSyncTargetFields() {
  syncServerFields.hidden = false;
  testSyncServerButton.hidden = false;
}

function splitGoalMinutes(totalMinutes) {
  const safeMinutes = Math.max(1, Number(totalMinutes) || 30);
  return {
    hours: Math.floor(safeMinutes / 60),
    minutes: safeMinutes % 60
  };
}

function renderGoalInputs(totalMinutes) {
  const { hours, minutes } = splitGoalMinutes(totalMinutes);
  superGoalHoursInput.value = String(hours);
  superGoalMinutesInput.value = String(minutes);
}

function getGoalMinutesFromInputs() {
  const hours = Math.max(0, Number(superGoalHoursInput.value) || 0);
  const minutes = Math.max(0, Math.min(59, Number(superGoalMinutesInput.value) || 0));

  superGoalHoursInput.value = String(hours);
  superGoalMinutesInput.value = String(minutes);

  return Math.max(1, (hours * 60) + minutes);
}

function renderProfileGoalSelect() {
  const currentValue = profileGoalSelect.value || draftSettings.activeProfileId;
  profileGoalSelect.innerHTML = "";

  for (const profile of draftSettings.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    if (profile.id === currentValue) {
      option.selected = true;
    }
    profileGoalSelect.append(option);
  }

  const selectedProfile = getProfile(draftSettings, profileGoalSelect.value || draftSettings.activeProfileId);
  renderGoalInputs(selectedProfile.superGoalMinutes);
}

function renderImportProfileSelect() {
  const currentValue = importProfileSelect.value || draftSettings.activeProfileId;
  importProfileSelect.innerHTML = "";

  for (const profile of draftSettings.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    if (profile.id === currentValue) {
      option.selected = true;
    }
    importProfileSelect.append(option);
  }
}

function renderExportProfileSelect() {
  const currentValue = exportProfileSelect.value || draftSettings.activeProfileId;
  exportProfileSelect.innerHTML = "";

  for (const profile of draftSettings.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    if (profile.id === currentValue) {
      option.selected = true;
    }
    exportProfileSelect.append(option);
  }
}

function renderProfilesList() {
  profilesList.innerHTML = "";

  for (const profile of draftSettings.profiles) {
    const item = document.createElement("div");
    item.className = "profile-item";

    const input = document.createElement("input");
    input.type = "text";
    input.value = profile.name;
    input.placeholder = "Profile name";
    input.addEventListener("input", (event) => {
      profile.name = event.target.value;
      setStatus("");
      renderProfileGoalSelect();
      renderImportProfileSelect();
      renderExportProfileSelect();
    });

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = normalizeProfileColor(profile.color, profile.name);
    colorInput.className = "profile-color-input";
    colorInput.setAttribute("aria-label", `${profile.name || "Profile"} color`);
    colorInput.addEventListener("input", (event) => {
      profile.color = event.target.value;
      setStatus("");
    });

    const actions = document.createElement("div");
    actions.className = "profile-actions";

    const makeActiveButton = document.createElement("button");
    makeActiveButton.type = "button";
    makeActiveButton.className = "secondary-button";
    makeActiveButton.textContent = draftSettings.activeProfileId === profile.id ? "Active" : "Set Active";
    makeActiveButton.disabled = draftSettings.activeProfileId === profile.id;
    makeActiveButton.addEventListener("click", () => {
      draftSettings.activeProfileId = profile.id;
      renderProfilesList();
      renderProfileGoalSelect();
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary-button";
    removeButton.textContent = "Remove";
    const isFixedProfile = ["activate-immersion", "passive-immersion", "anki-migaku"].includes(profile.id);
    removeButton.disabled = draftSettings.profiles.length === 1 || isFixedProfile;
    removeButton.addEventListener("click", () => {
      if (draftSettings.profiles.length === 1 || isFixedProfile) {
        return;
      }

      draftSettings.profiles = draftSettings.profiles.filter((candidate) => candidate.id !== profile.id);
      if (draftSettings.activeProfileId === profile.id) {
        draftSettings.activeProfileId = draftSettings.profiles[0].id;
      }
      renderProfilesList();
      renderProfileGoalSelect();
      renderImportProfileSelect();
      renderExportProfileSelect();
    });

    actions.append(colorInput, makeActiveButton, removeButton);
    item.append(input, actions);
    profilesList.append(item);
  }
}

function renderOptions() {
  dayStartInput.value = draftSettings.dayStart;
  dayEndInput.value = draftSettings.dayEnd;
  weekStartDaySelect.value = String(draftSettings.weekStartDay);
  ankiConnectEnabledInput.checked = Boolean(draftSettings.ankiConnectEnabled);
  ankiConnectHostInput.value = draftSettings.ankiConnectHost || "127.0.0.1";
  ankiConnectPortInput.value = String(draftSettings.ankiConnectPort || 8765);
  ankiConnectHostInput.disabled = !draftSettings.ankiConnectEnabled;
  ankiConnectPortInput.disabled = !draftSettings.ankiConnectEnabled;
  testAnkiConnectButton.disabled = false;
  autoExportEnabledInput.checked = Boolean(draftSettings.autoExportEnabled);
  csvSyncServerUrlInput.value = draftSettings.csvSyncServerUrl || "http://127.0.0.1:8787/sync";
  csvSyncTokenInput.value = draftSettings.csvSyncToken || "";
  renderCsvSyncTargetFields();
  renderProfilesList();
  renderProfileGoalSelect();
  renderImportProfileSelect();
  renderExportProfileSelect();
}

function addProfile() {
  const baseName = `New Profile ${draftSettings.profiles.length + 1}`;
  draftSettings.profiles.push({
    id: slugifyProfileName(`${baseName}-${Date.now()}`),
    name: baseName,
    superGoalMinutes: 30,
    color: normalizeProfileColor("", baseName)
  });
  renderProfilesList();
  renderProfileGoalSelect();
  renderImportProfileSelect();
  renderExportProfileSelect();
}

function syncDraftFromInputs() {
  draftSettings.dayStart = dayStartInput.value || "07:00";
  draftSettings.dayEnd = dayEndInput.value || "23:00";
  draftSettings.weekStartDay = Math.max(0, Math.min(6, Number(weekStartDaySelect.value) || 0));
  draftSettings.ankiConnectEnabled = Boolean(ankiConnectEnabledInput.checked);
  draftSettings.ankiConnectHost = String(ankiConnectHostInput.value || "127.0.0.1").trim() || "127.0.0.1";
  draftSettings.ankiConnectPort = Math.max(1, Math.min(65535, Number(ankiConnectPortInput.value) || 8765));
  draftSettings.autoExportEnabled = Boolean(autoExportEnabledInput.checked);
  draftSettings.csvSyncTarget = "server";
  draftSettings.csvSyncServerUrl = String(csvSyncServerUrlInput.value || "http://127.0.0.1:8787/sync").trim() || "http://127.0.0.1:8787/sync";
  draftSettings.csvSyncToken = String(csvSyncTokenInput.value || "");
  ankiConnectHostInput.value = draftSettings.ankiConnectHost;
  ankiConnectPortInput.value = String(draftSettings.ankiConnectPort);
  ankiConnectHostInput.disabled = !draftSettings.ankiConnectEnabled;
  ankiConnectPortInput.disabled = !draftSettings.ankiConnectEnabled;

  const selectedProfile = draftSettings.profiles.find((profile) => profile.id === profileGoalSelect.value);
  if (selectedProfile) {
    selectedProfile.superGoalMinutes = getGoalMinutesFromInputs();
  }

  draftSettings.profiles = draftSettings.profiles.map((profile, index) => ({
    ...profile,
    name: profile.name.trim() || `Profile ${index + 1}`,
    id: profile.id || slugifyProfileName(profile.name || `profile-${index + 1}`),
    color: normalizeProfileColor(profile.color, profile.name || `Profile ${index + 1}`)
  }));
}

async function persistAnkiConnectSettings() {
  syncDraftFromInputs();
  draftSettings = normalizeSettings(draftSettings);
  await saveSettings(draftSettings);
}

function scheduleAnkiConnectSettingsPersist() {
  clearTimeout(ankiSettingsSaveTimeoutId);
  ankiSettingsSaveTimeoutId = setTimeout(() => {
    ankiSettingsSaveTimeoutId = null;
    void persistAnkiConnectSettings();
  }, 250);
}

async function refreshAnkiConnectStatus(options = {}) {
  syncDraftFromInputs();
  if (options.persist) {
    await persistAnkiConnectSettings();
  }
  const requestId = ++ankiStatusRequestId;

  if (!draftSettings.ankiConnectEnabled) {
    setAnkiIndicator("disabled", "Disabled");
    setAnkiStatus("Turn on AnkiConnect to test the local connection.");
    return;
  }

  setAnkiIndicator("checking", "Checking");
  setAnkiStatus("Trying to reach AnkiConnect...");
  testAnkiConnectButton.disabled = true;

  const status = await getAnkiConnectStatus(draftSettings);
  if (requestId !== ankiStatusRequestId) {
    return;
  }

  testAnkiConnectButton.disabled = false;
  if (status.ok) {
    setAnkiIndicator("connected", "Connected");
    const versionSuffix = status.version ? ` AnkiConnect v${status.version}.` : "";
    setAnkiStatus(`${status.message}${versionSuffix}`);
    return;
  }

  setAnkiIndicator("disconnected", "Disconnected");
  setAnkiStatus(status.message);
}

function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importCsv() {
  syncDraftFromInputs();
  const profileId = importProfileSelect.value;
  const file = csvFileInput.files && csvFileInput.files[0];

  if (!profileId) {
    setImportStatus("Choose a profile for the import.");
    return;
  }

  if (!file) {
    setImportStatus("Choose a CSV file first.");
    return;
  }

  setImportStatus("Importing...");

  try {
    const csvText = await file.text();
    const { sessions, goalMinutes } = parseImportedSessions(csvText, profileId);
    const existingSessions = draftSettings.sessions || [];
    if (!sessions.length) {
      setImportStatus("No sessions found in that CSV.");
      return;
    }

    draftSettings.sessions = existingSessions
      .filter((session) => session.profileId !== profileId)
      .concat(sessions);
    const importedCount = sessions.length;

    const profile = draftSettings.profiles.find((candidate) => candidate.id === profileId);
    if (profile && goalMinutes) {
      profile.superGoalMinutes = goalMinutes;
    }

    draftSettings = normalizeSettings(draftSettings);
    await saveSettings(draftSettings);
    renderOptions();
    csvFileInput.value = "";

    const goalSuffix = goalMinutes ? ` Goal set to ${goalMinutes} minutes.` : "";
    setImportStatus(`Imported ${importedCount} sessions into ${getProfile(draftSettings, profileId).name}.${goalSuffix}`);
  } catch (error) {
    setImportStatus(error.message || "Import failed.");
  }
}

async function exportCsv() {
  syncDraftFromInputs();
  const profileId = exportProfileSelect.value;

  if (!profileId) {
    setExportStatus("Choose a profile to export.");
    return;
  }

  const latestSettings = await loadSettings();
  const csvText = buildExportCsv(latestSettings, profileId);
  const profile = getProfile(latestSettings, profileId);
  const filename = `${slugifyProfileName(profile.name || "profile")}.csv`;

  downloadCsv(filename, csvText);
  const rowCount = Math.max(0, csvText.split(/\r?\n/).length - 1);
  setExportStatus(`Exported ${rowCount} sessions from ${profile.name}.`);
}

async function persistAutoExportSettings(options = {}) {
  syncDraftFromInputs();
  draftSettings = normalizeSettings(draftSettings);
  if (options.requestPermission && draftSettings.autoExportEnabled) {
    await ensureSyncServerPermission();
  }
  await saveSettings(draftSettings);
  renderOptions();
}

function getSyncServerOriginPattern(urlText) {
  const url = new URL(urlText);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Server URL must start with http:// or https://.");
  }

  return `${url.protocol}//${url.hostname}/*`;
}

function isLocalSyncServerUrl(urlText) {
  const url = new URL(urlText);
  return ["127.0.0.1", "localhost"].includes(url.hostname.toLowerCase());
}

async function ensureSyncServerPermission() {
  if (draftSettings.csvSyncTarget !== "server" || isLocalSyncServerUrl(draftSettings.csvSyncServerUrl)) {
    return;
  }

  const origin = getSyncServerOriginPattern(draftSettings.csvSyncServerUrl);
  if (!chrome.permissions) {
    throw new Error(`Chrome cannot request permission for ${origin}.`);
  }

  const permission = { origins: [origin] };
  const hasPermission = await chrome.permissions.contains(permission);
  if (hasPermission) {
    return;
  }

  const granted = await chrome.permissions.request(permission);
  if (!granted) {
    throw new Error(`Permission denied for ${origin}.`);
  }
}

async function sendCsvSyncMessage(type) {
  syncDraftFromInputs();
  draftSettings = normalizeSettings(draftSettings);
  await ensureSyncServerPermission();
  await saveSettings(draftSettings);
  renderOptions();

  const response = await chrome.runtime.sendMessage({ type });
  if (!response || !response.ok) {
    throw new Error(response && response.error ? response.error : "Sync failed.");
  }

  draftSettings = await loadSettings();
  renderOptions();
  return response;
}

async function exportAllNow() {
  setAutoExportStatus("Syncing CSV files...");
  exportAllNowButton.disabled = true;

  try {
    const response = await sendCsvSyncMessage("export-all-csv");
    setAutoExportStatus(response.message || `Synced ${response.count} CSV files.`);
  } catch (error) {
    const message = error && error.message ? error.message : "Sync failed.";
    setAutoExportStatus(message);
    window.alert(message);
  } finally {
    exportAllNowButton.disabled = false;
  }
}

async function testSyncServer() {
  setAutoExportStatus("Testing sync server...");
  testSyncServerButton.disabled = true;

  try {
    const response = await sendCsvSyncMessage("test-csv-sync-server");
    setAutoExportStatus(response.message || "Sync server is reachable.");
  } catch (error) {
    const message = error && error.message ? error.message : "Sync server test failed.";
    setAutoExportStatus(message);
    window.alert(message);
  } finally {
    testSyncServerButton.disabled = false;
  }
}

async function saveOptions() {
  syncDraftFromInputs();
  draftSettings = normalizeSettings(draftSettings);
  await saveSettings(draftSettings);
  setStatus("Settings saved.");
  renderOptions();
  await refreshAnkiConnectStatus();
}

async function initializeOptions() {
  draftSettings = await loadSettings();
  renderOptions();

  addProfileButton.addEventListener("click", addProfile);
  profileGoalSelect.addEventListener("change", () => {
    syncDraftFromInputs();
    const selectedProfile = getProfile(draftSettings, profileGoalSelect.value);
    renderGoalInputs(selectedProfile.superGoalMinutes);
  });
  superGoalHoursInput.addEventListener("input", () => setStatus(""));
  superGoalMinutesInput.addEventListener("input", () => setStatus(""));
  dayStartInput.addEventListener("input", () => setStatus(""));
  dayEndInput.addEventListener("input", () => setStatus(""));
  weekStartDaySelect.addEventListener("change", () => setStatus(""));
  ankiConnectEnabledInput.addEventListener("change", () => {
    setStatus("");
    void refreshAnkiConnectStatus({ persist: true });
  });
  ankiConnectHostInput.addEventListener("input", () => {
    setStatus("");
    setAnkiStatus("");
    scheduleAnkiConnectSettingsPersist();
  });
  ankiConnectPortInput.addEventListener("input", () => {
    setStatus("");
    setAnkiStatus("");
    scheduleAnkiConnectSettingsPersist();
  });
  csvFileInput.addEventListener("change", () => setImportStatus(""));
  importButton.addEventListener("click", importCsv);
  exportButton.addEventListener("click", exportCsv);
  exportAllNowButton.addEventListener("click", exportAllNow);
  testSyncServerButton.addEventListener("click", testSyncServer);
  csvSyncServerUrlInput.addEventListener("input", () => setAutoExportStatus(""));
  csvSyncTokenInput.addEventListener("input", () => setAutoExportStatus(""));
  autoExportEnabledInput.addEventListener("change", () => {
    void persistAutoExportSettings({ requestPermission: true }).then(() => {
      setAutoExportStatus(draftSettings.autoExportEnabled ? "Auto sync enabled." : "Auto sync disabled.");
    }).catch((error) => {
      draftSettings.autoExportEnabled = false;
      autoExportEnabledInput.checked = false;
      void saveSettings(draftSettings);
      setAutoExportStatus(error && error.message ? error.message : "Auto sync permission was not granted.");
    });
  });
  testAnkiConnectButton.addEventListener("click", () => {
    void refreshAnkiConnectStatus({ persist: true });
  });
  saveButton.addEventListener("click", saveOptions);
  await refreshAnkiConnectStatus();
}

initializeOptions();
