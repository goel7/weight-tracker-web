// =====================================================
// AUTHENTICATION
// =====================================================

import { sb } from "./supabase.js";

// UI Elements
const authCard = document.getElementById("authCard");
const app = document.getElementById("app");
const logoutBtn = document.getElementById("logoutBtn");
const pageNav = document.getElementById("pageNav");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const primaryAuthBtn = document.getElementById("primaryAuthBtn");
const toggleAuthBtn = document.getElementById("toggleAuthBtn");

const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authHint = document.getElementById("authHint");
const confirmWrap = document.getElementById("confirmWrap");
const pass2El = document.getElementById("password2");

let authMode = "login"; // "login" | "signup"

export async function setUIAuthed(isAuthed) {
  authCard.classList.toggle("hidden", isAuthed);
  app.classList.toggle("hidden", !isAuthed);
  logoutBtn.classList.toggle("hidden", !isAuthed);
  pageNav.classList.toggle("hidden", !isAuthed);
}

export function setAuthMode(mode) {
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

export function initAuthListeners(showBanner, clearBanner, bootstrapAuthed) {
  toggleAuthBtn.addEventListener("click", (e) => {
    e.preventDefault();
    clearBanner();
    setAuthMode(authMode === "login" ? "signup" : "login");
  });

  primaryAuthBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    clearBanner();

    const email = emailEl.value.trim();
    const pw = passEl.value;

    if (!email) return showBanner("Enter an email.");
    if (!pw || pw.length < 6)
      return showBanner("Password must be at least 6 characters.");

    primaryAuthBtn.disabled = true;
    toggleAuthBtn.disabled = true;

    try {
      if (authMode === "signup") {
        const pw2 = pass2El.value;
        if (pw !== pw2) return showBanner("Passwords do not match.");

        const { error } = await sb.auth.signUp({ email, password: pw });
        if (error) throw error;

        const { error: signInErr } = await sb.auth.signInWithPassword({
          email,
          password: pw,
        });
        if (signInErr) throw signInErr;

        // bootstrapAuthed will be called by onAuthStateChange
        return;
      }

      const { error } = await sb.auth.signInWithPassword({
        email,
        password: pw,
      });
      if (error) throw error;

      // bootstrapAuthed will be called by onAuthStateChange
    } catch (e) {
      showBanner(
        `${authMode === "signup" ? "Sign up" : "Login"} failed: ${e.message}`,
      );
    } finally {
      primaryAuthBtn.disabled = false;
      toggleAuthBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await sb.auth.signOut();
  });
}

export function setupAuthStateListener(bootstrapAuthed, setUIAuthed) {
  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session) await bootstrapAuthed();
    else await setUIAuthed(false);
  });
}

export async function getCurrentSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
