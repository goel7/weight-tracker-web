// 1) Paste your Supabase keys here:
const SUPABASE_URL = "https://leksemdifenhfvfafcqa.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3NlbWRpZmVuaGZ2ZmFmY3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNzk3MjIsImV4cCI6MjA4NDg1NTcyMn0.hpa7L5oqxgn2u2PIk4F0UfRTKWpB07MYOa7uyjPJE-Y";

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI
const authCard = document.getElementById("authCard");
const app = document.getElementById("app");
const banner = document.getElementById("banner");
const logoutBtn = document.getElementById("logoutBtn");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");

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
function showBanner(msg) {
  banner.textContent = msg;
  banner.classList.remove("hidden");
}
function clearBanner() {
  banner.textContent = "";
  banner.classList.add("hidden");
}

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

registerBtn.addEventListener("click", async () => {
  clearBanner();
  try {
    const { error } = await sb.auth.signUp({
      email: emailEl.value.trim(),
      password: passEl.value,
    });
    if (error) throw error;
    showBanner("Registered. Now login.");
  } catch (e) {
    showBanner(`Register failed: ${e.message}`);
  }
});

loginBtn.addEventListener("click", async () => {
  clearBanner();
  try {
    const { error } = await sb.auth.signInWithPassword({
      email: emailEl.value.trim(),
      password: passEl.value,
    });
    if (error) throw error;
    await bootstrapAuthed();
  } catch (e) {
    showBanner(`Login failed: ${e.message}`);
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
function renderChart() {
  const points = computePoints(weights);
  const domain = yAxisDomain(points);

  avg7Text.textContent = points.length
    ? fmt2(points[points.length - 1].avg7)
    : "—";

  const labels = points.map((p) => p.date.toISOString().slice(0, 10));
  const wData = points.map((p) => p.weight);
  const aData = points.map((p) => p.avg7);

  const ctx = document.getElementById("chart");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Weight", data: wData, tension: 0 },
        { label: "7-day avg", data: aData, tension: 0, borderDash: [6, 4] },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { min: domain.min, max: domain.max } },
    },
  });
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
  const { data } = await sb.auth.getSession();
  if (data.session) await bootstrapAuthed();
  else await setUIAuthed(false);

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session) await bootstrapAuthed();
    else await setUIAuthed(false);
  });
})();
