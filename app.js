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
const toast = document.querySelector(".toast");
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderRoute() {
  const isJoin = location.hash === "#join";
  dashboardView.hidden = isJoin;
  joinView.hidden = !isJoin;
  body.classList.toggle("view-dashboard", !isJoin);
  document.title = isJoin ? "Join TrustGift" : "TrustGift — Member area";
  document.querySelector(".main-nav").classList.remove("open");
  document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", renderRoute);
renderRoute();

document.querySelector(".menu-toggle").addEventListener("click", event => {
  const nav = document.querySelector(".main-nav");
  nav.classList.toggle("open");
  event.currentTarget.setAttribute("aria-expanded", String(nav.classList.contains("open")));
});

document.querySelector(".copy-button").addEventListener("click", async event => {
  const referralLink = "https://trustgift.example/register?ref=1A612B34";
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
  showToast("Account created in demo mode — no data was sent.");
});

document.querySelectorAll('a[href="#signin"]').forEach(link => link.addEventListener("click", event => {
  event.preventDefault();
  showToast("Sign in is not connected in this demo.");
}));
