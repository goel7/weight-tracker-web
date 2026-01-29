// =====================================================
// UTILITY FUNCTIONS
// =====================================================

export function isoToday() {
  return new Date().toISOString().slice(0, 10);
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
