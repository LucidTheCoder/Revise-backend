
// ============================================================================
// BACKEND API CONFIGURATION
// ============================================================================
// Set API_BASE_URL to your backend server
// Currently set to production Render deployment
// ============================================================================
const API_BASE_URL = 'https://revise-backend-yp6e.onrender.com';

// Determine if using backend API or local files
const USE_BACKEND = !!API_BASE_URL;

const state = {
  subjects: [],
  subjectMap: new Map(),
  topics: new Map(),
  searchIndex: [],
  pastPapers: [],
  community: { forumThreads: [], chatChannels: [] },
  currentView: "home",
  currentSubject: null,
  currentTopic: null,
  selectedThreadId: null,
  selectedChannelId: null,
  quiz: null,
  flash: null,
  particleSystem: null,
  streak: 3,
  xp: 2400,
  weeklyMinutes: [90, 70, 110, 60, 25, 0, 0],
};

const doneStorageKey = "revise.doneTopics";
const quizStorageKey = "revise.quizScores";
const confidenceStorageKey = "revise.topicConfidence";
const authTokenKey = "revise.authToken";
const authUserKey  = "revise.authUser";

const auth = {
  get token() { return localStorage.getItem(authTokenKey); },
  get user()  { try { return JSON.parse(localStorage.getItem(authUserKey)); } catch { return null; } },
  set(token, user) { localStorage.setItem(authTokenKey, token); localStorage.setItem(authUserKey, JSON.stringify(user)); },
  clear() { localStorage.removeItem(authTokenKey); localStorage.removeItem(authUserKey); },
  get isLoggedIn() { return !!this.token; },
};

function authHeaders(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (auth.token) h["Authorization"] = "Bearer " + auth.token;
  return h;
}

function injectAuthModal() {
  if (document.getElementById("auth-modal")) return;
  const el = document.createElement("div");
  el.id = "auth-modal";
  el.className = "auth-modal-overlay";
  el.innerHTML = '<div class="auth-modal-box card"><button class="auth-modal-close" id="auth-modal-close">&times;</button><div id="auth-tab-login"><h2>Sign In</h2><p class="auth-sub">Welcome back — your progress awaits.</p><label>Email<input type="email" id="login-email" placeholder="you@example.com"></label><label>Password<input type="password" id="login-password" placeholder="••••••••"></label><div class="auth-error" id="login-error"></div><button class="btn btn-primary auth-submit" id="login-submit">Sign In</button><p class="auth-switch">No account? <button class="link-btn" id="switch-to-register">Create one</button></p></div><div id="auth-tab-register" style="display:none"><h2>Create Account</h2><p class="auth-sub">Join Revise and track your progress.</p><label>Name<input type="text" id="register-name" placeholder="Your name"></label><label>Email<input type="email" id="register-email" placeholder="you@example.com"></label><label>Password<input type="password" id="register-password" placeholder="Min. 8 characters"></label><div class="auth-error" id="register-error"></div><button class="btn btn-primary auth-submit" id="register-submit">Create Account</button><p class="auth-switch">Have an account? <button class="link-btn" id="switch-to-login">Sign in</button></p></div></div>';
  document.body.appendChild(el);
  document.getElementById("auth-modal-close").addEventListener("click", closeAuthModal);
  el.addEventListener("click", (e) => { if (e.target === el) closeAuthModal(); });
  document.getElementById("switch-to-register").addEventListener("click", () => { document.getElementById("auth-tab-login").style.display="none"; document.getElementById("auth-tab-register").style.display=""; });
  document.getElementById("switch-to-login").addEventListener("click", () => { document.getElementById("auth-tab-register").style.display="none"; document.getElementById("auth-tab-login").style.display=""; });
  document.getElementById("login-submit").addEventListener("click", handleLogin);
  document.getElementById("register-submit").addEventListener("click", handleRegister);
}

function openAuthModal(tab) {
  injectAuthModal();
  const m = document.getElementById("auth-modal");
  m.classList.add("open");
  document.getElementById("auth-tab-login").style.display    = tab === "register" ? "none" : "";
  document.getElementById("auth-tab-register").style.display = tab === "register" ? "" : "none";
}

function closeAuthModal() { const m = document.getElementById("auth-modal"); if (m) m.classList.remove("open"); }

async function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  if (!email || !password) { errEl.textContent = "Please fill in all fields."; return; }
  const btn = document.getElementById("login-submit");
  btn.textContent = "Signing in…"; btn.disabled = true;
  try {
    const res = await fetch(API_BASE_URL + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || "Login failed."; return; }
    auth.set(data.token, data.user); closeAuthModal(); updateNavForAuth();
    showToast("Welcome back, " + data.user.name.split(" ")[0] + "!");
  } catch { errEl.textContent = "Network error."; }
  finally { btn.textContent = "Sign In"; btn.disabled = false; }
}

async function handleRegister() {
  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const errEl = document.getElementById("register-error");
  errEl.textContent = "";
  if (!name || !email || !password) { errEl.textContent = "Please fill in all fields."; return; }
  if (password.length < 8) { errEl.textContent = "Password must be at least 8 characters."; return; }
  const btn = document.getElementById("register-submit");
  btn.textContent = "Creating…"; btn.disabled = true;
  try {
    const res = await fetch(API_BASE_URL + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || "Registration failed."; return; }
    auth.set(data.token, data.user); closeAuthModal(); updateNavForAuth();
    showToast("Account created! Welcome, " + data.user.name.split(" ")[0] + ".");
  } catch { errEl.textContent = "Network error."; }
  finally { btn.textContent = "Create Account"; btn.disabled = false; }
}

function handleSignOut() { auth.clear(); updateNavForAuth(); showToast("Signed out."); }

function updateNavForAuth() {
  const btn = byId("signin-btn"); if (!btn) return;
  if (auth.isLoggedIn) {
    btn.textContent = auth.user?.name?.split(" ")[0] || "Account";
    btn.title = "Click to sign out";
    btn.onclick = () => { if (confirm("Sign out?")) handleSignOut(); };
  } else {
    btn.textContent = "Sign In"; btn.title = "";
    btn.onclick = () => openAuthModal("login");
  }
}


function byId(id) {
  return document.getElementById(id);
}

function toSuperscript(digits) {
  const map = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻" };
  return String(digits)
    .split("")
    .map((char) => map[char] || char)
    .join("");
}

function toSubscript(chars) {
  const map = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "n": "ₙ" };
  return String(chars)
    .split("")
    .map((char) => map[char] || char)
    .join("");
}

function scientificSymbols(input) {
  let text = String(input);
  text = text.replace(/\+\/-/g, "±");
  text = text.replace(/\bdelta\s*H\b/gi, "ΔH");
  text = text.replace(/\bdelta\s*G\b/gi, "ΔG");
  text = text.replace(/\bdelta\s*T\b/gi, "ΔT");
  text = text.replace(/\bdelta\s*S\b/gi, "ΔS");
  text = text.replace(/\bdelta\s*\+/gi, "δ+");
  text = text.replace(/\bdelta\s*-/gi, "δ−");
  text = text.replace(/\bm s-1\b/g, "m s⁻¹");
  text = text.replace(/\bm s-2\b/g, "m s⁻²");
  text = text.replace(/\bdm-3\b/g, "dm⁻³");
  text = text.replace(/\bmol-1\b/g, "mol⁻¹");
  text = text.replace(/\bx 10\^([0-9]+)/g, (_, n) => `× 10${toSuperscript(n)}`);
  text = text.replace(/\b10\^([0-9]+)/g, (_, n) => `10${toSuperscript(n)}`);

  // Charge notation such as SO4^2- -> SO₄²⁻ and Fe^3+ -> Fe³⁺
  text = text.replace(/([A-Za-z0-9()]+)\^([0-9]*)([+-])/g, (_, base, mag, sign) => {
    const formattedBase = String(base).replace(/([A-Za-z\)])([0-9n]+)/g, (m, a, b) => `${a}${toSubscript(b)}`);
    const charge = `${mag || ""}${sign}`;
    return `${formattedBase}${toSuperscript(charge)}`;
  });

  // Multi-element chemical formulae with optional ionic sign, e.g. H2SO4, NH4+
  text = text.replace(/\b(?:[A-Z][a-z]?[0-9n]*){2,}[+-]?\b/g, (token) => {
    const sign = /[+-]$/.test(token) ? token.slice(-1) : "";
    const body = sign ? token.slice(0, -1) : token;
    const formatted = body.replace(/([A-Za-z\)])([0-9n]+)/g, (m, a, b) => `${a}${toSubscript(b)}`);
    return sign ? `${formatted}${toSuperscript(sign)}` : formatted;
  });

  // Common single-element forms that still need subscripts.
  text = text.replace(/\b(H2|N2|O2|F2|Cl2|Br2|I2|P4|S8)\b/g, (token) =>
    token.replace(/([A-Za-z])([0-9]+)/g, (m, a, b) => `${a}${toSubscript(b)}`)
  );

  return text;
}

