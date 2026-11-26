const t = (value, parameters) => window.TRUSTGIFT_I18N?.translate(value, parameters) ?? value;

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
      <div><span>Example center</span><strong class="active-user">@examplemember</strong></div>
      <div><span>Sample board · completion</span><strong>2/7 · 29 %</strong></div>
      <div class="progress-track"><span></span></div>
      <span class="line-count">♧&nbsp; Example queue: 784</span>
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
const pageViews = {
  dashboard: dashboardView,
  gifts: document.querySelector("#gifts-view"),
  referrals: document.querySelector("#referrals-view"),
  leaderboard: document.querySelector("#leaderboard-view"),
  support: document.querySelector("#support-view"),
  "support-admin": document.querySelector("#support-admin-view"),
  "admin-tools": document.querySelector("#admin-tools-view"),
  profile: document.querySelector("#profile-view"),
  join: joinView,
  signin: signinView,
  "password-recovery": document.querySelector("#password-recovery-view"),
  "password-reset": document.querySelector("#password-reset-view"),
  terms: document.querySelector("#terms-view"),
  privacy: document.querySelector("#privacy-view")
};
const toast = document.querySelector(".toast");
const referralCodeInput = document.querySelector('[name="referralCode"]');
const referralFromUrl = new URLSearchParams(location.search).get("ref");
let pendingSupportInviteToken = new URLSearchParams(location.search).get("support_invite");
let passwordRecoveryRedirect = new URLSearchParams(location.hash.slice(1)).get("type") === "recovery"
  || new URLSearchParams(location.search).get("type") === "recovery";
let supportInviteAttemptedFor = null;
if (pendingSupportInviteToken && !location.hash) location.hash = "#join";
if (referralFromUrl) referralCodeInput.value = referralFromUrl.toUpperCase();

let supabaseClient = null;
let schemaReady = false;
let currentUser = null;
let currentProfile = null;
let toastTimer;
let authRedirectUrl = "";
let referralsCache = [];
let selectedSupportThreadId = null;
let selectedAdminThreadId = null;
let selectedAdminThreadStatus = null;
let supportThreadsCache = [];

function isSupportAgent() {
  return currentUser?.app_metadata?.support_agent === true;
}

function isTrustGiftAdmin() {
  return currentUser?.app_metadata?.trustgift_admin === true;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderRoute() {
  const requestedRoute = location.hash.slice(1) || "dashboard";
  let route = Object.hasOwn(pageViews, requestedRoute) ? requestedRoute : "dashboard";
  if (route === "support-admin" && !isSupportAgent()) route = "support";
  if (route === "admin-tools" && !isTrustGiftAdmin()) route = "dashboard";
  const isJoin = route === "join";
  const isSignin = route === "signin";
  Object.entries(pageViews).forEach(([name, view]) => {
    view.hidden = name !== route;
  });

  body.classList.toggle("view-dashboard", route === "dashboard");
  body.classList.toggle("auth-view", isJoin || isSignin || route === "password-recovery" || route === "password-reset");
  body.classList.toggle("authenticated", Boolean(currentUser));
  body.classList.toggle("support-agent", isSupportAgent());
  body.classList.toggle("trustgift-admin", isTrustGiftAdmin());
  document.querySelector("#support-admin-link").hidden = !isSupportAgent();
  document.querySelector("#admin-tools-link").hidden = !isTrustGiftAdmin();
  document.querySelector("#support-invite-notice").hidden = !(isJoin && pendingSupportInviteToken);
  const titles = {
    dashboard: "TrustGift — Member area",
    gifts: "Gifts & rewards — TrustGift",
    referrals: "My referrals — TrustGift",
    leaderboard: "Top sponsors — TrustGift",
    support: "Support — TrustGift",
    "support-admin": "Support inbox — TrustGift",
    profile: "My profile — TrustGift",
    "admin-tools": "Administrator — TrustGift",
    join: "Join TrustGift",
    signin: "Sign in — TrustGift",
    "password-recovery": "Reset your password — TrustGift",
    "password-reset": "Choose a new password — TrustGift",
    terms: "Terms of Use — TrustGift",
    privacy: "Privacy Policy — TrustGift"
  };
  document.title = t(titles[route]);
  document.querySelectorAll(".main-nav a[href^='#']").forEach(link => {
    link.classList.toggle("active", link.getAttribute("href") === `#${route}`);
  });
  document.querySelector(".main-nav").classList.remove("open");
  document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
  window.scrollTo(0, 0);
}
document.addEventListener("trustgift-language-change", () => {
  renderRoute();
  loadActiveRouteData().catch(error => {
    console.error("Could not reload this page after changing language.", error);
    showToast(`Could not load page data: ${authErrorMessage(error)}`);
  });
});

window.addEventListener("hashchange", () => {
  renderRoute();
  loadActiveRouteData().catch(error => {
    console.error("Could not load this page's data.", error);
    showToast(`Could not load page data: ${authErrorMessage(error)}`);
  });
});
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
  document.querySelector("#gifts-referral-count").textContent = "0";
  document.querySelector("#referrals-total").textContent = "0";
  document.querySelector("#referrals-active").textContent = "0";
  document.querySelector("#referrals-inactive").textContent = "0";
  document.querySelector("#profile-private-details").textContent = "Sign in to view your email and invite code.";
  document.querySelector("#profile-info-status").textContent = "";
  document.querySelector("#profile-info-form").reset();
  document.querySelector("#profile-contact-form").reset();
  document.querySelector("#profile-contact-status").textContent = "";
  document.querySelector("#leaderboard-opt-in").checked = false;
  referralsCache = [];
  selectedSupportThreadId = null;
  selectedAdminThreadId = null;
  selectedAdminThreadStatus = null;
  supportThreadsCache = [];
  profileMethods.length = 0;
  renderProfileMethods();
}

