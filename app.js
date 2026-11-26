const levels = [
  { metal: "Bronze", amount: "$20", received: "$100", position: true },
  { metal: "Silver", amount: "$60", received: "$300" },
  { metal: "Gold", amount: "$200", received: "$1.000" },
  { metal: "Platinum", amount: "$500", received: "$2.500" },
  { metal: "Palladium", amount: "$2.000", received: "$10.000" },
  { metal: "Rhodium", amount: "$6.000", received: "$30.000" },
  { metal: "Iridium", amount: "$20.000", received: "$100.000" },
  { metal: "Osmium", amount: "$54.000", received: "$270.000" }
];

const grid = document.querySelector("#levels-grid");
grid.innerHTML = levels.map((level, index) => {
  const active = level.position;
  return `<article class="level-card ${active ? "active-level" : "locked"}">
    <div class="level-meta"><span class="level-label">✧&nbsp; Level ${index + 1} • ${level.metal}</span>${active ? "" : '<span class="locked-label">♙&nbsp; LOCKED</span>'}</div>
    <p class="offer-label">GIFT TO OFFER</p>
    <h3 class="offer-amount">${level.amount}</h3>
    ${active ? `<div class="line-info">
      <span>You are not in this line yet.</span>
      <div><span>Current center</span><strong class="active-user">@natalie12</strong></div>
      <div><span>Board #143 · completion</span><strong>2/7 · 29 %</strong></div>
      <div class="progress-track"><span></span></div>
      <span class="line-count">♧&nbsp; 784 in line</span>
    </div>` : ""}
    <div class="line-info support-info">
      <div><span>♡&nbsp; 5 gifts received at the center:</span><strong>${level.received}</strong></div>
      <div><span>♢&nbsp; ${index === 7 ? "4th and 7th" : index < 2 ? "5th and 7th" : "5th and 7th"} gifts:</span><strong>Support Fund (2 gifts)</strong></div>
      <div><span>⟲&nbsp; Board completed:</span><strong>Re-entry paid by TrustGift</strong></div>
    </div>
    ${active ? "" : `<p class="unlocks">♙&nbsp; Unlocks as soon as you are active on ${levels[index - 1].metal}.</p>`}
    <button class="button level-action ${active ? "" : "locked-button"}" type="button" ${active ? "" : "disabled"}>${active ? "Open the board&nbsp; →" : "Locked&nbsp; →"}</button>
  </article>`;
}).join("");

const body = document.body;
const dashboardView = document.querySelector("#dashboard-view");
const joinView = document.querySelector("#join-view");
const signinView = document.querySelector("#signin-view");
const toast = document.querySelector(".toast");
const referralCodeInput = document.querySelector('[name="referralCode"]');
const referralFromUrl = new URLSearchParams(location.search).get("ref");
if (referralFromUrl) referralCodeInput.value = referralFromUrl.toUpperCase();

let supabaseClient = null;
let schemaReady = false;
let currentUser = null;
let currentProfile = null;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderRoute() {
  const route = location.hash.slice(1);
  const isJoin = route === "join";
  const isSignin = route === "signin";
  dashboardView.hidden = isJoin || isSignin;
  joinView.hidden = !isJoin;
  signinView.hidden = !isSignin;
  body.classList.toggle("view-dashboard", !isJoin && !isSignin);
  body.classList.toggle("authenticated", Boolean(currentUser));
  document.title = isJoin ? "Join TrustGift" : isSignin ? "Sign in — TrustGift" : "TrustGift — Member area";
  document.querySelector(".main-nav").classList.remove("open");
  document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", renderRoute);
renderRoute();

function setAuthStatus(id, message) {
  document.querySelector(`#${id}`).textContent = message;
}

function authErrorMessage(error) {
  if (error?.code === "23505" || /duplicate key|already registered/i.test(error?.message ?? "")) {
    return "That username or e-mail is already in use.";
  }
  if (/referral code is invalid/i.test(error?.message ?? "")) {
    return "That referral code was not found. Check it and try again.";
  }
  return error?.message || "An unexpected authentication error occurred.";
}

function setSignedOutView() {
  currentUser = null;
  currentProfile = null;
  body.classList.remove("authenticated");
  document.querySelector("#welcome-heading").textContent = "Welcome to TrustGift";
  document.querySelector("#profile-full-name").textContent = "Demo member";
  document.querySelector("#profile-username").textContent = "@demo";
  document.querySelector("#referral-link").textContent = "Sign in to view your referral link";
  document.querySelector("#referral-count").textContent = "0";
}

async function loadProfile(user) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, username, first_name, last_name, country, referral_code")
    .eq("id", user.id)
    .single();
  if (error) throw error;

  const { data: referralCount, error: referralError } = await supabaseClient.rpc("my_referral_count");
  if (referralError) throw referralError;

  currentProfile = profile;
  document.querySelector("#welcome-heading").textContent = `Good to see you again, ${profile.first_name}`;
  document.querySelector("#profile-full-name").textContent = `${profile.first_name} ${profile.last_name}`;
  document.querySelector("#profile-username").textContent = `@${profile.username}`;
  document.querySelector(".member-account strong").textContent = `@${profile.username}`;
  document.querySelector(".member-account small").textContent = profile.referral_code;
  document.querySelector("#referral-count").textContent = String(referralCount ?? 0);

  const referralUrl = new URL(location.pathname, location.origin);
  referralUrl.searchParams.set("ref", profile.referral_code);
  referralUrl.hash = "join";
  document.querySelector("#referral-link").textContent = referralUrl.toString();
}