function escapeHtml(input) {
  return scientificSymbols(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMathMarkup(escapedText) {
  const splitTrail = (token) => {
    const str = String(token || "");
    const m = str.match(/^(.+?)([.,;:!?])?$/);
    return { core: m ? m[1] : str, trail: (m && m[2]) || "" };
  };
  const wrapVar = (value) => `<span class="math-var">${value}</span>`;
  const fraction = (top, bottom) =>
    `<span class="math-frac"><span class="math-top">${top}</span><span class="math-bottom">${bottom}</span></span>`;

  // Convert patterns like c = n/V or n = m / Mr into formatted inline fractions.
  return String(escapedText).replace(
    /([A-Za-z0-9Δλρμ][A-Za-z0-9Δλρμ₀-₉⁰-⁹().+\-]*)\s*=\s*([A-Za-z0-9Δλρμ₀-₉⁰-⁹().+\-]+)\s*\/\s*([A-Za-z0-9Δλρμ₀-₉⁰-⁹().+\-]+)/g,
    (_, lhsRaw, numRaw, denRaw) => {
      const lhsParts = splitTrail(lhsRaw);
      const numParts = splitTrail(numRaw);
      const denParts = splitTrail(denRaw);
      return `<span class="math-eq">${wrapVar(lhsParts.core)} = ${fraction(wrapVar(numParts.core), wrapVar(denParts.core))}</span>${lhsParts.trail}${numParts.trail}${denParts.trail}`;
    }
  );
}

function richText(input) {
  return formatMathMarkup(escapeHtml(input));
}

function escapeXml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colorVar(subjectId) {
  if (subjectId === "chem") return "var(--chem)";
  if (subjectId === "bio") return "var(--bio)";
  return "var(--phy)";
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickColor(subjectId, alpha) {
  if (subjectId === "chem") return `rgba(249, 115, 22, ${alpha})`;
  if (subjectId === "bio") return `rgba(34, 197, 94, ${alpha})`;
  return `rgba(129, 140, 248, ${alpha})`;
}

function confidenceByTopic() {
  try {
    const raw = localStorage.getItem(confidenceStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getTopicConfidence(topicId) {
  const map = confidenceByTopic();
  return map[topicId] || "none";
}

function setTopicConfidence(topicId, level) {
  if (!topicId) return;
  const map = confidenceByTopic();
  map[topicId] = level;
  localStorage.setItem(confidenceStorageKey, JSON.stringify(map));
  if (state.currentView === "topic") {
    renderTopicView(topicId);
  }
  const label = level === "confident" ? "Confident" : level === "needs-practice" ? "Needs Practice" : "No Idea";
  showToast(`Confidence set: ${label}`);
}

function buildTopicDiagramSvg(topic) {
  const seed = hashString(`${topic.id}|${topic.title}`);
  const variant = seed % 5;
  const heading = String(topic.title || "");
  const genericLabel = /^(key point|syllabus|summary|core idea|method|exam link|practice|concept|model|application|definition|exam tip|syllabus ref|core ideas|exam focus)$/i;
  const topicToken = topic.title.split(/\s+/).find((part) => part.length > 2) || topic.subject.toUpperCase();
  const labels = [
    ...(topic.definitions || []).map((item) => item.term),
    ...(topic.notes || []).map((item) => item.heading),
    ...(topic.summary || []).map((item) => item.label),
  ]
    .filter(Boolean)
    .filter((label) => !genericLabel.test(String(label).trim()));
  const normalizeLabel = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  const estimateTextWidth = (text, size) => normalizeLabel(text).length * size * 0.56;
  const fitTextSize = (text, maxWidth, maxSize = 12, minSize = 7) => {
    const label = normalizeLabel(text);
    let size = maxSize;
    while (size > minSize && estimateTextWidth(label, size) > maxWidth) {
      size -= 0.5;
    }
    return Number(size.toFixed(1));
  };
  const renderFittedText = ({
    text,
    x,
    y,
    maxWidth,
    maxSize = 12,
    minSize = 6,
    anchor = "start",
    fill = "#d8e4ef",
  }) => {
    const label = normalizeLabel(text);
    const size = fitTextSize(label, maxWidth, maxSize, minSize);
    const measured = estimateTextWidth(label, size);
    const compressAttr =
      measured > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : "";
    return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-family="DM Sans" text-anchor="${anchor}"${compressAttr}>${escapeXml(label)}</text>`;
  };

  const chipARaw = normalizeLabel(labels[0] || `${topicToken} Core`);
  const chipBRaw = normalizeLabel(labels[1] || `${topic.subject.toUpperCase()} Model`);
  const chipCRaw = normalizeLabel(labels[2] || "Exam Focus");
  const chipDRaw = normalizeLabel(labels[3] || "Recall");
  const chipERaw = normalizeLabel(labels[4] || "Practice Set");

  const lineColor = pickColor(topic.subject, 0.55);
  const nodeFill = pickColor(topic.subject, 0.26);
  const nodeSolidFill = pickColor(topic.subject, 0.88);
  const nodeStroke = pickColor(topic.subject, 0.75);
  const glow = pickColor(topic.subject, 0.12);
  const accent = topic.subject === "chem" ? "#f97316" : topic.subject === "bio" ? "#22c55e" : "#818cf8";
  const d1x = 78 + (seed % 540);
  const d1y = 66 + (seed % 96);
  const d2x = 126 + ((seed >> 4) % 500);
  const d2y = 74 + ((seed >> 7) % 104);
  const d3x = 164 + ((seed >> 9) % 450);
  const d3y = 82 + ((seed >> 12) % 96);

  const base = `
    <defs>
      <linearGradient id="g-${topic.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${glow}"/>
        <stop offset="100%" stop-color="rgba(10,14,23,0.08)"/>
      </linearGradient>
    </defs>
    <rect x="16" y="16" width="668" height="218" rx="18" fill="url(#g-${topic.id})" stroke="${nodeStroke}" stroke-width="1.4"/>
    <circle cx="${d1x}" cy="${d1y}" r="9" fill="${pickColor(topic.subject, 0.08)}"/>
    <circle cx="${d2x}" cy="${d2y}" r="6" fill="${pickColor(topic.subject, 0.1)}"/>
    <circle cx="${d3x}" cy="${d3y}" r="4" fill="${pickColor(topic.subject, 0.14)}"/>
    ${renderFittedText({ text: heading, x: 38, y: 48, maxWidth: 608, maxSize: 17, minSize: 10.5, fill: accent })}
  `;

  if (variant === 0) {
    const y1 = 84 + (seed % 14);
    const y2 = 112 + (seed % 14);
    const y3 = 126 + (seed % 12);
    return `<svg viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(topic.title)} diagram">
      ${base}
      <path d="M90 ${y1} C190 ${y2}, 270 ${y1}, 350 ${y2}" fill="none" stroke="${lineColor}" stroke-width="2.6"/>
      <path d="M350 ${y2} C430 ${y3}, 510 ${y2}, 612 ${y3}" fill="none" stroke="${lineColor}" stroke-width="2.6"/>
      <circle cx="90" cy="${y1}" r="14" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <circle cx="350" cy="${y2}" r="18" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <circle cx="612" cy="${y3}" r="14" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <g font-family="DM Sans">
        <rect x="52" y="166" width="122" height="28" rx="9" fill="${nodeFill}" stroke="${nodeStroke}"/>
        ${renderFittedText({ text: chipARaw, x: 62, y: 184, maxWidth: 102, maxSize: 12, minSize: 6.2 })}
        <rect x="192" y="166" width="122" height="28" rx="9" fill="${nodeFill}" stroke="${nodeStroke}"/>
        ${renderFittedText({ text: chipBRaw, x: 202, y: 184, maxWidth: 102, maxSize: 12, minSize: 6.2 })}
        <rect x="332" y="166" width="122" height="28" rx="9" fill="${nodeFill}" stroke="${nodeStroke}"/>
        ${renderFittedText({ text: chipCRaw, x: 342, y: 184, maxWidth: 102, maxSize: 12, minSize: 6.2 })}
        <rect x="472" y="166" width="122" height="28" rx="9" fill="${nodeFill}" stroke="${nodeStroke}"/>
        ${renderFittedText({ text: chipDRaw, x: 482, y: 184, maxWidth: 102, maxSize: 12, minSize: 6.2 })}
      </g>
    </svg>`;
  }

  if (variant === 1) {
    return `<svg viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(topic.title)} diagram">
      ${base}
      <line x1="350" y1="122" x2="170" y2="92" stroke="${lineColor}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="350" y1="122" x2="530" y2="92" stroke="${lineColor}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="350" y1="122" x2="170" y2="156" stroke="${lineColor}" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="350" y1="122" x2="530" y2="156" stroke="${lineColor}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="350" cy="122" r="30" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <circle cx="170" cy="92" r="16" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <circle cx="530" cy="92" r="16" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <circle cx="170" cy="156" r="16" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <circle cx="530" cy="156" r="16" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <g font-family="DM Sans" fill="#d8e4ef">
        ${renderFittedText({ text: topic.subject.toUpperCase(), x: 325, y: 126, maxWidth: 60, maxSize: 12, minSize: 8 })}
        ${renderFittedText({ text: chipARaw, x: 118, y: 88, maxWidth: 106, maxSize: 12, minSize: 6.2 })}
        ${renderFittedText({ text: chipBRaw, x: 484, y: 88, maxWidth: 106, maxSize: 12, minSize: 6.2 })}
        ${renderFittedText({ text: chipCRaw, x: 118, y: 176, maxWidth: 106, maxSize: 12, minSize: 6.2 })}
        ${renderFittedText({ text: chipDRaw, x: 484, y: 176, maxWidth: 106, maxSize: 12, minSize: 6.2 })}
      </g>
    </svg>`;
  }

  if (variant === 2) {
    const b1 = 72 + (seed % 24);
    const b2 = 92 + (seed % 30);
    const b3 = 65 + (seed % 20);
    const b4 = 104 + (seed % 22);
    const b5 = 82 + (seed % 26);
    return `<svg viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(topic.title)} diagram">
      ${base}
      <line x1="62" y1="176" x2="640" y2="176" stroke="${lineColor}" stroke-width="2"/>
      <path d="M114 ${176 - b1} L216 ${176 - b2} L318 ${176 - b3} L420 ${176 - b4} L522 ${176 - b5}" fill="none" stroke="${lineColor}" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="88" y="${176 - b1}" width="52" height="${b1}" rx="7" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <rect x="190" y="${176 - b2}" width="52" height="${b2}" rx="7" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <rect x="292" y="${176 - b3}" width="52" height="${b3}" rx="7" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <rect x="394" y="${176 - b4}" width="52" height="${b4}" rx="7" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <rect x="496" y="${176 - b5}" width="52" height="${b5}" rx="7" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <g font-family="DM Sans" fill="#d8e4ef">
        ${renderFittedText({ text: chipARaw, x: 78, y: 198, maxWidth: 94, maxSize: 11.8, minSize: 5.8 })}
        ${renderFittedText({ text: chipBRaw, x: 180, y: 198, maxWidth: 94, maxSize: 11.8, minSize: 5.8 })}
        ${renderFittedText({ text: chipCRaw, x: 282, y: 198, maxWidth: 94, maxSize: 11.8, minSize: 5.8 })}
        ${renderFittedText({ text: chipDRaw, x: 384, y: 198, maxWidth: 94, maxSize: 11.8, minSize: 5.8 })}
        ${renderFittedText({ text: chipERaw, x: 486, y: 198, maxWidth: 94, maxSize: 11.8, minSize: 5.8 })}
      </g>
    </svg>`;
  }

  if (variant === 3) {
    return `<svg viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(topic.title)} diagram">
      ${base}
      <path d="M234 99 H258 M432 99 H456 M350 122 V138" stroke="${lineColor}" stroke-width="2.1" stroke-linecap="round"/>
      <rect x="70" y="76" width="164" height="46" rx="12" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <rect x="268" y="76" width="164" height="46" rx="12" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <rect x="466" y="76" width="164" height="46" rx="12" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <rect x="168" y="144" width="164" height="46" rx="12" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <rect x="366" y="144" width="164" height="46" rx="12" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
      <g font-family="DM Sans" fill="#d8e4ef">
        ${renderFittedText({ text: chipARaw, x: 84, y: 103, maxWidth: 136, maxSize: 12, minSize: 6.2 })}
        ${renderFittedText({ text: chipBRaw, x: 282, y: 103, maxWidth: 136, maxSize: 12, minSize: 6.2 })}
        ${renderFittedText({ text: chipCRaw, x: 480, y: 103, maxWidth: 136, maxSize: 12, minSize: 6.2 })}
        ${renderFittedText({ text: chipDRaw, x: 182, y: 171, maxWidth: 136, maxSize: 12, minSize: 6.2 })}
        ${renderFittedText({ text: chipERaw, x: 380, y: 171, maxWidth: 136, maxSize: 12, minSize: 6.2 })}
      </g>
    </svg>`;
  }

  return `<svg viewBox="0 0 700 250" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(topic.title)} diagram">
    ${base}
    <line x1="250" y1="136" x2="290" y2="136" stroke="${lineColor}" stroke-width="2.4" stroke-linecap="round"/>
    <line x1="410" y1="136" x2="450" y2="136" stroke="${lineColor}" stroke-width="2.4" stroke-linecap="round"/>
    <polygon points="160,84 220,84 250,136 220,188 160,188 130,136" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
    <polygon points="320,84 380,84 410,136 380,188 320,188 290,136" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
    <polygon points="480,84 540,84 570,136 540,188 480,188 450,136" fill="${nodeSolidFill}" stroke="${nodeStroke}"/>
    <g font-family="DM Sans" fill="#d8e4ef" text-anchor="middle">
      ${renderFittedText({ text: chipARaw, x: 190, y: 138, maxWidth: 102, maxSize: 12, minSize: 6, anchor: "middle" })}
      ${renderFittedText({ text: chipBRaw, x: 350, y: 138, maxWidth: 102, maxSize: 12, minSize: 6, anchor: "middle" })}
      ${renderFittedText({ text: chipCRaw, x: 510, y: 138, maxWidth: 102, maxSize: 12, minSize: 6, anchor: "middle" })}
      ${renderFittedText({ text: chipDRaw, x: 190, y: 206, maxWidth: 94, maxSize: 12, minSize: 6, anchor: "middle" })}
      ${renderFittedText({ text: chipERaw, x: 510, y: 206, maxWidth: 94, maxSize: 12, minSize: 6, anchor: "middle" })}
    </g>
  </svg>`;
}

function fallbackDiagramSvg(topic) {
  if (topic.subject === "chem") {
    return `<svg viewBox='0 0 460 190' xmlns='http://www.w3.org/2000/svg'>
      <rect x='18' y='18' width='424' height='154' rx='16' fill='rgba(0,212,170,0.08)' stroke='rgba(0,212,170,0.35)'/>
      <text x='36' y='44' fill='#00d4aa' font-size='14' font-family='DM Sans'>Bond Polarity and Energy Snapshot</text>
      <line x1='120' y1='98' x2='250' y2='98' stroke='#8b949e' stroke-width='2'/>
      <circle cx='120' cy='98' r='26' fill='rgba(129,140,248,0.22)'/>
      <circle cx='250' cy='98' r='30' fill='rgba(249,115,22,0.25)'/>
      <text x='103' y='103' fill='#cdd9e5' font-size='13' font-family='DM Sans'>H</text>
      <text x='242' y='103' fill='#cdd9e5' font-size='13' font-family='DM Sans'>Cl</text>
      <text x='84' y='71' fill='#cdd9e5' font-size='13' font-family='DM Sans'>δ+</text>
      <text x='267' y='66' fill='#cdd9e5' font-size='13' font-family='DM Sans'>δ−</text>
      <path d='M320 132 L360 92 L402 132' fill='none' stroke='#22c55e' stroke-width='2.2'/>
      <text x='316' y='148' fill='#22c55e' font-size='13' font-family='DM Sans'>ΔH &lt; 0 exothermic profile</text>
    </svg>`;
  }
  if (topic.subject === "bio") {
    return `<svg viewBox='0 0 460 190' xmlns='http://www.w3.org/2000/svg'>
      <rect x='18' y='18' width='424' height='154' rx='16' fill='rgba(34,197,94,0.08)' stroke='rgba(34,197,94,0.35)'/>
      <text x='36' y='44' fill='#22c55e' font-size='14' font-family='DM Sans'>Membrane Transport Snapshot</text>
      <rect x='68' y='74' width='324' height='46' rx='20' fill='rgba(129,140,248,0.14)' stroke='rgba(129,140,248,0.45)'/>
      <circle cx='120' cy='96' r='14' fill='rgba(249,115,22,0.26)'/>
      <rect x='214' y='70' width='30' height='54' rx='10' fill='rgba(0,212,170,0.36)'/>
      <path d='M112 96 H198' stroke='#cdd9e5' stroke-width='2' marker-end='url(#arrbio)'/>
      <text x='78' y='136' fill='#cdd9e5' font-size='12' font-family='DM Sans'>Diffusion</text>
      <text x='254' y='136' fill='#cdd9e5' font-size='12' font-family='DM Sans'>Carrier protein</text>
      <defs><marker id='arrbio' markerWidth='6' markerHeight='6' refX='5' refY='3' orient='auto'><path d='M0,0 L6,3 L0,6 Z' fill='#cdd9e5'/></marker></defs>
    </svg>`;
  }
  return `<svg viewBox='0 0 460 190' xmlns='http://www.w3.org/2000/svg'>
    <rect x='18' y='18' width='424' height='154' rx='16' fill='rgba(129,140,248,0.10)' stroke='rgba(129,140,248,0.40)'/>
    <text x='36' y='44' fill='#818cf8' font-size='14' font-family='DM Sans'>Motion Graph Snapshot</text>
    <line x1='76' y1='140' x2='392' y2='140' stroke='#8b949e' stroke-width='2'/>
    <line x1='76' y1='140' x2='76' y2='56' stroke='#8b949e' stroke-width='2'/>
    <path d='M76 130 L146 112 L230 88 L312 62 L392 46' stroke='#00d4aa' stroke-width='3' fill='none'/>
    <text x='398' y='146' fill='#cdd9e5' font-size='12' font-family='DM Sans'>t</text>
    <text x='66' y='52' fill='#cdd9e5' font-size='12' font-family='DM Sans'>v</text>
    <text x='252' y='163' fill='#cdd9e5' font-size='12' font-family='DM Sans'>gradient = a, area = s</text>
  </svg>`;
}

/**
 * Unified fetch function supporting both local JSON and backend API
 * @param {string} path - Local path (e.g., 'data/subjects.json') or API endpoint
 * @param {string} [apiOverride] - Override API endpoint for direct API calls
 * @returns {Promise<object>} Parsed JSON response
 */
async function fetchJson(path, apiOverride = null) {
  try {
    let url;
    
    if (apiOverride) {
      // Direct API endpoint call
      url = `${API_BASE_URL}${apiOverride}`;
    } else if (USE_BACKEND) {
      // Map local paths to API endpoints
      if (path === "data/subjects.json") {
        url = `${API_BASE_URL}/api/subjects`;
      } else if (path === "data/past-papers.json") {
        url = `${API_BASE_URL}/api/past-papers`;
      } else if (path === "data/community.json") {
        url = `${API_BASE_URL}/api/community`;
      } else if (path.startsWith("data/topics/")) {
        // Extract subject and topic ID from path: data/topics/chem/atomic-structure.json
        const parts = path.replace("data/topics/", "").replace(".json", "").split("/");
        const [subject, topicId] = parts;
        url = `${API_BASE_URL}/api/topics/${topicId}?subject=${subject}`;
      } else {
        // Fallback to local
        url = path;
      }
    } else {
      // Use local path
      url = path;
    }
    
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to load ${url}: ${res.status}`);
    }
    
    const data = await res.json();
    
    // Extract actual data from API response wrapper if needed
    if (USE_BACKEND && data.data) {
      return data.data;
    }
    
    return data;
  } catch (error) {
    console.error(`Fetch error for ${path}:`, error);
    throw error;
  }
}