async function loadProfile(user) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, username, first_name, last_name, country, referral_code, leaderboard_opt_in")
    .eq("id", user.id)
    .single();
  if (error) throw error;

  const [
    { data: referralStats, error: referralStatsError },
    { data: referrals, error: referralsError },
    { data: contacts, error: contactsError },
    { data: methods, error: methodsError }
  ] = await Promise.all([
    supabaseClient.rpc("my_referral_stats"),
    supabaseClient.rpc("my_referrals"),
    supabaseClient.from("profile_contacts").select("*").eq("user_id", user.id).maybeSingle(),
    supabaseClient.from("member_payment_methods")
      .select("id, method_type, currency, display_label, status, is_default")
      .eq("user_id", user.id)
      .order("created_at")
  ]);
  if (referralStatsError) throw referralStatsError;
  if (referralsError) throw referralsError;
  if (contactsError) throw contactsError;
  if (methodsError) throw methodsError;

  currentProfile = profile;
  const totalReferrals = referralStats?.[0]?.total_referrals ?? 0;
  const activeReferrals = referralStats?.[0]?.active_referrals ?? 0;
  document.querySelector("#welcome-heading").textContent = `Good to see you again, ${profile.first_name}`;
  document.querySelector("#profile-full-name").textContent = `${profile.first_name} ${profile.last_name}`;
  document.querySelector("#profile-username").textContent = `@${profile.username}`;
  document.querySelector(".member-account strong").textContent = `@${profile.username}`;
  document.querySelector(".member-account small").textContent = profile.referral_code;
  document.querySelector("#referral-count").textContent = String(totalReferrals);
  document.querySelector("#gifts-referral-count").textContent = String(activeReferrals);
  document.querySelector("#milestone-count").textContent = String(activeReferrals);
  document.querySelector("#referrals-total").textContent = String(totalReferrals);
  document.querySelector("#referrals-active").textContent = String(activeReferrals);
  document.querySelector("#referrals-inactive").textContent = String(totalReferrals - activeReferrals);
  referralsCache = referrals ?? [];
  renderReferralList();
  document.querySelector("#profile-info-form").elements.firstName.value = profile.first_name;
  document.querySelector("#profile-info-form").elements.lastName.value = profile.last_name;
  document.querySelector("#profile-info-form").elements.username.value = profile.username;
  document.querySelector("#profile-country").value = profile.country;
  document.querySelector("#leaderboard-opt-in").checked = profile.leaderboard_opt_in;
  updateProfilePixAvailability();
  const contactForm = document.querySelector("#profile-contact-form");
  contactForm.elements.phoneCountry.value = contacts?.phone_country_code ?? "+1";
  contactForm.elements.phone.value = contacts?.phone_number ?? "";
  contactForm.elements.whatsappCountry.value = contacts?.whatsapp_country_code ?? "+1";
  contactForm.elements.whatsapp.value = contacts?.whatsapp_number ?? "";
  profileMethods.splice(0, profileMethods.length, ...(methods ?? []));
  renderProfileMethods();
  document.querySelector("#profile-private-details").textContent = `${user.email || ""} · Invite code ${profile.referral_code}`;

  const referralUrl = new URL("./", window.TRUSTGIFT_SUPABASE_CONFIG.siteUrl);
  referralUrl.searchParams.set("ref", profile.referral_code);
  referralUrl.hash = "join";
  document.querySelector("#referral-link").textContent = referralUrl.toString();
  document.querySelector("#referrals-link").textContent = referralUrl.toString();
}

async function applySession(session) {
  if (!session?.user) {
    setSignedOutView();
    renderRoute();
    await loadActiveRouteData();
    return;
  }

  currentUser = session.user;
  body.classList.add("authenticated");
  renderRoute();
  try {
    await loadProfile(session.user);
    await loadActiveRouteData();
    await redeemSupportInvitation();
  } catch (error) {
    console.error("Could not load the signed-in profile.", error);
    showToast(t("Could not load your profile: {error}", { error: authErrorMessage(error) }));
  }
}

async function throwSupportFunctionError(error) {
  if (error?.context instanceof Response) {
    let responseBody = null;
    try {
      responseBody = await error.context.clone().json();
    } catch (parseError) {
      console.warn("Could not parse the support invitation error response.", parseError);
    }
    if (typeof responseBody?.error === "string") throw new Error(responseBody.error);
  }
  throw error;
}

async function redeemSupportInvitation() {
  if (!pendingSupportInviteToken || !currentUser || !currentUser.email_confirmed_at
      || supportInviteAttemptedFor === currentUser.id) return;

  supportInviteAttemptedFor = currentUser.id;
  try {
    const { data, error } = await supabaseClient.functions.invoke("support-invitations", {
      body: { action: "redeem", token: pendingSupportInviteToken }
    });
    if (error) await throwSupportFunctionError(error);
    if (data?.ok !== true) throw new Error("The support invitation could not be verified.");

    const { data: refreshed, error: refreshError } = await supabaseClient.auth.refreshSession();
    if (refreshError) throw refreshError;
    currentUser = refreshed.session?.user ?? currentUser;
    pendingSupportInviteToken = null;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("support_invite");
    window.history.replaceState(null, "", cleanUrl.toString());
    renderRoute();
    if (isSupportAgent()) location.hash = "#support-admin";
    showToast(t("Support access activated."));
  } catch (error) {
    console.error("Could not redeem the support invitation.", error);
    showToast(t("Could not activate support access: {error}", { error: authErrorMessage(error) }));
  }
}

