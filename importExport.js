// =====================================================
// IMPORT/EXPORT FUNCTIONALITY
// =====================================================

import { sb } from "./supabase.js";
import { isoToday, uiConfirm } from "./utils.js";

// ==================== WEIGHT EXPORT ====================

/**
 * Export weight entries to CSV
 * CSV format: entry_date, weight
 */
export function exportWeightToCSV(weights) {
  if (!weights || weights.length === 0) {
    return "entry_date,weight\n";
  }

  let csv = "entry_date,weight\n";
  for (const entry of weights) {
    csv += `${entry.entry_date},${entry.weight}\n`;
  }
  return csv;
}

/**
 * Download weight CSV to user's computer
 */
export function downloadWeightCSV(weights) {
  const csv = exportWeightToCSV(weights);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `weight-tracker-export-${isoToday()}.csv`);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Parse weight CSV and return array of entries
 * Expected format: entry_date,weight (with header)
 */
export function parseWeightCSV(csvText) {
  const lines = csvText
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }

  // Check header
  const header = lines[0].toLowerCase();
  if (!header.includes("date") && !header.includes("weight")) {
    throw new Error("Invalid CSV format. Expected columns: entry_date, weight");
  }

  const entries = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim());

    if (parts.length < 2) continue;

    const entry_date = parts[0];
    const weight = parseFloat(parts[1]);

    // Validate date format (YYYY-MM-DD)
    if (!entry_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      console.warn(`Skipping invalid date format: ${entry_date}`);
      continue;
    }

    // Validate weight is a number
    if (isNaN(weight) || weight <= 0) {
      console.warn(`Skipping invalid weight: ${parts[1]}`);
      continue;
    }

    entries.push({ entry_date, weight });
  }

  if (entries.length === 0) {
    throw new Error("No valid entries found in CSV");
  }

  return entries;
}

/**
 * Import weight entries from CSV
 * Upserts entries into database (updates if exists for same date)
 */
export async function importWeightFromCSV(csvText) {
  const entries = parseWeightCSV(csvText);
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;

  if (!user) throw new Error("Not logged in");

  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };

  for (const entry of entries) {
    try {
      const { error } = await sb.from("weights").upsert(
        {
          user_id: user.id,
          entry_date: entry.entry_date,
          weight: entry.weight,
        },
        {
          onConflict: "user_id,entry_date",
        },
      );

      if (error) {
        results.failed++;
        results.errors.push(
          `${entry.entry_date}: ${error.message || "Unknown error"}`,
        );
      } else {
        results.success++;
      }
    } catch (e) {
      results.failed++;
      results.errors.push(`${entry.entry_date}: ${e.message}`);
    }
  }

  return results;
}

// ==================== LIFTS EXPORT ====================

/**
 * Export lift entries to CSV
 * CSV format: entry_date, exercise, category, weight, reps, sets, notes
 */
