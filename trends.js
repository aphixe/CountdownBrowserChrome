const {
  buildGraphSeries,
  formatDuration,
  loadSettings
} = window.CountDownPro;

const TRENDS_WINDOW_BOUNDS_KEY = "trendsWindowBounds";
const TRENDS_PREFS_KEY = "trendsGraphPrefs";
const DEFAULT_PREFS = {
  scale: "week",
  rangeDays: 365,
  zoom: 100,
  enabledLabels: []
};

const scaleSelect = document.getElementById("scaleSelect");
const rangeSelect = document.getElementById("rangeSelect");
const previousButton = document.getElementById("previousButton");
const nextButton = document.getElementById("nextButton");
const zoomSlider = document.getElementById("zoomSlider");
const zoomValue = document.getElementById("zoomValue");
const legendGrid = document.getElementById("legendGrid");
const graphCanvas = document.getElementById("graphCanvas");
const graphTooltip = document.getElementById("graphTooltip");
const pageSubtitle = document.getElementById("pageSubtitle");
const graphScroll = document.querySelector(".graph-scroll");
const graphPanel = document.querySelector(".graph-panel");
const pageShell = document.querySelector(".page-shell");

const state = {
  settings: null,
  series: [],
  scale: "week",
  rangeDays: 365,
  zoom: 100,
  enabledLabels: new Set(),
  rangeEnd: startOfDay(new Date()),
  yearAnchor: new Date().getFullYear(),
  hoverIndex: null,
  hoverCanvasX: null,
  hoverCanvasY: null,
  pointsBySeries: new Map(),
  visibleSeries: [],
  valuesBySeries: new Map(),
  dates: [],
  plotRect: null
};

let resizeBoundsTimeoutId = null;

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function makeLocalDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

function formatDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function daysInYear(year) {
  const start = makeLocalDate(year, 0, 1);
  const end = makeLocalDate(year + 1, 0, 1);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function getYearDates(year) {
  const today = startOfDay(new Date());
  const maxDays = year === today.getFullYear()
    ? Math.floor((today.getTime() - makeLocalDate(year, 0, 1).getTime()) / 86400000) + 1
    : daysInYear(year);
  const dates = [];
  for (let index = 0; index < maxDays; index += 1) {
    dates.push(addDays(makeLocalDate(year, 0, 1), index));
  }
  return dates;
}

function getMonthDates(year) {
  return Array.from({ length: 12 }, (_unused, index) => makeLocalDate(year, index, 1));
}

function formatRangeLabel(startDate, endDate) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit"
  });
  return `${formatter.format(startDate)}-${formatter.format(endDate)}`;
}

function formatTooltipDate(date, scale) {
  if (scale === "year") {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric"
    }).format(date);
  }
  return formatDayKey(date);
}

function getVisibleSeries() {
  return state.series.filter((entry) => state.enabledLabels.has(entry.label));
}

function buildDates() {
  if (state.scale === "year") {
    return getMonthDates(state.yearAnchor);
  }

  if (state.rangeDays >= 365) {
    return getYearDates(state.yearAnchor);
  }

  const endDate = startOfDay(state.rangeEnd);
  const startDate = addDays(endDate, -(state.rangeDays - 1));
  return Array.from({ length: state.rangeDays }, (_unused, index) => addDays(startDate, index));
}

function buildValuesForSeries(series, dates) {
  if (state.scale === "year") {
    const totalsByMonth = new Map();
    for (const [dayKey, seconds] of Object.entries(series.totals || {})) {
      const date = new Date(`${dayKey}T12:00:00`);
      if (Number.isNaN(date.getTime())) {
        continue;
      }
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      totalsByMonth.set(monthKey, (totalsByMonth.get(monthKey) || 0) + (Number(seconds) || 0));
    }
    return dates.map((date) => totalsByMonth.get(`${date.getFullYear()}-${date.getMonth()}`) || 0);
  }

  return dates.map((date) => Number(series.totals?.[formatDayKey(date)] || 0));
}