async function initializeSupabase() {
  const config = window.TRUSTGIFT_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey || !config?.siteUrl) {
    const message = "Supabase is not configured. Add its project URL, publishable key, and public site URL to supabase-config.js.";
    setAuthStatus("signup-status", message);
    setAuthStatus("signin-status", message);
    return;
  }

  try {
    const publicSiteUrl = new URL(config.siteUrl);
    if (publicSiteUrl.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(publicSiteUrl.hostname)) {
      throw new Error("The Supabase email redirect must use the public HTTPS site URL.");
    }
    publicSiteUrl.search = "";
    publicSiteUrl.hash = "";
    publicSiteUrl.pathname = `${publicSiteUrl.pathname.replace(/\/+$/, "")}/`;
    if (pendingSupportInviteToken) {
      publicSiteUrl.searchParams.set("support_invite", pendingSupportInviteToken);
    }
    authRedirectUrl = publicSiteUrl.toString();

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabaseClient = createClient(config.url, config.publishableKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
    });
    supabaseClient.auth.onAuthStateChange(event => {
      if (event === "PASSWORD_RECOVERY") passwordRecoveryRedirect = true;
    });

    const health = await fetch(`${config.url.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: config.publishableKey }
    });
    if (!health.ok) throw new Error(`Supabase returned HTTP ${health.status}`);

    const [
      { data: workflowsReady, error: workflowsError },
      { data: supportManagementReady, error: supportManagementError }
    ] = await Promise.all([
      supabaseClient.rpc("member_workflows_ready"),
      supabaseClient.rpc("support_agent_management_ready")
    ]);
    if (workflowsError || workflowsReady !== true
        || supportManagementError || supportManagementReady !== true) {
      console.error("Supabase is reachable, but required migrations are not ready.", {
        workflowsError,
        supportManagementError
      });
      setAuthStatus("signup-status", "Supabase is reachable, but required database migrations are missing. Run all SQL migrations before creating accounts.");
      setAuthStatus("signin-status", "Supabase is reachable, but required database migrations are missing. Run all SQL migrations before signing in.");
      return;
    }
    schemaReady = true;

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    await applySession(data.session);
    if (passwordRecoveryRedirect) {
      passwordRecoveryRedirect = false;
      location.hash = "#password-reset";
    }
    setAuthStatus("signup-status", "Supabase is connected and the database schema is ready.");
    setAuthStatus("signin-status", "Sign-in is handled by Supabase Auth.");

    supabaseClient.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (event === "PASSWORD_RECOVERY") location.hash = "#password-reset";
        applySession(session).catch(error => {
          console.error("Could not update the signed-in profile.", error);
          showToast(t("Could not load your profile: {error}", { error: authErrorMessage(error) }));
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
  window.TRUSTGIFT_I18N?.setLanguage(button.dataset.lang);
  updateNetworkWarning();
}));

document.querySelectorAll(".level-action:not(:disabled)").forEach(button => button.addEventListener("click", () => {
  showToast("Bronze board preview — demo only.");
}));

const paymentTabs = document.querySelectorAll("#payments .payment-tab");
const paymentOptions = document.querySelector("#payment-options");
const paymentDetail = document.querySelector("#payment-detail");
const paymentLabel = document.querySelector("#payment-label");
const cryptoFields = document.querySelector("#crypto-fields");
const paymentNetwork = document.querySelector("#payment-network");
const cryptoAddress = document.querySelector("#crypto-address");
const networkWarning = document.querySelector("#network-warning");
const pixTab = document.querySelector('.payment-tab[data-method="Pix"]');
const countrySelect = document.querySelector("#country-select");
let selectedPayment = "Crypto";
let selectedPaymentCurrency = "USDT";

function updateNetworkWarning() {
  const network = paymentNetwork.options[paymentNetwork.selectedIndex].textContent;
  networkWarning.textContent = t("Send only {currency} over {network}. A transfer on another network may be lost.")
    .replace("{currency}", selectedPaymentCurrency)
    .replace("{network}", network);
  cryptoAddress.placeholder = paymentNetwork.value === "solana" ? t("Solana address") : "0x...";
}

function updatePixAvailability() {
  const isBrazil = countrySelect.value === "Brazil";
  pixTab.hidden = !isBrazil;
  if (!isBrazil) {
    const pixMethods = document.querySelectorAll('.added-method[data-method="pix"]');
    pixMethods.forEach(method => method.remove());
    if (selectedPayment === "Pix") {
      document.querySelector('.payment-tab[data-method="Crypto"]').click();
    }
  }
}

function updatePaymentFields() {
  const isCrypto = selectedPayment === "Crypto";
  const isPix = selectedPayment === "Pix";
  paymentOptions.hidden = !isCrypto;
  cryptoFields.hidden = !isCrypto;
  paymentDetail.hidden = isCrypto;
  if (!isCrypto) cryptoAddress.value = "";
  paymentLabel.textContent = isPix
    ? "Pix preference saved as pending setup. No Pix key is collected."
    : `${selectedPayment} preference saved as pending setup. No account details are collected.`;
  if (isCrypto) {
    const selectedChoice = document.querySelector("#payment-options .choice.selected");
    selectedPaymentCurrency = selectedChoice?.textContent.includes("USDC") ? "USDC" : "USDT";
    updateNetworkWarning();
  }
}

countrySelect.addEventListener("change", updatePixAvailability);
updatePixAvailability();
updatePaymentFields();

paymentTabs.forEach(button => button.addEventListener("click", () => {
  if (button.dataset.method === "Pix" && countrySelect.value !== "Brazil") return;
  selectedPayment = button.dataset.method;
  paymentTabs.forEach(tab => tab.classList.toggle("active", tab === button));
  updatePaymentFields();
}));

document.querySelectorAll("#payment-options .choice").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("#payment-options .choice").forEach(choice => choice.classList.toggle("selected", choice === button));
  selectedPaymentCurrency = button.textContent.includes("USDC") ? "USDC" : "USDT";
  updateNetworkWarning();
}));

paymentNetwork.addEventListener("change", updateNetworkWarning);

function isValidCryptoAddress(network, address) {
  if (network === "tron") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  if (network === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

document.querySelector(".secondary-copy").addEventListener("click", async event => {
  if (!currentProfile) {
    showToast("Sign in to get your personal referral link.");
    return;
  }
  try {
    await navigator.clipboard.writeText(document.querySelector("#referrals-link").textContent);
    event.currentTarget.textContent = "✓ Copied";
    showToast("Referral link copied to clipboard.");
  } catch {
    showToast("Could not copy the referral link.");
  }
});

function renderReferralList() {
  const list = document.querySelector("#referral-list");
  const filter = document.querySelector(".filter-tab.active")?.dataset.filter ?? "all";
  const rows = referralsCache.filter(referral =>
    filter === "all" || (filter === "active" ? referral.is_active : !referral.is_active)
  );
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.textContent = filter === "all"
      ? "No referrals yet. Share your invite link."
      : filter === "active"
        ? "No email-confirmed referrals yet."
        : "No referrals awaiting email confirmation.";
    list.append(empty);
    return;
  }
  rows.forEach(referral => {
    const row = document.createElement("div");
    row.className = "referral-row";
    const username = document.createElement("strong");
    username.dataset.i18nIgnore = "";
    username.textContent = `@${referral.username}`;
    const status = document.createElement("span");
    status.className = referral.is_active ? "status-active" : "status-pending";
    status.textContent = referral.is_active ? "Email confirmed" : "Awaiting confirmation";
    row.append(username, status);
    list.append(row);
  });
}

document.querySelectorAll(".filter-tab").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".filter-tab").forEach(tab => {
    const active = tab === button;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  renderReferralList();
}));

const supportMessage = document.querySelector("#support-message");
const sendSupportMessage = document.querySelector("#send-support-message");
const supportAttachment = document.querySelector("#support-attachment");
const supportStatus = document.querySelector("#support-status");
const acceptedAttachmentTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
supportMessage.addEventListener("input", () => {
  sendSupportMessage.disabled = supportMessage.value.trim().length === 0 && !supportAttachment.files[0];
});

async function renderSupportMessages(container, messages, ownUserId) {
  container.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement("p");
    empty.textContent = "No messages yet. Send your question to Support.";
    container.append(empty);
    return;
  }
  for (const message of messages) {
    const bubble = document.createElement("article");
    bubble.className = `chat-message${message.sender_id === ownUserId ? " own" : ""}`;
    if (message.body) {
      const bodyText = document.createElement("p");
      bodyText.textContent = message.body;
      bubble.append(bodyText);
    }
    if (message.attachment_path) {
      const { data, error } = await supabaseClient.storage
        .from("support-attachments")
        .createSignedUrl(message.attachment_path, 600);
      if (error) throw error;
      const attachment = document.createElement("a");
      attachment.href = data.signedUrl;
      attachment.target = "_blank";
      attachment.rel = "noopener noreferrer";
      attachment.textContent = message.attachment_name || "Open attachment";
      bubble.append(attachment);
    }
    const timestamp = document.createElement("small");
    timestamp.textContent = new Date(message.created_at).toLocaleString(
      window.TRUSTGIFT_I18N?.getLocale() ?? navigator.language
    );
    bubble.append(timestamp);
    container.append(bubble);
  }
  container.scrollTop = container.scrollHeight;
}

async function loadSupportThread() {
  if (!currentUser) {
    supportStatus.textContent = "Sign in to send a private message to Support.";
    document.querySelector("#chat-messages").replaceChildren();
    return;
  }
  const { data: thread, error: threadError } = await supabaseClient
    .from("support_threads")
    .select("id, status")
    .eq("user_id", currentUser.id)
    .in("status", ["open", "waiting"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (threadError) throw threadError;
  selectedSupportThreadId = thread?.id ?? null;
  if (!thread) {
    document.querySelector("#chat-messages").innerHTML = "";
    supportStatus.textContent = "Messages are private to you and authorized support agents.";
    return;
  }
  const { data: messages, error: messagesError } = await supabaseClient
    .from("support_messages")
    .select("id, sender_id, body, attachment_path, attachment_name, created_at")
    .eq("thread_id", thread.id)
    .order("created_at")
    .limit(100);
  if (messagesError) throw messagesError;
  await renderSupportMessages(document.querySelector("#chat-messages"), messages ?? [], currentUser.id);
  supportStatus.textContent = thread.status === "waiting"
    ? "Support has replied. Send a message if you need more help."
    : "Messages are private to you and authorized support agents.";
}

async function ensureSupportThread() {
  if (selectedSupportThreadId) return selectedSupportThreadId;
  const { data: existing, error: lookupError } = await supabaseClient
    .from("support_threads")
    .select("id")
    .eq("user_id", currentUser.id)
    .in("status", ["open", "waiting"])
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    selectedSupportThreadId = existing.id;
    return existing.id;
  }
  const { data: created, error: createError } = await supabaseClient
    .from("support_threads")
    .insert({ user_id: currentUser.id })
    .select("id")
    .single();
  if (createError) throw createError;
  selectedSupportThreadId = created.id;
  return created.id;
}

async function submitSupportMessage() {
  const message = supportMessage.value.trim();
  const file = supportAttachment.files[0];
  if (!currentUser) {
    showToast("Sign in before messaging Support.");
    location.hash = "#signin";
    return;
  }
  if (!message && !file) return;
  sendSupportMessage.disabled = true;
  supportStatus.textContent = "Sending securely…";
  let uploadedPath = null;
  try {
    const threadId = await ensureSupportThread();
    if (file) {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120);
      uploadedPath = `${currentUser.id}/${threadId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabaseClient.storage
        .from("support-attachments")
        .upload(uploadedPath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
    }
    const { error } = await supabaseClient.from("support_messages").insert({
      thread_id: threadId,
      sender_id: currentUser.id,
      body: message,
      attachment_path: uploadedPath,
      attachment_name: file?.name ?? null,
      attachment_mime: file?.type ?? null
    });
    if (error) throw error;
    supportMessage.value = "";
    supportAttachment.value = "";
    sendSupportMessage.disabled = true;
    await loadSupportThread();
  } catch (error) {
    if (uploadedPath) {
      const { error: cleanupError } = await supabaseClient.storage.from("support-attachments").remove([uploadedPath]);
      if (cleanupError) console.error("Could not clean up an unused support attachment.", cleanupError);
    }
    console.error("Could not send support message.", error);
    supportStatus.textContent = `Could not send message: ${authErrorMessage(error)}`;
    sendSupportMessage.disabled = false;
  }
}