async function loadData() {
  try {
    console.log(`📚 Loading data from ${USE_BACKEND ? 'Backend API: ' + API_BASE_URL : 'Local JSON files'}...`);
    
    // Load subjects, papers, and community in parallel
    const [subjectsData, papersData, communityData] = await Promise.all([
      fetchJson("data/subjects.json"),
      fetchJson("data/past-papers.json"),
      fetchJson("data/community.json"),
    ]);

    // Setup subjects
    if (Array.isArray(subjectsData)) {
      state.subjects = subjectsData;
    } else if (subjectsData.subjects) {
      state.subjects = subjectsData.subjects;
    } else {
      state.subjects = [subjectsData];
    }

    // Setup papers
    if (Array.isArray(papersData)) {
      state.pastPapers = papersData;
    } else if (papersData.papers) {
      state.pastPapers = papersData.papers;
    } else {
      state.pastPapers = [];
    }

    // Setup community
    if (communityData.forumThreads || communityData.forum) {
      state.community = {
        forumThreads: communityData.forumThreads || communityData.forum || [],
        chatChannels: communityData.chatChannels || communityData.chat || [],
      };
    } else {
      state.community = communityData || { forumThreads: [], chatChannels: [] };
    }

    for (const subject of state.subjects) {
      state.subjectMap.set(subject.id, subject);
    }

    //Load all topics
    const topicLoads = [];
    for (const subject of state.subjects) {
      for (const unit of subject.units || []) {
        for (const topicRef of unit.topics || []) {
          const path = `data/topics/${subject.id}/${topicRef.file}`;
          topicLoads.push(
            fetchJson(path)
              .then((topic) => {
                state.topics.set(topic.id, topic);
              })
              .catch(() => {
                state.topics.set(topicRef.id, {
                  id: topicRef.id,
                  subject: subject.id,
                  title: topicRef.name,
                  subtitle: "Topic file missing.",
                  concept: ["Content file missing. Add this topic JSON in data/topics."],
                  notes: [],
                  definitions: [],
                  workedExamples: [],
                  mistakes: [],
                  tips: [],
                  recall: [],
                  summary: [],
                  flashcards: [],
                  quiz: { title: `${topicRef.name} Quiz`, questions: [] },
                });
              })
          );
        }
      }
    }

    await Promise.all(topicLoads);

    state.searchIndex = Array.from(state.topics.values()).map((topic) => ({
      id: topic.id,
      title: topic.title,
      subtitle: topic.subtitle,
      subject: topic.subject,
    }));

    hydrateDoneTopics();

    if (state.community.forumThreads && state.community.forumThreads.length > 0) {
      state.selectedThreadId = state.community.forumThreads[0].id;
    }
    if (state.community.chatChannels && state.community.chatChannels.length > 0) {
      state.selectedChannelId = state.community.chatChannels[0].id;
    }
    
    console.log(`✅ Data loaded successfully (${state.topics.size} topics, ${state.subjects.length} subjects)`);
  } catch (error) {
    console.error('❌ Failed to load data:', error);
    throw error;
  }
}

