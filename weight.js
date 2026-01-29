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
} from "./utils.js";

// UI Elements
const dateInput = document.getElementById("dateInput");
const weightInput = document.getElementById("weightInput");
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

  const points = computePoints(rowsForChart);
  const domain = yAxisDomain(points);
  const step = domain.step;

  avg7Text.textContent = points.length
    ? fmt2(points[points.length - 1].avg7)
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
    return;
  }

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
function renderEntries(refreshAll) {
  const sorted = [...weights].sort((a, b) =>
    b.entry_date.localeCompare(a.entry_date),
  );
  entriesBody.innerHTML = "";

  for (const r of sorted) {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = formatDisplayDate(r.entry_date);

    const tdWeight = document.createElement("td");
    tdWeight.textContent = fmt2(r.weight);
    tdWeight.className = "mono";

    const tdAction = document.createElement("td");
    tdAction.style.textAlign = "right";

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.className = "actionBtn";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete ${r.entry_date}?`)) return;
      await deleteWeight(r.entry_date);
      await refreshAll();
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

  for (const w of weeks) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDisplayDate(w.weekStart)}</td>
      <td class="mono">${fmt2(w.avg)}</td>
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
  weightInput.value = existing ? String(existing.weight) : "";
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
  weights = await fetchWeights();
  renderChart(showBanner, clearBanner);
  renderEntries(refreshAll);
  renderWeekly();
  syncEditorToSelectedDate();
}

export function initWeightListeners(showBanner, clearBanner) {
  dateInput.addEventListener("change", syncEditorToSelectedDate);

  saveBtn.addEventListener("click", async () => {
    clearBanner();

    const d = dateInput.value;
    const w = Number(weightInput.value);

    if (!d) return showBanner("Pick a date.");
    if (!Number.isFinite(w) || w <= 0)
      return showBanner("Enter a valid weight.");

    try {
      saveBtn.disabled = true;
      await upsertWeight(d, w);
      await refreshAll(showBanner, clearBanner);
    } catch (e) {
      showBanner(`Save failed: ${e.message}`);
    } finally {
      saveBtn.disabled = false;
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
  syncEditorToSelectedDate();
}

export function resizeWeightChart() {
  if (chart) chart.resize();
}
