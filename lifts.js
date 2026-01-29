// =====================================================
// LIFT TRACKING
// =====================================================

import { sb } from "./supabase.js";
import {
  isoToday,
  parseISO,
  fmt2,
  filterByTimeframe,
  formatTickLabel,
  formatDisplayDate,
  computeLiftPoints,
  liftYAxisDomain,
} from "./utils.js";

// UI Elements
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
  "liftViewExerciseSelect",
);
const liftTableExerciseSelect = document.getElementById(
  "liftTableExerciseSelect",
);
const liftEntriesBody = document.getElementById("liftEntriesBody");
const liftLastText = document.getElementById("liftLastText");
const liftRangeButtons = Array.from(
  document.querySelectorAll("#liftsPage .liftRangeBtn"),
);
const manageExercisesBtn = document.getElementById("manageExercisesBtn");

// Modal elements
const exerciseModal = document.getElementById("exerciseModal");
const exModalInput = document.getElementById("exModalInput");
const exModalClose = document.getElementById("exModalClose");
const exModalCancel = document.getElementById("exModalCancel");
const exModalSave = document.getElementById("exModalSave");

// State
let exercises = [];
let liftEntries = [];
let liftChart = null;
let selectedLiftRange = "90d";

// Data operations
export async function fetchExercises() {
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

// UI helpers
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

  if (current && list.some((e) => String(e.id) === String(current))) {
    selectEl.value = current;
  }
}

function getExerciseNameById(id) {
  const ex = exercises.find((e) => String(e.id) === String(id));
  return ex ? ex.name : "—";
}

// Chart rendering
function renderLiftChart() {
  const exId = liftViewExerciseSelect.value;
  const ctx = document.getElementById("liftChart");

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
    (r) => String(r.exercise_id) === String(exId),
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
    byDate.has(iso) ? byDate.get(iso).weight : null,
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

// Modal management
function openExerciseModal(showBanner, clearBanner) {
  clearBanner();
  exerciseModal.classList.remove("hidden");
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

  const done = (e) => {
    if (e.target !== exerciseModal) return;
    exerciseModal.removeEventListener("transitionend", done);
    exerciseModal.classList.add("hidden");
  };

  exerciseModal.addEventListener("transitionend", done);
}

function openManageExercisesModal(showBanner) {
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
        await refreshLifts();
        close();
      } catch (e) {
        showBanner(`Rename failed: ${e.message}`);
      }
    });

    deleteBtn.addEventListener("click", async () => {
      const ok = confirm(
        `Delete "${ex.name}"?\nThis will also delete its lift history.`,
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

// UI sync
function syncLiftEditorToSelectedDate() {
  const d = liftDateInput.value;
  liftSelectedDateText.textContent = d || "";
}

function setActiveLiftRange(range) {
  selectedLiftRange = range;

  liftRangeButtons.forEach((btn) => {
    const on = btn.dataset.range === range;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  renderLiftChart();
}

export async function refreshLifts() {
  exercises = await fetchExercises();
  liftEntries = await fetchLiftEntries();

  fillExerciseSelect(exerciseSelect, exercises);
  fillExerciseSelect(liftViewExerciseSelect, exercises);
  fillExerciseSelect(liftTableExerciseSelect, exercises);

  if (!liftViewExerciseSelect.value && exercises.length) {
    liftViewExerciseSelect.value = String(exercises[0].id);
  }
  if (!liftTableExerciseSelect.value && exercises.length) {
    liftTableExerciseSelect.value = String(exercises[0].id);
  }

  renderLiftChart();
  renderLiftEntriesTable();
}

export function initLiftListeners(showBanner, clearBanner) {
  liftDateInput.addEventListener("change", syncLiftEditorToSelectedDate);

  liftRangeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveLiftRange(btn.dataset.range));
  });

  addExerciseBtn.addEventListener("click", () =>
    openExerciseModal(showBanner, clearBanner),
  );

  exModalClose.addEventListener("click", closeExerciseModal);
  exModalCancel.addEventListener("click", closeExerciseModal);

  exerciseModal.addEventListener("click", (e) => {
    if (e.target === exerciseModal) closeExerciseModal();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !exerciseModal.classList.contains("hidden")) {
      closeExerciseModal();
    }
  });

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
        (e) => e.name.toLowerCase() === name.toLowerCase(),
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
    renderLiftEntriesTable(),
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

      liftViewExerciseSelect.value = String(exId);
      liftTableExerciseSelect.value = String(exId);

      await refreshLifts();
    } catch (e) {
      showBanner(`Save failed: ${e.message}`);
    } finally {
      liftSaveBtn.disabled = false;
    }
  });

  manageExercisesBtn.addEventListener("click", () => {
    openManageExercisesModal(showBanner);
  });
}

export function initLiftUI() {
  liftDateInput.value = isoToday();
  syncLiftEditorToSelectedDate();
}

export function resizeLiftChart() {
  if (liftChart) liftChart.resize();
}