function hydrateDoneTopics() {
  try {
    const raw = localStorage.getItem(doneStorageKey);
    if (!raw) return;
    const done = new Set(JSON.parse(raw));
    for (const subject of state.subjects) {
      for (const unit of subject.units) {
        for (const topic of unit.topics) {
          if (done.has(topic.id)) topic.done = true;
        }
      }
    }
  } catch {
    // Ignore invalid local storage.
  }
}

function persistDoneTopics() {
  const done = [];
  for (const subject of state.subjects) {
    for (const unit of subject.units) {
      for (const topic of unit.topics) {
        if (topic.done) done.push(topic.id);
      }
    }
  }
  localStorage.setItem(doneStorageKey, JSON.stringify(done));
}

function quizHistory() {
  try {
    const raw = localStorage.getItem(quizStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pushQuizScore(scorePct) {
  const entries = quizHistory();
  entries.push({ scorePct, at: Date.now() });
  localStorage.setItem(quizStorageKey, JSON.stringify(entries.slice(-30)));
}

// ============================================================================
// BACKEND USER PROGRESS & ANALYTICS
// ============================================================================

/**
 * Save topic progress to backend
 */
async function saveProgressToBackend(topicId, quizScore, confidence) {
  if (!USE_BACKEND || !topicId) return;
  
  try {
    const subject = state.currentSubject || 'chem';
    const response = await fetch(`${API_BASE_URL}/api/user/progress`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        topicId,
        subject,
        confidence: confidence ?? 75,
        isComplete: true,
        quizScore: quizScore ?? null
      })
    });
    
    if (response.ok) {
      console.log('✅ Progress saved to backend');
    }
  } catch (error) {
    console.warn('Backend progress save failed:', error);
  }
}

/**
 * Update user stats on backend (XP, streak, study time)
 */
async function updateStatsOnBackend(xpGain, minutesStudied = 0) {
  if (!USE_BACKEND) return;
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/stats/update`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        xpGain,
        addToStreak: 1,
        minutesStudied
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Stats updated on backend');
    }
  } catch (error) {
    console.warn('Backend stats update failed:', error);
  }
}

/**
 * Load user analytics from backend
 */
async function loadUserAnalytics() {
  if (!USE_BACKEND) return null;
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/analytics`, {
      headers: authHeaders(),
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.data;
    }
  } catch (error) {
    console.warn('Backend analytics load failed:', error);
  }
  return null;
}

/**
 * Get user progress for a specific topic
 */