async function applySession(session) {
  if (!session?.user) {
    setSignedOutView();
    renderRoute();
    return;
  }

  currentUser = session.user;
  body.classList.add("authenticated");
  renderRoute();
  try {
    await loadProfile(session.user);
  } catch (error) {
    console.error("Could not load the signed-in profile.", error);
    showToast(`Could not load your profile: ${authErrorMessage(error)}`);
  }
}

async function initializeSupabase() {
  const config = window.TRUSTGIFT_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) {
    const message = "Supabase is not connected yet. Add the project URL and publishable key to supabase-config.js, then apply the SQL migration.";
    setAuthStatus("signup-status", message);
    setAuthStatus("signin-status", message);
    return;
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabaseClient = createClient(config.url, config.publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    });

    const health = await fetch(`${config.url.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: config.publishableKey }
    });
    if (!health.ok) throw new Error(`Supabase returned HTTP ${health.status}`);

    const { data: readiness, error: readinessError } = await supabaseClient.rpc("is_schema_ready");
    if (readinessError || readiness !== true) {
      console.error("Supabase is reachable, but its schema migration is not ready.", readinessError);
      setAuthStatus("signup-status", "Supabase is reachable, but the database migration has not been applied. Run the SQL migration before creating accounts.");
      setAuthStatus("signin-status", "Supabase is reachable, but the database migration has not been applied. Run the SQL migration before signing in.");
      return;
    }
    schemaReady = true;

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    await applySession(data.session);
    setAuthStatus("signup-status", "Supabase is connected and the database schema is ready.");
    setAuthStatus("signin-status", "Sign-in is handled by Supabase Auth.");

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        applySession(session).catch(error => {
          console.error("Could not update the signed-in profile.", error);
          showToast(`Could not load your profile: ${authErrorMessage(error)}`);
        });
      }, 0);
    });
  } catch (error) {
    console.error("Could not initialize Supabase.", error);
    setAuthStatus("signup-status", "Could not connect to Supabase. Check the project URL, publishable key, and network connection.");
    setAuthStatus("signin-status", "Could not connect to Supabase. Check the project URL, publishable key, and network connection.");
  }
}

initializeSupabase();

document.querySelector(".menu-toggle").addEventListener("click", event => {
  const nav = document.querySelector(".main-nav");
  nav.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(nav.classList.contains("open")));
});

document.querySelector(".copy-button").addEventListener("click", async event => {
  const referralLink = document.querySelector("#referral-link").textContent;
  if (!currentProfile) {
    showToast("Sign in to get your personal referral link.");
    return;
  }
  try {
    await navigator.clipboard.writeText(referralLink);
    event.currentTarget.innerHTML = "✓&nbsp; Copied";
    showToast("Referral link copied to clipboard.");
  } catch {
    showToast(referralLink);
  }
});

document.querySelector(".back-to-top").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
document.querySelectorAll(".language").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".language").forEach(item => item.classList.toggle("selected", item === button));
  showToast(`${button.dataset.lang} selected for this demo.`);
}));

document.querySelectorAll(".level-action:not(:disabled)").forEach(button => button.addEventListener("click", () => {
  showToast("Bronze board preview — demo only.");
}));

const paymentTabs = document.querySelectorAll(".payment-tab");
const paymentOptions = document.querySelector("#payment-options");
const paymentDetail = document.querySelector("#payment-detail");
let selectedPayment = "Crypto";

paymentTabs.forEach(button => button.addEventListener("click", () => {
  selectedPayment = button.dataset.method;
  paymentTabs.forEach(tab => tab.classList.toggle("active", tab === button));
  const crypto = selectedPayment === "Crypto";
  paymentOptions.hidden = !crypto;
  paymentDetail.hidden = crypto;
  if (!crypto) {
    document.querySelector("#payment-label").firstChild.textContent = `${selectedPayment} account `;
    document.querySelector("#payment-detail input").placeholder = `Enter your ${selectedPayment} details`;
  }
}));

document.querySelectorAll(".choice").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".choice").forEach(choice => choice.classList.toggle("selected", choice === button));
}));

document.querySelector(".add-method").addEventListener("click", () => {
  let detail = selectedPayment === "Crypto"
    ? document.querySelector(".choice.selected")?.textContent.trim()
    : document.querySelector("#payment-detail input").value.trim();
  if (!detail) {
    showToast(selectedPayment === "Crypto" ? "Choose a crypto method first." : "Enter your payment details first.");
    return;
  }
  const method = selectedPayment === "Crypto" ? `${selectedPayment} · ${detail}` : `${selectedPayment} · ${detail}`;
  const row = document.createElement("div");
  row.className = "added-method";
  const text = document.createElement("span");
  text.textContent = method;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => row.remove());
  row.append(text, remove);
  document.querySelector("#added-methods").append(row);
  showToast("Payment method added.");
});

document.querySelectorAll(".show-password").forEach(button => button.addEventListener("click", () => {
  const input = button.parentElement.querySelector("input");
  input.type = input.type === "password" ? "text" : "password";
  button.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
}));

const joinForm = document.querySelector("#join-form");
const createAccount = document.querySelector(".create-account");
const terms = [...document.querySelectorAll(".check-row input")];
function updateSubmitState() {
  createAccount.disabled = !terms.every(input => input.checked);
}
terms.forEach(input => input.addEventListener("change", updateSubmitState));
updateSubmitState();

joinForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!supabaseClient) {
    showToast("Connect Supabase before creating an account.");
    return;
  }
  if (!schemaReady) {
    showToast("Apply the Supabase database migration before creating an account.");
    return;
  }
  const password = joinForm.elements.password.value;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    showToast("Password must include at least one letter and one digit.");
    joinForm.elements.password.focus();
    return;
  }
  if (password !== joinForm.elements.confirmPassword.value) {
    showToast("The passwords do not match.");
    joinForm.elements.confirmPassword.focus();
    return;
  }
  const formData = new FormData(joinForm);
  createAccount.disabled = true;
  setAuthStatus("signup-status", "Creating your account…");
  supabaseClient.auth.signUp({
    email: String(formData.get("email")).trim(),
    password,
    options: {
      emailRedirectTo: `${location.origin}${location.pathname}#signin`,
      data: {
        first_name: String(formData.get("firstName")).trim(),
        last_name: String(formData.get("lastName")).trim(),
        username: String(formData.get("username")).trim().toLowerCase(),
        country: String(formData.get("country")).trim(),
        referral_code: String(formData.get("referralCode")).trim().toUpperCase(),
        legal_acceptance: {
          age_confirmed: terms[0].checked,
          gift_risk_acknowledged: terms[1].checked,
          terms_accepted: terms[2].checked
        }
      }
    }
  }).then(({ data, error }) => {
    if (error) throw error;
    if (data.session) {
      location.hash = "#dashboard";
      showToast("Account created successfully.");
    } else {
      location.hash = "#signin";
      showToast("Account created. Check your email to confirm it before signing in.");
    }
  }).catch(error => {
    console.error("Account creation failed.", error);
    setAuthStatus("signup-status", authErrorMessage(error));
    showToast(`Could not create your account: ${authErrorMessage(error)}`);
  }).finally(() => {
    updateSubmitState();
  });
});

document.querySelector("#signin-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabaseClient) {
    showToast("Connect Supabase before signing in.");
    return;
  }
  if (!schemaReady) {
    showToast("Apply the Supabase database migration before signing in.");
    return;
  }

  const formData = new FormData(event.currentTarget);
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setAuthStatus("signin-status", "Signing in…");
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: String(formData.get("email")).trim(),
      password: String(formData.get("password"))
    });
    if (error) throw error;
    location.hash = "#dashboard";
  } catch (error) {
    console.error("Sign-in failed.", error);
    setAuthStatus("signin-status", authErrorMessage(error));
    showToast(`Could not sign in: ${authErrorMessage(error)}`);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.error("Sign-out failed.", error);
    showToast(`Could not sign out: ${authErrorMessage(error)}`);
  }
});