sendSupportMessage.addEventListener("click", submitSupportMessage);
supportMessage.addEventListener("keydown", event => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submitSupportMessage();
  }
});

supportAttachment.addEventListener("change", event => {
  const file = event.currentTarget.files[0];
  if (file && (!acceptedAttachmentTypes.includes(file.type) || file.size > 8 * 1024 * 1024)) {
    event.currentTarget.value = "";
    showToast("Choose a JPG, PNG, GIF, WebP or PDF file up to 8 MB.");
  }
  sendSupportMessage.disabled = supportMessage.value.trim().length === 0 && !event.currentTarget.files[0];
});

function renderLeaderboard(records) {
  const rows = document.querySelector("#leaderboard-rows");
  rows.replaceChildren();
  const hallOfFame = document.querySelector("#reward-leaderboard");
  hallOfFame.replaceChildren();
  if (!records.length) {
    const emptyRow = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "leaderboard-empty";
    cell.textContent = "No members have opted in to the ranking.";
    emptyRow.append(cell);
    rows.append(emptyRow);
    const emptyItem = document.createElement("li");
    emptyItem.className = "leaderboard-empty";
    emptyItem.textContent = "No members have opted in to the ranking.";
    hallOfFame.append(emptyItem);
    return;
  }
  const countryCodes = { Brazil: "BR", Canada: "CA", France: "FR", Haiti: "HT", Spain: "ES", "United States": "US" };
  records.forEach(record => {
    const positionNumber = Number(record.position);
    const row = document.createElement("tr");
    const position = document.createElement("td");
    position.className = positionNumber <= 3 ? "medal" : "";
    position.textContent = positionNumber === 1 ? "♛" : positionNumber <= 3 ? "♢" : `#${positionNumber}`;
    const username = document.createElement("td");
    username.dataset.i18nIgnore = "";
    username.textContent = `@${record.username}`;
    const country = document.createElement("td");
    country.textContent = `${countryCodes[record.country] ?? ""} ${record.country}`.trim();
    const referrals = document.createElement("td");
    referrals.textContent = `♧ ${record.active_referrals}`;
    row.append(position, username, country, referrals);
    rows.append(row);

    const listItem = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = `rank-number ${positionNumber === 1 ? "gold" : positionNumber === 2 ? "silver" : "bronze"}`;
    rank.textContent = String(positionNumber);
    const identity = document.createElement("span");
    const listName = document.createElement("strong");
    listName.dataset.i18nIgnore = "";
    listName.textContent = `@${record.username}`;
    const listCountry = document.createElement("small");
    listCountry.textContent = record.country;
    identity.append(listName, listCountry);
    const count = document.createElement("strong");
    count.textContent = String(record.active_referrals);
    const countLabel = document.createElement("small");
    countLabel.textContent = "CONFIRMED REFERRALS";
    count.append(countLabel);
    listItem.append(rank, identity, count);
    hallOfFame.append(listItem);
  });
}

