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
const rangeButtons = Array.from(
  document.querySelectorAll("#weightPage .rangeBtn")
);

const bannerText = document.getElementById("bannerText");
const bannerClose = document.getElementById("bannerClose");

// ---------- Page nav ----------
const pageNav = document.getElementById("pageNav");
const pageBtns = Array.from(document.querySelectorAll(".pageBtn"));
const weightPage = document.getElementById("weightPage");
const liftsPage = document.getElementById("liftsPage");

const appTitle = document.getElementById("appTitle");
const appSub = document.getElementById("appSub");

// ---------- Lifts UI ----------
const liftDateInput = document.getElementById("liftDateInput");
const liftSelectedDateText = document.getElementById("liftSelectedDateText");

const exerciseSelect = document.getElementById("exerciseSelect");
const addExerciseBtn = document.getElementById("addExerciseBtn");

const liftWeightInput = document.getElementById("liftWeightInput");
const liftRepsInput = document.getElementById("liftRepsInput");
const liftSetsInput = document.getElementById("liftSetsInput");
const liftNotesInput = document.getElementById("liftNotesInput");
const liftSaveBtn = document.getElementById("liftSaveBtn");

const liftViewExerciseSelect = document.getElementById(
  "liftViewExerciseSelect"
);
const liftTableExerciseSelect = document.getElementById(
  "liftTableExerciseSelect"
);
const liftEntriesBody = document.getElementById("liftEntriesBody");
const liftLastText = document.getElementById("liftLastText");

const liftRangeButtons = Array.from(
  document.querySelectorAll("#liftsPage .liftRangeBtn")
);

// -------------------- State --------------------
let selectedRange = "30d";
let weights = [];
let chart = null;

// Persist legend visibility across chart rebuilds (timeframe changes, resize, etc.)
let datasetVisible = [true, true]; // [Weight, 7-day avg]

// ---------- Lifts state ----------
let selectedPage = "weight";
let selectedLiftRange = "90d";

let exercises = []; // [{ id, name }]
let liftEntries = []; // [{ id, entry_date, exercise_id, weight, reps, sets, notes }]

let liftChart = null;