function getScaleLimitSeconds() {
  if (!state.settings || state.scale === "year") {
    return 0;
  }

  const [endHoursText, endMinutesText] = (state.settings.dayEnd || "23:00").split(":");
  const endHours = Number(endHoursText) || 0;
  const endMinutes = Number(endMinutesText) || 0;
  return (endHours * 3600) + (endMinutes * 60);
}

function getLabelIndices(count) {
  if (count <= 1) {
    return [0];
  }

  if (state.scale === "year") {
    return Array.from({ length: count }, (_unused, index) => index);
  }

  if (state.rangeDays <= 7) {
    return Array.from({ length: count }, (_unused, index) => index);
  }

  if (state.rangeDays >= 365) {
    return Array.from({ length: count }, (_unused, index) => index).filter((index) => index % 28 === 0 || index === count - 1);
  }

  const step = Math.max(1, Math.ceil(count / 6));
  return Array.from({ length: count }, (_unused, index) => index).filter((index) => index % step === 0 || index === count - 1);
}

function getAxisLabel(date, index) {
  if (state.scale === "year") {
    return new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
  }

  if (state.rangeDays <= 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  }

  if (state.rangeDays >= 365) {
    const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(date);
    if (index === state.dates.length - 1 || date.getDate() <= 7) {
      return month;
    }
    return "";
  }

  return new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric" }).format(date);
}

function savePrefs() {
  void chrome.storage.local.set({
    [TRENDS_PREFS_KEY]: {
      scale: state.scale,
      rangeDays: state.rangeDays,
      zoom: state.zoom,
      enabledLabels: Array.from(state.enabledLabels)
    }
  });
}

async function saveTrendsWindowBounds() {
  await chrome.storage.local.set({
    [TRENDS_WINDOW_BOUNDS_KEY]: {
      width: window.outerWidth,
      height: window.outerHeight
    }
  });
}

async function loadPrefs() {
  const result = await chrome.storage.local.get(TRENDS_PREFS_KEY);
  const prefs = result[TRENDS_PREFS_KEY] || DEFAULT_PREFS;
  state.scale = prefs.scale === "month" || prefs.scale === "year" ? prefs.scale : "week";
  state.rangeDays = prefs.rangeDays === 7 || prefs.rangeDays === 30 || prefs.rangeDays === 365 ? prefs.rangeDays : 365;
  state.zoom = Number.isFinite(Number(prefs.zoom)) ? Math.min(200, Math.max(50, Number(prefs.zoom))) : 100;
  state.enabledLabels = new Set(Array.isArray(prefs.enabledLabels) ? prefs.enabledLabels : []);
}

function syncControlsFromState() {
  scaleSelect.value = state.scale;
  rangeSelect.value = String(state.rangeDays);
  zoomSlider.value = String(state.zoom);
  zoomValue.textContent = `${state.zoom}%`;
  rangeSelect.disabled = state.scale === "year";
}

function ensureEnabledLabels() {
  if (!state.series.length) {
    state.enabledLabels = new Set();
    return;
  }

  if (!state.enabledLabels.size) {
    state.enabledLabels = new Set(state.series.map((entry) => entry.label));
    return;
  }

  const available = new Set(state.series.map((entry) => entry.label));
  state.enabledLabels = new Set(Array.from(state.enabledLabels).filter((label) => available.has(label)));
  if (!state.enabledLabels.size) {
    state.enabledLabels = new Set(state.series.map((entry) => entry.label));
  }
}

function renderLegend() {
  legendGrid.innerHTML = "";

  for (const entry of state.series) {
    const item = document.createElement("div");
    item.className = "legend-item";

    const label = document.createElement("label");
    label.className = "legend-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.enabledLabels.has(entry.label);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.enabledLabels.add(entry.label);
      } else {
        state.enabledLabels.delete(entry.label);
      }
      savePrefs();
      drawGraph();
    });

    const swatch = document.createElement("div");
    swatch.className = "legend-swatch";
    swatch.style.background = entry.lineColor;

    const text = document.createElement("span");
    text.textContent = entry.label;

    label.append(checkbox, swatch, text);
    item.append(label);
    legendGrid.append(item);
  }
}

