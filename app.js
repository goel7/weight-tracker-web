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

// -------------------- UI --------------------
const banner = document.getElementById("banner");
const bannerText = document.getElementById("bannerText");
const bannerClose = document.getElementById("bannerClose");
const unitToggle = document.getElementById("unitToggle");
const unitToggleText = document.getElementById("unitToggleText");

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
  localStorage.setItem("selectedPage", page);

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

  const savedPage = localStorage.getItem("selectedPage") || "weight";
  setActivePage(savedPage);
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
