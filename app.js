// =====================================================
// MAIN APP - Weight & Lift Tracker
// =====================================================

import { sb } from "./supabase.js";
import {
  setUIAuthed,
  setAuthMode,
  initAuthListeners,
  setupAuthStateListener,
  getCurrentSession,
} from "./auth.js";
import {
  refreshAll as refreshWeight,
  initWeightListeners,
  initWeightUI,
  resizeWeightChart,
  updateWeightLabels,
} from "./weight.js";
import {
  refreshLifts,
  initLiftListeners,
  initLiftUI,
  resizeLiftChart,
  updateLiftLabels,
} from "./lifts.js";
import { getWeightUnit, setWeightUnit } from "./utils.js";
import * as importExportModule from "./importExport.js";

// -------------------- UI --------------------
const banner = document.getElementById("banner");
const bannerText = document.getElementById("bannerText");
const bannerClose = document.getElementById("bannerClose");
const unitToggle = document.getElementById("unitToggle");
const unitToggleText = document.getElementById("unitToggleText");

const settingsBtn = document.getElementById("settingsBtn");
const settingsMenu = document.getElementById("settingsMenu");
const settingsImportBtn = document.getElementById("settingsImportBtn");
const settingsExportBtn = document.getElementById("settingsExportBtn");
const settingsLogoutBtn = document.getElementById("settingsLogoutBtn");

const pageBtns = Array.from(document.querySelectorAll(".pageBtn"));
const weightPage = document.getElementById("weightPage");
const liftsPage = document.getElementById("liftsPage");
const appTitle = document.getElementById("appTitle");
const appSub = document.getElementById("appSub");

// -------------------- State --------------------
let selectedPage = "weight";
let hasBootstrapped = false;

// -------------------- Banner --------------------
let bannerTimeout = null;

function showBanner(msg, type = "error") {
  bannerText.textContent = msg;
  banner.classList.remove("hidden");
  banner.classList.remove("error", "success");
  banner.classList.add(type);

  // Auto-dismiss success messages after 3 seconds
  if (type === "success") {
    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(clearBanner, 3000);
  }
}

function clearBanner() {
  banner.classList.add("hidden");
  bannerText.textContent = "";
  clearTimeout(bannerTimeout);
}

bannerClose.addEventListener("click", clearBanner);

// -------------------- Settings Menu --------------------
function closeSettingsMenu() {
  settingsMenu.classList.remove("isOpen");
}

settingsBtn.addEventListener("click", () => {
  settingsMenu.classList.toggle("isOpen");
});

// Close menu when clicking outside
document.addEventListener("click", (e) => {
  if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) {
    closeSettingsMenu();
  }
});

settingsLogoutBtn.addEventListener("click", async () => {
  closeSettingsMenu();
  await sb.auth.signOut();
});

// Import/Export handlers for settings menu
settingsExportBtn.addEventListener("click", async () => {
  closeSettingsMenu();

  if (selectedPage === "weight") {
    // Export weight data
    const { data: weights, error } = await sb
      .from("weights")
      .select("id, entry_date, weight")
      .order("entry_date", { ascending: true });

    if (error) {
      showBanner(`Failed to fetch weight data: ${error.message}`, "error");
      return;
    }

    if (!weights || weights.length === 0) {
      showBanner("No weight data to export yet.", "error");
      return;
    }

    importExportModule.downloadWeightCSV(weights);
    showBanner("Weight data exported successfully!", "success");
  } else {
    // Export lifts data
    const { data: liftEntries, error: entriesError } = await sb
      .from("lift_entries")
      .select("id, entry_date, exercise_id, weight, reps, sets, notes")
      .order("entry_date", { ascending: true });

    if (entriesError) {
      showBanner(`Failed to fetch lift data: ${entriesError.message}`, "error");
      return;
    }

    const { data: exercises, error: exError } = await sb
      .from("exercises")
      .select("id, name, category_id, exercise_categories(name)");

    if (exError) {
      showBanner(`Failed to fetch exercises: ${exError.message}`, "error");
      return;
    }

    if (!liftEntries || liftEntries.length === 0) {
      showBanner("No lift data to export yet.", "error");
      return;
    }

    importExportModule.downloadLiftsCSV(liftEntries, exercises);
    showBanner("Lift data exported successfully!", "success");
  }
});

