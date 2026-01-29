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
  uiConfirm,
  uiPrompt,
  getWeightUnit,
  convertWeight,
  getWeightLabel,
} from "./utils.js";

// UI Elements
const liftDateInput = document.getElementById("liftDateInput");
const liftSelectedDateText = document.getElementById("liftSelectedDateText");
const exerciseSelect = document.getElementById("exerciseSelect");
const exerciseCategoryFilter = document.getElementById(
  "exerciseCategoryFilter",
);
const categoryPillRow = document.getElementById("categoryPillRow");
const addExerciseBtn = document.getElementById("addExerciseBtn");
const liftWeightInput = document.getElementById("liftWeightInput");
const liftWeightInputLabel = document.getElementById("liftWeightInputLabel");
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
const exModalCategoryInput = document.getElementById("exModalCategoryInput");
const categoryDropdown = document.getElementById("categoryDropdown");
const exModalClose = document.getElementById("exModalClose");
const exModalCancel = document.getElementById("exModalCancel");
const exModalSave = document.getElementById("exModalSave");

// State
let exercises = [];
let liftEntries = [];
let liftChart = null;
let selectedLiftRange = "90d";
let showBannerFn = null;
let clearBannerFn = null;
let activeNotesPopover = null;
let activeNotesButton = null;
let categories = [];

// Update labels based on unit preference
export function updateLiftLabels() {
  const unit = getWeightUnit();
  if (liftWeightInputLabel) {
    liftWeightInputLabel.textContent = getWeightLabel();
  }
  if (liftWeightInput) {
    liftWeightInput.placeholder = unit === "kg" ? "60" : "135";
  }
}

function normalizeCategory(name) {
  return String(name || "").trim();
}

function getFilteredExercises() {
  const cat = exerciseCategoryFilter?.value || "all";

  return exercises.filter((ex) => {
    const catMatch = cat === "all" || String(ex.category_id || "") === cat;
    return catMatch;
  });
}

function updateCategoryFilterOptions() {
  if (!exerciseCategoryFilter) return;
  const current = exerciseCategoryFilter.value || "all";

  exerciseCategoryFilter.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All categories";
  exerciseCategoryFilter.appendChild(allOpt);

  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = String(cat.id);
    opt.textContent = cat.name;
    exerciseCategoryFilter.appendChild(opt);
  });

  exerciseCategoryFilter.value =
    current === "all" || categories.some((c) => String(c.id) === current)
      ? current
      : "all";

  renderCategoryPills();
}

