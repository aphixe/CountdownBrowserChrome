const {
  formatDuration,
  getGraphColorsForProfile,
  getPaletteProfileColor,
  loadSettings,
  saveSettings
} = window.CountDownPro;

const CALENDAR_WINDOW_BOUNDS_KEY = "calendarWindowBounds";
const CALENDAR_PREFS_KEY = "calendarViewPrefs";
const CALENDAR_PROFILE_ALL = "__calendar_all_profiles__";
const CALENDAR_SCALE_OPTIONS = [5, 10, 15, 30, 60];

const profileSelect = document.getElementById("profileSelect");
const previousButton = document.getElementById("previousButton");
const nextButton = document.getElementById("nextButton");
const thisWeekButton = document.getElementById("thisWeekButton");
const nowButton = document.getElementById("nowButton");
const scaleSlider = document.getElementById("scaleSlider");
const scaleLabel = document.getElementById("scaleLabel");
const weekLabel = document.getElementById("weekLabel");
const calendarHeader = document.getElementById("calendarHeader");
const timeGutter = document.getElementById("timeGutter");
const timeGutterTrack = document.getElementById("timeGutterTrack");
const calendarScroll = document.getElementById("calendarScroll");
const calendarSurface = document.getElementById("calendarSurface");
const calendarGrid = document.getElementById("calendarGrid");
const calendarBlocks = document.getElementById("calendarBlocks");
const nowLine = document.getElementById("nowLine");
const nowBubble = document.getElementById("nowBubble");
const calendarTooltip = document.getElementById("calendarTooltip");
const calendarContextMenu = document.getElementById("calendarContextMenu");
const addTimeButton = document.getElementById("addTimeButton");
const editBlockButton = document.getElementById("editBlockButton");
const deleteBlockButton = document.getElementById("deleteBlockButton");
const undoEditButton = document.getElementById("undoEditButton");
const editDialogBackdrop = document.getElementById("editDialogBackdrop");
const editDialogTitle = document.getElementById("editDialogTitle");
const editProfileField = document.getElementById("editProfileField");
const editProfileSelect = document.getElementById("editProfileSelect");
const editDialogSubtitle = document.getElementById("editDialogSubtitle");
const editBlockForm = document.getElementById("editBlockForm");
const editStartTimeInput = document.getElementById("editStartTimeInput");
const editEndTimeInput = document.getElementById("editEndTimeInput");
const editDialogStatus = document.getElementById("editDialogStatus");
const cancelEditButton = document.getElementById("cancelEditButton");
const closeButton = document.getElementById("closeButton");

const state = {
  settings: null,
  weekStart: startOfWeek(new Date()),
  selectedProfileId: CALENDAR_PROFILE_ALL,
  scaleIndex: 2,
  pixelsPerMinute: 2.2,
  nowTimerId: null,
  contextSessionId: "",
  contextDayIndex: null,
  contextStartMinutes: null,
  editingSessionId: "",
  editMode: "edit",
  lastEditSnapshot: null
};

let resizeBoundsTimeoutId = null;

async function loadCalendarPrefs() {
  const result = await chrome.storage.local.get(CALENDAR_PREFS_KEY);
  const prefs = result[CALENDAR_PREFS_KEY] || {};
  const savedScaleIndex = Number(prefs.scaleIndex);

  if (
    Number.isInteger(savedScaleIndex) &&
    savedScaleIndex >= 0 &&
    savedScaleIndex < CALENDAR_SCALE_OPTIONS.length
  ) {
    state.scaleIndex = savedScaleIndex;
  }
}

function saveCalendarPrefs() {
  void chrome.storage.local.set({
    [CALENDAR_PREFS_KEY]: {
      scaleIndex: state.scaleIndex
    }
  });
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + mondayOffset);
  return next;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekLabel(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const startOptions = weekStart.getFullYear() === weekEnd.getFullYear()
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  const endOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${new Intl.DateTimeFormat(undefined, startOptions).format(weekStart)} - ${new Intl.DateTimeFormat(undefined, endOptions).format(weekEnd)}`;
}

function formatHeaderDay(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatHourLabel(hour) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:00 ${suffix}`;
}

