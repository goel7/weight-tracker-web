// =====================================================
// WEIGHT TRACKING
// =====================================================

import { sb } from "./supabase.js";
import {
  isoToday,
  parseISO,
  fmt2,
  filterByTimeframe,
  formatTickLabel,
  formatDisplayDate,
  weeklyAverages,
  computePoints,
  yAxisDomain,
  uiConfirm,
  getWeightUnit,
  convertWeight,
  getWeightLabel,
} from "./utils.js";

// UI Elements
const dateInput = document.getElementById("dateInput");
const weightInput = document.getElementById("weightInput");
const weightInputLabel = document.getElementById("weightInputLabel");
const selectedDateText = document.getElementById("selectedDateText");
const saveBtn = document.getElementById("saveBtn");
const avg7Text = document.getElementById("avg7Text");
const entriesBody = document.getElementById("entriesBody");
const weeklyBody = document.getElementById("weeklyBody");
const entriesTab = document.getElementById("entriesTab");
const weeklyTab = document.getElementById("weeklyTab");
const tabButtons = Array.from(document.querySelectorAll(".tab"));
const rangeButtons = Array.from(
  document.querySelectorAll("#weightPage .rangeBtn"),
);

// State
let weights = [];
let chart = null;
let selectedRange = "30d";
let datasetVisible = [true, true]; // [Weight, 7-day avg]
let showBannerFn = null;
let clearBannerFn = null;

// Update labels based on unit preference
export function updateWeightLabels() {
  const unit = getWeightUnit();
  if (weightInputLabel) {
    weightInputLabel.textContent = getWeightLabel();
  }
  if (weightInput) {
    weightInput.placeholder = unit === "kg" ? "70.0" : "155.0";
  }
}

// Empty state helpers
function showEmptyState(canvas, title, subtitle) {
  const chartWrap = canvas.parentElement;
  let empty = chartWrap.querySelector(".emptyState");

  if (!empty) {
    empty = document.createElement("div");
    empty.className = "emptyState";
    chartWrap.appendChild(empty);
  }

  empty.innerHTML = `
    <div class="emptyIcon">📊</div>
    <div class="emptyTitle">${title}</div>
    <div class="emptySubtitle">${subtitle}</div>
  `;
}

function clearEmptyState(canvas) {
  const chartWrap = canvas.parentElement;
  const empty = chartWrap.querySelector(".emptyState");
  if (empty) empty.remove();
}

// Loading state helpers
function showLoading(element, text = "Loading...") {
  element.disabled = true;
  const original = element.textContent;
  element.dataset.originalText = original;
  element.innerHTML = `<span class="spinner"></span> ${text}`;
}

function hideLoading(element) {
  element.disabled = false;
  const original = element.dataset.originalText || element.textContent;
  element.textContent = original;
  delete element.dataset.originalText;
}

// Chart loading state
function showChartLoading() {
  const chart = document.getElementById("chart");
  const chartWrap = chart.parentElement;
  let loading = chartWrap.querySelector(".loadingState");

  if (!loading) {
    loading = document.createElement("div");
    loading.className = "loadingState";
    chartWrap.appendChild(loading);
  }

  loading.innerHTML = `
    <div class="loadingSpinner"></div>
    <div class="loadingText">Fetching your data...</div>
  `;
}

function hideChartLoading() {
  const chart = document.getElementById("chart");
  const chartWrap = chart.parentElement;
  const loading = chartWrap.querySelector(".loadingState");
  if (loading) loading.remove();
}

function removeWeightLocal(entry_date) {
  weights = weights.filter((w) => w.entry_date !== entry_date);
}

// Data operations
export async function fetchWeights() {
  const { data, error } = await sb
    .from("weights")
    .select("id, entry_date, weight")
    .order("entry_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function upsertWeight(entry_date, weight) {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not logged in");

  const payload = { user_id: user.id, entry_date, weight };
  const { error } = await sb.from("weights").upsert(payload, {
    onConflict: "user_id,entry_date",
  });
  if (error) throw error;
}

async function deleteWeight(entry_date) {
  const { error } = await sb
    .from("weights")
    .delete()
    .eq("entry_date", entry_date);
  if (error) throw error;
}

