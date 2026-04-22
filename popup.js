const {
  buildDailyTotals,
  formatDuration,
  formatElapsedCounter,
  formatGoalMinutes,
  getActiveSession,
  getDayTimeLeftSeconds,
  getProfile,
  getStreakStats,
  getTodayStats,
  getTotalSecondsForPeriod,
  getYearTotalSeconds,
  loadSettings,
  saveSettings,
  startClock,
  stopClock
} = window.CountDownPro;

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const defaultFloatingIconHref = chrome.runtime.getURL("icons/icon-128.png");
const FLOATING_WINDOW_BOUNDS_KEY = "floatingWindowBounds";
const TRENDS_WINDOW_BOUNDS_KEY = "trendsWindowBounds";
const CALENDAR_WINDOW_BOUNDS_KEY = "calendarWindowBounds";
const DEFAULT_FLOATING_WINDOW_BOUNDS = {
  width: 620,
  height: 430
};
const DEFAULT_TRENDS_WINDOW_BOUNDS = {
  width: 1240,
  height: 700
};
const DEFAULT_CALENDAR_WINDOW_BOUNDS = {
  width: 1480,
  height: 1100
};

const profileSelect = document.getElementById("profileSelect");
const popOutButton = document.getElementById("popOutButton");
const openTrendsButton = document.getElementById("openTrendsButton");
const openCalendarButton = document.getElementById("openCalendarButton");
const openAddTimeButton = document.getElementById("openAddTimeButton");
const undoAddTimeButton = document.getElementById("undoAddTimeButton");
const syncNowButton = document.getElementById("syncNowButton");
const syncNowStatus = document.getElementById("syncNowStatus");
const openSettingsButton = document.getElementById("openSettingsButton");
const todayTimer = document.getElementById("todayTimer");
const dayTimeLeft = document.getElementById("dayTimeLeft");
const goalProgressFill = document.getElementById("goalProgressFill");
const goalProgressText = document.getElementById("goalProgressText");
const heatmapYearSelect = document.getElementById("heatmapYearSelect");
const totalPeriodButton = document.getElementById("totalPeriodButton");
const totalPeriodLabel = document.getElementById("totalPeriodLabel");
const yearTotal = document.getElementById("yearTotal");
const longestStreak = document.getElementById("longestStreak");
const currentStreak = document.getElementById("currentStreak");
const goalLabel = document.getElementById("goalLabel");
const heatmap = document.getElementById("heatmap");
const clockButton = document.getElementById("clockButton");
const autoClockOnAudioInput = document.getElementById("autoClockOnAudio");
const pageFavicon = document.getElementById("pageFavicon");
const popupShell = document.querySelector(".popup-shell");
const manualAddBackdrop = document.getElementById("manualAddBackdrop");
const manualAddForm = document.getElementById("manualAddForm");
const manualAddProfileSelect = document.getElementById("manualAddProfileSelect");
const manualAddHoursInput = document.getElementById("manualAddHoursInput");
const manualAddMinutesInput = document.getElementById("manualAddMinutesInput");
const manualAddStartTimeInput = document.getElementById("manualAddStartTimeInput");
const manualAddStatus = document.getElementById("manualAddStatus");
const manualAddCancelButton = document.getElementById("manualAddCancelButton");

let liveIntervalId = null;
const isFloatingWindow = new URLSearchParams(window.location.search).get("mode") === "window";
let saveBoundsTimeoutId = null;
let lastManualAddSessionId = "";
let displayedTotalSeconds = null;
let totalAnimationFrameId = 0;

const totalPeriodOrder = ["year", "all", "week"];
const totalPeriodLabels = {
  year: "Year total:",
  all: "All time:",
  week: "This week:"
};

function cloneSession(session) {
  return session
    ? {
        id: session.id,
        profileId: session.profileId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        source: session.source,
        autoManaged: session.autoManaged
      }
    : null;
}

function updateUndoAddButton() {
  undoAddTimeButton.disabled = !lastManualAddSessionId;
}

function updateSyncNowButton(settings) {
  syncNowButton.hidden = settings.csvSyncTarget !== "server";
}

function showSyncNowStatus(type) {
  syncNowStatus.className = "sync-now-status";
  syncNowStatus.textContent = type === "success" ? "✓" : "×";
  void syncNowStatus.offsetWidth;
  syncNowStatus.classList.add(type === "success" ? "is-success" : "is-error");
}