settingsImportBtn.addEventListener("click", async () => {
  closeSettingsMenu();

  try {
    const csvText = await importExportModule.selectAndReadCSV();
    if (!csvText) {
      return; // User cancelled
    }

    if (selectedPage === "weight") {
      // Import weight data
      const entries = importExportModule.parseWeightCSV(csvText);

      const ok = await importExportModule.showImportConfirmation(
        "Import weight data",
        `Ready to import ${entries.length} weight entries.`,
        `First entry: ${entries[0].entry_date}\nLast entry: ${entries[entries.length - 1].entry_date}`,
      );

      if (!ok) return;

      showBanner("Importing weight data...", "success");
      const results = await importExportModule.importWeightFromCSV(csvText);

      if (results.success > 0) {
        await refreshWeight(showBanner, clearBanner);
        showBanner(
          `Imported ${results.success} weight entries successfully!`,
          "success",
        );
      }

      if (results.failed > 0) {
        console.warn("Import errors:", results.errors);
        showBanner(
          `Imported ${results.success} entries, ${results.failed} failed`,
          "error",
        );
      }
    } else {
      // Import lifts data
      const entries = importExportModule.parseLiftsCSV(csvText);

      const ok = await importExportModule.showImportConfirmation(
        "Import lift data",
        `Ready to import ${entries.length} lift entries.`,
        `First entry: ${entries[0].entry_date}\nLast entry: ${entries[entries.length - 1].entry_date}`,
      );

      if (!ok) return;

      showBanner("Importing lift data...", "success");
      const results = await importExportModule.importLiftsFromCSV(csvText);

      if (results.success > 0) {
        await refreshLifts(showBanner, clearBanner);
        showBanner(
          `Imported ${results.success} lift entries successfully!`,
          "success",
        );
      }

      if (results.failed > 0) {
        console.warn("Import errors:", results.errors);
        showBanner(
          `Imported ${results.success} entries, ${results.failed} failed`,
          "error",
        );
      }
    }
  } catch (e) {
    showBanner(`Import failed: ${e.message}`, "error");
  }
});

// -------------------- Unit Toggle --------------------
function updateUnitToggle() {
  const unit = getWeightUnit();
  unitToggleText.textContent = unit;
}

unitToggle.addEventListener("click", () => {
  const current = getWeightUnit();
  const next = current === "lbs" ? "kg" : "lbs";
  setWeightUnit(next);
  updateUnitToggle();
  updateWeightLabels();
  updateLiftLabels();
  refreshWeight(showBanner, clearBanner);
  refreshLifts(showBanner, clearBanner);
});

// -------------------- Page Navigation --------------------
async function setActivePage(page) {
  selectedPage = page;

  pageBtns.forEach((b) => {
    const on = b.dataset.page === page;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  weightPage.classList.toggle("hidden", page !== "weight");
  liftsPage.classList.toggle("hidden", page !== "lifts");

  if (page === "weight") {
    appTitle.textContent = "Weight Tracker";
    appSub.textContent = "Log daily weight, see trend + weekly averages.";
    // Don't reload data when switching pages - data is already loaded
  } else {
    appTitle.textContent = "Lift Tracker";
    appSub.textContent = "Log lifts, track strength progression by exercise.";
    // Don't reload data when switching pages - data is already loaded
  }
}

pageBtns.forEach((btn) => {
  btn.addEventListener("click", () => setActivePage(btn.dataset.page));
});

// -------------------- Bootstrap --------------------
async function bootstrapAuthed() {
  if (hasBootstrapped) return;
  hasBootstrapped = true;
  await setUIAuthed(true);

  updateUnitToggle();
  initWeightUI();
  await refreshWeight(showBanner, clearBanner);

  initLiftUI();
  await refreshLifts(showBanner, clearBanner);

  setActivePage("weight");
}

// -------------------- Init --------------------
(async function init() {
  setAuthMode("login");

  // Initialize listeners
  initAuthListeners(showBanner, clearBanner, bootstrapAuthed);
  initWeightListeners(showBanner, clearBanner);
  initLiftListeners(showBanner, clearBanner);

  // Check for existing session
  const session = await getCurrentSession();
  if (session) await bootstrapAuthed();
  else await setUIAuthed(false);

  // Setup auth state listener
  setupAuthStateListener(bootstrapAuthed, setUIAuthed);

  // reset bootstrap state when signed out
  sb.auth.onAuthStateChange((_event, session) => {
    if (!session) hasBootstrapped = false;
  });

  // Handle window resize
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    const app = document.getElementById("app");
    if (app.classList.contains("hidden")) return;

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (selectedPage === "weight") {
        resizeWeightChart();
      } else {
        resizeLiftChart();
      }
    }, 150);
  });
})();