// Chart legend pills
function ensureLegendHost(ctxCanvas) {
  const chartWrap = ctxCanvas.parentElement;
  const chartCard = chartWrap?.closest(".chartCard");
  if (!chartCard) return null;

  let host = chartCard.querySelector("#legendPills");
  if (!host) {
    host = document.createElement("div");
    host.id = "legendPills";
    host.className = "legendPills";
    chartCard.insertBefore(host, chartWrap);
  }
  return host;
}

function renderLegendPills(c, showBanner, clearBanner) {
  const host = ensureLegendHost(c.canvas);
  if (!host) return;

  host.innerHTML = "";

  c.data.datasets.forEach((ds, i) => {
    const visible = c.isDatasetVisible(i);

    const meta = c.getDatasetMeta(i);
    const stroke =
      ds.borderColor ||
      meta?.controller?.getStyle?.(0)?.borderColor ||
      "rgba(245,245,247,0.75)";

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "legendPill" + (visible ? "" : " isOff");
    pill.setAttribute("aria-pressed", visible ? "true" : "false");

    const dot = document.createElement("span");
    dot.className = "legendDot";
    dot.style.borderColor = stroke;
    dot.style.background = visible ? stroke + "33" : "rgba(0,0,0,0.15)";

    const label = document.createElement("span");
    label.textContent = ds.label;

    pill.appendChild(dot);
    pill.appendChild(label);

    pill.addEventListener("click", () => {
      datasetVisible[i] = !datasetVisible[i];
      c.setDatasetVisibility(i, datasetVisible[i]);
      c.update();

      const v0 = datasetVisible[0];
      const v1 = datasetVisible[1];
      if (!v0 && !v1) showBanner('Click "Weight" or "7-day avg" to show data.');
      else clearBanner();

      renderLegendPills(c, showBanner, clearBanner);
    });

    host.appendChild(pill);
  });
}

// Chart rendering
function renderChart(showBanner, clearBanner) {
  const tf = selectedRange || "ytd";
  const rowsForChart = filterByTimeframe(weights, tf);
  const displayUnit = getWeightUnit();

  // Convert weights to display unit for chart
  const convertedRows = rowsForChart.map((row) => ({
    ...row,
    weight: convertWeight(row.weight, "lbs", displayUnit),
  }));

  const points = computePoints(convertedRows);
  const domain = yAxisDomain(points);
  const step = domain.step;

  avg7Text.textContent = points.length
    ? fmt2(points[points.length - 1].avg7) + ` ${displayUnit}`
    : "—";

  const ctx = document.getElementById("chart");

  if (!points.length) {
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false },
    });

    const host = ensureLegendHost(ctx);
    if (host) host.innerHTML = "";

    // Show empty state message
    showEmptyState(
      ctx,
      "No weight entries yet",
      "Log your first entry above to see your trend!",
    );
    return;
  }

  // Clear empty state if it exists
  clearEmptyState(ctx);

  const minISO = points[0].iso;
  const maxISO = points[points.length - 1].iso;
  const minDate = parseISO(minISO);
  const maxDate = parseISO(maxISO);

  const labels = [];
  for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
    labels.push(d.toISOString().slice(0, 10));
  }

  const byDate = new Map(points.map((p) => [p.iso, p]));
  const wData = labels.map((iso) =>
    byDate.has(iso) ? byDate.get(iso).weight : null,
  );
  const aData = labels.map((iso) =>
    byDate.has(iso) ? byDate.get(iso).avg7 : null,
  );

  if (chart) {
    datasetVisible = [chart.isDatasetVisible(0), chart.isDatasetVisible(1)];
  }

  if (chart) chart.destroy();

  const isPhone = window.innerWidth < 480;

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Weight",
          data: wData,
          tension: 0,
          spanGaps: true,
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 4,
        },
        {
          label: "7-day avg",
          data: aData,
          tension: 0,
          spanGaps: true,
          borderDash: [6, 4],
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,

      layout: {
        padding: {
          left: isPhone ? 2 : 8,
          right: isPhone ? 6 : 10,
          top: 6,
          bottom: 10,
        },
      },

      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const iso = items?.[0]?.label;
              return iso ? formatTickLabel(iso) : "";
            },
          },
        },
      },

      scales: {
        y: {
          min: domain.min,
          max: domain.max,

          afterBuildTicks: (scale) => {
            const step = domain.step;
            const start = Math.ceil(scale.min / step) * step;
            const end = Math.floor(scale.max / step) * step;

            const ticks = [];
            for (let v = start; v <= end + 1e-9; v += step) {
              ticks.push({ value: v });
            }
            scale.ticks = ticks;
          },

          ticks: {
            callback: (v) => Number(v).toFixed(0),
            color: "rgba(245,245,247,0.55)",
          },

          grid: {
            color: "rgba(255,255,255,0.04)",
            drawBorder: false,
          },
        },

        x: {
          ticks: {
            autoSkip: true,
            maxTicksLimit: isPhone ? 5 : 8,
            maxRotation: 0,
            minRotation: 0,
            padding: isPhone ? 4 : 6,
            color: "rgba(245,245,247,0.55)",
            callback: (val) => formatTickLabel(labels[val]),
          },
          grid: {
            color: "rgba(255,255,255,0.04)",
            drawBorder: false,
          },
        },
      },
    },
  });

  chart.setDatasetVisibility(0, datasetVisible[0]);
  chart.setDatasetVisibility(1, datasetVisible[1]);
  chart.update("none");

  renderLegendPills(chart, showBanner, clearBanner);

  const v0 = chart.isDatasetVisible(0);
  const v1 = chart.isDatasetVisible(1);
  if (!v0 && !v1) showBanner('Click "Weight" or "7-day avg" to show data.');
  else clearBanner();
}