function formatNowLabel(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatMinutesLabel(totalMinutes) {
  const safeMinutes = Math.max(0, Number(totalMinutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = Math.floor(safeMinutes % 60);
  const date = new Date(2000, 0, 1, hours, minutes, 0, 0);
  return formatNowLabel(date);
}

function formatTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function minutesToTimeInputValue(totalMinutes) {
  const safeMinutes = Math.max(0, Math.min((24 * 60) - 1, Math.round(Number(totalMinutes) || 0)));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatShortDuration(seconds) {
  const totalMinutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatBlockDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  if (safeSeconds < 60) {
    return `${safeSeconds}s`;
  }

  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${totalMinutes}m`;
  }

  if (!minutes) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function getScaleMinutes() {
  return CALENDAR_SCALE_OPTIONS[state.scaleIndex] || 15;
}

function syncScaleMetrics() {
  const minutes = getScaleMinutes();
  const unitHeightMin = 20;
  const unitHeightMax = 100;
  const minutesMin = 5;
  const minutesMax = 120;
  const ratio = (minutes - minutesMin) / (minutesMax - minutesMin);
  const unitHeight = unitHeightMin + ((unitHeightMax - unitHeightMin) * (1 - ratio));
  state.pixelsPerMinute = unitHeight / minutes;

  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    scaleLabel.textContent = `${hours} hour${hours === 1 ? "" : "s"}`;
  } else {
    scaleLabel.textContent = `${minutes} min`;
  }
}

function parseSession(session) {
  const startedAt = new Date(session.startedAt);
  const endedAt = new Date(session.endedAt || Date.now());
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) || endedAt <= startedAt) {
    return null;
  }
  return { startedAt, endedAt };
}

function getSessionById(settings, sessionId) {
  return (settings.sessions || []).find((session) => session.id === sessionId) || null;
}

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

function getDefaultProfileId(settings) {
  const profiles = settings.profiles || [];
  if (!profiles.length) {
    return "";
  }
  if (state.selectedProfileId !== CALENDAR_PROFILE_ALL && profiles.some((profile) => profile.id === state.selectedProfileId)) {
    return state.selectedProfileId;
  }
  if (settings.activeProfileId && profiles.some((profile) => profile.id === settings.activeProfileId)) {
    return settings.activeProfileId;
  }
  return profiles[0].id;
}

function fillEditProfileSelect(settings, selectedProfileId) {
  editProfileSelect.innerHTML = "";
  for (const profile of settings.profiles || []) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === selectedProfileId;
    editProfileSelect.append(option);
  }
}

function splitSessionByDay(session) {
  const parsed = parseSession(session);
  if (!parsed) {
    return [];
  }

  const segments = [];
  let cursor = new Date(parsed.startedAt);

  while (cursor < parsed.endedAt) {
    const dayStart = startOfDay(cursor);
    const nextDay = addDays(dayStart, 1);
    const segmentStart = new Date(Math.max(parsed.startedAt.getTime(), dayStart.getTime()));
    const segmentEnd = new Date(Math.min(parsed.endedAt.getTime(), nextDay.getTime()));

    if (segmentEnd > segmentStart) {
      segments.push({
        date: dayStart,
        dayKey: formatDayKey(dayStart),
        startMinutes: (segmentStart.getHours() * 60) + segmentStart.getMinutes() + (segmentStart.getSeconds() / 60),
        endMinutes: (segmentEnd.getHours() * 60) + segmentEnd.getMinutes() + (segmentEnd.getSeconds() / 60),
        durationSeconds: Math.max(0, Math.round((segmentEnd.getTime() - segmentStart.getTime()) / 1000))
      });
    }

    cursor = nextDay;
  }

  return segments;
}

function buildProfileMap(settings) {
  return new Map((settings.profiles || []).map((profile) => [profile.id, profile]));
}

function getSelectedProfileSessions(settings) {
  if (state.selectedProfileId === CALENDAR_PROFILE_ALL) {
    return settings.sessions || [];
  }
  return (settings.sessions || []).filter((session) => session.profileId === state.selectedProfileId);
}

function getBlockColor(profile, settings) {
  if (!profile) {
    return "#58cfff";
  }
  return getGraphColorsForProfile(profile, settings.activeProfileId).lineColor || getPaletteProfileColor(profile.name);
}

function buildCalendarData(settings) {
  const profileMap = buildProfileMap(settings);
  const sessions = getSelectedProfileSessions(settings);
  const weekEnd = addDays(state.weekStart, 7);
  const weekTotals = Array.from({ length: 7 }, () => 0);
  const blocks = [];

  for (const session of sessions) {
    const profile = profileMap.get(session.profileId) || null;
    const segments = splitSessionByDay(session);

    for (const segment of segments) {
      if (segment.date < state.weekStart || segment.date >= weekEnd) {
        continue;
      }

      const dayIndex = Math.round((startOfDay(segment.date).getTime() - state.weekStart.getTime()) / 86400000);
      if (dayIndex < 0 || dayIndex > 6) {
        continue;
      }

      weekTotals[dayIndex] += segment.durationSeconds;
      blocks.push({
        sessionId: session.id,
        dayIndex,
        startMinutes: segment.startMinutes,
        endMinutes: Math.max(segment.endMinutes, segment.startMinutes + 2),
        durationSeconds: segment.durationSeconds,
        profileName: profile?.name || "Profile",
        color: getBlockColor(profile, settings)
      });
    }
  }

  return { weekTotals, blocks };
}

function renderProfiles(settings) {
  const previousValue = state.selectedProfileId;
  profileSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = CALENDAR_PROFILE_ALL;
  allOption.textContent = "All Profiles";
  profileSelect.append(allOption);

  for (const profile of settings.profiles || []) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    profileSelect.append(option);
  }

  const values = new Set(Array.from(profileSelect.options).map((option) => option.value));
  state.selectedProfileId = values.has(previousValue) ? previousValue : CALENDAR_PROFILE_ALL;
  profileSelect.value = state.selectedProfileId;
}

function renderHeader(weekTotals) {
  const todayKey = formatDayKey(new Date());
  calendarHeader.innerHTML = "";

  const gutterCell = document.createElement("div");
  gutterCell.className = "header-time-cell";
  calendarHeader.append(gutterCell);

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = addDays(state.weekStart, dayIndex);
    const dayCell = document.createElement("div");
    dayCell.className = "header-day";
    if (formatDayKey(date) === todayKey) {
      dayCell.classList.add("is-today");
    }

    const dayName = document.createElement("div");
    dayName.className = "header-day-name";
    dayName.textContent = formatHeaderDay(date);

    const dayTotal = document.createElement("div");
    dayTotal.className = "header-day-total";
    dayTotal.textContent = formatShortDuration(weekTotals[dayIndex] || 0);

    dayCell.append(dayName, dayTotal);
    calendarHeader.append(dayCell);
  }
}

function renderGrid() {
  const totalMinutes = 24 * 60;
  const fullHeight = Math.round(totalMinutes * state.pixelsPerMinute);
  const todayKey = formatDayKey(new Date());

  timeGutterTrack.innerHTML = "";
  timeGutterTrack.style.height = `${fullHeight}px`;
  calendarGrid.innerHTML = "";
  calendarSurface.style.height = `${fullHeight}px`;
  calendarGrid.style.height = `${fullHeight}px`;
  calendarBlocks.style.height = `${fullHeight}px`;

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = addDays(state.weekStart, dayIndex);
    const column = document.createElement("div");
    column.className = "day-column";
    if (formatDayKey(date) === todayKey) {
      column.classList.add("is-today");
    }

    for (let hour = 0; hour <= 24; hour += 1) {
      const top = Math.round(hour * 60 * state.pixelsPerMinute);
      if (hour < 24) {
        const hourLine = document.createElement("div");
        hourLine.className = "hour-line";
        hourLine.style.top = `${top}px`;
        column.append(hourLine);

        if (dayIndex === 0) {
          const timeLabel = document.createElement("div");
          timeLabel.className = "time-label";
          timeLabel.style.top = `${top}px`;
          timeLabel.textContent = formatHourLabel(hour);
          timeGutterTrack.append(timeLabel);
        }

        const halfLine = document.createElement("div");
        halfLine.className = "half-line";
        halfLine.style.top = `${Math.round(top + (30 * state.pixelsPerMinute))}px`;
        column.append(halfLine);
      }
    }

    calendarGrid.append(column);
  }
}

function renderBlocks(blocks) {
  calendarBlocks.innerHTML = "";
  const columns = Array.from(calendarGrid.children);
  if (!columns.length) {
    return;
  }

  const columnWidth = columns[0].offsetWidth;
  const calendarWidth = columnWidth * 7;
  calendarSurface.style.width = `${calendarWidth}px`;
  calendarBlocks.style.width = `${calendarWidth}px`;

  for (const block of blocks) {
    const blockElement = document.createElement("div");
    const top = Math.round(block.startMinutes * state.pixelsPerMinute);
    const height = Math.max(8, Math.round((block.endMinutes - block.startMinutes) * state.pixelsPerMinute));
    const left = Math.round((columnWidth * block.dayIndex) + 4);
    const width = Math.max(48, Math.round(columnWidth - 8));

    blockElement.className = "calendar-block";
    if (height >= 26) {
      blockElement.classList.add("has-detail");
    }
    blockElement.style.top = `${top}px`;
    blockElement.style.left = `${left}px`;
    blockElement.style.width = `${width}px`;
    blockElement.style.height = `${height}px`;
    blockElement.style.background = `linear-gradient(180deg, ${block.color}, ${block.color}dd)`;
    blockElement.dataset.sessionId = block.sessionId || "";
    blockElement.dataset.profileName = block.profileName;
    blockElement.dataset.duration = formatBlockDuration(block.durationSeconds);

    const label = document.createElement("span");
    label.className = "calendar-block-label";
    label.textContent = height >= 26 ? `${formatMinutesLabel(block.startMinutes)} • ${block.profileName}` : "";

    blockElement.append(label);
    calendarBlocks.append(blockElement);
  }
}

function hideTooltip() {
  calendarTooltip.hidden = true;
}

function hideContextMenu() {
  calendarContextMenu.hidden = true;
  state.contextSessionId = "";
  state.contextDayIndex = null;
  state.contextStartMinutes = null;
}

function showContextMenu(options, event) {
  const surfaceRect = calendarSurface.getBoundingClientRect();
  state.contextSessionId = options.sessionId || "";
  state.contextDayIndex = Number.isInteger(options.dayIndex) ? options.dayIndex : null;
  state.contextStartMinutes = Number.isFinite(options.startMinutes) ? options.startMinutes : null;
  addTimeButton.hidden = !options.allowAdd;
  editBlockButton.hidden = !options.allowEdit;
  deleteBlockButton.hidden = !options.allowDelete;
  undoEditButton.disabled = !state.lastEditSnapshot;
  calendarContextMenu.hidden = false;
  calendarContextMenu.style.left = "0px";
  calendarContextMenu.style.top = "0px";

  const menuWidth = calendarContextMenu.offsetWidth || 120;
  const menuHeight = calendarContextMenu.offsetHeight || 80;
  const left = Math.min(
    event.clientX - surfaceRect.left + 4,
    surfaceRect.width - menuWidth - 8
  );
  const top = Math.min(
    event.clientY - surfaceRect.top + 4,
    surfaceRect.height - menuHeight - 8
  );

  calendarContextMenu.style.left = `${Math.max(8, left)}px`;
  calendarContextMenu.style.top = `${Math.max(8, top)}px`;
  const initialFocusButton = options.allowAdd
    ? addTimeButton
    : (options.allowEdit ? editBlockButton : deleteBlockButton);
  initialFocusButton.focus();
}

function openEditDialog(sessionId) {
  const session = getSessionById(state.settings, sessionId);
  if (!session) {
    hideContextMenu();
    return;
  }

  const parsed = parseSession(session);
  if (!parsed) {
    hideContextMenu();
    return;
  }

  state.editMode = "edit";
  state.editingSessionId = sessionId;
  editDialogTitle.textContent = "Edit Block Time";
  editDialogSubtitle.textContent = `${formatHeaderDay(parsed.startedAt)}`;
  editProfileField.hidden = true;
  editStartTimeInput.value = formatTimeInputValue(parsed.startedAt);
  editEndTimeInput.value = formatTimeInputValue(parsed.endedAt);
  editDialogStatus.textContent = "";
  editDialogBackdrop.hidden = false;
  hideContextMenu();
  editStartTimeInput.focus();
}

function openAddDialog() {
  if (!state.settings || state.contextDayIndex === null) {
    hideContextMenu();
    return;
  }

  const dayDate = addDays(state.weekStart, state.contextDayIndex);
  const defaultStartMinutes = Number.isFinite(state.contextStartMinutes)
    ? state.contextStartMinutes
    : ((new Date().getHours() * 60) + new Date().getMinutes());
  const roundedStartMinutes = Math.max(0, Math.min((24 * 60) - 1, Math.round(defaultStartMinutes / 5) * 5));
  const defaultEndMinutes = Math.min(24 * 60, roundedStartMinutes + 30);

  state.editMode = "add";
  state.editingSessionId = "";
  editDialogTitle.textContent = "Add Time";
  editProfileField.hidden = false;
  fillEditProfileSelect(state.settings, getDefaultProfileId(state.settings));
  editDialogSubtitle.textContent = `${formatHeaderDay(dayDate)}`;
  editStartTimeInput.value = minutesToTimeInputValue(roundedStartMinutes);
  editEndTimeInput.value = minutesToTimeInputValue(Math.max(roundedStartMinutes + 1, defaultEndMinutes - (defaultEndMinutes === 24 * 60 ? 1 : 0)));
  editDialogStatus.textContent = "";
  editDialogBackdrop.hidden = false;
  hideContextMenu();
  editProfileSelect.focus();
}

function closeEditDialog() {
  editDialogBackdrop.hidden = true;
  editDialogStatus.textContent = "";
  state.editingSessionId = "";
  state.editMode = "edit";
}

function applyEditedSessionTimes(session, startTimeValue, endTimeValue) {
  const parsed = parseSession(session);
  if (!parsed) {
    throw new Error("This session could not be edited.");
  }

  const [startHours, startMinutes] = startTimeValue.split(":").map(Number);
  const [endHours, endMinutes] = endTimeValue.split(":").map(Number);
  const nextStart = new Date(parsed.startedAt);
  nextStart.setHours(startHours || 0, startMinutes || 0, 0, 0);

  const nextEnd = new Date(parsed.endedAt);
  nextEnd.setHours(endHours || 0, endMinutes || 0, 0, 0);
  if (nextEnd <= nextStart) {
    nextEnd.setDate(nextEnd.getDate() + 1);
  }

  if (nextEnd <= nextStart) {
    throw new Error("End time must be after start time.");
  }

  session.startedAt = nextStart.toISOString();
  session.endedAt = nextEnd.toISOString();
}

async function saveEditedBlock(event) {
  event.preventDefault();
  editDialogStatus.textContent = "";

  if (!editStartTimeInput.value || !editEndTimeInput.value) {
    editDialogStatus.textContent = "Choose both start and end times.";
    return;
  }

  try {
    if (state.editMode === "add") {
      const profileId = editProfileSelect.value;
      if (!profileId) {
        editDialogStatus.textContent = "Choose a profile.";
        return;
      }

      const dayDate = addDays(state.weekStart, state.contextDayIndex || 0);
      const [startHours, startMinutes] = editStartTimeInput.value.split(":").map(Number);
      const [endHours, endMinutes] = editEndTimeInput.value.split(":").map(Number);
      const startedAt = new Date(dayDate);
      startedAt.setHours(startHours || 0, startMinutes || 0, 0, 0);
      const endedAt = new Date(dayDate);
      endedAt.setHours(endHours || 0, endMinutes || 0, 0, 0);
      if (endedAt <= startedAt) {
        endedAt.setDate(endedAt.getDate() + 1);
      }
      if (endedAt <= startedAt) {
        throw new Error("End time must be after start time.");
      }

      const session = {
        id: crypto.randomUUID(),
        profileId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString()
      };
      state.settings.sessions = (state.settings.sessions || []).concat(session);
      state.lastEditSnapshot = {
        type: "delete-added",
        session: cloneSession(session)
      };
    } else {
      const session = getSessionById(state.settings, state.editingSessionId);
      if (!session) {
        editDialogStatus.textContent = "That block could not be found.";
        return;
      }

      state.lastEditSnapshot = {
        type: "restore-times",
        session: cloneSession(session)
      };
      applyEditedSessionTimes(session, editStartTimeInput.value, editEndTimeInput.value);
    }

    state.settings = await saveSettings(state.settings);
    closeEditDialog();
    drawCalendar();
  } catch (error) {
    editDialogStatus.textContent = error.message || "Could not save that block.";
  }
}

async function undoLastEdit() {
  if (!state.lastEditSnapshot) {
    hideContextMenu();
    return;
  }

  const snapshot = state.lastEditSnapshot;
  let nextSnapshot = null;

  if (snapshot.type === "delete-added") {
    state.settings.sessions = (state.settings.sessions || []).filter((entry) => entry.id !== snapshot.session.id);
  } else if (snapshot.type === "restore-times") {
    const session = getSessionById(state.settings, snapshot.session.id);
    if (!session) {
      state.lastEditSnapshot = null;
      hideContextMenu();
      return;
    }

    nextSnapshot = {
      type: "restore-times",
      session: cloneSession(session)
    };
    session.startedAt = snapshot.session.startedAt;
    session.endedAt = snapshot.session.endedAt;
  } else if (snapshot.type === "restore-deleted") {
    const existingSession = getSessionById(state.settings, snapshot.session.id);
    if (!existingSession) {
      state.settings.sessions = (state.settings.sessions || []).concat(cloneSession(snapshot.session));
      nextSnapshot = {
        type: "delete-added",
        session: cloneSession(snapshot.session)
      };
    }
  }

  state.settings = await saveSettings(state.settings);
  state.lastEditSnapshot = nextSnapshot;
  hideContextMenu();
  drawCalendar();
}

async function deleteSelectedBlock() {
  if (!state.contextSessionId) {
    hideContextMenu();
    return;
  }

  const session = getSessionById(state.settings, state.contextSessionId);
  if (!session) {
    hideContextMenu();
    return;
  }

  state.lastEditSnapshot = {
    type: "restore-deleted",
    session: cloneSession(session)
  };
  state.settings.sessions = (state.settings.sessions || []).filter((entry) => entry.id !== session.id);
  state.settings = await saveSettings(state.settings);
  hideContextMenu();
  drawCalendar();
}

function getContextSlotFromEvent(event) {
  const columns = Array.from(calendarGrid.children);
  if (!columns.length) {
    return null;
  }

  const surfaceRect = calendarSurface.getBoundingClientRect();
  const x = event.clientX - surfaceRect.left;
  const y = event.clientY - surfaceRect.top;
  const columnWidth = columns[0].offsetWidth;
  if (columnWidth <= 0) {
    return null;
  }

  const dayIndex = Math.max(0, Math.min(6, Math.floor(x / columnWidth)));
  const startMinutes = Math.max(0, Math.min((24 * 60) - 1, y / state.pixelsPerMinute));
  return { dayIndex, startMinutes };
}

function showTooltip(target, event) {
  const duration = target.dataset.duration || "";
  const profileName = target.dataset.profileName || "";
  const lines = [];
  if (profileName) {
    lines.push(`Profile: ${profileName}`);
  }
  if (duration) {
    lines.push(`Duration: ${duration}`);
  }
  if (!lines.length) {
    hideTooltip();
    return;
  }

  calendarTooltip.textContent = lines.join("\n");
  calendarTooltip.hidden = false;

  const surfaceRect = calendarSurface.getBoundingClientRect();
  const tooltipWidth = calendarTooltip.offsetWidth;
  const tooltipHeight = calendarTooltip.offsetHeight;
  const left = Math.min(
    event.clientX - surfaceRect.left + 12,
    surfaceRect.width - tooltipWidth - 12
  );
  const top = Math.min(
    event.clientY - surfaceRect.top + 12,
    surfaceRect.height - tooltipHeight - 12
  );

  calendarTooltip.style.left = `${Math.max(12, left)}px`;
  calendarTooltip.style.top = `${Math.max(12, top)}px`;
}

function updateWeekLabel() {
  weekLabel.textContent = formatWeekLabel(state.weekStart);
}

function updateNowLine() {
  const now = new Date();
  const today = startOfDay(now);
  const weekEnd = addDays(state.weekStart, 7);
  if (today < state.weekStart || today >= weekEnd) {
    nowLine.hidden = true;
    return;
  }

  const dayIndex = Math.round((today.getTime() - state.weekStart.getTime()) / 86400000);
  const columns = Array.from(calendarGrid.children);
  if (!columns[dayIndex]) {
    nowLine.hidden = true;
    return;
  }

  const column = columns[dayIndex];
  const top = Math.round(((now.getHours() * 60) + now.getMinutes()) * state.pixelsPerMinute);

  nowLine.hidden = false;
  nowLine.style.top = `${top}px`;
  nowLine.style.left = `${column.offsetLeft}px`;
  nowLine.style.width = `${column.offsetWidth}px`;
  nowBubble.textContent = formatNowLabel(now);
}

function scrollToCurrentTime() {
  const now = new Date();
  const target = Math.max(0, Math.round(((now.getHours() * 60) + now.getMinutes()) * state.pixelsPerMinute) - Math.round(calendarScroll.clientHeight / 2));
  calendarScroll.scrollTop = target;
}

function drawCalendar() {
  if (!state.settings) {
    return;
  }

  syncScaleMetrics();
  updateWeekLabel();
  const { weekTotals, blocks } = buildCalendarData(state.settings);
  renderHeader(weekTotals);
  renderGrid();
  renderBlocks(blocks);
  updateNowLine();
  updateNavButtons();
  hideContextMenu();
}

function updateNavButtons() {
  const currentWeekStart = startOfWeek(new Date());
  nextButton.disabled = state.weekStart >= currentWeekStart;
}

async function saveWindowBounds() {
  await chrome.storage.local.set({
    [CALENDAR_WINDOW_BOUNDS_KEY]: {
      width: window.outerWidth,
      height: window.outerHeight
    }
  });
}

function scheduleBoundsSave() {
  clearTimeout(resizeBoundsTimeoutId);
  resizeBoundsTimeoutId = setTimeout(() => {
    resizeBoundsTimeoutId = null;
    void saveWindowBounds();
  }, 160);
}

async function refresh() {
  state.settings = await loadSettings();
  renderProfiles(state.settings);
  drawCalendar();
}

function startNowTimer() {
  if (state.nowTimerId) {
    clearInterval(state.nowTimerId);
  }
  state.nowTimerId = setInterval(() => {
    updateNowLine();
  }, 30000);
}

async function initialize() {
  await loadCalendarPrefs();
  scaleSlider.value = String(state.scaleIndex);
  syncScaleMetrics();
  await refresh();
  scrollToCurrentTime();
  startNowTimer();

  profileSelect.addEventListener("change", () => {
    state.selectedProfileId = profileSelect.value;
    drawCalendar();
  });

  previousButton.addEventListener("click", () => {
    state.weekStart = addDays(state.weekStart, -7);
    drawCalendar();
  });

  nextButton.addEventListener("click", () => {
    const currentWeekStart = startOfWeek(new Date());
    state.weekStart = addDays(state.weekStart, 7);
    if (state.weekStart > currentWeekStart) {
      state.weekStart = currentWeekStart;
    }
    drawCalendar();
  });

  thisWeekButton.addEventListener("click", () => {
    state.weekStart = startOfWeek(new Date());
    drawCalendar();
  });

  nowButton.addEventListener("click", () => {
    state.weekStart = startOfWeek(new Date());
    drawCalendar();
    scrollToCurrentTime();
  });

  scaleSlider.addEventListener("input", () => {
    state.scaleIndex = Number(scaleSlider.value) || 0;
    saveCalendarPrefs();
    drawCalendar();
    scrollToCurrentTime();
  });

  closeButton.addEventListener("click", () => window.close());

  calendarScroll.addEventListener("scroll", () => {
    timeGutterTrack.style.transform = `translateY(${-calendarScroll.scrollTop}px)`;
    hideTooltip();
    hideContextMenu();
  });

  calendarBlocks.addEventListener("mouseover", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest(".calendar-block")
      : null;
    if (!target) {
      return;
    }
    showTooltip(target, event);
  });

  calendarBlocks.addEventListener("mousemove", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest(".calendar-block")
      : null;
    if (!target) {
      hideTooltip();
      return;
    }
    showTooltip(target, event);
  });

  calendarBlocks.addEventListener("mouseout", (event) => {
    const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (relatedTarget?.closest(".calendar-block")) {
      return;
    }
    hideTooltip();
  });

  calendarSurface.addEventListener("contextmenu", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest(".calendar-block")
      : null;
    event.preventDefault();
    if (target) {
      const sessionId = target.dataset.sessionId || "";
      if (!sessionId) {
        hideContextMenu();
        return;
      }

      const slot = getContextSlotFromEvent(event);
      showTooltip(target, event);
      showContextMenu({
        sessionId,
        dayIndex: slot?.dayIndex ?? null,
        startMinutes: slot?.startMinutes ?? null,
        allowAdd: true,
        allowEdit: true,
        allowDelete: true
      }, event);
      return;
    }

    hideTooltip();
    const slot = getContextSlotFromEvent(event);
    if (!slot) {
      hideContextMenu();
      return;
    }

    showContextMenu({
      sessionId: "",
      dayIndex: slot.dayIndex,
      startMinutes: slot.startMinutes,
      allowAdd: true,
      allowEdit: false,
      allowDelete: false
    }, event);
  });

  addTimeButton.addEventListener("click", openAddDialog);
  editBlockButton.addEventListener("click", () => {
    if (!state.contextSessionId) {
      hideContextMenu();
      return;
    }
    openEditDialog(state.contextSessionId);
  });
  deleteBlockButton.addEventListener("click", () => {
    void deleteSelectedBlock();
  });
  undoEditButton.addEventListener("click", () => {
    void undoLastEdit();
  });

  editBlockForm.addEventListener("submit", saveEditedBlock);
  cancelEditButton.addEventListener("click", closeEditDialog);
  editDialogBackdrop.addEventListener("click", (event) => {
    if (event.target === editDialogBackdrop) {
      closeEditDialog();
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest("#calendarContextMenu") && !target?.closest(".calendar-block")) {
      hideContextMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideContextMenu();
      if (!editDialogBackdrop.hidden) {
        closeEditDialog();
      }
    }
  });

  window.addEventListener("resize", () => {
    drawCalendar();
    scheduleBoundsSave();
  });
  window.addEventListener("beforeunload", () => {
    void saveWindowBounds();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" && areaName !== "sync") {
      return;
    }
    if (changes[CALENDAR_WINDOW_BOUNDS_KEY] || changes[CALENDAR_PREFS_KEY]) {
      return;
    }
    void refresh();
  });
}

initialize();