// -------------------- Helpers --------------------
function setActivePage(page) {
  selectedPage = page;

  // nav button UI
  pageBtns.forEach((b) => {
    const on = b.dataset.page === page;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  // show/hide pages
  weightPage.classList.toggle("hidden", page !== "weight");
  liftsPage.classList.toggle("hidden", page !== "lifts");

  // title/subtitle
  if (page === "weight") {
    appTitle.textContent = "Weight Tracker";
    appSub.textContent = "Log daily weight, see trend + weekly averages.";
    renderChart();
    renderEntries();
    renderWeekly();
  } else {
    appTitle.textContent = "Lift Tracker";
    appSub.textContent = "Log lifts, track strength progression by exercise.";
    renderLiftChart();
    renderLiftEntriesTable();
  }
}

pageBtns.forEach((btn) => {
  btn.addEventListener("click", () => setActivePage(btn.dataset.page));
});

function syncLiftEditorToSelectedDate() {
  const d = liftDateInput.value;
  liftSelectedDateText.textContent = d || "";
}
liftDateInput.addEventListener("change", syncLiftEditorToSelectedDate);

function setActiveLiftRange(range) {
  selectedLiftRange = range;

  liftRangeButtons.forEach((btn) => {
    const on = btn.dataset.range === range;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  renderLiftChart();
}

liftRangeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setActiveLiftRange(btn.dataset.range));
});

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
  pageNav.classList.toggle("hidden", !isAuthed);
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

// ==========================
// LIFTS: Data (Supabase)
// ==========================
async function fetchExercises() {
  const { data, error } = await sb
    .from("exercises")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function createExercise(name) {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not logged in");

  const clean = name.trim();
  if (!clean) throw new Error("Exercise name required");

  const { error } = await sb.from("exercises").insert({
    user_id: user.id,
    name: clean,
  });

  // If duplicate, treat as "already exists"
  if (
    error &&
    !String(error.message || "")
      .toLowerCase()
      .includes("duplicate")
  )
    throw error;
}

async function fetchLiftEntries() {
  const { data, error } = await sb
    .from("lift_entries")
    .select("id, entry_date, exercise_id, weight, reps, sets, notes")
    .order("entry_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function upsertLiftEntry(payload) {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not logged in");

  const row = {
    user_id: user.id,
    entry_date: payload.entry_date,
    exercise_id: payload.exercise_id,
    weight: payload.weight,
    reps: payload.reps ?? null,
    sets: payload.sets ?? null,
    notes: payload.notes ?? null,
  };

  const { error } = await sb.from("lift_entries").upsert(row, {
    onConflict: "user_id,exercise_id,entry_date",
  });
  if (error) throw error;
}

async function deleteLiftEntry(id) {
  const { error } = await sb.from("lift_entries").delete().eq("id", id);
  if (error) throw error;
}

async function renameExercise(exerciseId, newName) {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not logged in");

  const clean = newName.trim();
  if (!clean) throw new Error("Name required");

  const { error } = await sb
    .from("exercises")
    .update({ name: clean })
    .eq("id", exerciseId)
    .eq("user_id", user.id);

  if (error) throw error;
}

async function deleteExercise(exerciseId) {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not logged in");

  const { error } = await sb
    .from("exercises")
    .delete()
    .eq("id", exerciseId)
    .eq("user_id", user.id);

  if (error) throw error;
}

const manageExercisesBtn = document.getElementById("manageExercisesBtn");

manageExercisesBtn.addEventListener("click", () => {
  openManageExercisesModal();
});

function openManageExercisesModal() {
  // overlay
  const overlay = document.createElement("div");
  overlay.className = "modalOverlay";

  const card = document.createElement("div");
  card.className = "modalCard";
  card.innerHTML = `
    <div class="modalTop">
      <div>
        <div class="modalTitle">Manage exercises</div>
        <div class="modalSub muted">Rename or delete exercises.</div>
      </div>
      <button class="modalX" aria-label="Close">✕</button>
    </div>

    <div class="modalBody" id="manageList"></div>

    <div class="modalActions">
      <button class="btn ghost" id="closeManageBtn" type="button">Close</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // animate open
  requestAnimationFrame(() => overlay.classList.add("isOpen"));

  const close = () => {
    overlay.classList.remove("isOpen");
    overlay.addEventListener("transitionend", () => overlay.remove(), {
      once: true,
    });
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  card.querySelector(".modalX").addEventListener("click", close);
  card.querySelector("#closeManageBtn").addEventListener("click", close);

  // render list
  const list = card.querySelector("#manageList");
  list.innerHTML = "";

  exercises.forEach((ex) => {
    const row = document.createElement("div");
    row.className = "manageRow";
    row.innerHTML = `
      <div class="manageName">${ex.name}</div>
      <div class="manageBtns">
        <button class="btn ghost smallBtn" type="button">Rename</button>
        <button class="btn ghost smallBtn danger" type="button">Delete</button>
      </div>
    `;

    const [renameBtn, deleteBtn] = row.querySelectorAll("button");

    renameBtn.addEventListener("click", async () => {
      const next = prompt("Rename exercise to:", ex.name);
      if (!next) return;

      try {
        await renameExercise(ex.id, next);
        await refreshLifts(); // reload exercises + entries
        close();
      } catch (e) {
        showBanner(`Rename failed: ${e.message}`);
      }
    });

    deleteBtn.addEventListener("click", async () => {
      const ok = confirm(
        `Delete "${ex.name}"?\nThis will also delete its lift history.`
      );
      if (!ok) return;

      try {
        await deleteExercise(ex.id);
        await refreshLifts();
        close();
      } catch (e) {
        showBanner(`Delete failed: ${e.message}`);
      }
    });

    list.appendChild(row);
  });
}

// ==========================
// LIFTS: UI helpers
// ==========================
function fillExerciseSelect(selectEl, list, placeholder = "Select exercise…") {
  const current = selectEl.value;

  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.disabled = true;
  opt0.selected = true;
  opt0.textContent = placeholder;
  selectEl.appendChild(opt0);

  for (const ex of list) {
    const opt = document.createElement("option");
    opt.value = String(ex.id);
    opt.textContent = ex.name;
    selectEl.appendChild(opt);
  }

  // restore if still exists
  if (current && list.some((e) => String(e.id) === String(current))) {
    selectEl.value = current;
  }
}

function getExerciseNameById(id) {
  const ex = exercises.find((e) => String(e.id) === String(id));
  return ex ? ex.name : "—";
}

// ==========================
// LIFTS: Chart + table
// ==========================
function computeLiftPoints(rows) {
  const sorted = [...rows].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date)
  );
  return sorted.map((r) => ({
    iso: r.entry_date,
    weight: Number(r.weight),
    reps: r.reps,
    sets: r.sets,
    notes: r.notes,
    id: r.id,
  }));
}

function liftYAxisDomain(points) {
  if (!points.length) return { min: 0, max: 1, step: 5 };

  const ys = points.map((p) => p.weight).filter(Number.isFinite);
  let rawMin = Math.min(...ys);
  let rawMax = Math.max(...ys);

  if (rawMin === rawMax) {
    rawMin -= 5;
    rawMax += 5;
  }

  const rawSpan = rawMax - rawMin;

  let step = 5;
  if (rawSpan < 10) step = 2.5;
  if (rawSpan < 5) step = 1;

  const pad = Math.max(rawSpan * 0.6, step * 0.6);

  return {
    min: rawMin - pad,
    max: rawMax + pad,
    step,
  };
}

function renderLiftChart() {
  const exId = liftViewExerciseSelect.value;
  const ctx = document.getElementById("liftChart");

  // no exercise selected
  if (!exId) {
    liftLastText.textContent = "—";
    if (liftChart) liftChart.destroy();
    liftChart = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false },
    });
    return;
  }

  const rows = liftEntries.filter(
    (r) => String(r.exercise_id) === String(exId)
  );
  const rowsTf = filterByTimeframe(rows, selectedLiftRange);
  const pts = computeLiftPoints(rowsTf);

  liftLastText.textContent = pts.length
    ? fmt2(pts[pts.length - 1].weight)
    : "—";

  if (!pts.length) {
    if (liftChart) liftChart.destroy();
    liftChart = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false },
    });
    return;
  }

  // continuous labels day-by-day
  const minISO = pts[0].iso;
  const maxISO = pts[pts.length - 1].iso;
  const minDate = parseISO(minISO);
  const maxDate = parseISO(maxISO);

  const labels = [];
  for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
    labels.push(d.toISOString().slice(0, 10));
  }

  const byDate = new Map(pts.map((p) => [p.iso, p]));
  const data = labels.map((iso) =>
    byDate.has(iso) ? byDate.get(iso).weight : null
  );

  const domain = liftYAxisDomain(pts);
  const isPhone = window.innerWidth < 480;

  if (liftChart) liftChart.destroy();

  liftChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Weight",
          data,
          tension: 0,
          spanGaps: true,
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
            for (let v = start; v <= end + 1e-9; v += step)
              ticks.push({ value: v });
            scale.ticks = ticks;
          },
          ticks: {
            callback: (v) =>
              Number(v) % 1 === 0 ? Number(v).toFixed(0) : Number(v).toFixed(1),
            color: "rgba(245,245,247,0.55)",
          },
          grid: { color: "rgba(255,255,255,0.04)", drawBorder: false },
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
          grid: { color: "rgba(255,255,255,0.04)", drawBorder: false },
        },
      },
    },
  });
}

function renderLiftEntriesTable() {
  const exId = liftTableExerciseSelect.value;
  liftEntriesBody.innerHTML = "";

  if (!exId) return;

  const rows = liftEntries
    .filter((r) => String(r.exercise_id) === String(exId))
    .slice()
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));

  for (const r of rows) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${formatDisplayDate(r.entry_date)}</td>
      <td class="mono">${fmt2(r.weight)}</td>
      <td class="mono">${r.reps ?? "—"}</td>
      <td class="mono">${r.sets ?? "—"}</td>
      <td style="text-align:right"></td>
    `;

    const tdAction = tr.lastElementChild;

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.className = "actionBtn";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this entry?")) return;
      await deleteLiftEntry(r.id);
      await refreshLifts();
    });
    tdAction.appendChild(del);

    tr.addEventListener("click", () => {
      // load into editor
      liftDateInput.value = r.entry_date;
      syncLiftEditorToSelectedDate();

      exerciseSelect.value = String(r.exercise_id);
      liftWeightInput.value = String(r.weight);
      liftRepsInput.value = r.reps ?? "";
      liftSetsInput.value = r.sets ?? "";
      liftNotesInput.value = r.notes ?? "";
    });

    liftEntriesBody.appendChild(tr);
  }
}