function updateSubtitle() {
  const activeProfile = state.settings?.profiles?.find((profile) => profile.id === state.settings.activeProfileId);
  const activeText = activeProfile ? ` Active profile: ${activeProfile.name}.` : "";
  pageSubtitle.textContent = `Weekly scale across a year by default, with each profile shown in its own color.${activeText}`;
}

function resizeCanvas(width, height) {
  const dpr = window.devicePixelRatio || 1;
  graphCanvas.width = Math.max(1, Math.round(width * dpr));
  graphCanvas.height = Math.max(1, Math.round(height * dpr));
  graphCanvas.style.width = `${width}px`;
  graphCanvas.style.height = `${height}px`;

  const context = graphCanvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return context;
}

function applyWindowScale() {
  if (!pageShell) {
    return;
  }

  pageShell.style.transform = "scale(1)";
  pageShell.style.left = "0px";
  pageShell.style.top = "0px";

  const naturalWidth = pageShell.offsetWidth;
  const naturalHeight = pageShell.offsetHeight;
  if (!naturalWidth || !naturalHeight) {
    return;
  }

  const scale = Math.min(window.innerWidth / naturalWidth, window.innerHeight / naturalHeight, 1);
  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;
  const left = Math.max(0, Math.round((window.innerWidth - scaledWidth) / 2));
  const top = Math.max(0, Math.round((window.innerHeight - scaledHeight) / 2));

  pageShell.style.left = `${left}px`;
  pageShell.style.top = `${top}px`;
  pageShell.style.transform = `scale(${scale})`;
}

function getBasePointSpacing(pointCount) {
  if (state.scale === "year") {
    return 72;
  }

  if (state.rangeDays <= 7) {
    return 56;
  }

  if (state.rangeDays <= 30) {
    return 26;
  }

  if (pointCount >= 365) {
    return 10;
  }

  if (pointCount >= 120) {
    return 14;
  }

  return 18;
}

function getGraphWidth(pointCount, viewportWidth) {
  const baseWidth = 96 + ((Math.max(1, pointCount) - 1) * getBasePointSpacing(pointCount));
  return Math.max(viewportWidth, Math.round(baseWidth * (state.zoom / 100)));
}

function getGraphHeight() {
  return Math.max(260, graphPanel.clientHeight - 32);
}

function drawEmptyState(context, width, height, message) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#eef3f8";
  context.font = '16px "Segoe UI", sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, width / 2, height / 2);
}