function renderProfiles(settings) {
  const extraOptions = [
    { value: "__new__", label: "+ New Profile" },
    { value: "__edit__", label: "Edit Profiles" }
  ];

  profileSelect.innerHTML = "";

  for (const profile of settings.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    if (profile.id === settings.activeProfileId) {
      option.selected = true;
    }
    profileSelect.append(option);
  }

  for (const item of extraOptions) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    profileSelect.append(option);
  }
}

function fillManualAddProfiles(settings) {
  const preferredProfileId = settings.activeProfileId || (settings.profiles[0] && settings.profiles[0].id) || "";
  manualAddProfileSelect.innerHTML = "";

  for (const profile of settings.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === preferredProfileId;
    manualAddProfileSelect.append(option);
  }
}

function getIntensityLevel(seconds, goalSeconds) {
  if (seconds >= goalSeconds) {
    return 3;
  }
  if (seconds >= goalSeconds * 0.66) {
    return 2;
  }
  if (seconds > 0) {
    return 1;
  }
  return 0;
}

function getSelectedYear(settings, now = new Date()) {
  const currentYear = now.getFullYear();
  return Number.isFinite(Number(settings.selectedYear))
    ? Math.min(currentYear, Math.max(1970, Math.round(Number(settings.selectedYear))))
    : currentYear;
}

function getAvailableYears(settings, profileId, now = new Date()) {
  const currentYear = now.getFullYear();
  let earliestYear = currentYear;
  const totals = buildDailyTotals(settings, profileId, now);

  for (const dayKey of Object.keys(totals)) {
    const year = Number(dayKey.slice(0, 4));
    if (Number.isFinite(year) && year <= currentYear) {
      earliestYear = Math.min(earliestYear, year);
    }
  }

  const years = [];
  for (let year = currentYear; year >= earliestYear; year -= 1) {
    years.push(year);
  }
  return years;
}

function renderYearSelect(settings, profileId, selectedYear, now = new Date()) {
  const years = getAvailableYears(settings, profileId, now);
  if (!years.includes(selectedYear)) {
    years.push(selectedYear);
    years.sort((left, right) => right - left);
  }

  const optionKey = years.join(",");
  if (heatmapYearSelect.dataset.optionKey === optionKey) {
    heatmapYearSelect.value = String(selectedYear);
    return;
  }

  heatmapYearSelect.innerHTML = "";
  for (const year of years) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    option.selected = year === selectedYear;
    heatmapYearSelect.append(option);
  }
  heatmapYearSelect.dataset.optionKey = optionKey;
}