async function loadLeaderboard() {
  const { data, error } = await supabaseClient.rpc("public_leaderboard");
  if (error) throw error;
  renderLeaderboard(data ?? []);
}

function renderSupportThreadList(threads) {
  const list = document.querySelector("#support-thread-list");
  list.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "support-thread-list-heading";
  const title = document.createElement("strong");
  title.textContent = "Conversations";
  const refresh = document.createElement("button");
  refresh.className = "icon-button";
  refresh.type = "button";
  refresh.textContent = "↻";
  refresh.setAttribute("aria-label", "Refresh conversations");
  refresh.addEventListener("click", () => loadSupportInbox().catch(error => {
    console.error("Could not refresh support conversations.", error);
    showToast(`Could not refresh inbox: ${authErrorMessage(error)}`);
  }));
  heading.append(title, refresh);
  list.append(heading);
  if (!threads.length) {
    const empty = document.createElement("p");
    empty.textContent = "No support conversations.";
    list.append(empty);
    return;
  }
  threads.forEach(thread => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `support-thread-choice${thread.id === selectedAdminThreadId ? " active" : ""}`;
    button.textContent = `${thread.user_id.slice(0, 8)} · ${thread.status}`;
    button.addEventListener("click", () => loadAdminThread(thread).catch(error => {
      console.error("Could not load support conversation.", error);
      showToast(`Could not load conversation: ${authErrorMessage(error)}`);
    }));
    list.append(button);
  });
}

async function loadAdminThread(thread) {
  selectedAdminThreadId = thread.id;
  selectedAdminThreadStatus = thread.status;
  document.querySelector("#admin-thread-title").textContent = `Member ${thread.user_id}`;
  document.querySelector("#admin-support-reply").disabled = thread.status === "closed";
  document.querySelector("#send-support-reply").disabled = thread.status === "closed";
  document.querySelector("#close-support-thread").disabled = thread.status === "closed";
  document.querySelector("#close-support-thread").textContent = thread.status === "closed" ? "Closed" : "Close conversation";
  const { data: messages, error } = await supabaseClient
    .from("support_messages")
    .select("id, sender_id, body, attachment_path, attachment_name, created_at")
    .eq("thread_id", thread.id)
    .order("created_at")
    .limit(100);
  if (error) throw error;
  await renderSupportMessages(document.querySelector("#admin-chat-messages"), messages ?? [], currentUser.id);
  document.querySelector("#send-support-reply").disabled =
    thread.status === "closed" || document.querySelector("#admin-support-reply").value.trim().length === 0;
  renderSupportThreadList(supportThreadsCache);
}

async function loadSupportInbox() {
  if (!isSupportAgent()) return;
  const { data: threads, error } = await supabaseClient
    .from("support_threads")
    .select("id, user_id, status, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  supportThreadsCache = (threads ?? []).sort((first, second) => {
    if ((first.status === "closed") !== (second.status === "closed")) return first.status === "closed" ? 1 : -1;
    return new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime();
  });
  renderSupportThreadList(supportThreadsCache);
  const selected = supportThreadsCache.find(thread => thread.id === selectedAdminThreadId)
    ?? supportThreadsCache[0];
  if (selected) {
    await loadAdminThread(selected);
  } else {
    selectedAdminThreadId = null;
    document.querySelector("#admin-thread-title").textContent = "No conversations";
    document.querySelector("#admin-chat-messages").replaceChildren();
    document.querySelector("#admin-support-reply").disabled = true;
    document.querySelector("#send-support-reply").disabled = true;
    document.querySelector("#close-support-thread").disabled = true;
  }
}

document.querySelector("#admin-support-reply").addEventListener("input", event => {
  document.querySelector("#send-support-reply").disabled = event.currentTarget.value.trim().length === 0;
});

document.querySelector("#send-support-reply").addEventListener("click", async event => {
  const bodyText = document.querySelector("#admin-support-reply").value.trim();
  if (!selectedAdminThreadId || !bodyText || !isSupportAgent() || selectedAdminThreadStatus === "closed") return;
  event.currentTarget.disabled = true;
  try {
    const { error } = await supabaseClient.from("support_messages").insert({
      thread_id: selectedAdminThreadId,
      sender_id: currentUser.id,
      body: bodyText
    });
    if (error) throw error;
    document.querySelector("#admin-support-reply").value = "";
    await loadSupportInbox();
  } catch (error) {
    console.error("Could not send support reply.", error);
    document.querySelector("#admin-support-status").textContent = `Could not send reply: ${authErrorMessage(error)}`;
    event.currentTarget.disabled = false;
  }
});

document.querySelector("#close-support-thread").addEventListener("click", async event => {
  if (!selectedAdminThreadId || !isSupportAgent()) return;
  event.currentTarget.disabled = true;
  try {
    const { error } = await supabaseClient
      .from("support_threads")
      .update({ status: "closed" })
      .eq("id", selectedAdminThreadId);
    if (error) throw error;
    selectedAdminThreadId = null;
    await loadSupportInbox();
  } catch (error) {
    console.error("Could not close support conversation.", error);
    showToast(`Could not close conversation: ${authErrorMessage(error)}`);
    event.currentTarget.disabled = false;
  }
});