async function getTopicProgressFromBackend(topicId) {
  if (!USE_BACKEND) return null;
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/progress/${topicId}`, {
      headers: authHeaders(),
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.data;
    }
  } catch (error) {
    console.warn('Failed to get topic progress:', error);
  }
  return null;
}

function getTopicRefsForSubject(subjectId) {
  const subject = state.subjectMap.get(subjectId);
  if (!subject) return [];
  return subject.units.flatMap((unit) => unit.topics);
}

function getProgress(subjectId) {
  const refs = getTopicRefsForSubject(subjectId);
  const done = refs.filter((t) => t.done).length;
  const total = refs.length || 1;
  return { done, total, pct: Math.round((done / total) * 100) };
}

function totalProgress() {
  const all = state.subjects.flatMap((s) => s.units.flatMap((u) => u.topics));
  const done = all.filter((t) => t.done).length;
  return { done, total: all.length, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
}

function setActiveView(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  const target = byId(`view-${viewName}`);
  if (target) target.classList.add("active");
  state.currentView = viewName;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function go(viewName, payload = {}) {
  setActiveView(viewName);

  if (viewName === "home") renderHome();
  if (viewName === "subjects") renderSubjectSelection();
  if (viewName === "subject") renderSubjectView(payload.subjectId || state.currentSubject);
  if (viewName === "topic") renderTopicView(payload.topicId || state.currentTopic);
  if (viewName === "quiz") startQuiz(payload);
  if (viewName === "flash") startFlashcards(payload);
  if (viewName === "past-papers") renderPastPapers();
  if (viewName === "community") renderCommunity();
  if (viewName === "profile") renderProfile();
  if (viewName === "editor") {
    byId("editor-subject-select").value = "";
    byId("editor-topics-list").innerHTML = "";
    byId("editor-title").textContent = "Select a topic to edit";
    byId("editor-json").value = "";
  }
}
function renderHome() {
  const statsEl = byId("home-stats");
  const continueEl = byId("continue-list");
  const activityEl = byId("recent-activity");
  const goalEl = byId("weekly-goal");

  const overall = totalProgress();
  const avgQuiz = quizHistory();
  const avgScore = avgQuiz.length
    ? Math.round(avgQuiz.reduce((sum, item) => sum + item.scorePct, 0) / avgQuiz.length)
    : 0;

  statsEl.innerHTML = `
    <div class="stat-item"><strong style="color:var(--accent)">${overall.total}</strong><span>Topics available</span></div>
    <div class="stat-item"><strong style="color:var(--warn)">${state.streak}</strong><span>Day streak</span></div>
    <div class="stat-item"><strong style="color:var(--success)">${overall.done}</strong><span>Topics completed</span></div>
    <div class="stat-item"><strong style="color:var(--phy)">${avgScore}%</strong><span>Quiz average</span></div>
  `;

  const nextTopics = [];
  for (const subject of state.subjects) {
    for (const unit of subject.units) {
      const next = unit.topics.find((topic) => !topic.done);
      if (next) {
        nextTopics.push({ ...next, subjectName: subject.name, subjectId: subject.id });
      }
    }
  }

  const preview = nextTopics.slice(0, 4);
  continueEl.innerHTML = preview
    .map(
      (topic) => `
      <button class="continue-item" onclick="App.go('topic',{topicId:'${topic.id}'})">
        <span>
          <strong>${escapeHtml(topic.name)}</strong><br>
          <small>${escapeHtml(topic.subjectName)}</small>
        </span>
        <span class="badge ${topic.done ? "badge-success" : "badge-warn"}">${topic.done ? "Done" : "Resume"}</span>
      </button>
    `
    )
    .join("");

  const totalTarget = 180;
  const current = state.weeklyMinutes.reduce((sum, minutes) => sum + minutes, 0);
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const weeklyPct = Math.round((current / totalTarget) * 100);
  const weeklyPctCapped = Math.min(100, weeklyPct);
  const todayIndex = (new Date().getDay() + 6) % 7;
  const todayMinutes = state.weeklyMinutes[todayIndex] || 0;
  const weakest = state.subjects
    .map((s) => ({ ...s, progress: getProgress(s.id).pct }))
    .sort((a, b) => a.progress - b.progress)[0];
  const nextUp = preview[0] || null;

  const recentQuizEvents = quizHistory().slice(-3).reverse();
  const activityItems = [
    `🔥 ${state.streak} day streak active`,
    `✅ ${overall.done} topics completed so far`,
    ...(nextUp ? [`📌 Next recommended topic: ${nextUp.name}`] : ["📌 You are caught up on queued topics"]),
    ...recentQuizEvents.map((item) => {
      const date = new Date(item.at);
      return `📝 Quiz scored ${item.scorePct}% on ${date.toLocaleDateString()}`;
    }),
  ].slice(0, 5);

  if (activityEl) {
    activityEl.innerHTML = `
      <div class="recent-head">Recent Activity</div>
      <ul class="recent-list">
        ${activityItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    `;
  }

  goalEl.innerHTML = `
    <div class="goal-header">
      <p>${current} / ${totalTarget} min this week</p>
      <strong>${weeklyPct}%</strong>
    </div>
    <div class="goal-days">
      ${state.weeklyMinutes
        .map((min, i) => {
          const pct = Math.min(100, Math.round((min / 120) * 100));
          const cls = i === todayIndex ? "goal-day today" : "goal-day";
          return `<div class="${cls}"><div class="goal-bar"><div class="goal-fill" style="height:${pct}%"></div></div>${labels[i]}</div>`;
        })
        .join("")}
    </div>
    <div class="goal-status-grid">
      <div class="goal-stat">
        <div class="goal-ring" style="--ring:${weeklyPctCapped}%">
          <strong>${weeklyPct}%</strong>
          <span>of target</span>
        </div>
      </div>
      <div class="goal-stat">
        <small>Today Focus</small>
        <strong>${todayMinutes} min</strong>
        <p>${nextUp ? `Next up: ${escapeHtml(nextUp.name)}` : "All queued topics complete"}</p>
      </div>
      <div class="goal-stat">
        <small>Needs Attention</small>
        <strong>${weakest ? `${escapeHtml(weakest.name)} ${weakest.progress}%` : "No data"}</strong>
        <p>Run a short quiz to close weak gaps faster.</p>
      </div>
    </div>
    <div class="goal-actions">
      ${
        nextUp
          ? `<button class="btn btn-primary" onclick="App.go('topic',{topicId:'${nextUp.id}'})">Continue ${escapeHtml(nextUp.name)}</button>`
          : `<button class="btn btn-primary" onclick="App.go('subjects')">Pick New Topic</button>`
      }
      <button class="btn btn-outline" onclick="App.go('quiz',{subjectId:'${weakest ? weakest.id : "chem"}'})">Quick Weak-Area Quiz</button>
      <button class="btn btn-outline" onclick="App.showToast('Start a 25 minute focused sprint now')">Start Focus Sprint</button>
    </div>
  `;
}

function renderSubjectSelection() {
  const grid = byId("subject-select-grid");
  grid.innerHTML = state.subjects
    .map((subject) => {
      const p = getProgress(subject.id);
      return `
      <button class="subject-card" onclick="App.go('subject',{subjectId:'${subject.id}'})">
        <h3 style="color:${colorVar(subject.id)}">${escapeHtml(subject.name)}</h3>
        <p>${escapeHtml(subject.desc)}</p>
        <div class="subject-meta"><span>${p.done}/${p.total} done</span><span>${p.pct}% complete</span></div>
      </button>
    `;
    })
    .join("");
}

function renderSubjectSidebar(subject, activeTopicId = "") {
  return `
    <div class="sidebar-head">
      <button onclick="App.go('subjects')">Back to subjects</button>
      <p style="margin-top:0.35rem;color:var(--text2)">${escapeHtml(subject.name)}</p>
    </div>
    ${subject.units
      .map(
        (unit) => `
      <div class="sidebar-group">
        <div class="sidebar-label">${escapeHtml(unit.name)}</div>
        <div class="sidebar-topics">
          ${unit.topics
          .map(
            (topic) => `
          <button class="topic-item ${topic.id === activeTopicId ? "active" : ""} ${topic.done ? "done" : ""}" onclick="App.go('topic',{topicId:'${topic.id}'})">
            <span>${escapeHtml(topic.name)}</span>
            <span>${topic.done ? "Done" : "Open"}</span>
          </button>
        `
          )
          .join("")}
        </div>
      </div>
    `
      )
      .join("")}
  `;
}

function renderSubjectView(subjectId) {
  if (!subjectId) {
    go("subjects");
    return;
  }
  state.currentSubject = subjectId;

  const subject = state.subjectMap.get(subjectId);
  if (!subject) return;

  byId("subject-sidebar").innerHTML = renderSubjectSidebar(subject);

  const p = getProgress(subjectId);
  const subjectMain = byId("subject-main");
  subjectMain.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <p style="color:var(--text2)">Home / Subjects / ${escapeHtml(subject.name)}</p>
      <h1>${escapeHtml(subject.name)}</h1>
      <p>${escapeHtml(subject.desc)}</p>
      <div class="topic-actions">
        <button class="btn btn-primary" onclick="App.go('quiz',{subjectId:'${subject.id}'})">Take Subject Quiz</button>
        <button class="btn btn-outline" onclick="App.go('flash',{subjectId:'${subject.id}'})">Open Flashcards</button>
      </div>
      <p style="margin-top:0.8rem">Progress: ${p.done}/${p.total} topics (${p.pct}%)</p>
    </div>
    <div class="grid-2 subject-units-grid">
      ${subject.units
        .map(
          (unit) => `
        <div class="card subject-unit-card">
          <h2>${escapeHtml(unit.name)}</h2>
          ${unit.topics
            .map(
              (topic) => `
            <button class="continue-item" onclick="App.go('topic',{topicId:'${topic.id}'})">
              <span>${escapeHtml(topic.name)}</span>
              <span class="badge ${topic.done ? "badge-success" : "badge-warn"}">${topic.done ? "Done" : "Start"}</span>
            </button>
          `
            )
            .join("")}
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function scrollToSection(sectionId) {
  const el = byId(sectionId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTopicView(topicId) {
  const topic = state.topics.get(topicId);
  if (!topic) {
    showToast("Topic not found.");
    return;
  }

  state.currentTopic = topicId;
  state.currentSubject = topic.subject;

  const subject = state.subjectMap.get(topic.subject);
  byId("topic-sidebar").innerHTML = renderSubjectSidebar(subject, topic.id);

  const notesHtml = (topic.notes || [])
    .map(
      (group) => `
      <div class="topic-subsection">
        <h3>${richText(group.heading)}</h3>
        <ul class="topic-list">
          ${(group.items || []).map((item) => `<li>${richText(item)}</li>`).join("")}
        </ul>
      </div>
    `
    )
    .join("");

  const defsHtml = (topic.definitions || [])
    .map(
      (item) => `
      <div class="info-box">
        <strong>${richText(item.term)}</strong>
        <span>${richText(item.body)}</span>
      </div>
    `
    )
    .join("");

  const workedHtml = (topic.workedExamples || [])
    .map(
      (example, index) => `
      <div class="worked-box">
        <p><strong>Example ${index + 1}:</strong> ${richText(example.q)}</p>
        ${(example.steps || [])
          .map(
            (step) => `
          <div class="step">
            <span class="step-num">${step.n}</span>
            <div>
              <small style="color:var(--text3);text-transform:uppercase">${escapeHtml(step.sub || "Step")}</small>
              <p>${richText(step.text)}</p>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `
    )
    .join("");

  const recallHtml = (topic.recall || [])
    .map(
      (item, i) => `
      <div class="recall-item" id="recall-${i}">
        <div class="recall-q">
          <span>${richText(item.q)}</span>
          <button class="pill-btn" onclick="App.toggleRecall(${i})">Show answer</button>
        </div>
        <div class="recall-a" id="recall-a-${i}">${richText(item.a)}</div>
      </div>
    `
    )
    .join("");

  const summaryHtml = (topic.summary || [])
    .map(
      (item) => `
      <div class="summary-item">
        <strong>${richText(item.label)}</strong>
        <span>${richText(item.val)}</span>
      </div>
    `
    )
    .join("");
  const diagramHtml = buildTopicDiagramSvg(topic);
  const syllabusRef = topic.syllabusRef || "Syllabus reference not set";
  const confidence = getTopicConfidence(topic.id);
  const isConfident = confidence === "confident" ? "is-active" : "";
  const isNeedsPractice = confidence === "needs-practice" ? "is-active" : "";
  const isNoIdea = confidence === "no-idea" ? "is-active" : "";

  byId("topic-main").innerHTML = `
    <div class="topic-head card">
      <div class="topic-meta-row">
        <p class="topic-breadcrumb">Home / ${escapeHtml(subject.name)} / ${escapeHtml(topic.title)}</p>
        <span class="topic-ref">${escapeHtml(syllabusRef)}</span>
      </div>
      <h1 class="topic-title">${escapeHtml(topic.title)}</h1>
      <p class="topic-subtitle">${richText(topic.subtitle || "")}</p>
      <div class="topic-actions">
        <button class="btn btn-primary" onclick="App.go('quiz',{topicId:'${topic.id}'})">Topic Quiz</button>
        <button class="btn btn-outline" onclick="App.go('flash',{topicId:'${topic.id}'})">Topic Flashcards</button>
        <button class="btn btn-outline" onclick="App.markTopicDone('${topic.id}')">Mark Done</button>
      </div>
      <div class="confidence-bar">
        <span>Confidence:</span>
        <div class="confidence-actions">
          <button class="pill-btn confidence-btn ${isConfident}" onclick="App.setTopicConfidence('${topic.id}','confident')">Confident</button>
          <button class="pill-btn confidence-btn ${isNeedsPractice}" onclick="App.setTopicConfidence('${topic.id}','needs-practice')">Needs Practice</button>
          <button class="pill-btn confidence-btn ${isNoIdea}" onclick="App.setTopicConfidence('${topic.id}','no-idea')">No Idea</button>
        </div>
      </div>
      <div class="section-nav">
        <button class="pill-btn" onclick="App.scrollToSection('section-concept')">Concept</button>
        <button class="pill-btn" onclick="App.scrollToSection('section-notes')">Notes</button>
        <button class="pill-btn" onclick="App.scrollToSection('section-defs')">Definitions</button>
        <button class="pill-btn" onclick="App.scrollToSection('section-worked')">Worked</button>
        <button class="pill-btn" onclick="App.scrollToSection('section-diagram')">Diagram</button>
        <button class="pill-btn" onclick="App.scrollToSection('section-recall')">Recall</button>
        <button class="pill-btn" onclick="App.scrollToSection('section-summary')">Summary</button>
      </div>
    </div>

    <section class="section-block card topic-panel" id="section-concept">
      <h2>Concept Explanation</h2>
      ${(topic.concept || []).map((p) => `<p class="topic-paragraph">${richText(p)}</p>`).join("")}
    </section>

    <section class="section-block card topic-panel" id="section-notes">
      <h2>Notes</h2>
      ${notesHtml}
    </section>

    <section class="section-block card topic-panel" id="section-defs">
      <h2>Key Definitions</h2>
      <div class="topic-grid-2">${defsHtml}</div>
    </section>

    <section class="section-block card topic-panel" id="section-worked">
      <h2>Worked Examples</h2>
      ${workedHtml}
    </section>

    <section class="section-block card topic-panel" id="section-diagram">
      <h2>Visual Diagram</h2>
      <div class="diagram-wrap">
        ${diagramHtml}
      </div>
    </section>

    <section class="section-block card topic-panel">
      <h2>Common Mistakes</h2>
      ${(topic.mistakes || []).map((m) => `<div class="alert-danger"><strong>Mistake:</strong> ${richText(m)}</div>`).join("")}
    </section>

    <section class="section-block card topic-panel">
      <h2>Exam Tips</h2>
      ${(topic.tips || []).map((tip) => `<div class="alert-warn"><strong>Tip:</strong> ${richText(tip)}</div>`).join("")}
    </section>

    <section class="section-block card topic-panel" id="section-recall">
      <h2>Active Recall</h2>
      <p class="topic-note">Try to answer before revealing model responses.</p>
      ${recallHtml}
    </section>

    <section class="section-block card topic-panel" id="section-summary">
      <h2>Summary Sheet</h2>
      <div class="summary-grid">${summaryHtml}</div>
    </section>

    <section class="section-block ai-panel card topic-panel">
      <h2>AI Study Coach (Beta)</h2>
      <p class="topic-note">Ask for step-by-step help on this topic. Connect your backend endpoint to enable live tutoring.</p>
      <textarea id="ai-prompt" placeholder="Example: Can you test me with 3 exam-style questions on this topic?"></textarea>
      <div class="ai-actions">
        <button class="btn btn-primary" onclick="App.askAi('${topic.id}')">Ask AI</button>
        <button class="btn btn-outline" onclick="App.go('past-papers')">Open Past Papers for Practice</button>
      </div>
      <div class="ai-answer" id="ai-answer">No request sent yet.</div>
    </section>
  `;
}

function toggleRecall(index) {
  const answer = byId(`recall-a-${index}`);
  const row = byId(`recall-${index}`);
  if (!answer || !row) return;

  answer.classList.toggle("open");
  const button = row.querySelector("button");
  if (button) {
    button.textContent = answer.classList.contains("open") ? "Hide answer" : "Show answer";
  }
}

function markTopicDone(topicId) {
  for (const subject of state.subjects) {
    for (const unit of subject.units) {
      const topic = unit.topics.find((item) => item.id === topicId);
      if (topic) {
        topic.done = true;
      }
    }
  }
  persistDoneTopics();
  showToast("Topic marked as complete. Great progress.");
  if (state.currentView === "topic") renderTopicView(topicId);
}
function buildQuizFromPayload(payload) {
  if (payload.topicId) {
    const topic = state.topics.get(payload.topicId);
    if (topic && topic.quiz && Array.isArray(topic.quiz.questions)) {
      return {
        title: topic.quiz.title || `${topic.title} Quiz`,
        sourceLabel: topic.title,
        questions: topic.quiz.questions,
      };
    }
  }

  const subjectId = payload.subjectId || state.currentSubject || "chem";
  const refs = getTopicRefsForSubject(subjectId);
  const questions = [];
  for (const ref of refs) {
    const topic = state.topics.get(ref.id);
    if (!topic || !topic.quiz || !Array.isArray(topic.quiz.questions)) continue;
    for (const q of topic.quiz.questions) {
      questions.push({ ...q, sourceTopic: topic.title });
    }
  }

  const shuffled = [...questions].sort(() => Math.random() - 0.5).slice(0, 10);
  return {
    title: `${state.subjectMap.get(subjectId)?.name || "Subject"} Master Quiz`,
    sourceLabel: state.subjectMap.get(subjectId)?.name || "Subject",
    questions: shuffled,
  };
}

function startQuiz(payload) {
  const quiz = buildQuizFromPayload(payload);
  state.quiz = {
    title: quiz.title,
    sourceLabel: quiz.sourceLabel,
    questions: quiz.questions,
    qIndex: 0,
    score: 0,
    answered: false,
  };

  if (!quiz.questions.length) {
    byId("quiz-content").innerHTML = `
      <div class="card">
        <h2>No quiz questions found</h2>
        <p>Add quiz items into topic JSON files under the quiz.questions array.</p>
      </div>
    `;
    return;
  }

  renderQuizQuestion();
}

function renderQuizQuestion() {
  const quiz = state.quiz;
  if (!quiz) return;

  if (quiz.qIndex >= quiz.questions.length) {
    renderQuizResult();
    return;
  }

  const q = quiz.questions[quiz.qIndex];
  const pct = Math.round((quiz.qIndex / quiz.questions.length) * 100);

  byId("quiz-content").innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <p style="color:var(--text2)">${escapeHtml(quiz.sourceLabel)} / Quiz</p>
      <h1 style="font-size:2rem">${escapeHtml(quiz.title)}</h1>
      <div class="quiz-progress">
        <div class="quiz-bar"><div class="quiz-fill" style="width:${pct}%"></div></div>
        <small>${quiz.qIndex + 1}/${quiz.questions.length}</small>
      </div>
      <div class="q-card">
        <small style="color:var(--text3);text-transform:uppercase">Question ${quiz.qIndex + 1}</small>
        <p class="q-text">${richText(q.q)}</p>
        <div class="q-options">
          ${(q.opts || [])
            .map(
              (option, i) => `
            <button class="q-option" id="q-opt-${i}" onclick="App.selectQuizAnswer(${i})">${richText(option)}</button>
          `
            )
            .join("")}
        </div>
        <div class="q-explain" id="quiz-exp">${richText(q.exp || "")}</div>
      </div>
      <div class="quiz-nav">
        <button class="btn btn-outline" onclick="App.go('home')">Exit Quiz</button>
        <button class="btn btn-primary" id="quiz-next" onclick="App.nextQuizQuestion()" style="display:none">${quiz.qIndex + 1 === quiz.questions.length ? "See Results" : "Next Question"}</button>
      </div>
    </div>
  `;
}

function selectQuizAnswer(index) {
  const quiz = state.quiz;
  if (!quiz || quiz.answered) return;
  quiz.answered = true;

  const q = quiz.questions[quiz.qIndex];
  const correct = index === q.ans;
  if (correct) quiz.score += 1;

  (q.opts || []).forEach((_, i) => {
    const button = byId(`q-opt-${i}`);
    if (!button) return;
    if (i === q.ans) button.classList.add("correct");
    if (i === index && i !== q.ans) button.classList.add("wrong");
  });

  byId("quiz-exp").classList.add("open");
  byId("quiz-next").style.display = "inline-flex";
}

function nextQuizQuestion() {
  const quiz = state.quiz;
  if (!quiz) return;
  quiz.qIndex += 1;
  quiz.answered = false;
  renderQuizQuestion();
}

function renderQuizResult() {
  const quiz = state.quiz;
  if (!quiz) return;

  const pct = Math.round((quiz.score / quiz.questions.length) * 100);
  const xp = quiz.score * 20;
  state.xp += xp;
  pushQuizScore(pct);
  
  // Save progress to backend
  saveProgressToBackend(state.currentTopic, pct);
  updateStatsOnBackend(xp);

  byId("quiz-content").innerHTML = `
    <div class="card result-box">
      <h1>Quiz Complete</h1>
      <div class="result-score">${pct}%</div>
      <p>${quiz.score}/${quiz.questions.length} correct</p>
      <p style="margin:0.7rem 0;color:var(--text2)">+${xp} XP earned</p>
      <div style="display:flex;gap:0.6rem;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="App.go('quiz',{topicId:'${state.currentTopic || ""}',subjectId:'${state.currentSubject || ""}'})">Retry</button>
        <button class="btn btn-outline" onclick="App.go('home')">Back Home</button>
      </div>
    </div>
  `;

  showToast(`Quiz score ${pct}% and +${xp} XP.`);
}

function buildFlashDeck(payload) {
  if (payload.topicId) {
    const topic = state.topics.get(payload.topicId);
    if (topic && Array.isArray(topic.flashcards) && topic.flashcards.length) {
      return { label: topic.title, cards: topic.flashcards };
    }
  }

  const subjectId = payload.subjectId || state.currentSubject || "chem";
  const refs = getTopicRefsForSubject(subjectId);
  const cards = [];
  for (const ref of refs) {
    const topic = state.topics.get(ref.id);
    if (!topic || !Array.isArray(topic.flashcards)) continue;
    cards.push(...topic.flashcards.map((card) => ({ ...card, topic: topic.title })));
  }
  return {
    label: state.subjectMap.get(subjectId)?.name || "Flashcards",
    cards,
  };
}

function startFlashcards(payload) {
  const deck = buildFlashDeck(payload);
  state.flash = {
    label: deck.label,
    cards: deck.cards,
    index: 0,
    flipped: false,
    results: new Array(deck.cards.length).fill(null),
  };

  renderFlashcard();
}

function renderFlashcard() {
  const flash = state.flash;
  if (!flash || !flash.cards.length) {
    byId("flash-content").innerHTML = `<div class="card"><h2>No flashcards found</h2><p>Add flashcards arrays to topic JSON files.</p></div>`;
    return;
  }

  if (flash.index >= flash.cards.length) {
    renderFlashResult();
    return;
  }

  const card = flash.cards[flash.index];
  const sideLabel = flash.flipped ? "Answer" : "Question";
  const sideText = flash.flipped ? card.a : card.q;

  byId("flash-content").innerHTML = `
    <div class="card" style="margin-bottom:0.9rem">
      <p style="color:var(--text2)">${escapeHtml(flash.label)} / Flashcards</p>
      <h1 style="font-size:2rem">Flashcards</h1>
      <p>${flash.index + 1} / ${flash.cards.length}</p>
    </div>
    <button class="flash-card" onclick="App.flipFlash()">
      <div>
        <small>${sideLabel}</small>
        <p>${richText(sideText)}</p>
      </div>
    </button>
    <div class="flash-actions">
      <button class="btn btn-outline" onclick="App.rateFlash(false)">Did Not Know</button>
      <button class="btn btn-outline" onclick="App.rateFlash(null)">Skip</button>
      <button class="btn btn-primary" onclick="App.rateFlash(true)">Knew It</button>
    </div>
  `;
}

function flipFlash() {
  if (!state.flash) return;
  state.flash.flipped = !state.flash.flipped;
  renderFlashcard();
}

function rateFlash(value) {
  if (!state.flash) return;
  state.flash.results[state.flash.index] = value;
  state.flash.index += 1;
  state.flash.flipped = false;
  renderFlashcard();
}

function renderFlashResult() {
  const flash = state.flash;
  const known = flash.results.filter((r) => r === true).length;

  byId("flash-content").innerHTML = `
    <div class="card result-box">
      <h1>Flashcards Complete</h1>
      <div class="result-score">${known}/${flash.cards.length}</div>
      <p style="color:var(--text2)">Cards marked as known.</p>
      <div style="display:flex;gap:0.6rem;justify-content:center;flex-wrap:wrap;margin-top:0.8rem">
        <button class="btn btn-primary" onclick="App.go('flash',{subjectId:'${state.currentSubject || "chem"}'})">Restart</button>
        <button class="btn btn-outline" onclick="App.go('home')">Back Home</button>
      </div>
    </div>
  `;

  showToast("Flashcard session completed.");
}
function renderPastPapers() {
  const subjectFilter = byId("paper-subject-filter");
  const yearFilter = byId("paper-year-filter");

  if (!subjectFilter.dataset.ready) {
    subjectFilter.innerHTML = `<option value="all">All subjects</option>${state.subjects
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join("")}`;

    const years = Array.from(new Set(state.pastPapers.map((paper) => paper.year))).sort((a, b) => b - a);
    yearFilter.innerHTML = `<option value="all">All years</option>${years
      .map((year) => `<option value="${year}">${year}</option>`)
      .join("")}`;

    subjectFilter.addEventListener("change", renderPastPapers);
    yearFilter.addEventListener("change", renderPastPapers);
    subjectFilter.dataset.ready = "1";
  }

  const subjectValue = subjectFilter.value || "all";
  const yearValue = yearFilter.value || "all";

  const papers = state.pastPapers.filter((paper) => {
    const subjectOk = subjectValue === "all" || paper.subject === subjectValue;
    const yearOk = yearValue === "all" || String(paper.year) === yearValue;
    return subjectOk && yearOk;
  });

  byId("past-paper-list").innerHTML = papers
    .map((paper) => {
      const subject = state.subjectMap.get(paper.subject);
      return `
      <div class="paper-card">
        <h3>${escapeHtml(subject?.name || paper.subject)} ${paper.code} ${paper.paper} Variant ${paper.variant}</h3>
        <p>${paper.session} ${paper.year} - ${escapeHtml(paper.title)}</p>
        <p>Difficulty: ${escapeHtml(paper.difficulty)}</p>
        <div style="margin-top:0.6rem;display:flex;gap:0.5rem;flex-wrap:wrap">
          <a class="btn btn-outline" href="${escapeHtml(paper.downloadUrl)}" target="_blank" rel="noreferrer">Open PDF</a>
          <button class="btn btn-primary" onclick="App.go('subject',{subjectId:'${paper.subject}'})">Revise Linked Topic</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderCommunity() {
  const forumList = byId("forum-list");
  const forumThread = byId("forum-thread");

  const forumItemsHtml = state.community.forumThreads
    .map((thread) => {
      const subject = state.subjectMap.get(thread.subject);
      const activeClass = thread.id === state.selectedThreadId ? "active" : "";
      return `
      <button class="forum-item ${activeClass}" onclick="App.selectThread('${thread.id}')">
        <h3>${escapeHtml(thread.title)}</h3>
        <p>${escapeHtml(thread.body)}</p>
        <div class="forum-meta">
          <span>${escapeHtml(subject?.name || thread.subject)}</span>
          <span>@${escapeHtml(thread.author)}</span>
          <span>${thread.replies} replies</span>
          <span>${escapeHtml(thread.lastActive)}</span>
        </div>
      </button>
    `;
    })
    .join("");
  forumList.innerHTML = `
    <div class="forum-list-shell card">
      <div class="forum-stack">
        ${forumItemsHtml}
      </div>
    </div>
  `;

  const activeThread = state.community.forumThreads.find((thread) => thread.id === state.selectedThreadId);
  if (activeThread) {
    forumThread.innerHTML = `
      <h2>${escapeHtml(activeThread.title)}</h2>
      <p style="margin:0.5rem 0">${escapeHtml(activeThread.body)}</p>
      <p style="color:var(--text2)">Posted by @${escapeHtml(activeThread.author)} | ${activeThread.replies} replies | ${escapeHtml(activeThread.lastActive)}</p>
      <div style="margin-top:0.8rem;display:flex;gap:0.6rem;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="App.showToast('Thread bookmarked')">Bookmark Thread</button>
        <button class="btn btn-primary" onclick="App.showToast('Reply box can be wired to your backend API')">Reply</button>
      </div>
    `;
  }

  renderChatSidebar();
}

function renderChatSidebar() {
  byId("chat-channel-list").innerHTML = state.community.chatChannels
    .map(
      (channel) => `
      <button class="chat-channel-btn ${channel.id === state.selectedChannelId ? "active" : ""}" onclick="App.selectChannel('${channel.id}')">
        # ${escapeHtml(channel.name)}
      </button>
    `
    )
    .join("");

  const channel = state.community.chatChannels.find((item) => item.id === state.selectedChannelId);
  const messages = channel?.messages || [];

  byId("chat-messages").innerHTML = messages
    .map(
      (message) => `
      <div class="chat-message">
        <strong>${escapeHtml(message.user)}</strong>
        <small>${escapeHtml(message.time)}</small>
        <p>${escapeHtml(message.text)}</p>
      </div>
    `
    )
    .join("");
}

function selectThread(threadId) {
  state.selectedThreadId = threadId;
  renderCommunity();
}

function selectChannel(channelId) {
  state.selectedChannelId = channelId;
  renderChatSidebar();
}

function sendChatMessage() {
  const input = byId("chat-input");
  const text = input.value.trim();
  if (!text) return;

  const channel = state.community.chatChannels.find((item) => item.id === state.selectedChannelId);
  if (!channel) return;

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  channel.messages.push({ user: "you", time: `${hh}:${mm}`, text });

  input.value = "";
  renderChatSidebar();
}

function renderProfile() {
  const overall = totalProgress();
  const avgQuiz = quizHistory();
  const avgScore = avgQuiz.length
    ? Math.round(avgQuiz.reduce((sum, item) => sum + item.scorePct, 0) / avgQuiz.length)
    : 0;

  // Update profile identity from auth
  const user = auth.user;
  const avatarEl = byId("profile-avatar");
  const nameEl   = byId("profile-name");
  const emailEl  = byId("profile-email");
  if (user) {
    const initials = user.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl)   nameEl.textContent   = user.name;
    if (emailEl)  emailEl.textContent  = user.email;
  } else {
    if (avatarEl) avatarEl.textContent = "?";
    if (nameEl)   nameEl.textContent   = "Sign in to view profile";
    if (emailEl)  emailEl.textContent  = "";
  }

  byId("profile-topics").textContent = `${overall.done}/${overall.total}`;
  byId("profile-avg").textContent = `${avgScore}%`;
  byId("profile-xp").textContent = state.xp.toLocaleString();

  byId("profile-progress").innerHTML = state.subjects
    .map((subject) => {
      const p = getProgress(subject.id);
      return `
      <div class="card card-sm" style="margin-top:0.7rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.45rem">
          <strong>${escapeHtml(subject.name)}</strong>
          <span>${p.pct}%</span>
        </div>
        <div class="quiz-bar"><div class="quiz-fill" style="width:${p.pct}%;background:${colorVar(subject.id)}"></div></div>
      </div>
    `;
    })
    .join("");
}
async function askAi(topicId) {
  const promptEl = byId("ai-prompt");
  const answerEl = byId("ai-answer");
  const prompt = promptEl.value.trim();
  if (!prompt) {
    answerEl.textContent = "Add a question first.";
    return;
  }

  answerEl.textContent = "Generating response...";

  try {
    const topic = state.topics.get(topicId);
    const response = await fetch("/api/ai-tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicId,
        topicTitle: topic?.title || topicId,
        subjectId: topic?.subject || state.currentSubject,
        prompt,
      }),
    });

    if (!response.ok) {
      throw new Error("AI endpoint unavailable");
    }

    const body = await response.json();
    answerEl.textContent = body.answer || "No answer returned.";
  } catch {
    answerEl.textContent =
      "AI endpoint is not configured yet. Add a backend route POST /api/ai-tutor that calls your model API and returns {answer}.";
  }
}

function showToast(message) {
  const root = byId("toast-root");
  const existing = root.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 2800);
}

function syncThemeIcon(theme) {
  const icon = byId("theme-icon");
  if (!icon) return;

  if (theme === "dark") {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>';
  } else {
    icon.innerHTML =
      '<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><line x1="12" y1="2" x2="12" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="20" x2="12" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="12" x2="4" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  }
}

function createParticleSystem() {
  const canvas = byId("ambient-particles");
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let rafId = 0;
  let particles = [];
  let palette = {
    a: "rgba(0, 212, 170, 0.25)",
    b: "rgba(129, 140, 248, 0.2)",
    link: "rgba(255, 255, 255, 0.08)",
  };

  function withAlpha(color, alpha) {
    const value = String(color || "").trim();
    if (value.startsWith("#")) {
      const hex = value.slice(1);
      const normalized = hex.length === 3 ? hex.split("").map((v) => v + v).join("") : hex;
      if (normalized.length === 6) {
        const r = parseInt(normalized.slice(0, 2), 16);
        const g = parseInt(normalized.slice(2, 4), 16);
        const b = parseInt(normalized.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }
    const rgbMatch = value.match(/^rgb\(\s*([0-9]+),\s*([0-9]+),\s*([0-9]+)\s*\)$/i);
    if (rgbMatch) {
      return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    }
    return value || `rgba(255, 255, 255, ${alpha})`;
  }

  function refreshPalette() {
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue("--accent").trim() || "#00d4aa";
    const phy = style.getPropertyValue("--phy").trim() || "#818cf8";
    const text = style.getPropertyValue("--text").trim() || "#e6edf3";
    palette = {
      a: withAlpha(accent, 0.25),
      b: withAlpha(phy, 0.2),
      link: withAlpha(text, 0.1),
    };
  }

  function makeParticle() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: 0.8 + Math.random() * 1.8,
      c: Math.random() > 0.5 ? "a" : "b",
    };
  }

  function rebuildParticles() {
    const count = width < 760 ? 26 : 40;
    particles = new Array(count).fill(null).map(() => makeParticle());
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildParticles();
  }

  function drawLinks() {
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 120) continue;
        const alpha = Math.max(0, 1 - dist / 120) * 0.35;
        ctx.strokeStyle = palette.link;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  function tick() {
    ctx.clearRect(0, 0, width, height);
    drawLinks();

    for (const p of particles) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = palette[p.c];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      if (!reduceMotionQuery.matches) {
        p.x += p.vx;
        p.y += p.vy;
      }

      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;
      if (p.y < -20) p.y = height + 20;
      if (p.y > height + 20) p.y = -20;
    }

    ctx.globalAlpha = 1;
    rafId = window.requestAnimationFrame(tick);
  }

  function destroy() {
    window.cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resize);
  }

  refreshPalette();
  resize();
  tick();
  window.addEventListener("resize", resize);

  return { refreshPalette, destroy };
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("revise.theme", theme);
  syncThemeIcon(theme);
  if (state.particleSystem) {
    state.particleSystem.refreshPalette();
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
}

function initTheme() {
  const stored = localStorage.getItem("revise.theme") || "dark";
  setTheme(stored);
}

function bindSearch() {
  const input = byId("search-input");
  const results = byId("search-results");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      results.classList.remove("open");
      return;
    }

    const hits = state.searchIndex
      .filter((item) => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q))
      .slice(0, 7);

    if (!hits.length) {
      results.classList.remove("open");
      return;
    }

    results.innerHTML = hits
      .map(
        (hit) => `
        <button class="search-item" onclick="App.openFromSearch('${hit.subject}','${hit.id}')">
          <strong>${escapeHtml(hit.title)}</strong><br>
          <small>${escapeHtml(state.subjectMap.get(hit.subject)?.name || hit.subject)}</small>
        </button>
      `
      )
      .join("");

    results.classList.add("open");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-search")) {
      results.classList.remove("open");
    }
  });
}

function openFromSearch(subjectId, topicId) {
  state.currentSubject = subjectId;
  byId("search-input").value = "";
  byId("search-results").classList.remove("open");
  go("topic", { topicId });
}

function bindBaseEvents() {
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = button.getAttribute("data-route");
      go(route);
    });
  });

  updateNavForAuth();
  byId("theme-toggle").addEventListener("click", toggleTheme);
  byId("chat-send").addEventListener("click", sendChatMessage);
  byId("chat-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendChatMessage();
  });

  bindSearch();
}

function showDataLoadError(error) {
  const container = byId("view-home");
  container.innerHTML = `
    <div class="container page-pad">
      <div class="card">
        <h1>Data Load Error</h1>
        <p>The app could not load JSON content files.</p>
        <p style="margin-top:0.5rem;color:var(--text2)">${escapeHtml(error.message)}</p>
        <p style="margin-top:0.5rem;color:var(--text2)">Run this project from a local web server so fetch can read local files.</p>
      </div>
    </div>
  `;
}

async function init() {
  try {
    initTheme();
    state.particleSystem = createParticleSystem();
    await loadData();
    bindBaseEvents();
    updateNavForAuth();
    byId("streak-count").textContent = String(state.streak);
    go("home");
  } catch (error) {
    showDataLoadError(error);
  }
}

// Editor Functions
let editorState = {
  currentSubject: null,
  currentTopic: null,
  originalJson: null,
};

function loadEditorSubject(subjectId) {
  if (!subjectId) return;
  editorState.currentSubject = subjectId;
  editorState.currentTopic = null;

  const refs = getTopicRefsForSubject(subjectId);
  const listEl = byId("editor-topics-list");

  listEl.innerHTML = refs
    .map(
      (ref) => `
      <div class="editor-topic-item" onclick="App.openTopicInEditor('${ref.id}')" data-topic-id="${ref.id}">
        <strong>${escapeHtml(ref.name)}</strong>
        <small style="color:var(--text2);display:block;margin-top:0.2rem">${ref.id}</small>
      </div>
    `
    )
    .join("");
}

function openTopicInEditor(topicId) {
  const topic = state.topics.get(topicId);
  if (!topic) {
    showToast("Topic not found");
    return;
  }

  editorState.currentTopic = topicId;
  editorState.originalJson = JSON.stringify(topic, null, 2);

  // Update UI
  document.querySelectorAll(".editor-topic-item").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.topicId === topicId) item.classList.add("active");
  });

  byId("editor-title").textContent = `Editing: ${topic.title}`;
  byId("editor-json").value = editorState.originalJson;
  byId("editor-save-btn").style.display = "inline-flex";
  byId("editor-cancel-btn").style.display = "inline-flex";
  byId("editor-delete-btn").style.display = "inline-flex";
}

function saveTopic() {
  if (!editorState.currentTopic) return;

  try {
    const jsonStr = byId("editor-json").value;
    const parsed = JSON.parse(jsonStr);

    // Update in-memory topic
    state.topics.set(editorState.currentTopic, parsed);

    showToast("Topic saved (in-memory only - add backend endpoint to persist)");
    editorState.originalJson = jsonStr;

    // Refresh the topic view if it's currently being viewed
    if (state.currentView === "topic" && state.currentTopic === editorState.currentTopic) {
      renderTopicView(editorState.currentTopic);
    }
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

function cancelEdit() {
  byId("editor-json").value = editorState.originalJson || "";
  showToast("Changes discarded");
}

function deleteCurrentTopic() {
  if (!editorState.currentTopic || !confirm("Really delete this topic? This action cannot be undone.")) return;

  state.topics.delete(editorState.currentTopic);
  
  // Remove from unit.topics arrays
  for (const subject of state.subjects) {
    for (const unit of subject.units) {
      const index = unit.topics.findIndex((t) => t.id === editorState.currentTopic);
      if (index >= 0) {
        unit.topics.splice(index, 1);
      }
    }
  }

  editorState.currentTopic = null;
  byId("editor-title").textContent = "Select a topic to edit";
  byId("editor-json").value = "";
  byId("editor-save-btn").style.display = "none";
  byId("editor-cancel-btn").style.display = "none";
  byId("editor-delete-btn").style.display = "none";

  loadEditorSubject(editorState.currentSubject);
  showToast("Topic deleted");
}

function createNewTopic() {
  if (!editorState.currentSubject) {
    showToast("Please select a subject first");
    return;
  }

  const newId = `new-topic-${Date.now()}`;
  const newTopic = {
    id: newId,
    subject: editorState.currentSubject,
    title: "New Topic",
    subtitle: "Brief summary",
    concept: ["Add concept explanation here"],
    notes: [{ heading: "Key Ideas", items: ["Point 1", "Point 2"] }],
    definitions: [{ term: "Key term", body: "Definition" }],
    workedExamples: [{ q: "Example question?", steps: [{ n: 1, sub: "Identify", text: "What is given?" }] }],
    mistakes: ["Common error to avoid"],
    tips: ["Exam saver tip"],
    recall: [{ q: "Recall question?", a: "Model answer" }],
    summary: [{ label: "Key Idea", val: "Summary point" }],
    flashcards: [{ q: "Card question?", a: "Card answer" }],
    quiz: { title: "New Topic Quiz", questions: [] },
    diagramSvg: '<svg viewBox="0 0 420 160"></svg>',
  };

  state.topics.set(newId, newTopic);

  // Add to current subject's first unit
  const subject = state.subjectMap.get(editorState.currentSubject);
  if (subject && subject.units.length > 0) {
    subject.units[0].topics.push({ id: newId, name: "New Topic", file: `${newId}.json` });
  }

  editorState.currentTopic = newId;
  editorState.originalJson = JSON.stringify(newTopic, null, 2);

  byId("editor-title").textContent = `Editing: ${newTopic.title}`;
  byId("editor-json").value = editorState.originalJson;
  byId("editor-save-btn").style.display = "inline-flex";
  byId("editor-cancel-btn").style.display = "inline-flex";
  byId("editor-delete-btn").style.display = "inline-flex";

  showToast("New topic created. Fill in details and save.");
}

function showEditorHelp() {
  showToast("Editor Help: Edit JSON to modify topic properties. Save sends to backend. Delete removes from system.");
}

const App = {
  go,
  scrollToSection,
  setTopicConfidence,
  toggleRecall,
  markTopicDone,
  selectQuizAnswer,
  nextQuizQuestion,
  flipFlash,
  rateFlash,
  selectThread,
  selectChannel,
  askAi,
  showToast,
  openFromSearch,
  loadEditorSubject,
  openTopicInEditor,
  saveTopic,
  cancelEdit,
  deleteCurrentTopic,
  createNewTopic,
  showEditorHelp,
};

window.App = App;
init();