function renderCategoryPills() {
  if (!categoryPillRow || !exerciseCategoryFilter) return;
  const current = exerciseCategoryFilter.value || "all";

  categoryPillRow.innerHTML = "";

  const pills = [
    { id: "all", name: "All" },
    ...categories.map((cat) => ({ id: String(cat.id), name: cat.name })),
  ];

  pills.forEach((pill, idx) => {
    if (idx > 0) {
      const sep = document.createElement("span");
      sep.className = "categoryRangeSep";
      categoryPillRow.appendChild(sep);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `categoryRangeBtn${current === pill.id ? " active" : ""}`;
    btn.textContent = pill.name;
    btn.addEventListener("click", () => {
      exerciseCategoryFilter.value = pill.id;
      applyExerciseFilters();
      renderCategoryPills();
    });
    categoryPillRow.appendChild(btn);
  });

  // Check if content overflows and adjust centering accordingly
  requestAnimationFrame(() => {
    const scrollWidth = categoryPillRow.scrollWidth;
    const clientWidth = categoryPillRow.clientWidth;

    if (scrollWidth <= clientWidth) {
      // Content fits, center it
      categoryPillRow.style.justifyContent = "center";
    } else {
      // Content overflows, align left
      categoryPillRow.style.justifyContent = "flex-start";
      categoryPillRow.scrollLeft = 0;
    }
  });
}

function updateCategoryDropdown() {
  if (!categoryDropdown) return;
  categoryDropdown.innerHTML = "";

  const inputValue = exModalCategoryInput.value.trim().toLowerCase();
  const filtered = categories.filter((cat) =>
    cat.name.toLowerCase().includes(inputValue),
  );

  if (filtered.length === 0) {
    categoryDropdown.classList.add("hidden");
    return;
  }

  filtered.forEach((cat) => {
    const opt = document.createElement("div");
    opt.className = "categoryOption";
    opt.textContent = cat.name;
    opt.addEventListener("click", () => {
      exModalCategoryInput.value = cat.name;
      categoryDropdown.classList.add("hidden");
    });
    categoryDropdown.appendChild(opt);
  });
}

function applyExerciseFilters() {
  const list = getFilteredExercises();
  fillExerciseSelect(exerciseSelect, list);
  fillExerciseSelect(liftViewExerciseSelect, list);
  fillExerciseSelect(liftTableExerciseSelect, list);
}

async function ensureCategoryId(name) {
  const clean = normalizeCategory(name);
  if (!clean) return null;

  const existing = categories.find(
    (c) => c.name.toLowerCase() === clean.toLowerCase(),
  );
  if (existing) return existing.id;

  const created = await createCategory(clean);
  if (created) {
    categories = [...categories, created].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    updateCategoryFilterOptions();
    updateCategoryDropdown();
  }
  return created?.id ?? null;
}

// Empty state helpers
function showLiftEmptyState(canvas, title, subtitle) {
  const chartWrap = canvas.parentElement;
  let empty = chartWrap.querySelector(".emptyState");

  if (!empty) {
    empty = document.createElement("div");
    empty.className = "emptyState";
    chartWrap.appendChild(empty);
  }

  empty.innerHTML = `
    <div class="emptyIcon">💪</div>
    <div class="emptyTitle">${title}</div>
    <div class="emptySubtitle">${subtitle}</div>
  `;
}

function clearLiftEmptyState(canvas) {
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
function showLiftChartLoading() {
  const liftChart = document.getElementById("liftChart");
  const chartWrap = liftChart.parentElement;
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

function hideLiftChartLoading() {
  const liftChart = document.getElementById("liftChart");
  const chartWrap = liftChart.parentElement;
  const loading = chartWrap.querySelector(".loadingState");
  if (loading) loading.remove();
}

// Data operations
export async function fetchExercises() {
  const { data, error } = await sb
    .from("exercises")
    .select("id, name, category_id, exercise_categories(name)")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    category: row.exercise_categories?.name || "",
  }));
}