async function loadActiveRouteData() {
  if (!supabaseClient || !schemaReady) return;
  const route = location.hash.slice(1);
  if (route === "leaderboard") {
    await loadLeaderboard();
  } else if (route === "support" && currentUser) {
    await loadSupportThread();
  } else if (route === "support-admin" && isSupportAgent()) {
    await loadSupportInbox();
  } else if (route === "admin-tools" && isTrustGiftAdmin()) {
    await loadSupportAccess();
  }
}

const supportInvitationForm = document.querySelector("#support-invitation-form");

function renderSupportAccess(data) {
  const agentList = document.querySelector("#support-agent-list");
  const invitationList = document.querySelector("#support-invitation-list");
  agentList.replaceChildren();
  invitationList.replaceChildren();

  if (!data.agents.length) {
    agentList.textContent = t("No support agents.");
  }
  data.agents.forEach(agent => {
    const row = document.createElement("div");
    row.className = "support-access-row";
    const label = document.createElement("span");
    label.textContent = agent.email || agent.userId;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button";
    remove.textContent = t("Remove");
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await invokeSupportAdminAction({ action: "remove_agent", userId: agent.userId });
        await loadSupportAccess();
      } catch (error) {
        console.error("Could not remove support access.", error);
        document.querySelector("#support-access-status").textContent =
          t("Could not remove support access: {error}", { error: authErrorMessage(error) });
        remove.disabled = false;
      }
    });
    row.append(label, remove);
    agentList.append(row);
  });

  if (!data.invitations.length) {
    invitationList.textContent = t("No support invitations.");
  }
  data.invitations.forEach(invitation => {
    const row = document.createElement("div");
    row.className = "support-access-row";
    const details = document.createElement("span");
    const expires = new Date(invitation.expires_at).toLocaleString(
      window.TRUSTGIFT_I18N?.getLocale() ?? navigator.language
    );
    details.textContent = `${invitation.email} · ${t(invitation.status)} · ${expires}`;
    row.append(details);
    if (invitation.status === "pending") {
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.className = "button";
      revoke.textContent = t("Revoke");
      revoke.addEventListener("click", async () => {
        revoke.disabled = true;
        try {
          await invokeSupportAdminAction({ action: "revoke", invitationId: invitation.id });
          await loadSupportAccess();
        } catch (error) {
          console.error("Could not revoke support invitation.", error);
          document.querySelector("#support-access-status").textContent =
            t("Could not revoke invitation: {error}", { error: authErrorMessage(error) });
          revoke.disabled = false;
        }
      });
      row.append(revoke);
    }
    invitationList.append(row);
  });
}

async function invokeSupportAdminAction(body) {
  const { data, error } = await supabaseClient.functions.invoke("support-invitations", { body });
  if (error) await throwSupportFunctionError(error);
  if (!data) throw new Error("The support access service returned no response.");
  return data;
}

async function loadSupportAccess() {
  const status = document.querySelector("#support-access-status");
  status.textContent = t("Loading support access…");
  try {
    const data = await invokeSupportAdminAction({ action: "list" });
    if (!Array.isArray(data.agents) || !Array.isArray(data.invitations)) {
      throw new Error("The support access service returned invalid data.");
    }
    renderSupportAccess(data);
    status.textContent = "";
  } catch (error) {
    console.error("Could not load support access.", error);
    status.textContent = t("Could not load support access: {error}", { error: authErrorMessage(error) });
  }
}

document.querySelector("#refresh-support-access").addEventListener("click", () => {
  loadSupportAccess();
});