function drawGraph() {
  const viewportWidth = Math.max(480, graphScroll.clientWidth);
  const height = getGraphHeight();
  state.dates = buildDates();
  state.visibleSeries = getVisibleSeries();

  const pointCount = Math.max(1, state.dates.length || (state.scale === "year" ? 12 : state.rangeDays));
  const width = getGraphWidth(pointCount, viewportWidth);
  const context = resizeCanvas(width, height);
  context.clearRect(0, 0, width, height);
  state.pointsBySeries = new Map();
  state.valuesBySeries = new Map();
  state.plotRect = null;

  if (!state.visibleSeries.length) {
    drawEmptyState(context, width, height, "No profiles selected");
    return;
  }

  if (!state.dates.length) {
    drawEmptyState(context, width, height, "No data for range");
    return;
  }

  let maxValue = 0;
  for (const series of state.visibleSeries) {
    const values = buildValuesForSeries(series, state.dates);
    state.valuesBySeries.set(series.label, values);
    for (const value of values) {
      maxValue = Math.max(maxValue, value);
    }
  }

  if (maxValue <= 0) {
    drawEmptyState(context, width, height, "No data for range");
    return;
  }

  let scaleSeconds = maxValue;
  const scaleLimitSeconds = getScaleLimitSeconds();
  if (scaleLimitSeconds > 0) {
    scaleSeconds = Math.min(scaleSeconds, scaleLimitSeconds);
  }
  if (scaleSeconds <= 0) {
    scaleSeconds = maxValue;
  }

  const maxHours = Math.max(1, Math.ceil(scaleSeconds / 3600));
  const marginLeft = 44;
  const marginRight = 18;
  const marginTop = 24;
  const marginBottom = 42;
  const plotRect = {
    left: marginLeft,
    top: marginTop,
    width: width - marginLeft - marginRight,
    height: height - marginTop - marginBottom
  };
  plotRect.right = plotRect.left + plotRect.width;
  plotRect.bottom = plotRect.top + plotRect.height;
  state.plotRect = plotRect;

  const activeSeries = state.visibleSeries.find((entry) => entry.isActive);
  const orderedSeries = activeSeries
    ? state.visibleSeries.filter((entry) => !entry.isActive).concat(activeSeries)
    : state.visibleSeries.slice();

  context.strokeStyle = "rgba(148, 163, 184, 0.26)";
  context.lineWidth = 1;
  for (let hour = 0; hour <= maxHours; hour += 1) {
    const ratio = hour / maxHours;
    const y = plotRect.bottom - (ratio * plotRect.height);
    context.beginPath();
    context.moveTo(plotRect.left, y);
    context.lineTo(plotRect.right, y);
    context.stroke();
  }

  context.fillStyle = "rgba(238, 243, 248, 0.76)";
  context.font = '12px "Segoe UI", sans-serif';
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let hour = 0; hour <= maxHours; hour += 1) {
    const ratio = hour / maxHours;
    const y = plotRect.bottom - (ratio * plotRect.height);
    context.fillText(String(hour), plotRect.left - 8, y);
  }

  context.strokeStyle = "rgba(148, 163, 184, 0.72)";
  context.lineWidth = 1.25;
  context.beginPath();
  context.moveTo(plotRect.left, plotRect.bottom);
  context.lineTo(plotRect.right, plotRect.bottom);
  context.stroke();

  const dateCount = state.dates.length;
  const stepX = dateCount > 1 ? plotRect.width / (dateCount - 1) : 0;

  for (const series of orderedSeries) {
    const values = state.valuesBySeries.get(series.label) || [];
    const points = values.map((value, index) => {
      const clampedValue = Math.min(value, scaleSeconds);
      const ratio = clampedValue / scaleSeconds;
      return {
        x: plotRect.left + (stepX * index),
        y: plotRect.bottom - (ratio * plotRect.height),
        value
      };
    });
    state.pointsBySeries.set(series.label, points);
  }

  for (const series of orderedSeries) {
    const points = state.pointsBySeries.get(series.label) || [];
    if (points.length < 2) {
      continue;
    }

    const gradient = context.createLinearGradient(0, plotRect.top, 0, plotRect.bottom);
    gradient.addColorStop(0, `${series.fillColor}${series.isActive ? "66" : "44"}`);
    gradient.addColorStop(1, `${series.fillColor}00`);

    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.lineTo(points[points.length - 1].x, plotRect.bottom);
    context.lineTo(points[0].x, plotRect.bottom);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
  }

  for (const series of orderedSeries) {
    const points = state.pointsBySeries.get(series.label) || [];
    if (points.length < 2) {
      continue;
    }

    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.strokeStyle = series.lineColor;
    context.lineWidth = series.isActive ? 2.6 : 2;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();
  }

  for (const series of orderedSeries) {
    const points = state.pointsBySeries.get(series.label) || [];
    context.fillStyle = series.dotColor;
    const radius = series.isActive ? 4 : 3;
    for (const point of points) {
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  const rangeLabel = state.scale === "year"
    ? String(state.yearAnchor)
    : formatRangeLabel(state.dates[0], state.dates[state.dates.length - 1]);
  context.fillStyle = "rgba(238, 243, 248, 0.76)";
  context.font = '12px "Segoe UI", sans-serif';
  context.textAlign = "right";
  context.textBaseline = "alphabetic";
  context.fillText(rangeLabel, plotRect.right, plotRect.top - 6);

  context.textAlign = "center";
  context.textBaseline = "top";
  const labelIndices = getLabelIndices(state.dates.length);
  for (const index of labelIndices) {
    const date = state.dates[index];
    const label = getAxisLabel(date, index);
    if (!label) {
      continue;
    }
    const x = plotRect.left + (stepX * index);
    context.fillText(label, x, plotRect.bottom + 12);
  }

  drawHoverState(context);
}

function updateNavButtons() {
  const today = startOfDay(new Date());
  if (state.scale === "year" || state.rangeDays >= 365) {
    nextButton.disabled = state.yearAnchor >= today.getFullYear();
    return;
  }
  nextButton.disabled = state.rangeEnd >= today;
}

function hideTooltip() {
  const hadHover = state.hoverIndex !== null;
  graphTooltip.hidden = true;
  state.hoverIndex = null;
  state.hoverCanvasX = null;
  state.hoverCanvasY = null;
  if (hadHover) {
    drawGraph();
  }
}

function getHoverAnchor(index) {
  const plotRect = state.plotRect;
  if (!plotRect) {
    return null;
  }

  const pointsAtIndex = state.visibleSeries
    .map((series) => {
      const point = state.pointsBySeries.get(series.label)?.[index];
      return point ? { series, point } : null;
    })
    .filter(Boolean);

  const fallbackPoint = {
    x: plotRect.left + (state.dates.length <= 1 ? 0 : (plotRect.width / (state.dates.length - 1)) * index),
    y: plotRect.bottom
  };
  const guideCanvasX = fallbackPoint.x;

  let anchorPoint = fallbackPoint;
  if (pointsAtIndex.length) {
    const pointerCanvasY = state.hoverCanvasY ?? fallbackPoint.y;
    anchorPoint = pointsAtIndex.reduce((closest, entry) => {
      if (!closest) {
        return entry.point;
      }
      return Math.abs(entry.point.y - pointerCanvasY) < Math.abs(closest.y - pointerCanvasY)
        ? entry.point
        : closest;
    }, null) || fallbackPoint;
  }

  return {
    guideX: graphScroll.offsetLeft + guideCanvasX - graphScroll.scrollLeft,
    pointX: graphScroll.offsetLeft + anchorPoint.x - graphScroll.scrollLeft,
    pointY: graphScroll.offsetTop + anchorPoint.y,
    pointerY: graphScroll.offsetTop + (state.hoverCanvasY ?? anchorPoint.y)
  };
}

function drawHoverState(context) {
  if (
    state.hoverIndex === null ||
    !state.plotRect ||
    state.hoverIndex < 0 ||
    state.hoverIndex >= state.dates.length
  ) {
    return;
  }

  const plotRect = state.plotRect;
  const pointsAtIndex = state.visibleSeries
    .map((series) => {
      const point = state.pointsBySeries.get(series.label)?.[state.hoverIndex];
      return point ? { series, point } : null;
    })
    .filter(Boolean);

  const fallbackX = plotRect.left + (state.dates.length <= 1
    ? 0
    : (plotRect.width / (state.dates.length - 1)) * state.hoverIndex);
  const guideX = fallbackX;

  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.28)";
  context.lineWidth = 1;
  context.setLineDash([5, 5]);
  context.beginPath();
  context.moveTo(guideX, plotRect.top);
  context.lineTo(guideX, plotRect.bottom);
  context.stroke();
  context.setLineDash([]);

  for (const { series, point } of pointsAtIndex) {
    context.fillStyle = series.lineColor;
    context.beginPath();
    context.arc(point.x, point.y, series.isActive ? 5 : 4, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "rgba(17, 21, 30, 0.96)";
    context.beginPath();
    context.arc(point.x, point.y, series.isActive ? 2.5 : 2, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function renderTooltip(index) {
  if (index < 0 || index >= state.dates.length) {
    hideTooltip();
    return;
  }

  const lines = [`Date: ${formatTooltipDate(state.dates[index], state.scale)}`];
  for (const series of state.visibleSeries) {
    const values = state.valuesBySeries.get(series.label) || [];
    const seconds = values[index] || 0;
    if (seconds > 0) {
      lines.push(`${series.label}: ${formatDuration(seconds)}`);
    }
  }
  if (lines.length === 1) {
    lines.push("No activity");
  }

  graphTooltip.textContent = lines.join("\n");
  graphTooltip.hidden = false;
  const panelRect = graphPanel.getBoundingClientRect();
  const anchor = getHoverAnchor(index);
  if (!anchor) {
    hideTooltip();
    return;
  }

  const left = anchor.guideX;
  let top = anchor.pointerY - graphTooltip.offsetHeight - 10;
  if (top < 12) {
    top = anchor.pointerY + 10;
  }
  if (top + graphTooltip.offsetHeight > panelRect.height - 12) {
    top = panelRect.height - graphTooltip.offsetHeight - 12;
  }

  graphTooltip.style.left = `${left}px`;
  graphTooltip.style.top = `${top}px`;
}

function handleCanvasPointerMove(event) {
  if (!state.plotRect || !state.dates.length) {
    hideTooltip();
    return;
  }

  const rect = graphCanvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? graphCanvas.clientWidth / rect.width : 1;
  const scaleY = rect.height > 0 ? graphCanvas.clientHeight / rect.height : 1;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  if (
    x < state.plotRect.left ||
    x > state.plotRect.right ||
    y < state.plotRect.top ||
    y > state.plotRect.bottom
  ) {
    hideTooltip();
    return;
  }

  const ratio = state.dates.length <= 1
    ? 0
    : (x - state.plotRect.left) / state.plotRect.width;
  const index = Math.max(0, Math.min(state.dates.length - 1, Math.round(ratio * (state.dates.length - 1))));
  state.hoverIndex = index;
  state.hoverCanvasX = x;
  state.hoverCanvasY = y;
  drawGraph();

  if (state.hoverIndex === index && !graphTooltip.hidden) {
    renderTooltip(index);
    return;
  }
  renderTooltip(index);
}

function shiftRange(direction) {
  const today = startOfDay(new Date());

  if (state.scale === "year" || state.rangeDays >= 365) {
    state.yearAnchor += direction;
    state.yearAnchor = Math.min(today.getFullYear(), state.yearAnchor);
    savePrefs();
    drawGraph();
    updateNavButtons();
    return;
  }

  state.rangeEnd = addDays(state.rangeEnd, state.rangeDays * direction);
  if (state.rangeEnd > today) {
    state.rangeEnd = today;
  }
  savePrefs();
  drawGraph();
  updateNavButtons();
}

async function refreshData() {
  state.settings = await loadSettings();
  state.series = buildGraphSeries(state.settings);
  ensureEnabledLabels();
  updateSubtitle();
  renderLegend();
  applyWindowScale();
  drawGraph();
  updateNavButtons();
}

function scheduleBoundsSave() {
  clearTimeout(resizeBoundsTimeoutId);
  resizeBoundsTimeoutId = setTimeout(() => {
    resizeBoundsTimeoutId = null;
    void saveTrendsWindowBounds();
  }, 160);
}

async function initialize() {
  await loadPrefs();
  syncControlsFromState();
  await refreshData();

  scaleSelect.addEventListener("change", () => {
    state.scale = scaleSelect.value;
    if (state.scale === "year") {
      state.rangeDays = 365;
      rangeSelect.value = "365";
    }
    syncControlsFromState();
    savePrefs();
    drawGraph();
    updateNavButtons();
  });

  rangeSelect.addEventListener("change", () => {
    state.rangeDays = Number(rangeSelect.value) || 365;
    savePrefs();
    drawGraph();
    updateNavButtons();
  });

  zoomSlider.addEventListener("input", () => {
    state.zoom = Number(zoomSlider.value) || 100;
    zoomValue.textContent = `${state.zoom}%`;
    savePrefs();
    drawGraph();
  });

  previousButton.addEventListener("click", () => shiftRange(-1));
  nextButton.addEventListener("click", () => shiftRange(1));
  graphCanvas.addEventListener("mousemove", handleCanvasPointerMove);
  graphCanvas.addEventListener("mouseleave", hideTooltip);
  graphScroll.addEventListener("scroll", () => {
    if (state.hoverIndex === null || graphTooltip.hidden) {
      return;
    }
    renderTooltip(state.hoverIndex);
  });

  window.addEventListener("resize", () => {
    applyWindowScale();
    drawGraph();
    scheduleBoundsSave();
  });
  window.addEventListener("beforeunload", () => {
    void saveTrendsWindowBounds();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" && areaName !== "sync") {
      return;
    }
    if (changes[TRENDS_PREFS_KEY] || changes[TRENDS_WINDOW_BOUNDS_KEY]) {
      return;
    }
    void refreshData();
  });
}

initialize();
