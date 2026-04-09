const {
  buildDailyTotals,
  formatDuration,
  formatGoalMinutes,
  getActiveSession,
  getDayTimeLeftSeconds,
  getProfile,
  getStreakStats,
  getTodayStats,
  getYearTotalSeconds,
  loadSettings,
  saveSettings,
  startClock,
  stopClock
} = window.CountDownPro;

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const defaultFloatingIconHref = chrome.runtime.getURL("icons/icon-128.png");
const FLOATING_WINDOW_BOUNDS_KEY = "floatingWindowBounds";
const DEFAULT_FLOATING_WINDOW_BOUNDS = {
  width: 620,
  height: 430
};

const profileSelect = document.getElementById("profileSelect");
const popOutButton = document.getElementById("popOutButton");
const openSettingsButton = document.getElementById("openSettingsButton");
const todayTimer = document.getElementById("todayTimer");
const dayTimeLeft = document.getElementById("dayTimeLeft");
const yearTotal = document.getElementById("yearTotal");
const longestStreak = document.getElementById("longestStreak");
const currentStreak = document.getElementById("currentStreak");
const goalLabel = document.getElementById("goalLabel");
const heatmap = document.getElementById("heatmap");
const clockButton = document.getElementById("clockButton");
const pageFavicon = document.getElementById("pageFavicon");
const popupShell = document.querySelector(".popup-shell");

let liveIntervalId = null;
const isFloatingWindow = new URLSearchParams(window.location.search).get("mode") === "window";
let saveBoundsTimeoutId = null;

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

function renderHeatmap(settings) {
  const now = new Date();
  const profile = getProfile(settings, settings.activeProfileId);
  const goalSeconds = profile.superGoalMinutes * 60;
  const totals = buildDailyTotals(settings, profile.id, now);
  const currentYear = now.getFullYear();

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

    const firstDayOfMonth = new Date(currentYear, monthIndex, 1);
    const daysInMonth = new Date(currentYear, monthIndex + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(currentYear, monthIndex, day);
      const mondayFirstRow = (date.getDay() + 6) % 7;
      const firstDayRow = (firstDayOfMonth.getDay() + 6) % 7;
      const cellIndex = firstDayRow + (day - 1);
      const column = Math.floor(cellIndex / 7) + 1;
      const row = mondayFirstRow + 1;
      const key = `${currentYear}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  const yearSeconds = getYearTotalSeconds(settings, profile.id, now.getFullYear(), now);
  const activeSession = getActiveSession(settings, profile.id);

  renderProfiles(settings);
  renderHeatmap(settings);

  todayTimer.textContent = formatDuration(today.totalSeconds);
  dayTimeLeft.textContent = `Day time left: ${formatDuration(getDayTimeLeftSeconds(settings, now))}`;
  yearTotal.textContent = formatDuration(yearSeconds);
  longestStreak.textContent = `${streaks.longestStreak} days`;
  currentStreak.textContent = `${streaks.currentStreak} days`;
  goalLabel.textContent = `Super goal: ${formatGoalMinutes(profile.superGoalMinutes)}`;
  clockButton.textContent = activeSession ? "Clock Off" : "Clock On";
  clockButton.dataset.running = activeSession ? "true" : "false";
  updateFloatingWindowIcon(Boolean(activeSession));
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
  clockButton.addEventListener("click", toggleClock);
  popOutButton.addEventListener("click", openFloatingWindow);
  openSettingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
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