supportInvitationForm.addEventListener("submit", async event => {
  event.preventDefault();
  const status = document.querySelector("#support-invitation-status");
  const result = document.querySelector("#support-invitation-result");
  const submitButton = supportInvitationForm.querySelector('button[type="submit"]');
  if (!supabaseClient || !schemaReady || !currentUser || !isTrustGiftAdmin()) {
    status.textContent = t("Only a TrustGift administrator can create support invitations.");
    return;
  }

  submitButton.disabled = true;
  result.hidden = true;
  status.textContent = t("Creating invitation link…");
  try {
    const data = await invokeSupportAdminAction({
      action: "create",
      email: String(new FormData(supportInvitationForm).get("email")).trim()
    });
    if (typeof data?.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(data.token)) {
      throw new Error("The invitation service returned an invalid link.");
    }

    const inviteUrl = new URL(window.TRUSTGIFT_SUPABASE_CONFIG.siteUrl);
    inviteUrl.search = "";
    inviteUrl.searchParams.set("support_invite", data.token);
    inviteUrl.hash = "join";
    const link = document.querySelector("#support-invitation-link");
    link.href = inviteUrl.toString();
    link.textContent = inviteUrl.toString();
    result.hidden = false;
    status.textContent = t("Invitation link created. Share it with the invited person. It expires in 7 days.");
    supportInvitationForm.reset();
    await loadSupportAccess();
  } catch (error) {
    console.error("Could not create the support invitation.", error);
    status.textContent = t("Could not create support invitation: {error}", {
      error: authErrorMessage(error)
    });
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#copy-support-invitation").addEventListener("click", async () => {
  const status = document.querySelector("#support-invitation-status");
  const link = document.querySelector("#support-invitation-link").href;
  try {
    await navigator.clipboard.writeText(link);
    status.textContent = t("Invitation link copied.");
  } catch (error) {
    console.error("Could not copy the support invitation link.", error);
    status.textContent = t("Could not copy invitation link: {error}", {
      error: authErrorMessage(error)
    });
  }
});

const profileInfoForm = document.querySelector("#profile-info-form");
profileInfoForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabaseClient || !schemaReady || !currentUser) {
    document.querySelector("#profile-info-status").textContent = "Sign in and apply the database migration to save profile changes.";
    return;
  }
  const formData = new FormData(profileInfoForm);
  const changes = {
    first_name: String(formData.get("firstName")).trim(),
    last_name: String(formData.get("lastName")).trim(),
    country: String(formData.get("country")).trim(),
    leaderboard_opt_in: formData.get("leaderboardOptIn") === "on"
  };
  const saveButton = profileInfoForm.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  document.querySelector("#profile-info-status").textContent = "Saving…";
  try {
    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .update(changes)
      .eq("id", currentUser.id)
      .select("id, username, first_name, last_name, country, referral_code, leaderboard_opt_in")
      .single();
    if (error) throw error;
    currentProfile = profile;
    await loadProfile(currentUser);
    document.querySelector("#profile-info-status").textContent = "Profile updated.";
  } catch (error) {
    console.error("Could not save profile changes.", error);
    document.querySelector("#profile-info-status").textContent = `Could not save profile: ${authErrorMessage(error)}`;
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector("#profile-contact-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const phone = String(formData.get("phone")).trim();
  const whatsapp = String(formData.get("whatsapp")).trim();
  const phoneCountry = String(formData.get("phoneCountry")).trim();
  const whatsappCountry = String(formData.get("whatsappCountry")).trim();
  const status = document.querySelector("#profile-contact-status");
  if (!currentUser || !schemaReady) {
    status.textContent = "Sign in and apply the member-data migration to save contact details.";
    return;
  }
  if ((phone && !phoneCountry) || (whatsapp && !whatsappCountry)) {
    status.textContent = "Choose a country calling code for each number.";
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  status.textContent = "Saving…";
  try {
    const { error } = await supabaseClient.from("profile_contacts").upsert({
      user_id: currentUser.id,
      phone_country_code: phone ? phoneCountry : null,
      phone_number: phone || null,
      whatsapp_country_code: whatsapp ? whatsappCountry : null,
      whatsapp_number: whatsapp || null,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) throw error;
    status.textContent = "Contact details saved privately.";
  } catch (error) {
    console.error("Could not save contact details.", error);
    status.textContent = `Could not save contact details: ${authErrorMessage(error)}`;
  } finally {
    button.disabled = false;
  }
});

const profileCountry = document.querySelector("#profile-country");
const profileMethodTabs = document.querySelectorAll(".profile-payment-tab");
const profilePaymentOptions = document.querySelector("#profile-payment-options");
const profilePaymentDetail = document.querySelector("#profile-payment-detail");
const profilePaymentLabel = document.querySelector("#profile-payment-label");
const profilePixTab = document.querySelector('.profile-payment-tab[data-profile-method="Pix"]');
const profileMethods = [];
let selectedProfileMethod = "Crypto";

function renderProfileMethods() {
  const list = document.querySelector("#profile-method-list");
  list.replaceChildren();
  if (profileMethods.length === 0) {
    const empty = document.createElement("p");
    empty.className = "profile-empty";
    empty.textContent = "No payment methods added.";
    list.append(empty);
    return;
  }
  profileMethods.forEach((method, index) => {
    const row = document.createElement("div");
    row.className = `profile-method${method.is_default ? " default" : ""}`;
    const icon = document.createElement("span");
    icon.textContent = { crypto: "₿", zelle: "ϟ", cash_app: "$", moncash: "▣", natcash: "▣", pix: "▣" }[method.method_type];
    const info = document.createElement("div");
    info.className = "profile-method-info";
    const name = document.createElement("strong");
    name.textContent = method.display_label;
    if (method.is_default) {
      const badge = document.createElement("small");
      badge.textContent = "Default";
      name.append("  ", badge);
    }
    const detail = document.createElement("small");
    detail.textContent = method.status === "ready"
      ? "Provider connected"
      : method.status === "disabled"
        ? "Unavailable for the selected country"
        : "Provider setup required";
    info.append(name, detail);
    row.append(icon, info);
    if (method.status === "pending_setup") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${method.display_label}`);
      remove.textContent = "♲";
      remove.addEventListener("click", async () => {
        remove.disabled = true;
        try {
          const { error } = await supabaseClient
            .from("member_payment_methods")
            .delete()
            .eq("id", method.id)
            .eq("user_id", currentUser.id);
          if (error) throw error;
          profileMethods.splice(index, 1);
          renderProfileMethods();
        } catch (error) {
          console.error("Could not remove payment preference.", error);
          showToast(`Could not remove payment preference: ${authErrorMessage(error)}`);
          remove.disabled = false;
        }
      });
      row.append(remove);
    }
    list.append(row);
  });
}

function updateProfilePixAvailability() {
  const isBrazil = profileCountry.value === "Brazil";
  profilePixTab.hidden = !isBrazil;
  if (!isBrazil && selectedProfileMethod === "Pix") {
    document.querySelector('.profile-payment-tab[data-profile-method="Crypto"]').click();
  }
}

profileCountry.addEventListener("change", updateProfilePixAvailability);
updateProfilePixAvailability();
renderProfileMethods();

profileMethodTabs.forEach(button => button.addEventListener("click", () => {
  const method = button.dataset.profileMethod;
  if (method === "Pix" && profileCountry.value !== "Brazil") return;
  selectedProfileMethod = method;
  profileMethodTabs.forEach(tab => tab.classList.toggle("active", tab === button));
  const isCrypto = method === "Crypto";
  const isPix = method === "Pix";
  profilePaymentOptions.hidden = !isCrypto;
  profilePaymentDetail.hidden = isCrypto;
  document.querySelector("#cancel-profile-method").hidden = isCrypto;
  profilePaymentLabel.textContent = isPix
    ? "Pix preference only. No Pix key is collected or stored."
    : `${method} preference only. No account details are collected or stored.`;
}));

document.querySelectorAll("#profile-payment-options .choice").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("#profile-payment-options .choice").forEach(choice => choice.classList.toggle("selected", choice === button));
}));

document.querySelector("#add-profile-method").addEventListener("click", async event => {
  if (!currentUser || !schemaReady) {
    showToast("Sign in and apply the member-data migration to save a payment preference.");
    return;
  }
  const methodCodes = { Crypto: "crypto", Zelle: "zelle", "Cash App": "cash_app", MonCash: "moncash", NatCash: "natcash", Pix: "pix" };
  const currency = selectedProfileMethod === "Crypto"
    ? (document.querySelector("#profile-payment-options .choice.selected")?.textContent.includes("USDC") ? "USDC" : "USDT")
    : null;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const { error } = await supabaseClient.rpc("add_member_payment_method_preference", {
      p_method_type: methodCodes[selectedProfileMethod],
      p_currency: currency
    });
    if (error) throw error;
    const { data: methods, error: methodsError } = await supabaseClient
      .from("member_payment_methods")
      .select("id, method_type, currency, display_label, status, is_default")
      .eq("user_id", currentUser.id)
      .order("created_at");
    if (methodsError) throw methodsError;
    profileMethods.splice(0, profileMethods.length, ...(methods ?? []));
    renderProfileMethods();
    showToast("Preference saved. A payment provider is required before receiving funds.");
  } catch (error) {
    console.error("Could not save payment preference.", error);
    showToast(`Could not save payment preference: ${authErrorMessage(error)}`);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#cancel-profile-method").addEventListener("click", () => {
  document.querySelector('.profile-payment-tab[data-profile-method="Crypto"]').click();
});

document.querySelector("#password-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const currentPassword = form.elements.currentPassword.value;
  const newPassword = form.elements.newPassword.value;
  if (newPassword !== form.elements.confirmPassword.value) {
    showToast("The new passwords do not match.");
    return;
  }
  if (!supabaseClient || !schemaReady || !currentUser?.email) {
    showToast("Sign in and connect Supabase before changing your password.");
    return;
  }
  if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    showToast("The new password must include a letter and a number.");
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error: verifyError } = await supabaseClient.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword
    });
    if (verifyError) throw verifyError;
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
    form.reset();
    showToast("Password updated.");
  } catch (error) {
    console.error("Could not update password.", error);
    showToast(`Could not update password: ${authErrorMessage(error)}`);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#join-view .add-method").addEventListener("click", () => {
  const methodCodes = { Crypto: "crypto", Zelle: "zelle", "Cash App": "cash_app", MonCash: "moncash", NatCash: "natcash", Pix: "pix" };
  const currency = selectedPayment === "Crypto" ? selectedPaymentCurrency : "";
  const methodCode = methodCodes[selectedPayment];
  if (document.querySelector(`.added-method[data-method="${methodCode}"][data-currency="${currency}"]`)) {
    showToast("That payment preference is already selected.");
    return;
  }
  let label = selectedPayment;
  if (selectedPayment === "Crypto") {
    const address = cryptoAddress.value.trim();
    if (!address) {
      showToast("Network and receiving address are required.");
      cryptoAddress.focus();
      return;
    }
    if (!isValidCryptoAddress(paymentNetwork.value, address)) {
      showToast(t("Enter a valid {network} receiving address.")
        .replace("{network}", paymentNetwork.options[paymentNetwork.selectedIndex].textContent));
      cryptoAddress.focus();
      return;
    }
    label = `Crypto · ${currency} · ${paymentNetwork.options[paymentNetwork.selectedIndex].textContent} · ${address}`;
  }
  const row = document.createElement("div");
  row.className = "added-method";
  row.dataset.method = methodCode;
  row.dataset.currency = currency;
  const text = document.createElement("span");
  text.textContent = label;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => row.remove());
  row.append(text, remove);
  document.querySelector("#added-methods").append(row);
  if (selectedPayment === "Crypto") cryptoAddress.value = "";
  showToast("Preference added. The address was not sent to Supabase.");
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
  const termsAccepted = terms.every(input => input.checked);
  const inputsValid = [...joinForm.querySelectorAll("input, select")].every(input => input.validity.valid);
  const password = joinForm.elements.password.value;
  const passwordValid = /[A-Za-z]/.test(password)
    && /\d/.test(password)
    && password === joinForm.elements.confirmPassword.value;
  const contactsValid = (!joinForm.elements.phone.value.trim() || joinForm.elements.phoneCountry.value)
    && (!joinForm.elements.whatsapp.value.trim() || joinForm.elements.whatsappCountry.value);
  const ready = termsAccepted && inputsValid && passwordValid && contactsValid;

  createAccount.disabled = !termsAccepted;
  createAccount.classList.toggle("ready", ready);
}
joinForm.addEventListener("input", updateSubmitState);
joinForm.addEventListener("change", updateSubmitState);
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
  if ((joinForm.elements.phone.value.trim() && !joinForm.elements.phoneCountry.value)
      || (joinForm.elements.whatsapp.value.trim() && !joinForm.elements.whatsappCountry.value)) {
    showToast("Choose a country calling code for each contact number.");
    return;
  }
  const formData = new FormData(joinForm);
  createAccount.disabled = true;
  setAuthStatus("signup-status", "Creating your account…");
  supabaseClient.auth.signUp({
    email: String(formData.get("email")).trim(),
    password,
    options: {
      emailRedirectTo: authRedirectUrl,
      data: {
        first_name: String(formData.get("firstName")).trim(),
        last_name: String(formData.get("lastName")).trim(),
        username: String(formData.get("username")).trim().toLowerCase(),
        country: String(formData.get("country")).trim(),
        referral_code: String(formData.get("referralCode")).trim().toUpperCase(),
        phone: String(formData.get("phone") ?? "").trim(),
        phone_country_code: String(formData.get("phoneCountry") ?? "").trim(),
        whatsapp: String(formData.get("whatsapp") ?? "").trim(),
        whatsapp_country_code: String(formData.get("whatsappCountry") ?? "").trim(),
        payment_preferences: [...document.querySelectorAll("#added-methods .added-method")].map(method => ({
          method_type: method.dataset.method,
          currency: method.dataset.currency || null
        })),
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

document.querySelector("#password-recovery-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector("#password-recovery-status");
  if (!supabaseClient || !schemaReady) {
    status.textContent = t("Connect Supabase before requesting a recovery link.");
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  status.textContent = t("Sending recovery link…");
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(
      String(new FormData(form).get("email")).trim(),
      { redirectTo: authRedirectUrl }
    );
    if (error) throw error;
    status.textContent = t("If an account matches that address, a recovery link has been sent.");
  } catch (error) {
    console.error("Could not request a password recovery link.", error);
    status.textContent = t("Could not send recovery link: {error}", { error: authErrorMessage(error) });
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#password-reset-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector("#password-reset-status");
  const values = new FormData(form);
  const password = String(values.get("password"));
  if (!currentUser || !supabaseClient) {
    status.textContent = t("Open the password recovery link before choosing a new password.");
    return;
  }
  if (password !== values.get("confirmPassword")) {
    status.textContent = t("The new passwords do not match.");
    return;
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    status.textContent = t("The new password must be at least 8 characters and include a letter and a number.");
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  status.textContent = t("Updating password…");
  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;
    form.reset();
    status.textContent = t("Password updated.");
    location.hash = "#dashboard";
  } catch (error) {
    console.error("Could not reset the password.", error);
    status.textContent = t("Could not update password: {error}", { error: authErrorMessage(error) });
  } finally {
    button.disabled = false;
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
