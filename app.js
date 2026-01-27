const SUPABASE_URL = "https://leksemdifenhfvfafcqa.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3NlbWRpZmVuaGZ2ZmFmY3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzk3MjIsImV4cCI6MjA4NDg1NTcyMn0.hpa7L5oqxgn2u2PIk4F0UfRTKWpB07MYOa7uyjPJE-Y";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("app.js loaded ✅");

// -------------------- UI --------------------
const authCard = document.getElementById("authCard");
const app = document.getElementById("app");
const banner = document.getElementById("banner");
const logoutBtn = document.getElementById("logoutBtn");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");

const primaryAuthBtn = document.getElementById("primaryAuthBtn");
const toggleAuthBtn = document.getElementById("toggleAuthBtn");

const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authHint = document.getElementById("authHint");

const confirmWrap = document.getElementById("confirmWrap");
const pass2El = document.getElementById("password2");

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
const rangeButtons = Array.from(document.querySelectorAll(".rangeBtn"));

const bannerText = document.getElementById("bannerText");
const bannerClose = document.getElementById("bannerClose");

// -------------------- State --------------------
let selectedRange = "ytd";
let weights = [];
let chart = null;

// Persist legend visibility across chart rebuilds (timeframe changes, resize, etc.)
let datasetVisible = [true, true]; // [Weight, 7-day avg]

// -------------------- Helpers --------------------
function showBanner(msg) {
  bannerText.textContent = msg;
  banner.classList.remove("hidden");
}
function clearBanner() {
  banner.classList.add("hidden");
  bannerText.textContent = "";
}
bannerClose.addEventListener("click", clearBanner);

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmt2(x) {
  return Number(x).toFixed(2);
}

function niceStep(minY, maxY) {
  const r = Math.max(0.0001, maxY - minY);
  const raw = r / 5; // target ~5 intervals
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow10;

  let mult;
  if (n <= 1) mult = 1;
  else if (n <= 2) mult = 2;
  else if (n <= 5) mult = 5;
  else mult = 10;

  return mult * pow10;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

function filterByTimeframe(rows, tf) {
  if (!rows?.length) return rows ?? [];
  const sorted = [...rows].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date)
  );
  if (tf === "all") return sorted;

  const today = new Date();
  let start;

  if (tf === "mtd") start = startOfMonth(today);
  else if (tf === "ytd") start = startOfYear(today);
  else {
    const days = Number(tf.replace("d", ""));
    start = new Date(today);
    start.setDate(start.getDate() - days + 1);
  }

  const startISO = start.toISOString().slice(0, 10);
  return sorted.filter((r) => r.entry_date >= startISO);
}

const fmtShort = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
function formatTickLabel(iso) {
  return fmtShort.format(parseISO(iso));
}

const fmtLong = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDisplayDate(iso) {
  return fmtLong.format(parseISO(iso));
}

function computePoints(rows) {
  const sorted = [...rows].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date)
  );
  const pts = [];
  const seen = [];

  for (const r of sorted) {
    seen.push(Number(r.weight));
    const last7 = seen.slice(-7);
    const avg7 = last7.reduce((s, v) => s + v, 0) / last7.length;

    pts.push({
      iso: r.entry_date,
      weight: Number(r.weight),
      avg7,
    });
  }
  return pts;
}

// ✅ Tight domain (no expanding to 145–165)
// We hide labels near min/max via tick callback
function yAxisDomain(points) {
  if (!points.length) return { min: 0, max: 1, rawMin: 0, rawMax: 1, step: 5 };

  const ys = points.flatMap((p) => [p.weight, p.avg7]).filter(Number.isFinite);
  let rawMin = Math.min(...ys);
  let rawMax = Math.max(...ys);

  if (rawMin === rawMax) {
    rawMin -= 1;
    rawMax += 1;
  }

  const rawSpan = rawMax - rawMin;

  // Choose tick step (lbs)
  // Keep 5 most of the time, but if range is super tiny, use 1 or 2.
  let step = 5;
  if (rawSpan < 2) step = 1;
  else if (rawSpan < 6) step = 2;

  // Padding so it doesn't look insanely zoomed in
  const pad = Math.max(rawSpan * 0.75, step * 0.35);

  let min = rawMin - pad;
  let max = rawMax + pad;

  // If the span is small, it's nice to snap out to clean tick boundaries
  // (but we avoid doing this on big spans because that's when you got 145–165).
  if (rawSpan < step * 2) {
    min = Math.min(min, Math.floor(rawMin / step) * step);
    max = Math.max(max, Math.ceil(rawMax / step) * step);
  }

  return { rawMin, rawMax, min, max, step };
}

function weekStartISO(dateObj) {
  const d = new Date(dateObj);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weeklyAverages(rows) {
  const buckets = new Map();

  for (const r of rows) {
    const ws = weekStartISO(parseISO(r.entry_date));
    if (!buckets.has(ws)) buckets.set(ws, []);
    buckets.get(ws).push(Number(r.weight));
  }

  const arr = [];
  for (const [ws, vals] of buckets.entries()) {
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    arr.push({ weekStart: ws, avg, count: vals.length });
  }

  arr.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  return arr;
}

// -------------------- Ranges --------------------
function setActiveRange(range) {
  selectedRange = range;

  rangeButtons.forEach((btn) => {
    const isActive = btn.dataset.range === range;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  renderChart();
}

rangeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveRange(btn.dataset.range));
});

// -------------------- Auth --------------------
async function setUIAuthed(isAuthed) {
  authCard.classList.toggle("hidden", isAuthed);
  app.classList.toggle("hidden", !isAuthed);
  logoutBtn.classList.toggle("hidden", !isAuthed);
}

let authMode = "login"; // "login" | "signup"

