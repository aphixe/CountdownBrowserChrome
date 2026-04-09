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

const profileSelect = document.getElementById("profileSelect");
const openSettingsButton = document.getElementById("openSettingsButton");
const todayTimer = document.getElementById("todayTimer");
const dayTimeLeft = document.getElementById("dayTimeLeft");
const yearTotal = document.getElementById("yearTotal");
const longestStreak = document.getElementById("longestStreak");
const currentStreak = document.getElementById("currentStreak");
const goalLabel = document.getElementById("goalLabel");
const heatmap = document.getElementById("heatmap");
const clockButton = document.getElementById("clockButton");

let liveIntervalId = null;

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
  await render();
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

  await render();
}

async function initializePopup() {
  await render();

  if (liveIntervalId) {
    clearInterval(liveIntervalId);
  }

  liveIntervalId = setInterval(render, 1000);

  profileSelect.addEventListener("change", handleProfileChange);
  clockButton.addEventListener("click", toggleClock);
  openSettingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  chrome.storage.onChanged.addListener(render);
}

initializePopup();