function renderHeatmap(settings, selectedYear, now = new Date()) {
  const profile = getProfile(settings, settings.activeProfileId);
  const goalSeconds = profile.superGoalMinutes * 60;
  const totals = buildDailyTotals(settings, profile.id, now);

  heatmap.innerHTML = "";

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const month = document.createElement("div");
    month.className = "month";

    const label = document.createElement("div");
    label.className = "month-label";
    label.textContent = monthNames[monthIndex];
    month.append(label);

    const grid = document.createElement("div");
    grid.className = "month-grid";

    const firstDayOfMonth = new Date(selectedYear, monthIndex, 1);
    const daysInMonth = new Date(selectedYear, monthIndex + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(selectedYear, monthIndex, day);
      const mondayFirstRow = (date.getDay() + 6) % 7;
      const firstDayRow = (firstDayOfMonth.getDay() + 6) % 7;
      const cellIndex = firstDayRow + (day - 1);
      const column = Math.floor(cellIndex / 7) + 1;
      const row = mondayFirstRow + 1;
      const key = `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const level = getIntensityLevel(totals[key] || 0, goalSeconds);
      const dot = document.createElement("div");
      dot.className = `day-dot${level ? ` level-${level}` : ""}`;
      dot.title = `${key}: ${formatDuration(totals[key] || 0)}`;
      dot.style.gridColumn = String(column);
      dot.style.gridRow = String(row);
      grid.append(dot);
    }

    month.append(grid);
    heatmap.append(month);
  }
}

function buildEmojiIconDataUrl(emoji, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  context.clearRect(0, 0, size, size);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${Math.floor(size * 0.82)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  context.fillText(emoji, size / 2, size / 2 + size * 0.04);

  return canvas.toDataURL("image/png");
}

function updateFloatingWindowIcon(isRunning) {
  if (!isFloatingWindow || !pageFavicon) {
    return;
  }

  pageFavicon.href = isRunning
    ? buildEmojiIconDataUrl("⌛", 128)
    : defaultFloatingIconHref;
}

function animateTotalSeconds(targetSeconds, options = {}) {
  const target = Math.max(0, Math.round(targetSeconds));

  if (totalAnimationFrameId) {
    cancelAnimationFrame(totalAnimationFrameId);
    totalAnimationFrameId = 0;
  }

  if (options.immediate || displayedTotalSeconds === null) {
    displayedTotalSeconds = target;
    yearTotal.textContent = formatDuration(target);
    return;
  }

  const startSeconds = displayedTotalSeconds;
  const startedAt = performance.now();
  const durationMs = 260;

  function step(timestamp) {
    const progress = Math.min((timestamp - startedAt) / durationMs, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startSeconds + ((target - startSeconds) * eased));
    displayedTotalSeconds = current;
    yearTotal.textContent = formatDuration(current);

    if (progress < 1) {
      totalAnimationFrameId = requestAnimationFrame(step);
      return;
    }

    displayedTotalSeconds = target;
    yearTotal.textContent = formatDuration(target);
    totalAnimationFrameId = 0;
  }

  totalAnimationFrameId = requestAnimationFrame(step);
}

async function getStoredFloatingWindowBounds() {
  const result = await chrome.storage.local.get(FLOATING_WINDOW_BOUNDS_KEY);
  const bounds = result[FLOATING_WINDOW_BOUNDS_KEY];

  if (!bounds || typeof bounds.width !== "number" || typeof bounds.height !== "number") {
    return DEFAULT_FLOATING_WINDOW_BOUNDS;
  }

  return {
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  };
}

async function getStoredTrendsWindowBounds() {
  const result = await chrome.storage.local.get(TRENDS_WINDOW_BOUNDS_KEY);
  const bounds = result[TRENDS_WINDOW_BOUNDS_KEY];

  if (!bounds || typeof bounds.width !== "number" || typeof bounds.height !== "number") {
    return DEFAULT_TRENDS_WINDOW_BOUNDS;
  }

  return {
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  };
}

async function getStoredCalendarWindowBounds() {
  const result = await chrome.storage.local.get(CALENDAR_WINDOW_BOUNDS_KEY);
  const bounds = result[CALENDAR_WINDOW_BOUNDS_KEY];

  if (!bounds || typeof bounds.width !== "number" || typeof bounds.height !== "number") {
    return DEFAULT_CALENDAR_WINDOW_BOUNDS;
  }

  return {
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  };
}

async function saveFloatingWindowBounds() {
  if (!isFloatingWindow) {
    return;
  }

  await chrome.storage.local.set({
    [FLOATING_WINDOW_BOUNDS_KEY]: {
      width: window.outerWidth,
      height: window.outerHeight
    }
  });
}

function scheduleFloatingWindowBoundsSave() {
  if (!isFloatingWindow) {
    return;
  }

  clearTimeout(saveBoundsTimeoutId);
  saveBoundsTimeoutId = setTimeout(() => {
    saveBoundsTimeoutId = null;
    void saveFloatingWindowBounds();
  }, 150);
}

function applyFloatingWindowScale() {
  if (!isFloatingWindow || !popupShell) {
    return;
  }

  popupShell.style.transform = "scale(1)";

  const naturalWidth = popupShell.offsetWidth;
  const naturalHeight = popupShell.offsetHeight;

  if (!naturalWidth || !naturalHeight) {
    return;
  }

  const scale = Math.min(window.innerWidth / naturalWidth, window.innerHeight / naturalHeight, 1);
  popupShell.style.transform = `scale(${scale})`;
}

async function render() {
  const settings = await loadSettings();
  const profile = getProfile(settings, settings.activeProfileId);
  const now = new Date();
  const today = getTodayStats(settings, profile.id, now);
  const streaks = getStreakStats(settings, profile.id, now);
  const totalPeriod = totalPeriodOrder.includes(settings.totalPeriod) ? settings.totalPeriod : "year";
  const selectedYear = getSelectedYear(settings, now);
  const totalSeconds = totalPeriod === "year"
    ? getYearTotalSeconds(settings, profile.id, selectedYear, now)
    : getTotalSecondsForPeriod(settings, profile.id, totalPeriod, now);
  const activeSession = getActiveSession(settings, profile.id);

  renderProfiles(settings);
  renderYearSelect(settings, profile.id, selectedYear, now);
  renderHeatmap(settings, selectedYear, now);

  todayTimer.textContent = formatElapsedCounter(today.totalSeconds);
  dayTimeLeft.textContent = `Day time left: ${formatDuration(getDayTimeLeftSeconds(settings, now))}`;
  const goalSeconds = profile.superGoalMinutes * 60;
  const goalProgressPercent = goalSeconds > 0
    ? Math.min((today.totalSeconds / goalSeconds) * 100, 100)
    : 0;
  goalProgressFill.style.width = `${goalProgressPercent}%`;
  goalProgressText.textContent = `${Math.round(goalProgressPercent)}%`;
  totalPeriodLabel.textContent = totalPeriodLabels[totalPeriod];
  totalPeriodButton.title = `Showing ${totalPeriodLabels[totalPeriod].slice(0, -1)}. Click or scroll to change.`;
  animateTotalSeconds(totalSeconds);
  longestStreak.textContent = `${streaks.longestStreak} days`;
  currentStreak.textContent = `${streaks.currentStreak} days`;
  goalLabel.textContent = `Super goal: ${formatGoalMinutes(profile.superGoalMinutes)}`;
  clockButton.textContent = activeSession ? "Clock Off" : "Clock On";
  clockButton.dataset.running = activeSession ? "true" : "false";
  autoClockOnAudioInput.checked = settings.autoClockOnAudio;
  updateSyncNowButton(settings);
  updateFloatingWindowIcon(Boolean(activeSession));
  if (lastManualAddSessionId && !settings.sessions.some((session) => session.id === lastManualAddSessionId)) {
    lastManualAddSessionId = "";
  }
  fillManualAddProfiles(settings);
  updateUndoAddButton();
}

async function renderAndResize() {
  await render();
  applyFloatingWindowScale();
}

async function handleProfileChange(event) {
  const value = event.target.value;
  const settings = await loadSettings();

  if (value === "__new__" || value === "__edit__") {
    chrome.runtime.openOptionsPage();
    profileSelect.value = settings.activeProfileId;
    return;
  }

  settings.activeProfileId = value;
  await saveSettings(settings);
  await renderAndResize();
}

async function toggleClock() {
  const settings = await loadSettings();
  const profile = getProfile(settings, settings.activeProfileId);
  const activeSession = getActiveSession(settings, profile.id);

  if (activeSession) {
    await stopClock(profile.id);
  } else {
    await startClock(profile.id);
  }

  await renderAndResize();
}

async function handleAutoClockOnAudioChange(event) {
  const settings = await loadSettings();
  settings.autoClockOnAudio = Boolean(event.target.checked);
  await saveSettings(settings);
  await renderAndResize();
}

async function changeTotalPeriod(direction = 1) {
  const settings = await loadSettings();
  const currentIndex = Math.max(0, totalPeriodOrder.indexOf(settings.totalPeriod));
  const nextIndex = (currentIndex + direction + totalPeriodOrder.length) % totalPeriodOrder.length;
  settings.totalPeriod = totalPeriodOrder[nextIndex];
  await saveSettings(settings);
  await renderAndResize();
}

async function handleHeatmapYearChange(event) {
  const settings = await loadSettings();
  const currentYear = new Date().getFullYear();
  const selectedYear = Math.min(currentYear, Math.max(1970, Number(event.target.value) || currentYear));
  settings.selectedYear = selectedYear;
  settings.selectedYearFollowsCurrent = selectedYear === currentYear;
  await saveSettings(settings);
  await renderAndResize();
}

async function openFloatingWindow() {
  const bounds = await getStoredFloatingWindowBounds();

  await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html?mode=window"),
    type: "popup",
    width: bounds.width,
    height: bounds.height,
    focused: true
  });

  window.close();
}

async function openTrendsWindow() {
  const bounds = await getStoredTrendsWindowBounds();

  await chrome.windows.create({
    url: chrome.runtime.getURL("trends.html"),
    type: "popup",
    width: bounds.width,
    height: bounds.height,
    focused: true
  });
}

async function openCalendarWindow() {
  const bounds = await getStoredCalendarWindowBounds();

  await chrome.windows.create({
    url: chrome.runtime.getURL("calendar.html"),
    type: "popup",
    width: bounds.width,
    height: bounds.height,
    focused: true
  });
}

function openManualAddDialog() {
  const now = new Date();
  manualAddStatus.textContent = "";
  manualAddHoursInput.value = "0";
  manualAddMinutesInput.value = "30";
  manualAddStartTimeInput.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  manualAddBackdrop.hidden = false;
  manualAddProfileSelect.focus();
}

function closeManualAddDialog() {
  manualAddBackdrop.hidden = true;
  manualAddStatus.textContent = "";
}

async function saveManualTime(event) {
  event.preventDefault();
  manualAddStatus.textContent = "";

  const settings = await loadSettings();
  const profileId = manualAddProfileSelect.value;
  const [startHours, startMinutes] = String(manualAddStartTimeInput.value || "").split(":").map(Number);
  const hours = Math.max(0, Number(manualAddHoursInput.value) || 0);
  const minutes = Math.max(0, Math.min(59, Number(manualAddMinutesInput.value) || 0));
  const durationMinutes = (hours * 60) + minutes;

  manualAddHoursInput.value = String(hours);
  manualAddMinutesInput.value = String(minutes);

  if (!profileId) {
    manualAddStatus.textContent = "Choose a profile.";
    return;
  }

  if (!manualAddStartTimeInput.value || !Number.isFinite(startHours) || !Number.isFinite(startMinutes)) {
    manualAddStatus.textContent = "Choose a start time.";
    return;
  }

  if (durationMinutes <= 0) {
    manualAddStatus.textContent = "Enter a duration longer than 0 minutes.";
    return;
  }

  const startedAt = new Date();
  startedAt.setHours(startHours, startMinutes, 0, 0);
  const endedAt = new Date(startedAt.getTime() + (durationMinutes * 60000));
  const session = {
    id: crypto.randomUUID(),
    profileId,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    source: "manual-add"
  };

  settings.sessions = (settings.sessions || []).concat(session);
  await saveSettings(settings);
  lastManualAddSessionId = session.id;
  closeManualAddDialog();
  await renderAndResize();
}

async function undoLastManualAdd() {
  if (!lastManualAddSessionId) {
    updateUndoAddButton();
    return;
  }

  const settings = await loadSettings();
  const existingSession = settings.sessions.find((session) => session.id === lastManualAddSessionId);
  if (!existingSession) {
    lastManualAddSessionId = "";
    updateUndoAddButton();
    return;
  }

  settings.sessions = settings.sessions.filter((session) => session.id !== lastManualAddSessionId);
  await saveSettings(settings);
  lastManualAddSessionId = "";
  await renderAndResize();
}

async function syncNow() {
  syncNowButton.disabled = true;
  syncNowButton.classList.add("is-syncing");

  try {
    const response = await chrome.runtime.sendMessage({ type: "export-all-csv" });
    if (!response || !response.ok) {
      throw new Error(response && response.error ? response.error : "Sync failed.");
    }
    syncNowButton.title = response.message || "Sync complete";
    showSyncNowStatus("success");
  } catch (error) {
    const message = error && error.message ? error.message : "Sync failed.";
    syncNowButton.title = message;
    showSyncNowStatus("error");
    window.alert(message);
  } finally {
    syncNowButton.classList.remove("is-syncing");
    syncNowButton.disabled = false;
    await renderAndResize();
  }
}

async function initializePopup() {
  if (isFloatingWindow) {
    popOutButton.hidden = true;
    document.title = "CountDown Pro Floating";
    document.body.classList.add("floating-window");
  }

  await renderAndResize();

  if (liveIntervalId) {
    clearInterval(liveIntervalId);
  }

  liveIntervalId = setInterval(render, 1000);

  profileSelect.addEventListener("change", handleProfileChange);
  heatmapYearSelect.addEventListener("change", handleHeatmapYearChange);
  clockButton.addEventListener("click", toggleClock);
  autoClockOnAudioInput.addEventListener("change", handleAutoClockOnAudioChange);
  totalPeriodButton.addEventListener("click", () => {
    void changeTotalPeriod(1);
  });
  totalPeriodButton.addEventListener("wheel", (event) => {
    event.preventDefault();
    void changeTotalPeriod(event.deltaY < 0 ? -1 : 1);
  }, { passive: false });
  popOutButton.addEventListener("click", openFloatingWindow);
  openTrendsButton.addEventListener("click", openTrendsWindow);
  openCalendarButton.addEventListener("click", openCalendarWindow);
  openAddTimeButton.addEventListener("click", openManualAddDialog);
  undoAddTimeButton.addEventListener("click", () => {
    void undoLastManualAdd();
  });
  syncNowButton.addEventListener("click", () => {
    void syncNow();
  });
  openSettingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  manualAddForm.addEventListener("submit", saveManualTime);
  manualAddCancelButton.addEventListener("click", closeManualAddDialog);
  manualAddBackdrop.addEventListener("click", (event) => {
    if (event.target === manualAddBackdrop) {
      closeManualAddDialog();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !manualAddBackdrop.hidden) {
      closeManualAddDialog();
    }
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" && areaName !== "sync") {
      return;
    }
    if (changes[FLOATING_WINDOW_BOUNDS_KEY]) {
      return;
    }
    void renderAndResize();
  });

  if (isFloatingWindow) {
    window.addEventListener("resize", () => {
      applyFloatingWindowScale();
      scheduleFloatingWindowBoundsSave();
    });
    window.addEventListener("beforeunload", () => {
      void saveFloatingWindowBounds();
    });
  }
}

initializePopup();