function setAuthMode(mode) {
  authMode = mode;

  if (mode === "login") {
    authTitle.textContent = "Sign in";
    authSubtitle.textContent = "Welcome back. Log in to see your trend.";
    primaryAuthBtn.textContent = "Login";
    toggleAuthBtn.textContent = "Sign up instead";
    authHint.textContent = "New here? Create an account in 10 seconds.";
    confirmWrap.classList.add("hidden");
    pass2El.value = "";
    passEl.autocomplete = "current-password";
  } else {
    authTitle.textContent = "Create account";
    authSubtitle.textContent =
      "First time here? Make an account to start logging.";
    primaryAuthBtn.textContent = "Create account";
    toggleAuthBtn.textContent = "I already have an account";
    authHint.textContent = "Use a real email if you keep confirmations on.";
    confirmWrap.classList.remove("hidden");
    passEl.autocomplete = "new-password";
  }
}

toggleAuthBtn.addEventListener("click", () => {
  clearBanner();
  setAuthMode(authMode === "login" ? "signup" : "login");
});

primaryAuthBtn.addEventListener("click", async () => {
  clearBanner();

  const email = emailEl.value.trim();
  const pw = passEl.value;

  if (!email) return showBanner("Enter an email.");
  if (!pw || pw.length < 6)
    return showBanner("Password must be at least 6 characters.");

  primaryAuthBtn.disabled = true;
  toggleAuthBtn.disabled = true;

  try {
    if (authMode === "signup") {
      const pw2 = pass2El.value;
      if (pw !== pw2) return showBanner("Passwords do not match.");

      const { error } = await sb.auth.signUp({ email, password: pw });
      if (error) throw error;

      showBanner("Account created. Now log in (or confirm email if required).");
      setAuthMode("login");
      return;
    }

    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) throw error;

    await bootstrapAuthed();
  } catch (e) {
    showBanner(
      `${authMode === "signup" ? "Sign up" : "Login"} failed: ${e.message}`
    );
  } finally {
    primaryAuthBtn.disabled = false;
    toggleAuthBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  weights = [];
  if (chart) chart.destroy();
  chart = null;
  await setUIAuthed(false);
});

// -------------------- Data --------------------
async function fetchWeights() {
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

// -------------------- UI behavior --------------------
function syncEditorToSelectedDate() {
  const d = dateInput.value;
  selectedDateText.textContent = d || "";
  const existing = weights.find((w) => w.entry_date === d);
  weightInput.value = existing ? String(existing.weight) : "";
}
dateInput.addEventListener("change", syncEditorToSelectedDate);

saveBtn.addEventListener("click", async () => {
  clearBanner();

  const d = dateInput.value;
  const w = Number(weightInput.value);

  if (!d) return showBanner("Pick a date.");
  if (!Number.isFinite(w) || w <= 0) return showBanner("Enter a valid weight.");

  try {
    saveBtn.disabled = true;
    await upsertWeight(d, w);
    await refreshAll();
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

// -------------------- Legend pills (external) --------------------
function ensureLegendHost(ctxCanvas) {
  const chartWrap = ctxCanvas.parentElement; // .chartWrap
  const chartCard = chartWrap?.closest(".chartCard");
  if (!chartCard) return null;

  let host = chartCard.querySelector("#legendPills");
  if (!host) {
    host = document.createElement("div");
    host.id = "legendPills";
    host.className = "legendPills";
    chartCard.insertBefore(host, chartWrap); // directly above the canvas
  }
  return host;
}

function renderLegendPills(c) {
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
      datasetVisible[i] = !datasetVisible[i]; // store desired state
      c.setDatasetVisibility(i, datasetVisible[i]); // apply to current chart
      c.update();

      const v0 = datasetVisible[0];
      const v1 = datasetVisible[1];
      if (!v0 && !v1) showBanner("Click “Weight” or “7-day avg” to show data.");
      else clearBanner();

      renderLegendPills(c); // re-render pills to reflect state
    });

    host.appendChild(pill);
  });
}

// -------------------- Render --------------------
function renderChart() {
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

  // continuous labels from min -> max
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
    byDate.has(iso) ? byDate.get(iso).weight : null
  );
  const aData = labels.map((iso) =>
    byDate.has(iso) ? byDate.get(iso).avg7 : null
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

          // Force clean tick values (150, 155, 160...) without showing raw min/max like 147/161
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
            callback: (v) => Number(v).toFixed(0), // show as integers
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

  // ✅ re-apply visibility after rebuild
  chart.setDatasetVisibility(0, datasetVisible[0]);
  chart.setDatasetVisibility(1, datasetVisible[1]);
  chart.update("none"); // fast update, no animation

  renderLegendPills(chart);

  const v0 = chart.isDatasetVisible(0);
  const v1 = chart.isDatasetVisible(1);
  if (!v0 && !v1) showBanner("Click “Weight” or “7-day avg” to show data.");
  else clearBanner();
}

function renderEntries() {
  const sorted = [...weights].sort((a, b) =>
    b.entry_date.localeCompare(a.entry_date)
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

async function refreshAll() {
  weights = await fetchWeights();
  renderChart();
  renderEntries();
  renderWeekly();
  syncEditorToSelectedDate();
}

async function bootstrapAuthed() {
  await setUIAuthed(true);
  dateInput.value = isoToday();
  syncEditorToSelectedDate();
  await refreshAll();
}

// -------------------- Boot --------------------
(async function init() {
  setAuthMode("login");

  const { data } = await sb.auth.getSession();
  if (data.session) await bootstrapAuthed();
  else await setUIAuthed(false);

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session) await bootstrapAuthed();
    else await setUIAuthed(false);
  });

  window.addEventListener("resize", () => {
    if (!app.classList.contains("hidden")) renderChart();
  });
})();
