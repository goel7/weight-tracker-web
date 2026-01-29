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
} from "./weight.js";
import {
  refreshLifts,
  initLiftListeners,
  initLiftUI,
  resizeLiftChart,
} from "./lifts.js";

// -------------------- UI --------------------
const banner = document.getElementById("banner");
const bannerText = document.getElementById("bannerText");
const bannerClose = document.getElementById("bannerClose");

const pageBtns = Array.from(document.querySelectorAll(".pageBtn"));
const weightPage = document.getElementById("weightPage");
const liftsPage = document.getElementById("liftsPage");
const appTitle = document.getElementById("appTitle");
const appSub = document.getElementById("appSub");

// -------------------- State --------------------
let selectedPage = "weight";

// -------------------- Banner --------------------
function showBanner(msg) {
  bannerText.textContent = msg;
  banner.classList.remove("hidden");
}

function clearBanner() {
  banner.classList.add("hidden");
  bannerText.textContent = "";
}

bannerClose.addEventListener("click", clearBanner);

// -------------------- Page Navigation --------------------
function setActivePage(page) {
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
    refreshWeight(showBanner, clearBanner);
  } else {
    appTitle.textContent = "Lift Tracker";
    appSub.textContent = "Log lifts, track strength progression by exercise.";
    refreshLifts();
  }
}

pageBtns.forEach((btn) => {
  btn.addEventListener("click", () => setActivePage(btn.dataset.page));
});

// -------------------- Bootstrap --------------------
async function bootstrapAuthed() {
  await setUIAuthed(true);

  initWeightUI();
  await refreshWeight(showBanner, clearBanner);

  initLiftUI();
  await refreshLifts();

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