// Table rendering
function renderEntries() {
  const sorted = [...weights].sort((a, b) =>
    b.entry_date.localeCompare(a.entry_date),
  );
  entriesBody.innerHTML = "";
  const displayUnit = getWeightUnit();

  if (sorted.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" class="emptyTableMessage">No entries yet. Start logging above!</td>`;
    entriesBody.appendChild(tr);
    return;
  }

  for (const r of sorted) {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = formatDisplayDate(r.entry_date);

    const tdWeight = document.createElement("td");
    const displayWeight = convertWeight(r.weight, "lbs", displayUnit);
    tdWeight.textContent = fmt2(displayWeight) + ` ${displayUnit}`;
    tdWeight.className = "mono";

    const tdAction = document.createElement("td");
    tdAction.style.textAlign = "right";

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.className = "actionBtn";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await uiConfirm({
        title: "Delete entry",
        message: `Delete ${r.entry_date}?`,
        confirmText: "Delete",
        danger: true,
      });
      if (!ok) return;

      try {
        showLoading(del, "Deleting...");
        await deleteWeight(r.entry_date);
        removeWeightLocal(r.entry_date);
        if (showBannerFn && clearBannerFn) {
          renderChart(showBannerFn, clearBannerFn);
        }
        renderEntries();
        renderWeekly();
        syncEditorToSelectedDate();
        if (showBannerFn)
          showBannerFn("Entry deleted successfully!", "success");
      } catch (e) {
        if (showBannerFn) showBannerFn(`Delete failed: ${e.message}`, "error");
      } finally {
        hideLoading(del);
      }
    });

    tdAction.appendChild(del);

    tr.appendChild(tdDate);
    tr.appendChild(tdWeight);
    tr.appendChild(tdAction);

    tr.addEventListener("click", () => {
      dateInput.value = r.entry_date;
      syncEditorToSelectedDate();
    });

    entriesBody.appendChild(tr);
  }
}

function renderWeekly() {
  const weeks = weeklyAverages(weights);
  weeklyBody.innerHTML = "";
  const displayUnit = getWeightUnit();

  if (weeks.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" class="emptyTableMessage">No weekly data yet. Add more entries!</td>`;
    weeklyBody.appendChild(tr);
    return;
  }

  for (const w of weeks) {
    const tr = document.createElement("tr");
    const displayWeight = convertWeight(w.avg, "lbs", displayUnit);
    tr.innerHTML = `
      <td>${formatDisplayDate(w.weekStart)}</td>
      <td class="mono">${fmt2(displayWeight)} ${displayUnit}</td>
      <td>${w.count}</td>
    `;
    weeklyBody.appendChild(tr);
  }
}

