const SUPABASE_URL = "https://leksemdifenhfvfafcqa.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3NlbWRpZmVuaGZ2ZmFmY3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzk3MjIsImV4cCI6MjA4NDg1NTcyMn0.hpa7L5oqxgn2u2PIk4F0UfRTKWpB07MYOa7uyjPJE-Y";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("app.js loaded ✅");

// UI
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

const toggleWeight = document.getElementById("toggleWeight");
const toggleAvg7 = document.getElementById("toggleAvg7");

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

let weights = [];
let chart = null;

// helpers
const bannerText = document.getElementById("bannerText");
const bannerClose = document.getElementById("bannerClose");

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

function applyChartVisibility() {
  if (!chart) return;

  const showWeight = toggleWeight ? toggleWeight.checked : true;
  const showAvg7 = toggleAvg7 ? toggleAvg7.checked : true;

  // dataset 0 = Weight, dataset 1 = 7-day avg
  chart.setDatasetVisibility(0, showWeight);
  chart.setDatasetVisibility(1, showAvg7);

  // Optional UX message
  if (!showWeight && !showAvg7) {
    showBanner("Turn on Daily or 7-day avg to see the chart.");
  } else {
    clearBanner();
  }

  chart.update();
}

toggleWeight?.addEventListener("change", applyChartVisibility);
toggleAvg7?.addEventListener("change", applyChartVisibility);

function computePoints(rows) {
  const sorted = [...rows].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date)
  );
  const pts = [];
  const seen = [];
  for (const r of sorted) {
    const dt = parseISO(r.entry_date);
    seen.push(Number(r.weight));
    const last7 = seen.slice(-7);
    const avg7 = last7.reduce((s, v) => s + v, 0) / last7.length;
    pts.push({ date: dt, weight: Number(r.weight), avg7 });
  }
  return pts;
}

function yAxisDomain(points) {
  if (!points.length) return { min: 0, max: 1 };
  const ys = points.flatMap((p) => [p.weight, p.avg7]);
  let minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const range = Math.max(0.1, maxY - minY);
  const pad = Math.max(5.0, range * 0.1);
  minY = Math.floor(minY - pad);
  maxY = Math.ceil(maxY + pad);
  if (minY === maxY) {
    minY -= 5;
    maxY += 5;
  }
  return { min: minY, max: maxY };
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

// auth
async function setUIAuthed(isAuthed) {
  authCard.classList.toggle("hidden", isAuthed);
  app.classList.toggle("hidden", !isAuthed);
  logoutBtn.classList.toggle("hidden", !isAuthed);
}

let authMode = "login"; // "login" or "signup"

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

  // Button UX: disable while loading
  primaryAuthBtn.disabled = true;
  toggleAuthBtn.disabled = true;

  try {
    if (authMode === "signup") {
      const pw2 = pass2El.value;
      if (pw !== pw2) return showBanner("Passwords do not match.");

      const { error } = await sb.auth.signUp({ email, password: pw });
      if (error) throw error;

      // If email confirmations are ON, user may need to confirm.
      showBanner("Account created. Now log in (or confirm email if required).");
      setAuthMode("login");
      return;
    }

    // login
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

// data
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
  const { error } = await sb
    .from("weights")
    .upsert(payload, { onConflict: "user_id,entry_date" });
  if (error) throw error;
}

async function deleteWeight(entry_date) {
  const { error } = await sb
    .from("weights")
    .delete()
    .eq("entry_date", entry_date);
  if (error) throw error;
}

// UI behavior
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

// render
function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

function renderChart() {
  const points = computePoints(weights);
  const domain = yAxisDomain(points);

  avg7Text.textContent = points.length
    ? fmt2(points[points.length - 1].avg7)
    : "—";

  // If no data, render empty chart
  if (!points.length) {
    const ctx = document.getElementById("chart");
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false },
    });
    applyChartVisibility?.();
    return;
  }

  // 1) Build continuous daily labels from min -> max date
  const minDate = points[0].date;
  const maxDate = points[points.length - 1].date;

  const labels = [];
  for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
    labels.push(d.toISOString().slice(0, 10));
  }

  // 2) Map existing points by date
  const byDate = new Map(
    points.map((p) => [p.date.toISOString().slice(0, 10), p])
  );

  // 3) Build datasets aligned to ALL days (missing = null)
  const wData = labels.map((iso) =>
    byDate.has(iso) ? byDate.get(iso).weight : null
  );

  const aData = labels.map((iso) =>
    byDate.has(iso) ? byDate.get(iso).avg7 : null
  );

  const ctx = document.getElementById("chart");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Weight",
          data: wData,
          tension: 0,
          spanGaps: true, // 🔑 CONNECT ACROSS MISSING DAYS
        },
        {
          label: "7-day avg",
          data: aData,
          tension: 0,
          borderDash: [6, 4],
          spanGaps: true, // 🔑 CONNECT ACROSS MISSING DAYS
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: domain.min,
          max: domain.max,
        },
      },
    },
  });

  applyChartVisibility();
}

function renderEntries() {
  const sorted = [...weights].sort((a, b) =>
    b.entry_date.localeCompare(a.entry_date)
  );
  entriesBody.innerHTML = "";
  for (const r of sorted) {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = r.entry_date;
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
    tr.innerHTML = `<td>${w.weekStart}</td><td class="mono">${fmt2(
      w.avg
    )}</td><td>${w.count}</td>`;
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

// boot
(async function init() {
  setAuthMode("login");
  const { data } = await sb.auth.getSession();
  if (data.session) await bootstrapAuthed();
  else await setUIAuthed(false);

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session) await bootstrapAuthed();
    else await setUIAuthed(false);
  });
})();