// ==========================
// LIFTS: refresh + events
// ==========================
async function refreshLifts() {
  exercises = await fetchExercises();
  liftEntries = await fetchLiftEntries();

  fillExerciseSelect(exerciseSelect, exercises);
  fillExerciseSelect(liftViewExerciseSelect, exercises);
  fillExerciseSelect(liftTableExerciseSelect, exercises);

  // If nothing selected yet, auto-pick first exercise for viewing/table (nice UX)
  if (!liftViewExerciseSelect.value && exercises.length) {
    liftViewExerciseSelect.value = String(exercises[0].id);
  }
  if (!liftTableExerciseSelect.value && exercises.length) {
    liftTableExerciseSelect.value = String(exercises[0].id);
  }

  renderLiftChart();
  renderLiftEntriesTable();
}

// ---- Add Exercise Modal wiring ----
const exerciseModal = document.getElementById("exerciseModal");
const exModalInput = document.getElementById("exModalInput");
const exModalClose = document.getElementById("exModalClose");
const exModalCancel = document.getElementById("exModalCancel");
const exModalSave = document.getElementById("exModalSave");

function openExerciseModal() {
  clearBanner();

  // make it exist in layout first
  exerciseModal.classList.remove("hidden");

  // next frame: trigger transition
  requestAnimationFrame(() => {
    exerciseModal.classList.add("isOpen");
    exerciseModal.setAttribute("aria-hidden", "false");
    exModalInput.value = "";
    exModalInput.focus();
  });
}