// UI sync
function syncEditorToSelectedDate() {
  const d = dateInput.value;
  selectedDateText.textContent = d || "";
  const existing = weights.find((w) => w.entry_date === d);
  if (existing) {
    const displayUnit = getWeightUnit();
    const displayWeight = convertWeight(existing.weight, "lbs", displayUnit);
    weightInput.value = String(displayWeight.toFixed(1));
  } else {
    weightInput.value = "";
  }
}

function setActiveRange(range, showBanner, clearBanner) {
  selectedRange = range;

  rangeButtons.forEach((btn) => {
    const isActive = btn.dataset.range === range;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  renderChart(showBanner, clearBanner);
}

export async function refreshAll(showBanner, clearBanner) {
  try {
    showChartLoading();
    weights = await fetchWeights();
    renderChart(showBanner, clearBanner);
    renderEntries();
    renderWeekly();
    syncEditorToSelectedDate();
    hideChartLoading();
  } catch (e) {
    hideChartLoading();
    showBanner(`Failed to load data: ${e.message}`, "error");
  }
}

export function initWeightListeners(showBanner, clearBanner) {
  showBannerFn = showBanner;
  clearBannerFn = clearBanner;

  dateInput.addEventListener("change", syncEditorToSelectedDate);

  // Add input validation
  weightInput.addEventListener("input", () => {
    const w = Number(weightInput.value);
    const displayUnit = getWeightUnit();
    const maxWeight = displayUnit === "kg" ? 454 : 1000;
    const isValid = w > 0 && w <= maxWeight;
    weightInput.classList.toggle("invalid", weightInput.value && !isValid);
    saveBtn.disabled = !dateInput.value || !isValid || !weightInput.value;
  });

  dateInput.addEventListener("change", () => {
    const w = Number(weightInput.value);
    const displayUnit = getWeightUnit();
    const maxWeight = displayUnit === "kg" ? 454 : 1000;
    const isValid = w > 0 && w <= maxWeight;
    saveBtn.disabled = !dateInput.value || !isValid || !weightInput.value;
  });

  saveBtn.addEventListener("click", async () => {
    clearBanner();

    const d = dateInput.value;
    const inputWeight = Number(weightInput.value);
    const displayUnit = getWeightUnit();

    // Convert from display unit to lbs for storage
    const weightInLbs = convertWeight(inputWeight, displayUnit, "lbs");

    // Validation limits adjusted for unit
    const maxWeight = displayUnit === "kg" ? 454 : 1000; // ~1000 lbs = 454 kg

    if (!d) {
      dateInput.classList.add("invalid");
      return showBanner("Pick a date.", "error");
    }
    if (!weightInput.value) {
      weightInput.classList.add("invalid");
      return showBanner("Enter a weight.", "error");
    }
    if (
      !Number.isFinite(inputWeight) ||
      inputWeight <= 0 ||
      inputWeight > maxWeight
    ) {
      weightInput.classList.add("invalid");
      return showBanner(
        `Enter a valid weight (1-${maxWeight} ${displayUnit}).`,
        "error",
      );
    }

    try {
      showLoading(saveBtn, "Saving...");
      await upsertWeight(d, weightInLbs);
      await refreshAll(showBanner, clearBanner);
      showBanner("Weight saved successfully!", "success");
      weightInput.classList.remove("invalid");
      dateInput.classList.remove("invalid");
    } catch (e) {
      showBanner(`Save failed: ${e.message}`, "error");
    } finally {
      hideLoading(saveBtn);
    }
  });

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const tab = btn.dataset.tab;
      entriesTab.classList.toggle("hidden", tab !== "entries");
      weeklyTab.classList.toggle("hidden", tab !== "weekly");
    });
  });

  rangeButtons.forEach((btn) => {
    btn.addEventListener("click", () =>
      setActiveRange(btn.dataset.range, showBanner, clearBanner),
    );
  });
}

export function initWeightUI() {
  dateInput.value = isoToday();
  updateWeightLabels();
  syncEditorToSelectedDate();
}

export function resizeWeightChart() {
  if (chart) chart.resize();
}