export function exportLiftsToCSV(liftEntries, exercises) {
  if (!liftEntries || liftEntries.length === 0) {
    return "entry_date,exercise,category,weight,reps,sets,notes\n";
  }

  // Create a map of exercise IDs to details for quick lookup
  const exerciseMap = new Map();
  if (exercises) {
    for (const ex of exercises) {
      exerciseMap.set(ex.id, {
        name: ex.name,
        category: ex.category || ex.exercise_categories?.name || "",
      });
    }
  }

  let csv = "entry_date,exercise,category,weight,reps,sets,notes\n";

  for (const entry of liftEntries) {
    const exerciseData = exerciseMap.get(entry.exercise_id) || {
      name: "Unknown",
      category: "",
    };
    const exerciseName = exerciseData.name || "Unknown";
    const category = exerciseData.category || "";
    const reps = entry.reps ?? "";
    const sets = entry.sets ?? "";
    const notes = (entry.notes ?? "").replace(/"/g, '""'); // Escape quotes in notes

    const escapedExercise = String(exerciseName).replace(/"/g, '""');
    const escapedCategory = String(category).replace(/"/g, '""');

    csv += `${entry.entry_date},"${escapedExercise}","${escapedCategory}",${entry.weight},${reps},${sets},"${notes}"\n`;
  }

  return csv;
}

/**
 * Download lifts CSV to user's computer
 */
export function downloadLiftsCSV(liftEntries, exercises) {
  const csv = exportLiftsToCSV(liftEntries, exercises);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `lifts-tracker-export-${isoToday()}.csv`);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Parse lifts CSV and return array of entries
 * Expected format: entry_date, exercise, category, weight, reps, sets, notes (with header)
 * Supports common header aliases (e.g. Date, Exercise Name, Load, etc)
 */
export function parseLiftsCSV(csvText) {
  const lines = csvText
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }

  // Parse header and resolve columns with flexible aliases
  const headerParts = parseCSVLine(lines[0]).map((h) => h.trim());
  const columnMap = resolveLiftColumnMap(headerParts);

  if (
    columnMap.entry_date === -1 ||
    columnMap.exercise === -1 ||
    columnMap.weight === -1
  ) {
    throw new Error(
      "Invalid CSV format. Required columns: date, exercise, weight (header names can vary)",
    );
  }

  const entries = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV with quoted fields support
    const parts = parseCSVLine(line);

    const entry_date = readColumn(parts, columnMap.entry_date);
    const exercise = readColumn(parts, columnMap.exercise);
    const category = readColumn(parts, columnMap.category);
    const weightRaw = readColumn(parts, columnMap.weight);
    const repsRaw = readColumn(parts, columnMap.reps);
    const setsRaw = readColumn(parts, columnMap.sets);
    const notes = readColumn(parts, columnMap.notes);

    const weight = parseFloat(weightRaw);
    const reps = repsRaw ? parseInt(repsRaw, 10) : null;
    const sets = setsRaw ? parseInt(setsRaw, 10) : null;

    // Validate date format (YYYY-MM-DD)
    if (!entry_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      console.warn(`Skipping invalid date format: ${entry_date}`);
      continue;
    }

    // Validate exercise name
    if (!exercise) {
      console.warn(`Skipping entry with missing exercise name`);
      continue;
    }

    // Validate weight is a number
    if (isNaN(weight) || weight <= 0) {
      console.warn(`Skipping invalid weight: ${parts[2]}`);
      continue;
    }

    entries.push({
      entry_date,
      exercise,
      category,
      weight,
      reps: !isNaN(reps) ? reps : null,
      sets: !isNaN(sets) ? sets : null,
      notes,
    });
  }

  if (entries.length === 0) {
    throw new Error("No valid entries found in CSV");
  }

  return entries;
}

/**
 * Helper to parse CSV line respecting quoted fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function normalizeHeaderName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findFirstHeaderIndex(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function resolveLiftColumnMap(rawHeaders) {
  const headers = rawHeaders.map(normalizeHeaderName);

  return {
    entry_date: findFirstHeaderIndex(headers, [
      "entrydate",
      "date",
      "workoutdate",
      "logdate",
    ]),
    exercise: findFirstHeaderIndex(headers, [
      "exercise",
      "exercisename",
      "movement",
      "lift",
      "name",
    ]),
    category: findFirstHeaderIndex(headers, [
      "category",
      "exercisecategory",
      "group",
      "musclegroup",
    ]),
    weight: findFirstHeaderIndex(headers, ["weight", "load", "kg", "lbs"]),
    reps: findFirstHeaderIndex(headers, ["reps", "rep"]),
    sets: findFirstHeaderIndex(headers, ["sets", "set"]),
    notes: findFirstHeaderIndex(headers, [
      "notes",
      "note",
      "comment",
      "comments",
    ]),
  };
}

function readColumn(parts, index) {
  if (index < 0 || index >= parts.length) return "";
  return String(parts[index] || "").trim();
}

/**
 * Import lift entries from CSV
 * First creates exercises if they don't exist, then upserts lift entries
 */
export async function importLiftsFromCSV(csvText) {
  const entries = parseLiftsCSV(csvText);
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;

  if (!user) throw new Error("Not logged in");

  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };

  // Get existing categories
  const { data: existingCategories, error: categoryFetchError } = await sb
    .from("exercise_categories")
    .select("id, name")
    .eq("user_id", user.id);

  if (categoryFetchError) {
    throw new Error(
      `Failed to fetch categories: ${categoryFetchError.message}`,
    );
  }

  const categoryMap = new Map();
  if (existingCategories) {
    for (const cat of existingCategories) {
      categoryMap.set(cat.name.toLowerCase(), cat.id);
    }
  }

  // Get existing exercises
  const { data: existingExercises, error: fetchError } = await sb
    .from("exercises")
    .select("id, name, category_id")
    .eq("user_id", user.id);

  if (fetchError) {
    throw new Error(`Failed to fetch exercises: ${fetchError.message}`);
  }

  // Create a map of exercise names to exercise records
  const exerciseMap = new Map();
  if (existingExercises) {
    for (const ex of existingExercises) {
      exerciseMap.set(ex.name.toLowerCase(), {
        id: ex.id,
        category_id: ex.category_id,
      });
    }
  }

  async function getOrCreateCategoryId(categoryName) {
    const clean = String(categoryName || "").trim();
    if (!clean) return null;

    const key = clean.toLowerCase();
    const existing = categoryMap.get(key);
    if (existing) return existing;

    const { data: categoryData, error: categoryCreateError } = await sb
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

    if (categoryCreateError) {
      throw new Error(
        `Failed to create category \"${clean}\": ${categoryCreateError.message}`,
      );
    }

    categoryMap.set(key, categoryData.id);
    return categoryData.id;
  }

  // Process each entry
  for (const entry of entries) {
    try {
      const entryCategoryId = await getOrCreateCategoryId(entry.category);
      const existingExercise = exerciseMap.get(entry.exercise.toLowerCase());
      let exerciseId = existingExercise?.id;

      // If exercise doesn't exist, create it
      if (!exerciseId) {
        const { data: newExercise, error: createError } = await sb
          .from("exercises")
          .insert({
            user_id: user.id,
            name: entry.exercise,
            category_id: entryCategoryId,
          })
          .select("id, category_id")
          .single();

        if (createError) {
          results.failed++;
          results.errors.push(
            `${entry.entry_date} - ${entry.exercise}: Failed to create exercise`,
          );
          continue;
        }

        exerciseId = newExercise.id;
        exerciseMap.set(entry.exercise.toLowerCase(), {
          id: newExercise.id,
          category_id: newExercise.category_id,
        });
      } else if (
        entryCategoryId &&
        (!existingExercise?.category_id ||
          String(existingExercise.category_id) !== String(entryCategoryId))
      ) {
        // If exercise exists but is uncategorized/different category, update it
        const { error: updateCategoryError } = await sb
          .from("exercises")
          .update({ category_id: entryCategoryId })
          .eq("id", exerciseId)
          .eq("user_id", user.id);

        if (updateCategoryError) {
          results.failed++;
          results.errors.push(
            `${entry.entry_date} - ${entry.exercise}: Failed to assign category`,
          );
          continue;
        }

        exerciseMap.set(entry.exercise.toLowerCase(), {
          id: exerciseId,
          category_id: entryCategoryId,
        });
      }

      // Insert/update lift entry
      const { error } = await sb.from("lift_entries").upsert(
        {
          user_id: user.id,
          entry_date: entry.entry_date,
          exercise_id: exerciseId,
          weight: entry.weight,
          reps: entry.reps,
          sets: entry.sets,
          notes: entry.notes || null,
        },
        {
          onConflict: "user_id,exercise_id,entry_date",
        },
      );

      if (error) {
        results.failed++;
        results.errors.push(
          `${entry.entry_date} - ${entry.exercise}: ${error.message || "Unknown error"}`,
        );
      } else {
        results.success++;
      }
    } catch (e) {
      results.failed++;
      results.errors.push(
        `${entry.entry_date} - ${entry.exercise}: ${e.message}`,
      );
    }
  }

  return results;
}

// ==================== FILE HANDLING ====================

/**
 * Trigger file input and get CSV content
 */
export async function selectAndReadCSV() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";

    input.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      try {
        const text = await file.text();
        resolve(text);
      } catch (error) {
        resolve(null);
      }
    });

    input.click();
  });
}

/**
 * Show import confirmation with preview
 */
export async function showImportConfirmation(title, message, details) {
  const ok = await uiConfirm({
    title,
    message: `${message}\n\n${details}`,
    confirmText: "Import",
    cancelText: "Cancel",
  });
  return ok;
}
