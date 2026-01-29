// =====================================================
// UTILITY FUNCTIONS
// =====================================================

// Unit conversion constants
const LBS_TO_KG = 0.453592;
const KG_TO_LBS = 2.20462;

// Unit preference (stored in localStorage)
export function getWeightUnit() {
  return localStorage.getItem("weightUnit") || "lbs";
}

export function setWeightUnit(unit) {
  localStorage.setItem("weightUnit", unit);
}

export function convertWeight(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value;
  if (fromUnit === "lbs" && toUnit === "kg") return value * LBS_TO_KG;
  if (fromUnit === "kg" && toUnit === "lbs") return value * KG_TO_LBS;
  return value;
}

export function formatWeight(value, unit = null) {
  const displayUnit = unit || getWeightUnit();
  return `${Number(value).toFixed(1)} ${displayUnit}`;
}

export function getWeightLabel(baseLabel = "Weight") {
  return `${baseLabel} (${getWeightUnit()})`;
}

export function isoToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmt2(x) {
  return Number(x).toFixed(2);
}

export function niceStep(minY, maxY) {
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

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

export function filterByTimeframe(rows, tf) {
  if (!rows?.length) return rows ?? [];
  const sorted = [...rows].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date),
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

export function formatTickLabel(iso) {
  return fmtShort.format(parseISO(iso));
}

const fmtLong = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function createModal({
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  input = false,
  placeholder = "",
  defaultValue = "",
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modalOverlay";

    const card = document.createElement("div");
    card.className = "modalCard";

    const top = document.createElement("div");
    top.className = "modalTop";

    const titleWrap = document.createElement("div");
    const titleEl = document.createElement("div");
    titleEl.className = "modalTitle";
    titleEl.textContent = title;
    titleWrap.appendChild(titleEl);

    const closeBtn = document.createElement("button");
    closeBtn.className = "modalX";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "✕";

    top.appendChild(titleWrap);
    top.appendChild(closeBtn);

    const messageEl = document.createElement("div");
    messageEl.className = "modalMessage";
    messageEl.textContent = message || "";

    let inputEl = null;
    if (input) {
      inputEl = document.createElement("input");
      inputEl.className = "modalInput";
      inputEl.type = "text";
      inputEl.placeholder = placeholder;
      inputEl.value = defaultValue;
    }

    const actions = document.createElement("div");
    actions.className = "modalActions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn ghost";
    cancelBtn.type = "button";
    cancelBtn.textContent = cancelText;
    cancelBtn.dataset.action = "cancel";

    const confirmBtn = document.createElement("button");
    confirmBtn.className = `btn ${danger ? "danger" : "primary"}`;
    confirmBtn.type = "button";
    confirmBtn.textContent = confirmText;
    confirmBtn.dataset.action = "confirm";

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    card.appendChild(top);
    card.appendChild(messageEl);
    if (inputEl) card.appendChild(inputEl);
    card.appendChild(actions);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add("isOpen"));

    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    }

    const cleanup = () => {
      overlay.classList.remove("isOpen");
      overlay.addEventListener("transitionend", () => overlay.remove(), {
        once: true,
      });
    };

    const finish = (value) => {
      cleanup();
      resolve(value);
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(input ? null : false);
    });

    closeBtn.addEventListener("click", () => finish(input ? null : false));
    cancelBtn.addEventListener("click", () => finish(input ? null : false));

    confirmBtn.addEventListener("click", () => {
      if (input) {
        finish(inputEl.value.trim());
      } else {
        finish(true);
      }
    });

    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        finish(input ? null : false);
      },
      { once: true },
    );

    if (inputEl) {
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(inputEl.value.trim());
        }
      });
    }
  });
}

export function uiConfirm({
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
}) {
  return createModal({ title, message, confirmText, cancelText, danger });
}

export function uiPrompt({
  title = "Rename",
  message = "",
  defaultValue = "",
  placeholder = "",
  confirmText = "Save",
  cancelText = "Cancel",
}) {
  return createModal({
    title,
    message,
    confirmText,
    cancelText,
    input: true,
    placeholder,
    defaultValue,
  });
}

export function formatDisplayDate(iso) {
  return fmtLong.format(parseISO(iso));
}

export function weekStartISO(dateObj) {
  const d = new Date(dateObj);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = day === 0 ? -6 : 1 - day; // to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function weeklyAverages(rows) {
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

export function computePoints(rows) {
  const sorted = [...rows].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date),
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

export function yAxisDomain(points) {
  if (!points.length) return { min: 0, max: 1, rawMin: 0, rawMax: 1, step: 5 };

  const ys = points.flatMap((p) => [p.weight, p.avg7]).filter(Number.isFinite);
  let rawMin = Math.min(...ys);
  let rawMax = Math.max(...ys);

  if (rawMin === rawMax) {
    rawMin -= 1;
    rawMax += 1;
  }

  const rawSpan = rawMax - rawMin;

  let step = 5;
  if (rawSpan < 2) step = 1;
  else if (rawSpan < 6) step = 2;

  const pad = Math.max(rawSpan * 0.75, step * 0.35);

  let min = rawMin - pad;
  let max = rawMax + pad;

  if (rawSpan < step * 2) {
    min = Math.min(min, Math.floor(rawMin / step) * step);
    max = Math.max(max, Math.ceil(rawMax / step) * step);
  }

  return { rawMin, rawMax, min, max, step };
}

export function computeLiftPoints(rows) {
  const sorted = [...rows].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date),
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

export function liftYAxisDomain(points) {
  if (!points.length) return { min: 0, max: 1, step: 5 };

  const ys = points.map((p) => p.weight).filter(Number.isFinite);
  let rawMin = Math.min(...ys);
  let rawMax = Math.max(...ys);

  if (rawMin === rawMax) {
    rawMin -= 5;
    rawMax += 5;
  }

  const rawSpan = rawMax - rawMin;

  let step = 10;
  if (rawSpan < 20) step = 5;
  if (rawSpan < 10) step = 2.5;

  const pad = Math.max(rawSpan * 0.6, step * 0.6);

  return {
    min: rawMin - pad,
    max: rawMax + pad,
    step,
  };
}