async function createExercise(name, categoryId = null) {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not logged in");

  const clean = name.trim();
  if (!clean) throw new Error("Exercise name required");

  const { error } = await sb.from("exercises").insert({
    user_id: user.id,
    name: clean,
    category_id: categoryId,
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

async function fetchCategories() {
  const { data, error } = await sb
    .from("exercise_categories")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function createCategory(name) {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not logged in");

  const clean = normalizeCategory(name);
  if (!clean) throw new Error("Category name required");

  const { data, error } = await sb
    .from("exercise_categories")
    .upsert(
      {
        user_id: user.id,
        name: clean,
      },
      { onConflict: "user_id,name" },
    )
    .select("id, name")
    .single();

  if (
    error &&
    String(error.message || "")
      .toLowerCase()
      .includes("duplicate")
  ) {
    const { data: existing, error: existingError } = await sb
      .from("exercise_categories")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("name", clean)
      .single();
    if (existingError) throw existingError;
    return existing;
  }
  if (error) throw error;
  return data;
}

async function renameCategory(categoryId, newName) {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not logged in");

  const clean = normalizeCategory(newName);
  if (!clean) throw new Error("Category name required");

  const { error } = await sb
    .from("exercise_categories")
    .update({ name: clean })
    .eq("id", categoryId)
    .eq("user_id", user.id);

  if (error) throw error;
}

async function deleteCategory(categoryId) {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not logged in");

  const { error } = await sb
    .from("exercise_categories")
    .delete()
    .eq("id", categoryId)
    .eq("user_id", user.id);

  if (error) throw error;
}

async function updateExerciseCategory(exerciseId, categoryId) {
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not logged in");

  const { error } = await sb
    .from("exercises")
    .update({ category_id: categoryId || null })
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
    opt.textContent = ex.category ? `${ex.name} • ${ex.category}` : ex.name;
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
  const displayUnit = getWeightUnit();

  if (!exId) {
    liftLastText.textContent = "—";
    if (liftChart) liftChart.destroy();
    liftChart = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false },
    });
    showLiftEmptyState(
      ctx,
      "Select an exercise",
      "Choose an exercise above to see your progress!",
    );
    return;
  }

  const rows = liftEntries.filter(
    (r) => String(r.exercise_id) === String(exId),
  );

  // Convert weights to display unit
  const convertedRows = rows.map((row) => ({
    ...row,
    weight: convertWeight(row.weight, "lbs", displayUnit),
  }));

  const rowsTf = filterByTimeframe(convertedRows, selectedLiftRange);
  const pts = computeLiftPoints(rowsTf);

  liftLastText.textContent = pts.length
    ? fmt2(pts[pts.length - 1].weight) + ` ${displayUnit}`
    : "—";

  if (!pts.length) {
    if (liftChart) liftChart.destroy();
    liftChart = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false },
    });
    showLiftEmptyState(
      ctx,
      "No entries yet",
      "Log your first lift above to track progress!",
    );
    return;
  }

  clearLiftEmptyState(ctx);

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
  const displayUnit = getWeightUnit();

  if (!exId) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="emptyTableMessage">Select an exercise to view entries</td>`;
    liftEntriesBody.appendChild(tr);
    return;
  }

  const rows = liftEntries
    .filter((r) => String(r.exercise_id) === String(exId))
    .slice()
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="emptyTableMessage">No entries yet for this exercise. Start logging above!</td>`;
    liftEntriesBody.appendChild(tr);
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = formatDisplayDate(r.entry_date);

    const tdWeight = document.createElement("td");
    const displayWeight = convertWeight(r.weight, "lbs", displayUnit);
    tdWeight.textContent = fmt2(displayWeight) + ` ${displayUnit}`;
    tdWeight.className = "mono";

    const tdReps = document.createElement("td");
    tdReps.textContent = r.reps ?? "—";
    tdReps.className = "mono";

    const tdSets = document.createElement("td");
    tdSets.textContent = r.sets ?? "—";
    tdSets.className = "mono";

    const tdNotes = document.createElement("td");
    const notesText = typeof r.notes === "string" ? r.notes.trim() : "";
    tdNotes.className = "noteCell";

    if (!notesText) {
      tdNotes.textContent = "—";
    } else {
      const notesBtn = document.createElement("button");
      notesBtn.type = "button";
      notesBtn.className = "noteBtn";
      notesBtn.innerHTML = "📝 View";

      const popover = document.createElement("div");
      popover.className = "notePopover hidden";
      popover.textContent = notesText;

      notesBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        if (activeNotesPopover && activeNotesPopover !== popover) {
          activeNotesPopover.classList.add("hidden");
          if (activeNotesButton) activeNotesButton.classList.remove("isOpen");
        }

        const isOpen = !popover.classList.contains("hidden");
        popover.classList.toggle("hidden", isOpen);
        notesBtn.classList.toggle("isOpen", !isOpen);

        activeNotesPopover = popover.classList.contains("hidden")
          ? null
          : popover;
        activeNotesButton = popover.classList.contains("hidden")
          ? null
          : notesBtn;
      });

      tdNotes.appendChild(notesBtn);
      tdNotes.appendChild(popover);
    }

    const tdAction = document.createElement("td");
    tdAction.style.textAlign = "right";

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.className = "actionBtn";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await uiConfirm({
        title: "Delete entry",
        message: "Delete this entry?",
        confirmText: "Delete",
        danger: true,
      });
      if (!ok) return;

      try {
        showLoading(del, "Deleting...");
        await deleteLiftEntry(r.id);
        await refreshLifts(showBannerFn, clearBannerFn);
        if (showBannerFn)
          showBannerFn("Entry deleted successfully!", "success");
      } catch (e) {
        if (showBannerFn) showBannerFn(`Delete failed: ${e.message}`, "error");
        hideLoading(del);
      }
    });
    tdAction.appendChild(del);

    tr.appendChild(tdDate);
    tr.appendChild(tdWeight);
    tr.appendChild(tdReps);
    tr.appendChild(tdSets);
    tr.appendChild(tdNotes);
    tr.appendChild(tdAction);

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
    exModalCategoryInput.value = "";
    categoryDropdown.classList.add("hidden");
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
  card.className = "modalCard modalCard--wide";
  card.innerHTML = `
    <div class="modalTop">
      <div>
        <div class="modalTitle">Manage exercises</div>
        <div class="modalSub muted">Organize exercises by category.</div>
      </div>
      <button class="modalX" aria-label="Close">✕</button>
    </div>

    <div class="modalBody">
      <div class="modalSection">
        <div class="modalTop" style="margin-bottom: 12px;">
          <div class="modalTitle">Categories</div>
          <button class="btn ghost smallBtn" id="addCategoryBtnCompact" type="button" style="margin-left: auto;">+ Add</button>
        </div>
        <div class="modalSub muted">Create, rename, or delete categories.</div>
        <div id="categoryInputContainer" class="hidden" style="margin: 10px 0; display: flex; gap: 8px;">
          <input
            id="newCategoryInput"
            type="text"
            placeholder="Category name..."
            autocomplete="off"
            style="flex: 1;"
          />
          <button class="btn ghost smallBtn" id="addCategoryConfirmBtn" type="button">
            ✓
          </button>
          <button class="btn ghost smallBtn" id="addCategoryCancelBtn" type="button">
            ✕
          </button>
        </div>
        <div id="categoryList" class="categoryList"></div>
      </div>

      <div class="modalSection">
        <div class="modalTop" style="margin-bottom: 12px;">
          <div class="modalTitle">Exercises</div>
          <button class="btn ghost smallBtn" id="addExerciseBtnCompact" type="button" style="margin-left: auto;">+ Add</button>
        </div>
        <div class="modalSub muted">Create, rename, delete, or assign categories.</div>
        <div id="exerciseInputContainer" class="hidden" style="margin: 10px 0; display: flex; gap: 8px;">
          <input
            id="newExerciseInput"
            type="text"
            placeholder="Exercise name..."
            autocomplete="off"
            style="flex: 1;"
          />
          <button class="btn ghost smallBtn" id="addExerciseConfirmBtn" type="button">
            ✓
          </button>
          <button class="btn ghost smallBtn" id="addExerciseCancelBtn" type="button">
            ✕
          </button>
        </div>
        <div id="manageList"></div>
      </div>
    </div>

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
  const categoryList = card.querySelector("#categoryList");
  const newCategoryInput = card.querySelector("#newCategoryInput");
  const addCategoryBtn = card.querySelector("#addCategoryBtn");
  const newExerciseInput = card.querySelector("#newExerciseInput");
  const addExerciseBtn = card.querySelector("#addExerciseBtn");

  // Exercise options modal
  function openExerciseOptionsModal(
    ex,
    showBanner,
    clearBanner,
    closeManageModal,
    renderCategoryListFn,
    renderExerciseListFn,
  ) {
    const overlay = document.createElement("div");
    overlay.className = "modalOverlay";

    const optionsCard = document.createElement("div");
    optionsCard.className = "modalCard";
    optionsCard.innerHTML = `
      <div class="modalTop">
        <div>
          <div class="modalTitle">${ex.name}</div>
          <div class="modalSub muted">Manage this exercise.</div>
        </div>
        <button class="modalX" aria-label="Close">✕</button>
      </div>

      <div class="modalBody">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label style="margin-bottom: 0;">Rename</label>
          <input
            id="renameExInput"
            type="text"
            autocomplete="off"
            value="${ex.name}"
          />
        </div>
      </div>

      <div class="modalActions">
        <button class="btn ghost" id="deleteExBtn" type="button" style="padding: 8px 10px; font-size: 12px;">
          Delete
        </button>
        <button class="btn primary" id="renameExSave" type="button">Save</button>
      </div>
    `;

    overlay.appendChild(optionsCard);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add("isOpen"));

    const closeOptions = () => {
      overlay.classList.remove("isOpen");
      overlay.addEventListener("transitionend", () => overlay.remove(), {
        once: true,
      });
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeOptions();
    });
    optionsCard
      .querySelector(".modalX")
      .addEventListener("click", closeOptions);

    const renameInput = optionsCard.querySelector("#renameExInput");
    const renameSave = optionsCard.querySelector("#renameExSave");
    requestAnimationFrame(() => renameInput.focus());

    renameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") renameSave.click();
    });

    renameSave.addEventListener("click", async () => {
      const next = renameInput.value.trim();
      if (!next) {
        renameInput.classList.add("invalid");
        return;
      }

      try {
        await renameExercise(ex.id, next);
        await refreshLifts(showBanner, clearBanner);
        closeOptions();
        closeManageModal();
        if (showBanner) showBanner("Exercise renamed successfully!", "success");
      } catch (e) {
        if (showBanner) showBanner(`Rename failed: ${e.message}`, "error");
      }
    });

    optionsCard
      .querySelector("#deleteExBtn")
      .addEventListener("click", async () => {
        const ok = await uiConfirm({
          title: "Delete exercise",
          message: `Delete "${ex.name}"? This will also delete its lift history.`,
          confirmText: "Delete",
          danger: true,
        });
        if (!ok) return;

        try {
          await deleteExercise(ex.id);
          await refreshLifts(showBanner, clearBanner);
          closeOptions();
          closeManageModal();
          if (showBanner)
            showBanner("Exercise deleted successfully!", "success");
        } catch (e) {
          if (showBanner) showBanner(`Delete failed: ${e.message}`, "error");
        }
      });
  }

  const renderCategoryList = () => {
    categoryList.innerHTML = "";

    if (!categories.length) {
      const empty = document.createElement("div");
      empty.className = "muted small";
      empty.textContent = "No categories yet.";
      categoryList.appendChild(empty);
      return;
    }

    categories.forEach((cat) => {
      const row = document.createElement("div");
      row.className = "categoryRow";
      row.innerHTML = `
        <div class="categoryName">${cat.name}</div>
        <div class="categoryActions">
          <button class="btn ghost smallBtn" type="button">Rename</button>
          <button class="btn ghost smallBtn danger" type="button">Delete</button>
        </div>
      `;

      const [renameBtn, deleteBtn] = row.querySelectorAll("button");

      renameBtn.addEventListener("click", async () => {
        const next = await uiPrompt({
          title: "Rename category",
          message: "Choose a new category name.",
          defaultValue: cat.name,
          confirmText: "Rename",
        });
        const clean = normalizeCategory(next);
        if (!clean) return;
        renameCategory(cat.id, clean)
          .then(() => refreshLifts(showBannerFn, clearBannerFn))
          .then(() => {
            renderCategoryList();
            renderExerciseList();
          })
          .catch((e) => {
            if (showBannerFn)
              showBannerFn(`Rename failed: ${e.message}`, "error");
          });
      });

      deleteBtn.addEventListener("click", async () => {
        const ok = await uiConfirm({
          title: "Delete category",
          message: `Delete category "${cat.name}"?`,
          confirmText: "Delete",
          danger: true,
        });
        if (!ok) return;

        deleteCategory(cat.id)
          .then(() => refreshLifts(showBannerFn, clearBannerFn))
          .then(() => {
            renderCategoryList();
            renderExerciseList();
          })
          .catch((e) => {
            if (showBannerFn)
              showBannerFn(`Delete failed: ${e.message}`, "error");
          });
      });

      categoryList.appendChild(row);
    });
  };

  const renderExerciseList = () => {
    list.innerHTML = "";

    exercises.forEach((ex) => {
      const row = document.createElement("div");
      row.className = "manageRow";
      row.innerHTML = `
        <div class="manageName">${ex.name}</div>
        <div class="manageBtns"></div>
      `;

      const btnWrap = row.querySelector(".manageBtns");
      const categorySelect = document.createElement("select");
      categorySelect.className = "select compactSelect categoryAssign";

      const noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "Uncategorized";
      categorySelect.appendChild(noneOpt);

      categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = String(cat.id);
        opt.textContent = cat.name;
        categorySelect.appendChild(opt);
      });

      categorySelect.value = ex.category_id ? String(ex.category_id) : "";

      categorySelect.addEventListener("change", async () => {
        try {
          await updateExerciseCategory(ex.id, categorySelect.value || null);
          await refreshLifts(showBannerFn, clearBannerFn);
          renderCategoryList();
          renderExerciseList();
        } catch (e) {
          if (showBannerFn)
            showBannerFn(`Update failed: ${e.message}`, "error");
        }
      });

      // Settings button that opens exercise options modal
      const settingsBtn = document.createElement("button");
      settingsBtn.className = "iconBtn";
      settingsBtn.type = "button";
      settingsBtn.innerHTML = "⚙️";
      settingsBtn.style.fontSize = "18px";
      settingsBtn.addEventListener("click", () => {
        openExerciseOptionsModal(
          ex,
          showBannerFn,
          clearBannerFn,
          close,
          renderCategoryList,
          renderExerciseList,
        );
      });

      btnWrap.appendChild(categorySelect);
      btnWrap.appendChild(settingsBtn);
      list.appendChild(row);
    });
  };

  const addCategoryBtnCompact = card.querySelector("#addCategoryBtnCompact");
  const categoryInputContainer = card.querySelector("#categoryInputContainer");
  const addCategoryConfirmBtn = card.querySelector("#addCategoryConfirmBtn");
  const addCategoryCancelBtn = card.querySelector("#addCategoryCancelBtn");

  const addExerciseBtnCompact = card.querySelector("#addExerciseBtnCompact");
  const exerciseInputContainer = card.querySelector("#exerciseInputContainer");
  const addExerciseConfirmBtn = card.querySelector("#addExerciseConfirmBtn");
  const addExerciseCancelBtn = card.querySelector("#addExerciseCancelBtn");

  // Category add toggle
  addCategoryBtnCompact.addEventListener("click", () => {
    categoryInputContainer.classList.toggle("hidden");
    if (!categoryInputContainer.classList.contains("hidden")) {
      newCategoryInput.focus();
    }
  });

  addCategoryConfirmBtn.addEventListener("click", () => {
    const next = normalizeCategory(newCategoryInput.value);
    if (!next) return;

    createCategory(next)
      .then(() => refreshLifts(showBannerFn, clearBannerFn))
      .then(() => {
        newCategoryInput.value = "";
        categoryInputContainer.classList.add("hidden");
        renderCategoryList();
        renderExerciseList();
      })
      .catch((e) => {
        if (showBannerFn) showBannerFn(`Add failed: ${e.message}`, "error");
      });
  });

  addCategoryCancelBtn.addEventListener("click", () => {
    newCategoryInput.value = "";
    categoryInputContainer.classList.add("hidden");
  });

  newCategoryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addCategoryConfirmBtn.click();
    if (e.key === "Escape") addCategoryCancelBtn.click();
  });

  // Exercise add toggle
  addExerciseBtnCompact.addEventListener("click", () => {
    openExerciseModal(showBannerFn, clearBannerFn);
  });

  addExerciseConfirmBtn.addEventListener("click", () => {
    const name = newExerciseInput.value.trim();
    if (!name) return;

    createExercise(name, null)
      .then(() => refreshLifts(showBannerFn, clearBannerFn))
      .then(() => {
        newExerciseInput.value = "";
        exerciseInputContainer.classList.add("hidden");
        renderExerciseList();
        if (showBannerFn) showBannerFn("Exercise added!", "success");
      })
      .catch((e) => {
        if (showBannerFn) showBannerFn(`Add failed: ${e.message}`, "error");
      });
  });

  addExerciseCancelBtn.addEventListener("click", () => {
    newExerciseInput.value = "";
    exerciseInputContainer.classList.add("hidden");
  });

  newExerciseInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addExerciseConfirmBtn.click();
    if (e.key === "Escape") addExerciseCancelBtn.click();
  });

  renderCategoryList();
  renderExerciseList();
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

export async function refreshLifts(showBanner, clearBanner) {
  try {
    showLiftChartLoading();
    categories = await fetchCategories();
    exercises = await fetchExercises();
    liftEntries = await fetchLiftEntries();

    updateCategoryFilterOptions();
    updateCategoryDropdown();
    applyExerciseFilters();

    const filtered = getFilteredExercises();
    if (!liftViewExerciseSelect.value && filtered.length) {
      liftViewExerciseSelect.value = String(filtered[0].id);
    }
    if (!liftTableExerciseSelect.value && filtered.length) {
      liftTableExerciseSelect.value = String(filtered[0].id);
    }

    renderLiftChart();
    renderLiftEntriesTable();
    hideLiftChartLoading();
  } catch (e) {
    hideLiftChartLoading();
    showBanner(`Failed to load data: ${e.message}`, "error");
  }
}

export function initLiftListeners(showBanner, clearBanner) {
  // Store banner functions for use in other handlers
  showBannerFn = showBanner;
  clearBannerFn = clearBanner;

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
    if (e.key === "Escape" && activeNotesPopover) {
      activeNotesPopover.classList.add("hidden");
      if (activeNotesButton) activeNotesButton.classList.remove("isOpen");
      activeNotesPopover = null;
      activeNotesButton = null;
    }
  });

  document.addEventListener("click", (e) => {
    if (activeNotesPopover && !activeNotesPopover.contains(e.target)) {
      activeNotesPopover.classList.add("hidden");
      if (activeNotesButton) activeNotesButton.classList.remove("isOpen");
      activeNotesPopover = null;
      activeNotesButton = null;
    }
  });

  exModalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") exModalSave.click();
  });

  exModalSave.addEventListener("click", async () => {
    const name = exModalInput.value.trim();
    const category = normalizeCategory(exModalCategoryInput.value);
    if (!name) {
      exModalInput.classList.add("invalid");
      return showBanner("Enter an exercise name.", "error");
    }

    try {
      showLoading(exModalSave, "Adding...");
      const categoryId = await ensureCategoryId(category);
      await createExercise(name, categoryId);
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
      showBanner("Exercise added successfully!", "success");
      exModalInput.classList.remove("invalid");
    } catch (e) {
      showBanner(`Add exercise failed: ${e.message}`, "error");
    } finally {
      hideLoading(exModalSave);
    }
  });

  if (exerciseCategoryFilter) {
    exerciseCategoryFilter.addEventListener("change", () => {
      applyExerciseFilters();
      renderCategoryPills();
    });
  }

  liftViewExerciseSelect.addEventListener("change", () => renderLiftChart());
  liftTableExerciseSelect.addEventListener("change", () =>
    renderLiftEntriesTable(),
  );

  liftSaveBtn.addEventListener("click", async () => {
    clearBanner();

    const entry_date = liftDateInput.value;
    const exId = exerciseSelect.value;

    const inputWeight = Number(liftWeightInput.value);
    const displayUnit = getWeightUnit();

    // Convert from display unit to lbs for storage
    const weightInLbs = convertWeight(inputWeight, displayUnit, "lbs");

    const reps = liftRepsInput.value ? Number(liftRepsInput.value) : null;
    const sets = liftSetsInput.value ? Number(liftSetsInput.value) : null;
    const notes = liftNotesInput.value.trim();

    // Validation limits adjusted for unit
    const maxWeight = displayUnit === "kg" ? 2268 : 5000; // ~5000 lbs = 2268 kg

    // Validation with visual feedback
    if (!entry_date) {
      liftDateInput.classList.add("invalid");
      return showBanner("Pick a date.", "error");
    }
    if (!exId) {
      exerciseSelect.classList.add("invalid");
      return showBanner("Select an exercise.", "error");
    }
    if (
      !liftWeightInput.value ||
      !Number.isFinite(inputWeight) ||
      inputWeight <= 0 ||
      inputWeight > maxWeight
    ) {
      liftWeightInput.classList.add("invalid");
      return showBanner(
        `Enter a valid lift weight (1-${maxWeight} ${displayUnit}).`,
        "error",
      );
    }
    if (
      reps !== null &&
      (!Number.isInteger(reps) || reps <= 0 || reps > 1000)
    ) {
      liftRepsInput.classList.add("invalid");
      return showBanner("Reps must be a positive integer (1-1000).", "error");
    }
    if (sets !== null && (!Number.isInteger(sets) || sets <= 0 || sets > 100)) {
      liftSetsInput.classList.add("invalid");
      return showBanner("Sets must be a positive integer (1-100).", "error");
    }

    try {
      showLoading(liftSaveBtn, "Saving...");

      await upsertLiftEntry({
        entry_date,
        exercise_id: Number(exId),
        weight: weightInLbs,
        reps,
        sets,
        notes: typeof notes === "string" ? notes.trim() : null,
      });

      liftViewExerciseSelect.value = String(exId);
      liftTableExerciseSelect.value = String(exId);

      await refreshLifts();
      showBanner("Lift saved successfully!", "success");

      // Clear validation states
      liftDateInput.classList.remove("invalid");
      exerciseSelect.classList.remove("invalid");
      liftWeightInput.classList.remove("invalid");
      liftRepsInput.classList.remove("invalid");
      liftSetsInput.classList.remove("invalid");
    } catch (e) {
      showBanner(`Save failed: ${e.message}`, "error");
    } finally {
      hideLoading(liftSaveBtn);
    }
  });

  // Category dropdown handlers
  exModalCategoryInput.addEventListener("input", () => {
    updateCategoryDropdown();
    if (exModalCategoryInput.value.trim()) {
      categoryDropdown.classList.remove("hidden");
    } else {
      categoryDropdown.classList.add("hidden");
    }
  });

  exModalCategoryInput.addEventListener("focus", () => {
    if (categories.length > 0 && exModalCategoryInput.value.trim()) {
      updateCategoryDropdown();
      categoryDropdown.classList.remove("hidden");
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (
      !exModalCategoryInput.contains(e.target) &&
      !categoryDropdown.contains(e.target)
    ) {
      categoryDropdown.classList.add("hidden");
    }
  });

  manageExercisesBtn.addEventListener("click", () => {
    openManageExercisesModal(showBanner);
  });
}

export function initLiftUI() {
  liftDateInput.value = isoToday();
  updateLiftLabels();
  syncLiftEditorToSelectedDate();
}

export function resizeLiftChart() {
  if (liftChart) liftChart.resize();
}
