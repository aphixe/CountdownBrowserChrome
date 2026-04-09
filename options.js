const {
  buildExportCsv,
  getProfile,
  loadSettings,
  normalizeSettings,
  parseImportedSessions,
  saveSettings,
  slugifyProfileName,
} = window.CountDownPro;

const dayStartInput = document.getElementById("dayStartInput");
const dayEndInput = document.getElementById("dayEndInput");
const profileGoalSelect = document.getElementById("profileGoalSelect");
const superGoalInput = document.getElementById("superGoalInput");
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

let draftSettings = null;

function setStatus(message) {
  saveStatus.textContent = message;
}

function setImportStatus(message) {
  importStatus.textContent = message;
}

function setExportStatus(message) {
  exportStatus.textContent = message;
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
  superGoalInput.value = selectedProfile.superGoalMinutes;
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
      renderProfileGoalSelect();
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
    });

    actions.append(makeActiveButton, removeButton);
    item.append(input, actions);
    profilesList.append(item);
  }
}

function renderOptions() {
  dayStartInput.value = draftSettings.dayStart;
  dayEndInput.value = draftSettings.dayEnd;
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
    superGoalMinutes: 30
  });
  renderProfilesList();
  renderProfileGoalSelect();
}

function syncDraftFromInputs() {
  draftSettings.dayStart = dayStartInput.value || "07:00";
  draftSettings.dayEnd = dayEndInput.value || "23:00";

  const selectedProfile = draftSettings.profiles.find((profile) => profile.id === profileGoalSelect.value);
  if (selectedProfile) {
    selectedProfile.superGoalMinutes = Math.max(1, Number(superGoalInput.value) || 30);
  }

  draftSettings.profiles = draftSettings.profiles.map((profile, index) => ({
    ...profile,
    name: profile.name.trim() || `Profile ${index + 1}`,
    id: profile.id || slugifyProfileName(profile.name || `profile-${index + 1}`)
  }));
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

async function saveOptions() {
  syncDraftFromInputs();
  draftSettings = normalizeSettings(draftSettings);
  await saveSettings(draftSettings);
  setStatus("Settings saved.");
  renderOptions();
}

async function initializeOptions() {
  draftSettings = await loadSettings();
  renderOptions();

  addProfileButton.addEventListener("click", addProfile);
  profileGoalSelect.addEventListener("change", () => {
    syncDraftFromInputs();
    const selectedProfile = getProfile(draftSettings, profileGoalSelect.value);
    superGoalInput.value = selectedProfile.superGoalMinutes;
  });
  superGoalInput.addEventListener("input", () => setStatus(""));
  dayStartInput.addEventListener("input", () => setStatus(""));
  dayEndInput.addEventListener("input", () => setStatus(""));
  csvFileInput.addEventListener("change", () => setImportStatus(""));
  importButton.addEventListener("click", importCsv);
  exportButton.addEventListener("click", exportCsv);
  saveButton.addEventListener("click", saveOptions);
}

initializeOptions();