function closeExerciseModal() {
  exerciseModal.classList.remove("isOpen");
  exerciseModal.setAttribute("aria-hidden", "true");

  // wait for transition to finish, then fully hide
  const done = (e) => {
    if (e.target !== exerciseModal) return; // only once
    exerciseModal.removeEventListener("transitionend", done);
    exerciseModal.classList.add("hidden");
  };

  exerciseModal.addEventListener("transitionend", done);
}

addExerciseBtn.addEventListener("click", openExerciseModal);

exModalClose.addEventListener("click", closeExerciseModal);
exModalCancel.addEventListener("click", closeExerciseModal);

// click outside to close
exerciseModal.addEventListener("click", (e) => {
  if (e.target === exerciseModal) closeExerciseModal();
});

// Esc to close
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !exerciseModal.classList.contains("hidden")) {
    closeExerciseModal();
  }
});

// Enter to submit
exModalInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") exModalSave.click();
});

exModalSave.addEventListener("click", async () => {
  const name = exModalInput.value.trim();
  if (!name) return showBanner("Enter an exercise name.");

  try {
    exModalSave.disabled = true;
    await createExercise(name);
    await refreshLifts();

    const match = exercises.find(
      (e) => e.name.toLowerCase() === name.toLowerCase()
    );
    if (match) {
      exerciseSelect.value = String(match.id);
      liftViewExerciseSelect.value = String(match.id);
      liftTableExerciseSelect.value = String(match.id);
      renderLiftChart();
      renderLiftEntriesTable();
    }

    closeExerciseModal();
  } catch (e) {
    showBanner(`Add exercise failed: ${e.message}`);
  } finally {
    exModalSave.disabled = false;
  }
});

liftViewExerciseSelect.addEventListener("change", () => renderLiftChart());
liftTableExerciseSelect.addEventListener("change", () =>
  renderLiftEntriesTable()
);

liftSaveBtn.addEventListener("click", async () => {
  clearBanner();

  const entry_date = liftDateInput.value;
  const exId = exerciseSelect.value;

  const w = Number(liftWeightInput.value);
  const reps = liftRepsInput.value ? Number(liftRepsInput.value) : null;
  const sets = liftSetsInput.value ? Number(liftSetsInput.value) : null;
  const notes = liftNotesInput.value.trim();

  if (!entry_date) return showBanner("Pick a date.");
  if (!exId) return showBanner("Select an exercise.");
  if (!Number.isFinite(w) || w <= 0)
    return showBanner("Enter a valid lift weight.");
  if (reps !== null && (!Number.isInteger(reps) || reps <= 0))
    return showBanner("Reps must be a positive integer.");
  if (sets !== null && (!Number.isInteger(sets) || sets <= 0))
    return showBanner("Sets must be a positive integer.");

  try {
    liftSaveBtn.disabled = true;

    await upsertLiftEntry({
      entry_date,
      exercise_id: Number(exId),
      weight: w,
      reps,
      sets,
      notes: typeof notes === "string" ? notes.trim() : null,
    });

    // make view/table follow what you just saved
    liftViewExerciseSelect.value = String(exId);
    liftTableExerciseSelect.value = String(exId);

    await refreshLifts();
  } catch (e) {
    showBanner(`Save failed: ${e.message}`);
  } finally {
    liftSaveBtn.disabled = false;
  }
});

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

  if (selectedPage === "weight") {
    renderChart();
    renderEntries();
    renderWeekly();
    syncEditorToSelectedDate();
  }
}

async function bootstrapAuthed() {
  await setUIAuthed(true);
  dateInput.value = isoToday();
  syncEditorToSelectedDate();
  await refreshAll();

  liftDateInput.value = isoToday();
  syncLiftEditorToSelectedDate();
  await refreshLifts();

  // default page
  setActivePage("weight");
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
    if (app.classList.contains("hidden")) return;
    if (selectedPage === "weight") renderChart();
    else renderLiftChart();
  });
})();
