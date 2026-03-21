
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
  streak: 0,
  xp: 0,
  weeklyMinutes: [0, 0, 0, 0, 0, 0, 0],
};

const doneStorageKey       = "revise.doneTopics";
const quizStorageKey       = "revise.quizScores";
const confidenceStorageKey = "revise.topicConfidence";
const authTokenKey         = "revise.authToken";
const authUserKey          = "revise.authUser";
const weeklyMinutesKey     = "revise.weeklyMinutes";
const weeklyMinutesWeekKey = "revise.weeklyMinutesWeek";
const streakKey            = "revise.streak";
const streakDateKey        = "revise.streakDate";

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

// updateNavForAuth is defined in the new section below


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
  if (input === null || input === undefined) return '';
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
  // ── Helpers ───────────────────────────────────────────────────────────
  const tid = (topic.id || "").toLowerCase();
  const sub = (topic.subject || "chem");

  // Colour palette per subject
  const palette = {
    chem: { accent:"#f97316", stroke:"rgba(249,115,22,0.7)", fill:"rgba(249,115,22,0.18)", bg:"rgba(249,115,22,0.07)", glow:"rgba(249,115,22,0.12)", line:"rgba(249,115,22,0.55)", text:"#f97316" },
    bio:  { accent:"#22c55e", stroke:"rgba(34,197,94,0.7)",  fill:"rgba(34,197,94,0.18)",  bg:"rgba(34,197,94,0.07)",  glow:"rgba(34,197,94,0.12)",  line:"rgba(34,197,94,0.55)",  text:"#22c55e" },
    phy:  { accent:"#818cf8", stroke:"rgba(129,140,248,0.7)",fill:"rgba(129,140,248,0.18)",bg:"rgba(129,140,248,0.07)",glow:"rgba(129,140,248,0.12)",line:"rgba(129,140,248,0.55)", text:"#818cf8" },
  };
  const P = palette[sub] || palette.chem;

  // Shared SVG wrapper
  const W = 700, H = 260;
  const wrap = (inner, ariaLabel) =>
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(ariaLabel || topic.title)}">
  <defs>
    <radialGradient id="bg-${tid}" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="${P.glow}"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <marker id="arr-${tid}" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="${P.stroke}"/>
    </marker>
    <marker id="arr2-${tid}" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#8b949e"/>
    </marker>
  </defs>
  <rect width="${W}" height="${H}" rx="20" fill="url(#bg-${tid})"/>
  <rect x="1" y="1" width="${W-2}" height="${H-2}" rx="20" fill="none" stroke="${P.stroke}" stroke-width="1.2"/>
  ${inner}
</svg>`;

  // Hexagon polygon at (cx,cy) with radius r
  const hex = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 30);
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  // Draw a hexagon node
  const hexNode = (cx, cy, r, fillColor, strokeColor) =>
    `<polygon points="${hex(cx,cy,r)}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.6"/>`;

  // Auto-sizing label inside a hex
  const hexLabel = (cx, cy, lines, size=11) => {
    if (!Array.isArray(lines)) lines = [lines];
    const lineH = size * 1.4;
    const totalH = lines.length * lineH;
    const startY = cy - totalH / 2 + lineH * 0.75;
    return lines.map((l, i) =>
      `<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle" fill="#e6edf3" font-size="${size}" font-family="DM Sans" font-weight="500">${escapeXml(String(l || ""))}</text>`
    ).join("");
  };

  // Section title
  const title = (txt) =>
    `<text x="28" y="32" fill="${P.accent}" font-size="13" font-family="DM Sans" font-weight="700" letter-spacing="0.3">${escapeXml(txt)}</text>`;

  // Connecting lines
  const line  = (x1,y1,x2,y2, col, w=2, dash="") =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col||P.line}" stroke-width="${w}" stroke-linecap="round"${dash?` stroke-dasharray="${dash}"`:""}/>`;
  const arrow = (x1,y1,x2,y2, col) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col||P.line}" stroke-width="2" stroke-linecap="round" marker-end="url(#arr-${tid})"/>`;
  const curve = (d, col, w=2) =>
    `<path d="${d}" fill="none" stroke="${col||P.line}" stroke-width="${w}" stroke-linecap="round"/>`;
  const label = (x,y,txt,col,size=10.5,anchor="middle") =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${col||"#8b949e"}" font-size="${size}" font-family="DM Sans">${escapeXml(String(txt||""))}</text>`;

  // ══════════════════════════════════════════════════════════════════════
  // CHEMISTRY TOPICS
  // ══════════════════════════════════════════════════════════════════════

  if (sub === "chem") {

    // Atomic Structure — electron shell diagram + subshell blocks
    if (tid.includes("atomic-structure") || tid.includes("atomic_structure")) {
      const nucleus = hexNode(120, 140, 34, "rgba(249,115,22,0.30)", P.stroke);
      return wrap(`
        ${title("Atomic Structure")}
        ${nucleus}
        ${hexLabel(120, 140, ["nucleus", "p⁺ n⁰"], 11)}
        <circle cx="120" cy="140" r="58" fill="none" stroke="${P.line}" stroke-width="1.3" stroke-dasharray="4 3"/>
        <circle cx="120" cy="140" r="82" fill="none" stroke="${P.line}" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>
        <circle cx="120" cy="82" r="6" fill="${P.accent}"/>
        <circle cx="178" cy="140" r="6" fill="${P.accent}"/>
        <circle cx="120" cy="198" r="6" fill="${P.accent}"/>
        <circle cx="62"  cy="140" r="6" fill="${P.accent}"/>
        ${label(120, 77, "e⁻", P.accent, 10)}
        ${label(190, 143, "e⁻", P.accent, 10)}
        ${line(230,60, 690,60, P.line, 1, "2 3")}
        ${hexNode(310, 105, 34, P.fill, P.stroke)}
        ${hexLabel(310, 105, ["1s²2s²","2p⁶  …"], 10)}
        ${hexNode(460, 105, 34, P.fill, P.stroke)}
        ${hexLabel(460, 105, ["Isotopes","same Z", "diff A"], 9)}
        ${hexNode(610, 105, 34, P.fill, P.stroke)}
        ${hexLabel(610, 105, ["Ionisation","Energy"], 10)}
        ${hexNode(310, 180, 34, P.fill, P.stroke)}
        ${hexLabel(310, 180, ["Orbital","shapes"], 10)}
        ${hexNode(460, 180, 34, P.fill, P.stroke)}
        ${hexLabel(460, 180, ["E shells","n=1,2,3…"], 10)}
        ${hexNode(610, 180, 34, P.fill, P.stroke)}
        ${hexLabel(610, 180, ["Aufbau","principle"], 10)}
        ${line(310,71, 310,61, "#8b949e",1)} ${line(460,71, 460,61, "#8b949e",1)} ${line(610,71, 610,61, "#8b949e",1)}
        ${line(310,146, 310,146, P.line, 0)}
        ${line(280,105, 260,105, P.line, 1, "3 2")} ${line(280,180, 260,180, P.line, 1, "3 2")}
      `);
    }

    // Stoichiometry — mole wheel
    if (tid.includes("stoichiometry")) {
      return wrap(`
        ${title("Stoichiometry — The Mole")}
        ${hexNode(350, 140, 44, "rgba(249,115,22,0.25)", P.stroke)}
        ${hexLabel(350, 140, ["Mole","(n)"], 13)}
        ${hexNode(200, 80,  32, P.fill, P.stroke)}  ${hexLabel(200, 80,  ["mass","÷ Mᵣ"], 10)}
        ${hexNode(500, 80,  32, P.fill, P.stroke)}  ${hexLabel(500, 80,  ["volume","at STP"], 10)}
        ${hexNode(200, 200, 32, P.fill, P.stroke)}  ${hexLabel(200, 200, ["conc","× vol"], 10)}
        ${hexNode(500, 200, 32, P.fill, P.stroke)}  ${hexLabel(500, 200, ["particles","× Nₐ"], 10)}
        ${hexNode(90,  140, 28, "rgba(249,115,22,0.10)", P.stroke)} ${hexLabel(90,140,["Mᵣ"],10)}
        ${hexNode(610, 140, 28, "rgba(249,115,22,0.10)", P.stroke)} ${hexLabel(610,140,["Nₐ"],10)}
        ${arrow(228,91,318,126, P.line)} ${arrow(472,91,382,126, P.line)}
        ${arrow(228,189,318,154, P.line)} ${arrow(472,189,382,154, P.line)}
        ${line(118,140, 168,140, P.line, 1, "3 2")} ${line(532,140, 582,140, P.line, 1, "3 2")}
        ${label(270,76,"n = m/Mᵣ","#8b949e",9)} ${label(440,76,"n = V/24","#8b949e",9)}
        ${label(265,215,"n = cv","#8b949e",9)}  ${label(438,215,"n = N/Nₐ","#8b949e",9)}
      `);
    }

    // Chemical Bonding
    if (tid.includes("chemical-bonding") || tid.includes("bonding")) {
      return wrap(`
        ${title("Chemical Bonding")}
        ${hexNode(350, 135, 40, "rgba(249,115,22,0.22)", P.stroke)}
        ${hexLabel(350, 135, ["Bond","Types"], 12)}
        ${hexNode(180, 80,  34, P.fill, P.stroke)} ${hexLabel(180, 80,  ["Ionic","δ+ δ−"], 10)}
        ${hexNode(520, 80,  34, P.fill, P.stroke)} ${hexLabel(520, 80,  ["Covalent","shared e⁻"], 10)}
        ${hexNode(180, 190, 34, P.fill, P.stroke)} ${hexLabel(180, 190, ["Metallic","e⁻ sea"], 10)}
        ${hexNode(520, 190, 34, P.fill, P.stroke)} ${hexLabel(520, 190, ["Dative","lone pair"], 10)}
        ${hexNode(90,  135, 30, P.fill, P.stroke)} ${hexLabel(90,  135, ["Giant","lattice"], 9)}
        ${hexNode(610, 135, 30, P.fill, P.stroke)} ${hexLabel(610, 135, ["VSEPR","shapes"], 9)}
        ${line(214,91,314,122,P.line)} ${line(486,91,386,122,P.line)}
        ${line(214,179,314,148,P.line)} ${line(486,179,386,148,P.line)}
        ${line(120,135,196,135,P.line,1,"3 2")} ${line(504,135,580,135,P.line,1,"3 2")}
        ${label(245,68,"electron transfer","#8b949e",8.5)} ${label(450,68,"electrons shared","#8b949e",8.5)}
      `);
    }

    // Energetics / Thermodynamics
    if (tid.includes("energetics") || tid.includes("thermochem")) {
      return wrap(`
        ${title("Energetics — Enthalpy")}
        <rect x="60" y="170" width="580" height="2" rx="1" fill="${P.line}" opacity="0.4"/>
        <rect x="60" y="170" width="580" height="50" rx="4" fill="${P.fill}" opacity="0.3"/>
        ${label(350,198,"Reactants + Products (reference line)","#8b949e",9)}
        <path d="M120,170 L120,100 L260,100" fill="none" stroke="${P.accent}" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M260,100 L400,100 L400,170" fill="none" stroke="${P.accent}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="5 3"/>
        <path d="M460,170 L460,75 L600,75 L600,170" fill="none" stroke="#818cf8" stroke-width="2.5" stroke-linecap="round"/>
        ${hexNode(190, 100, 28, P.fill, P.stroke)} ${hexLabel(190,100,["Exo","ΔH<0"],10)}
        ${hexNode(530, 75,  28, "rgba(129,140,248,0.2)", "rgba(129,140,248,0.7)")} ${hexLabel(530,75,["Endo","ΔH>0"],10)}
        ${hexNode(350, 60,  26, P.fill, P.stroke)} ${hexLabel(350,60,["Eₐ","activ."],9)}
        ${arrow(280,60,324,60,P.line)}
        ${label(120,94,"start","#8b949e",8.5)} ${label(600,92,"start","#8b949e",8.5)}
        ${label(400,93,"end","#8b949e",8.5)}  ${label(460,69,"end","#8b949e",8.5)}
        ${line(260,100, 350,86, P.line, 1, "2 2")}
      `);
    }

    // Kinetics
    if (tid.includes("kinetics")) {
      return wrap(`
        ${title("Reaction Kinetics")}
        ${hexNode(120, 135, 36, P.fill, P.stroke)} ${hexLabel(120,135,["Rate","factors"],11)}
        ${hexNode(270, 85,  30, P.fill, P.stroke)} ${hexLabel(270,85,["Temp","↑ rate"],10)}
        ${hexNode(270, 185, 30, P.fill, P.stroke)} ${hexLabel(270,185,["Conc","↑ rate"],10)}
        ${hexNode(420, 85,  30, P.fill, P.stroke)} ${hexLabel(420,85,["Surface","area"],10)}
        ${hexNode(420, 185, 30, P.fill, P.stroke)} ${hexLabel(420,185,["Catalyst","↓ Eₐ"],10)}
        ${hexNode(570, 135, 36, P.fill, P.stroke)} ${hexLabel(570,135,["Maxwell-","Boltzmann"],9)}
        ${line(156,135,240,135,P.line)} ${line(300,91,390,91,P.line,1,"3 2")} ${line(300,179,390,179,P.line,1,"3 2")}
        ${line(450,95,539,120,P.line)} ${line(450,175,539,150,P.line)}
        <path d="M590,195 Q620,155 610,130 Q600,105 580,110" fill="none" stroke="${P.accent}" stroke-width="2"/>
        ${label(632,150,"f(E)","#8b949e",9)} ${label(592,118,"Eₐ","#8b949e",8.5)}
      `);
    }

    // Equilibria
    if (tid.includes("equilibria") || tid.includes("equilibrium")) {
      return wrap(`
        ${title("Chemical Equilibria")}
        ${hexNode(190, 135, 40, P.fill, P.stroke)} ${hexLabel(190,135,["Forward","reaction"],11)}
        ${hexNode(510, 135, 40, P.fill, P.stroke)} ${hexLabel(510,135,["Reverse","reaction"],11)}
        ${arrow(234,120, 466,120, P.accent)} ${arrow(466,150, 234,150, "#818cf8")}
        ${label(350,113,"kf","#f97316",9)} ${label(350,165,"kr","#818cf8",9)}
        ${hexNode(350, 55,  28, P.fill, P.stroke)} ${hexLabel(350,55,["Kc","= [P]/[R]"],9.5)}
        ${hexNode(100, 60,  26, P.fill, P.stroke)} ${hexLabel(100,60,["Le","Chatelier"],9)}
        ${hexNode(600, 60,  26, P.fill, P.stroke)} ${hexLabel(600,60,["Kp","= pᵅpᵝ…"],9)}
        ${hexNode(100, 210, 26, P.fill, P.stroke)} ${hexLabel(100,210,["Haber","Process"],9)}
        ${hexNode(600, 210, 26, P.fill, P.stroke)} ${hexLabel(600,210,["Contact","Process"],9)}
        ${line(350,83,350,95,P.line,1,"3 2")} ${line(120,86,150,100,P.line,1,"3 2")}
        ${line(580,86,560,100,P.line,1,"3 2")}
      `);
    }

    // Electrochemistry
    if (tid.includes("electrochem")) {
      return wrap(`
        ${title("Electrochemistry")}
        <rect x="70" y="100" width="240" height="110" rx="14" fill="${P.fill}" stroke="${P.stroke}" stroke-width="1.4"/>
        <rect x="390" y="100" width="240" height="110" rx="14" fill="rgba(129,140,248,0.14)" stroke="rgba(129,140,248,0.6)" stroke-width="1.4"/>
        ${label(190,124,"Anode (−) oxidation","#f97316",10)} ${label(510,124,"Cathode (+) reduction","#818cf8",10)}
        <line x1="310" y1="155" x2="390" y2="155" stroke="#8b949e" stroke-width="6" stroke-linecap="round" opacity="0.4"/>
        ${label(350,152,"salt bridge","#8b949e",8.5)}
        <path d="M190,100 L190,70 L510,70 L510,100" fill="none" stroke="${P.accent}" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M340,70 L360,70" fill="none" stroke="${P.accent}" stroke-width="4"/>
        ${label(350,64,"e⁻ flow","#f97316",9)}
        ${hexNode(190,170,22,P.fill,P.stroke)} ${hexLabel(190,170,["M→Mⁿ⁺","+ ne⁻"],8.5)}
        ${hexNode(510,170,22,"rgba(129,140,248,0.2)","rgba(129,140,248,0.7)")} ${hexLabel(510,170,["Mⁿ⁺+ne⁻","→M"],8.5)}
        ${hexNode(350,220,28,P.fill,P.stroke)} ${hexLabel(350,220,["EMF = E°cathode","− E°anode"],8.5)}
      `);
    }

    // Organic basics + any other organic
    if (tid.includes("organic") || tid.includes("hydrocarbons") || tid.includes("alkene") || tid.includes("alkane")) {
      return wrap(`
        ${title("Organic Chemistry — Homologous Series")}
        ${hexNode(120,135, 36, P.fill, P.stroke)} ${hexLabel(120,135,["Alkanes","CₙH₂ₙ₊₂"],10)}
        ${hexNode(270,80,  30, P.fill, P.stroke)} ${hexLabel(270,80, ["Alkenes","CₙH₂ₙ"],10)}
        ${hexNode(270,190, 30, P.fill, P.stroke)} ${hexLabel(270,190,["Arenes","benzene"],10)}
        ${hexNode(420,80,  30, P.fill, P.stroke)} ${hexLabel(420,80, ["Alcohols","−OH"],10)}
        ${hexNode(420,190, 30, P.fill, P.stroke)} ${hexLabel(420,190,["Carbonyls","C=O"],10)}
        ${hexNode(570,135, 36, P.fill, P.stroke)} ${hexLabel(570,135,["Carboxyl","−COOH"],10)}
        ${line(156,120,240,95,P.line)} ${line(156,150,240,175,P.line)}
        ${line(300,80,390,80,P.line,1,"3 2")} ${line(300,190,390,190,P.line,1,"3 2")}
        ${line(450,90,539,118,P.line)} ${line(450,180,539,152,P.line)}
        <path d="M320,130 L360,130 M360,120 L360,140" stroke="${P.accent}" stroke-width="2" stroke-linecap="round"/>
        ${label(348,118,"C=C",P.accent,9)}
      `);
    }

    if (tid.includes("halogen") || tid.includes("halogen-compounds")) {
      return wrap(`
        ${title("Halogen Compounds")}
        ${hexNode(350,130,40,P.fill,P.stroke)} ${hexLabel(350,130,["C–X","bond"],13)}
        ${hexNode(170,75, 32,P.fill,P.stroke)} ${hexLabel(170,75, ["Nucleo-","philic sub"],9.5)}
        ${hexNode(530,75, 32,P.fill,P.stroke)} ${hexLabel(530,75, ["Eliminat-","ion"],9.5)}
        ${hexNode(170,185,32,P.fill,P.stroke)} ${hexLabel(170,185,["SN1","tertiary"],10)}
        ${hexNode(530,185,32,P.fill,P.stroke)} ${hexLabel(530,185,["SN2","primary"],10)}
        ${hexNode(90, 130,26,P.fill,P.stroke)} ${hexLabel(90, 130,["F Cl","Br I"],9.5)}
        ${hexNode(610,130,26,P.fill,P.stroke)} ${hexLabel(610,130,["Reactiv-","ity↑"],9.5)}
        ${line(202,86,314,119,P.line)} ${line(498,86,386,119,P.line)}
        ${line(202,174,314,141,P.line)} ${line(498,174,386,141,P.line)}
        ${line(116,130,192,130,P.line,1,"3 2")} ${line(508,130,584,130,P.line,1,"3 2")}
      `);
    }

    // Periodicity
    if (tid.includes("periodicity") || tid.includes("period-3")) {
      return wrap(`
        ${title("Periodicity — Period 3")}
        <rect x="52" y="80" width="596" height="50" rx="10" fill="${P.fill}" stroke="${P.stroke}" stroke-width="1.2"/>
        ${["Na","Mg","Al","Si","P","S","Cl","Ar"].map((el,i) => {
          const cx = 90 + i * 76;
          return `${hexNode(cx,180,28,P.fill,P.stroke)}${hexLabel(cx,180,[el],13)}`;
        }).join("")}
        ${label(90,72,"metallic →","#8b949e",9,"start")} ${label(610,72,"→ non-metallic","#8b949e",9,"end")}
        ${label(350,115,"Atomic radius decreases →","#8b949e",9)}
        ${label(350,130,"Ionisation energy increases (with exceptions) →","#8b949e",8.5)}
        ${[90,166,242,318,394,470,546,622].map((x,i) =>
          `<line x1="${x}" y1="152" x2="${x}" y2="162" stroke="${P.line}" stroke-width="1.5"/>`
        ).join("")}
      `);
    }

    // Group 2 / Group 17
    if (tid.includes("group-2")) {
      return wrap(`
        ${title("Group 2 — Alkaline Earth Metals")}
        ${["Be","Mg","Ca","Sr","Ba","Ra"].map((el,i) => {
          const cx = 90 + i * 104;
          const r  = 22 + i*2;
          return `${hexNode(cx,120,r,"rgba(249,115,22,0.15)",P.stroke)}${hexLabel(cx,120,[el],12)}`;
        }).join("")}
        <path d="M90,150 Q194,175 298,165 Q402,155 506,170 Q558,178 610,185" fill="none" stroke="${P.accent}" stroke-width="2.5" stroke-linecap="round"/>
        ${label(350,205,"Reactivity with H₂O increases down group","#8b949e",9.5)}
        ${label(120,210,"↑ IE","#8b949e",9)} ${label(580,210,"↓ IE","#8b949e",9)}
        <line x1="60" y1="148" x2="648" y2="148" stroke="${P.line}" stroke-width="1" stroke-dasharray="3 4" opacity="0.5"/>
      `);
    }

    if (tid.includes("group-17") || tid.includes("halogens")) {
      return wrap(`
        ${title("Group 17 — The Halogens")}
        ${[["F","pale yellow"],["Cl","green gas"],["Br","red-brn liq"],["I","grey solid"]].map(([el,state],i) => {
          const cx = 120 + i * 152;
          return `${hexNode(cx,100,36,"rgba(249,115,22,0.15)",P.stroke)}
                  ${hexLabel(cx,100,[el],16)}
                  ${label(cx,152,state,"#8b949e",8.5)}`;
        }).join("")}
        <path d="M120,136 Q272,160 424,150 Q500,146 576,140" fill="none" stroke="${P.accent}" stroke-width="2.5" stroke-linecap="round"/>
        ${label(350,185,"Oxidising power decreases down group","#8b949e",9.5)}
        ${label(350,200,"Boiling point increases down group","#8b949e",9.5)}
        <line x1="60" y1="136" x2="640" y2="136" stroke="${P.line}" stroke-width="1" stroke-dasharray="3 4" opacity="0.4"/>
      `);
    }

    // Carbonyl / Carboxylic / Nitrogen
    if (tid.includes("carbonyl")) {
      return wrap(`
        ${title("Carbonyl Compounds")}
        ${hexNode(180,130,36,P.fill,P.stroke)} ${hexLabel(180,130,["Aldehydes","R–CHO"],10)}
        ${hexNode(350,80, 30,P.fill,P.stroke)} ${hexLabel(350,80, ["Nucleophilic","Addition"],9.5)}
        ${hexNode(520,130,36,P.fill,P.stroke)} ${hexLabel(520,130,["Ketones","R–CO–R"],10)}
        ${hexNode(180,210,30,P.fill,P.stroke)} ${hexLabel(180,210,["2,4-DNPH","orange ppt"],9)}
        ${hexNode(350,195,30,P.fill,P.stroke)} ${hexLabel(350,195,["Tollens'","silver mirr"],9)}
        ${hexNode(520,210,30,P.fill,P.stroke)} ${hexLabel(520,210,["Fehling's","brick red"],9)}
        <text x="265" y="82" text-anchor="middle" fill="${P.accent}" font-size="22" font-family="DM Sans" font-weight="300">C=O</text>
        ${line(216,130,320,130,P.line)} ${line(380,130,484,130,P.line)}
        ${line(180,166,180,180,P.line)} ${line(350,110,350,165,P.line)} ${line(520,166,520,180,P.line)}
      `);
    }

    if (tid.includes("nitrogen") || tid.includes("amines") || tid.includes("amino")) {
      return wrap(`
        ${title("Nitrogen Compounds")}
        ${hexNode(120,135,36,P.fill,P.stroke)} ${hexLabel(120,135,["Amines","–NH₂"],12)}
        ${hexNode(290,85, 30,P.fill,P.stroke)} ${hexLabel(290,85, ["Primary","R–NH₂"],10)}
        ${hexNode(290,185,30,P.fill,P.stroke)} ${hexLabel(290,185,["Secondary","R₂NH"],10)}
        ${hexNode(460,85, 30,P.fill,P.stroke)} ${hexLabel(460,85, ["Amides","–CONH₂"],10)}
        ${hexNode(460,185,30,P.fill,P.stroke)} ${hexLabel(460,185,["Amino","acids"],10)}
        ${hexNode(600,135,30,P.fill,P.stroke)} ${hexLabel(600,135,["Peptide","bonds"],10)}
        ${line(156,120,260,98, P.line)} ${line(156,150,260,172,P.line)}
        ${line(320,85, 430,85, P.line,1,"3 2")} ${line(320,185,430,185,P.line,1,"3 2")}
        ${line(490,90, 570,118,P.line)} ${line(490,180,570,152,P.line)}
      `);
    }

    // States of matter / Gases
    if (tid.includes("states") || tid.includes("gases")) {
      return wrap(`
        ${title("States of Matter")}
        ${hexNode(160,130,46,P.fill,P.stroke)} ${hexLabel(160,130,["Solid","ordered"],11)}
        ${hexNode(350,130,46,P.fill,P.stroke)} ${hexLabel(350,130,["Liquid","flowing"],11)}
        ${hexNode(540,130,46,P.fill,P.stroke)} ${hexLabel(540,130,["Gas","random"],11)}
        ${arrow(206,115,304,115,P.accent)} ${label(255,108,"melting","#8b949e",8.5)}
        ${arrow(406,115,494,115,P.accent)} ${label(450,108,"vaporise","#8b949e",8.5)}
        ${arrow(494,145,404,145,"#818cf8")} ${label(449,158,"condense","#8b949e",8.5)}
        ${arrow(302,145,208,145,"#818cf8")} ${label(255,158,"freezing","#8b949e",8.5)}
        ${hexNode(160,210,22,P.fill,P.stroke)} ${hexLabel(160,210,["pV=nRT"],9)}
        ${hexNode(350,210,22,P.fill,P.stroke)} ${hexLabel(350,210,["intermolec","forces"],8.5)}
        ${hexNode(540,210,22,P.fill,P.stroke)} ${hexLabel(540,210,["ideal gas","laws"],8.5)}
      `);
    }

    // Generic chem fallback — hexagonal network
    const chemLabels = [
      ...(topic.definitions||[]).map(d=>d.term),
      ...(topic.notes||[]).map(n=>n.heading),
    ].filter(Boolean).filter(l=>l.length>2).slice(0,6);
    while (chemLabels.length < 6) chemLabels.push(["Reaction","Equation","Mechanism","Structure","Property","Analysis"][chemLabels.length]);
    const chemHexPos = [[350,130,40],[175,85,30],[525,85,30],[175,180,30],[525,180,30],[350,50,24]];
    return wrap(`
      ${title(topic.title)}
      ${chemHexPos.map(([cx,cy,r],i)=>`${hexNode(cx,cy,r,i===0?P.fill+"":P.fill,P.stroke)}${hexLabel(cx,cy,[chemLabels[i]],i===0?11:9.5)}`).join("")}
      ${line(350,90,350,72,P.line,1,"3 2")}
      ${line(215,97,314,120,P.line)} ${line(485,97,386,120,P.line)}
      ${line(215,168,314,140,P.line)} ${line(485,168,386,140,P.line)}
    `);
  }

  // ══════════════════════════════════════════════════════════════════════
  // BIOLOGY TOPICS
  // ══════════════════════════════════════════════════════════════════════

  if (sub === "bio") {

    // Cell Structure
    if (tid.includes("cell-structure") || tid.includes("cell_structure")) {
      return wrap(`
        ${title("Cell Structure")}
        <ellipse cx="350" cy="135" rx="180" ry="90" fill="${P.fill}" stroke="${P.stroke}" stroke-width="1.5"/>
        <ellipse cx="350" cy="135" rx="60" ry="38" fill="rgba(34,197,94,0.30)" stroke="${P.stroke}" stroke-width="1.8"/>
        ${label(350,138,"Nucleus","#e6edf3",10)}
        ${hexNode(120,85, 26,P.fill,P.stroke)} ${hexLabel(120,85, ["Mitoch-","ondria"],9)}
        ${hexNode(120,185,26,P.fill,P.stroke)} ${hexLabel(120,185,["ER","rough/smth"],8.5)}
        ${hexNode(580,85, 26,P.fill,P.stroke)} ${hexLabel(580,85, ["Golgi","apparatus"],9)}
        ${hexNode(580,185,26,P.fill,P.stroke)} ${hexLabel(580,185,["Ribosome","80S/70S"],8.5)}
        ${hexNode(350,210,24,P.fill,P.stroke)} ${hexLabel(350,210,["Vacuole"],9)}
        ${line(146,95,196,108,P.line,1,"3 2")} ${line(146,175,196,162,P.line,1,"3 2")}
        ${line(554,95,504,108,P.line,1,"3 2")} ${line(554,175,504,162,P.line,1,"3 2")}
      `);
    }

    // Cell Membranes / Transport
    if (tid.includes("cell-membrane") || tid.includes("membrane")) {
      return wrap(`
        ${title("Cell Membranes — Fluid Mosaic")}
        <rect x="60" y="115" width="580" height="60" rx="0" fill="${P.fill}" stroke="none"/>
        <rect x="60" y="110" width="580" height="10" rx="5" fill="${P.accent}" opacity="0.5"/>
        <rect x="60" y="165" width="580" height="10" rx="5" fill="${P.accent}" opacity="0.5"/>
        ${label(350,145,"Phospholipid bilayer","#e6edf3",10)}
        ${[100,200,300,400,500,600].map(x=>
          `<line x1="${x}" y1="110" x2="${x-8}" y2="165" stroke="${P.accent}" stroke-width="1.5" opacity="0.3"/>`
        ).join("")}
        ${hexNode(130,80, 26,P.fill,P.stroke)} ${hexLabel(130,80, ["Channel","protein"],9)}
        ${hexNode(280,80, 26,P.fill,P.stroke)} ${hexLabel(280,80, ["Carrier","protein"],9)}
        ${hexNode(430,80, 26,P.fill,P.stroke)} ${hexLabel(430,80, ["Glyco-","protein"],9)}
        ${hexNode(580,80, 26,P.fill,P.stroke)} ${hexLabel(580,80, ["Cholest-","erol"],9)}
        ${hexNode(200,205,26,P.fill,P.stroke)} ${hexLabel(200,205,["Osmosis","H₂O"],9)}
        ${hexNode(350,205,26,P.fill,P.stroke)} ${hexLabel(350,205,["Diffusion","passive"],9)}
        ${hexNode(500,205,26,P.fill,P.stroke)} ${hexLabel(500,205,["Active","transport"],9)}
        ${[130,280,430,580].map(x=>`<line x1="${x}" y1="106" x2="${x}" y2="92" stroke="${P.line}" stroke-width="1.5" stroke-dasharray="3 2"/>`).join("")}
        ${[200,350,500].map(x=>`<line x1="${x}" y1="179" x2="${x}" y2="193" stroke="${P.line}" stroke-width="1.5" stroke-dasharray="3 2"/>`).join("")}
      `);
    }

    // Biological Molecules
    if (tid.includes("biological-molecule") || tid.includes("bio-molecule")) {
      return wrap(`
        ${title("Biological Molecules")}
        ${hexNode(350,120,40,P.fill,P.stroke)} ${hexLabel(350,120,["Monomers","→ Polymers"],10)}
        ${hexNode(160,75, 34,P.fill,P.stroke)} ${hexLabel(160,75, ["Carbo-","hydrates"],10)}
        ${hexNode(540,75, 34,P.fill,P.stroke)} ${hexLabel(540,75, ["Proteins","AA chains"],10)}
        ${hexNode(160,195,34,P.fill,P.stroke)} ${hexLabel(160,195,["Lipids","fatty acid"],10)}
        ${hexNode(540,195,34,P.fill,P.stroke)} ${hexLabel(540,195,["Nucleic","Acids"],10)}
        ${hexNode(90, 135,24,P.fill,P.stroke)} ${hexLabel(90, 135,["glucose","C₆H₁₂O₆"],8.5)}
        ${hexNode(610,135,24,P.fill,P.stroke)} ${hexLabel(610,135,["DNA","RNA"],9)}
        ${line(194,86,310,110,P.line)} ${line(506,86,390,110,P.line)}
        ${line(194,184,310,130,P.line)} ${line(506,184,390,130,P.line)}
        ${line(114,135,160,135,P.line,1,"3 2")} ${line(540,135,586,135,P.line,1,"3 2")}
        ${label(240,68,"condensation →","#8b949e",8.5)} ${label(460,68,"peptide bond","#8b949e",8.5)}
      `);
    }

    // Enzymes
    if (tid.includes("enzyme")) {
      return wrap(`
        ${title("Enzymes — Catalysis")}
        <path d="M200,100 Q240,55 280,100 Q320,145 280,180 Q240,215 200,180 Q160,145 200,100Z" fill="${P.fill}" stroke="${P.stroke}" stroke-width="1.8"/>
        ${label(240,142,"Active","#e6edf3",10)} ${label(240,155,"site","#e6edf3",10)}
        <path d="M260,130 Q290,115 315,130 Q290,150 260,130Z" fill="${P.accent}" opacity="0.5"/>
        ${label(290,135,"S","#e6edf3",11)}
        ${hexNode(460,100,30,P.fill,P.stroke)} ${hexLabel(460,100,["Lock & key","model"],9.5)}
        ${hexNode(600,100,30,P.fill,P.stroke)} ${hexLabel(600,100,["Induced","fit model"],9.5)}
        ${hexNode(460,195,30,P.fill,P.stroke)} ${hexLabel(460,195,["Inhibitors","comp/non"],9.5)}
        ${hexNode(600,195,30,P.fill,P.stroke)} ${hexLabel(600,195,["Temp &","pH effect"],9.5)}
        ${line(280,140,430,105,P.line,1,"3 2")} ${line(280,155,430,190,P.line,1,"3 2")}
        ${line(490,100,570,100,P.line,1,"2 2")} ${line(490,195,570,195,P.line,1,"2 2")}
        ${label(80,230,"E + S ⇌ ES → E + P",P.accent,10.5,"start")}
      `);
    }

    // Gas Exchange / Transport
    if (tid.includes("gas-exchange") || tid.includes("transport-gas")) {
      return wrap(`
        ${title("Gas Exchange")}
        ${hexNode(175,110,40,P.fill,P.stroke)} ${hexLabel(175,110,["Alveoli","features"],11)}
        ${hexNode(350,80, 28,P.fill,P.stroke)} ${hexLabel(350,80, ["Large SA","thin wall"],9.5)}
        ${hexNode(525,110,40,P.fill,P.stroke)} ${hexLabel(525,110,["Fick's","Law"],12)}
        ${hexNode(175,210,28,P.fill,P.stroke)} ${hexLabel(175,210,["Ventilat-","ion mech"],9.5)}
        ${hexNode(350,200,28,P.fill,P.stroke)} ${hexLabel(350,200,["Conc.","gradient"],9.5)}
        ${hexNode(525,210,28,P.fill,P.stroke)} ${hexLabel(525,210,["Diffusion","rate"],9.5)}
        ${arrow(215,110,321,110,P.line)} ${arrow(379,110,485,110,P.line)}
        ${line(175,150,175,182,P.line,1,"3 2")} ${line(350,108,350,172,P.line)} ${line(525,150,525,182,P.line,1,"3 2")}
        ${label(350,50,"rate = (SA × conc. diff.) / thickness",P.accent,9.5)}
      `);
    }

    // Genetics / DNA
    if (tid.includes("genetics") || tid.includes("nucleic") || tid.includes("dna") || tid.includes("gene")) {
      return wrap(`
        ${title("Genetics & DNA")}
        <path d="M200,60 Q240,100 200,140 Q160,180 200,220" fill="none" stroke="${P.accent}" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M240,60 Q200,100 240,140 Q280,180 240,220" fill="none" stroke="${P.accent}" stroke-width="2.5" stroke-linecap="round"/>
        ${[80,105,130,155,180].map(y=>`<line x1="200" y1="${y}" x2="240" y2="${y}" stroke="${P.line}" stroke-width="2" opacity="0.7"/>`).join("")}
        ${label(220,240,"DNA double helix","#8b949e",8.5)}
        ${hexNode(420,80, 30,P.fill,P.stroke)} ${hexLabel(420,80, ["Codons","triplet"],10)}
        ${hexNode(570,80, 30,P.fill,P.stroke)} ${hexLabel(570,80, ["mRNA","transcr."],10)}
        ${hexNode(420,145,30,P.fill,P.stroke)} ${hexLabel(420,145,["tRNA","transl."],10)}
        ${hexNode(570,145,30,P.fill,P.stroke)} ${hexLabel(570,145,["Ribosome","protein"],10)}
        ${hexNode(420,210,30,P.fill,P.stroke)} ${hexLabel(420,210,["Alleles","dominant"],10)}
        ${hexNode(570,210,30,P.fill,P.stroke)} ${hexLabel(570,210,["Punnett","square"],10)}
        ${line(310,80,390,80,P.line,1,"3 2")} ${line(310,145,390,145,P.line,1,"3 2")} ${line(310,210,390,210,P.line,1,"3 2")}
        ${line(450,80,540,80,P.line,1,"2 2")} ${line(450,145,540,145,P.line,1,"2 2")} ${line(450,210,540,210,P.line,1,"2 2")}
      `);
    }

    // Cell cycle / Mitosis
    if (tid.includes("mitosis") || tid.includes("cell-cycle") || tid.includes("meiosis")) {
      return wrap(`
        ${title("Mitotic Cell Cycle")}
        <circle cx="350" cy="135" r="90" fill="none" stroke="${P.line}" stroke-width="1.5" stroke-dasharray="5 4"/>
        ${[["G1","DNA","synthesis",-60],["S","Replic-","ation",0],["G2","Check-","point",60],["M","Mitosis","PMAT",130]].map(([ph,l1,l2,angle])=>{
          const rad = (angle - 90) * Math.PI / 180;
          const cx = 350 + 88 * Math.cos(rad);
          const cy = 135 + 88 * Math.sin(rad);
          return `${hexNode(cx,cy,28,P.fill,P.stroke)}${hexLabel(cx,cy,[ph,l1],9.5)}`;
        }).join("")}
        ${hexNode(350,135,36,"rgba(34,197,94,0.30)",P.stroke)} ${hexLabel(350,135,["Cell","Cycle"],11)}
        ${hexNode(580,80, 26,P.fill,P.stroke)} ${hexLabel(580,80, ["PMAT","stages"],9)}
        ${hexNode(580,190,26,P.fill,P.stroke)} ${hexLabel(580,190,["Checkpt","control"],9)}
        ${line(350,45,350,35,P.line,1,"3 2")}
      `);
    }

    // Immunity
    if (tid.includes("immun")) {
      return wrap(`
        ${title("Immunity")}
        ${hexNode(120,100,36,P.fill,P.stroke)} ${hexLabel(120,100,["Non-","specific"],11)}
        ${hexNode(120,190,36,P.fill,P.stroke)} ${hexLabel(120,190,["Specific","immunity"],11)}
        ${hexNode(310,80, 30,P.fill,P.stroke)} ${hexLabel(310,80, ["Phago-","cytosis"],9.5)}
        ${hexNode(310,165,30,P.fill,P.stroke)} ${hexLabel(310,165,["B cells","antibodies"],9.5)}
        ${hexNode(480,80, 30,P.fill,P.stroke)} ${hexLabel(480,80, ["T cells","cytotoxic"],9.5)}
        ${hexNode(480,165,30,P.fill,P.stroke)} ${hexLabel(480,165,["Memory","cells"],9.5)}
        ${hexNode(620,130,30,P.fill,P.stroke)} ${hexLabel(620,130,["Vaccine","immunity"],9.5)}
        ${line(156,100,280,88,P.line)} ${line(156,190,280,170,P.line)}
        ${line(340,80,450,80,P.line,1,"2 2")} ${line(340,165,450,165,P.line,1,"2 2")}
        ${line(510,90,590,118,P.line)} ${line(510,175,590,142,P.line)}
        ${label(540,60,"Ag + Ab →","#8b949e",8.5)}
      `);
    }

    // Transport in mammals
    if (tid.includes("transport-in-mammals") || tid.includes("heart") || tid.includes("circulation")) {
      return wrap(`
        ${title("Transport in Mammals")}
        <path d="M310,90 Q315,60 350,75 Q385,60 390,90 Q415,115 390,145 Q370,165 350,180 Q330,165 310,145 Q285,115 310,90Z" fill="${P.fill}" stroke="${P.stroke}" stroke-width="2"/>
        ${label(350,130,"Heart","#e6edf3",11)}
        ${hexNode(145,80, 28,P.fill,P.stroke)} ${hexLabel(145,80, ["Pulmon-","ary circ."],9)}
        ${hexNode(145,190,28,P.fill,P.stroke)} ${hexLabel(145,190,["Systemic","circ."],9.5)}
        ${hexNode(555,80, 28,P.fill,P.stroke)} ${hexLabel(555,80, ["Arteries","thick wall"],9)}
        ${hexNode(555,190,28,P.fill,P.stroke)} ${hexLabel(555,190,["Veins","valves"],9.5)}
        ${hexNode(350,50, 26,P.fill,P.stroke)} ${hexLabel(350,50, ["Double","circ."],9.5)}
        ${hexNode(350,220,26,P.fill,P.stroke)} ${hexLabel(350,220,["Capillaries","exchange"],9)}
        ${arrow(173,88,290,98,P.line)} ${arrow(173,182,290,155,P.line)}
        ${arrow(410,98,527,88,P.line)} ${arrow(410,162,527,178,P.line)}
        ${line(350,76,350,62,P.line,1,"3 2")} ${line(350,180,350,208,P.line,1,"3 2")}
      `);
    }

    // Transport in plants
    if (tid.includes("transport-in-plants") || tid.includes("xylem") || tid.includes("phloem")) {
      return wrap(`
        ${title("Transport in Plants")}
        <rect x="240" y="55" width="40" height="170" rx="8" fill="${P.fill}" stroke="${P.stroke}" stroke-width="1.6"/>
        <rect x="310" y="55" width="40" height="170" rx="8" fill="rgba(34,197,94,0.10)" stroke="${P.stroke}" stroke-width="1.6"/>
        ${label(260,46,"Xylem","#22c55e",9)} ${label(330,46,"Phloem","#22c55e",9)}
        ${[70,95,120,145,170,195].map(y=>`<line x1="240" y1="${y}" x2="280" y2="${y}" stroke="${P.accent}" stroke-width="1.2" opacity="0.5"/>`).join("")}
        <path d="M330,65 L330,210" stroke="${P.line}" stroke-width="1.5" stroke-dasharray="5 4"/>
        ${hexNode(120,80, 30,P.fill,P.stroke)} ${hexLabel(120,80, ["Cohesion","tension"],9.5)}
        ${hexNode(120,190,30,P.fill,P.stroke)} ${hexLabel(120,190,["Root hair","uptake"],9.5)}
        ${hexNode(520,80, 30,P.fill,P.stroke)} ${hexLabel(520,80, ["Source","to sink"],9.5)}
        ${hexNode(520,190,30,P.fill,P.stroke)} ${hexLabel(520,190,["Transpir-","ation"],9.5)}
        ${hexNode(600,135,26,P.fill,P.stroke)} ${hexLabel(600,135,["Stomata","guard cells"],8.5)}
        ${arrow(150,80,238,100,P.line)} ${arrow(150,190,238,180,P.line)}
        ${arrow(352,100,490,88,P.line)} ${arrow(352,170,490,178,P.line)}
        ${line(550,100,576,120,P.line,1,"3 2")} ${line(550,170,576,150,P.line,1,"3 2")}
      `);
    }

    // Infectious diseases
    if (tid.includes("infectious") || tid.includes("pathogen")) {
      return wrap(`
        ${title("Infectious Diseases")}
        ${hexNode(350,110,40,P.fill,P.stroke)} ${hexLabel(350,110,["Pathogens"],13)}
        ${hexNode(155,75, 32,P.fill,P.stroke)} ${hexLabel(155,75, ["Bacteria","prokaryote"],9.5)}
        ${hexNode(545,75, 32,P.fill,P.stroke)} ${hexLabel(545,75, ["Viruses","non-living"],9.5)}
        ${hexNode(155,185,32,P.fill,P.stroke)} ${hexLabel(155,185,["Fungi","eukaryote"],9.5)}
        ${hexNode(545,185,32,P.fill,P.stroke)} ${hexLabel(545,185,["Parasites","vectors"],9.5)}
        ${hexNode(350,210,28,P.fill,P.stroke)} ${hexLabel(350,210,["Transmission","droplet/direct"],9)}
        ${hexNode(90, 130,24,P.fill,P.stroke)} ${hexLabel(90, 130,["Antibiotics"],8.5)}
        ${hexNode(610,130,24,P.fill,P.stroke)} ${hexLabel(610,130,["Resistance"],8.5)}
        ${line(187,86,314,110,P.line)} ${line(513,86,386,110,P.line)}
        ${line(187,174,314,120,P.line)} ${line(513,174,386,120,P.line)}
        ${line(350,150,350,182,P.line,1,"3 2")}
        ${line(114,130,140,130,P.line,1,"3 2")} ${line(560,130,586,130,P.line,1,"3 2")}
      `);
    }

    // Generic bio fallback
    const bioLabels = [
      ...(topic.definitions||[]).map(d=>d.term),
      ...(topic.notes||[]).map(n=>n.heading),
    ].filter(Boolean).filter(l=>l.length>2).slice(0,5);
    while (bioLabels.length < 5) bioLabels.push(["Structure","Function","Process","Regulation","Adaptation"][bioLabels.length]);
    return wrap(`
      ${title(topic.title)}
      ${hexNode(350,125,40,P.fill,P.stroke)} ${hexLabel(350,125,[bioLabels[0]],10)}
      ${hexNode(175,80, 30,P.fill,P.stroke)} ${hexLabel(175,80, [bioLabels[1]],9.5)}
      ${hexNode(525,80, 30,P.fill,P.stroke)} ${hexLabel(525,80, [bioLabels[2]],9.5)}
      ${hexNode(175,185,30,P.fill,P.stroke)} ${hexLabel(175,185,[bioLabels[3]],9.5)}
      ${hexNode(525,185,30,P.fill,P.stroke)} ${hexLabel(525,185,[bioLabels[4]],9.5)}
      ${line(205,90,314,115,P.line)} ${line(495,90,386,115,P.line)}
      ${line(205,175,314,135,P.line)} ${line(495,175,386,135,P.line)}
    `);
  }

  // ══════════════════════════════════════════════════════════════════════
  // PHYSICS TOPICS
  // ══════════════════════════════════════════════════════════════════════

  if (sub === "phy") {

    // Kinematics
    if (tid.includes("kinematics") || tid.includes("suvat") || tid.includes("motion")) {
      return wrap(`
        ${title("Kinematics — SUVAT")}
        <rect x="60" y="170" width="580" height="1.5" rx="1" fill="${P.line}" opacity="0.5"/>
        <line x1="60" y1="60" x2="60" y2="178" stroke="${P.line}" stroke-width="1.5" opacity="0.5"/>
        <path d="M60,170 Q160,80 260,140 Q360,200 460,90 Q510,60 640,50" fill="none" stroke="${P.accent}" stroke-width="3" stroke-linecap="round"/>
        ${label(648,52,"v","#818cf8",11)} ${label(45,168,"0","#8b949e",9)} ${label(648,180,"t","#8b949e",10)}
        ${label(160,65,"gradient = a","#8b949e",8.5)} ${label(400,215,"area = s","#8b949e",8.5)}
        ${hexNode(200,50,26,P.fill,P.stroke)} ${hexLabel(200,50,["v = u + at"],9)}
        ${hexNode(400,50,26,P.fill,P.stroke)} ${hexLabel(400,50,["s = ut + ½at²"],8.5)}
        ${hexNode(580,130,26,P.fill,P.stroke)} ${hexLabel(580,130,["v² = u² + 2as"],8.5)}
        ${line(200,76,200,88,P.line,1,"3 2")} ${line(400,76,400,88,P.line,1,"3 2")}
      `);
    }

    // Dynamics / Forces / Newton
    if (tid.includes("dynamics") || tid.includes("forces") || tid.includes("newton")) {
      return wrap(`
        ${title("Dynamics — Newton's Laws")}
        ${hexNode(350,120,44,P.fill,P.stroke)} ${hexLabel(350,120,["F = ma"],14)}
        ${hexNode(160,75, 34,P.fill,P.stroke)} ${hexLabel(160,75, ["1st Law","inertia"],11)}
        ${hexNode(540,75, 34,P.fill,P.stroke)} ${hexLabel(540,75, ["3rd Law","action-reaction"],9)}
        ${hexNode(160,190,34,P.fill,P.stroke)} ${hexLabel(160,190,["Friction","μ = F/N"],11)}
        ${hexNode(540,190,34,P.fill,P.stroke)} ${hexLabel(540,190,["Momentum","p = mv"],11)}
        ${hexNode(350,220,26,P.fill,P.stroke)} ${hexLabel(350,220,["Impulse","FΔt = Δp"],10)}
        ${line(194,86,310,114,P.line)} ${line(506,86,390,114,P.line)}
        ${line(194,179,310,126,P.line)} ${line(506,179,390,126,P.line)}
        ${line(350,164,350,194,P.line,1,"3 2")}
      `);
    }

    // Work / Energy / Power
    if (tid.includes("work-energy") || tid.includes("energy") || tid.includes("power")) {
      return wrap(`
        ${title("Work, Energy & Power")}
        ${hexNode(350,115,40,P.fill,P.stroke)} ${hexLabel(350,115,["Energy","conservation"],10)}
        ${hexNode(160,70, 32,P.fill,P.stroke)} ${hexLabel(160,70, ["KE","½mv²"],12)}
        ${hexNode(540,70, 32,P.fill,P.stroke)} ${hexLabel(540,70, ["GPE","mgh"],12)}
        ${hexNode(160,185,32,P.fill,P.stroke)} ${hexLabel(160,185,["Work","W = Fs cosθ"],9.5)}
        ${hexNode(540,185,32,P.fill,P.stroke)} ${hexLabel(540,185,["Power","P = Fv"],11)}
        ${hexNode(350,210,26,P.fill,P.stroke)} ${hexLabel(350,210,["Efficiency","%"],10)}
        ${arrow(192,80,314,108,P.line)} ${arrow(508,80,386,108,P.line)}
        ${line(192,174,314,122,P.line)} ${line(508,174,386,122,P.line)}
        ${line(350,155,350,184,P.line,1,"3 2")}
        ${label(260,45,"KE ↔ GPE",P.accent,9.5)}
      `);
    }

    // Waves
    if (tid.includes("wave") || tid.includes("superposition")) {
      return wrap(`
        ${title("Waves & Superposition")}
        <path d="M60,135 Q100,75 140,135 Q180,195 220,135 Q260,75 300,135 Q340,195 380,135 Q420,75 460,135 Q500,195 540,135 Q580,75 620,135" fill="none" stroke="${P.accent}" stroke-width="3" stroke-linecap="round"/>
        ${label(340,75,"amplitude A","#8b949e",8.5)} ${label(200,215,"λ (wavelength)","#8b949e",8.5)}
        <line x1="120" y1="75" x2="120" y2="195" stroke="${P.line}" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.5"/>
        <line x1="220" y1="75" x2="220" y2="195" stroke="${P.line}" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.5"/>
        ${hexNode(160,228,24,P.fill,P.stroke)} ${hexLabel(160,228,["v = fλ"],9.5)}
        ${hexNode(350,228,24,P.fill,P.stroke)} ${hexLabel(350,228,["T = 1/f"],9.5)}
        ${hexNode(540,228,24,P.fill,P.stroke)} ${hexLabel(540,228,["I ∝ A²"],9.5)}
        ${label(140,60,"A","#818cf8",11)}
        ${curve(`M60,135 L60,50`, P.line, 1)}
        ${label(66,48,"A","#8b949e",9)}
      `);
    }

    // Electricity / Circuits
    if (tid.includes("electric") || tid.includes("dc-circuit") || tid.includes("circuit")) {
      return wrap(`
        ${title("Electricity & Circuits")}
        ${hexNode(350,120,40,P.fill,P.stroke)} ${hexLabel(350,120,["Ohm's","V = IR"],13)}
        ${hexNode(165,75, 32,P.fill,P.stroke)} ${hexLabel(165,75, ["Series","Σ R = R₁+R₂"],9)}
        ${hexNode(535,75, 32,P.fill,P.stroke)} ${hexLabel(535,75, ["Parallel","1/R = Σ1/Rₙ"],9)}
        ${hexNode(165,190,32,P.fill,P.stroke)} ${hexLabel(165,190,["Power","P = IV = I²R"],9)}
        ${hexNode(535,190,32,P.fill,P.stroke)} ${hexLabel(535,190,["EMF","ε = I(R+r)"],11)}
        ${hexNode(90, 130,26,P.fill,P.stroke)} ${hexLabel(90, 130,["Q = It","charge"],9)}
        ${hexNode(610,130,26,P.fill,P.stroke)} ${hexLabel(610,130,["Kirchhoff","laws"],9)}
        ${line(197,86,314,110,P.line)} ${line(503,86,386,110,P.line)}
        ${line(197,179,314,130,P.line)} ${line(503,179,386,130,P.line)}
        ${line(116,130,152,130,P.line,1,"3 2")} ${line(548,130,584,130,P.line,1,"3 2")}
      `);
    }

    // Particle Physics / Quantum
    if (tid.includes("particle") || tid.includes("quantum") || tid.includes("photon") || tid.includes("nuclear")) {
      return wrap(`
        ${title("Particle Physics")}
        ${hexNode(350,115,42,P.fill,P.stroke)} ${hexLabel(350,115,["Standard","Model"],11)}
        ${hexNode(155,70, 32,P.fill,P.stroke)} ${hexLabel(155,70, ["Quarks","u d s c b t"],9.5)}
        ${hexNode(545,70, 32,P.fill,P.stroke)} ${hexLabel(545,70, ["Leptons","e μ τ ν"],9.5)}
        ${hexNode(155,185,32,P.fill,P.stroke)} ${hexLabel(155,185,["Bosons","force carriers"],9.5)}
        ${hexNode(545,185,32,P.fill,P.stroke)} ${hexLabel(545,185,["Antimat-","ter"],9.5)}
        ${hexNode(350,205,26,P.fill,P.stroke)} ${hexLabel(350,205,["E = hf","photoelectric"],9)}
        ${hexNode(90, 125,24,P.fill,P.stroke)} ${hexLabel(90, 125,["Hadrons"],8.5)}
        ${hexNode(610,125,24,P.fill,P.stroke)} ${hexLabel(610,125,["Feynman"],8.5)}
        ${line(187,81,314,108,P.line)} ${line(513,81,386,108,P.line)}
        ${line(187,174,314,122,P.line)} ${line(513,174,386,122,P.line)}
        ${line(350,157,350,179,P.line,1,"3 2")}
        ${line(114,125,144,120,P.line,1,"3 2")} ${line(556,125,586,120,P.line,1,"3 2")}
      `);
    }

    // Deformation of Solids
    if (tid.includes("deformation") || tid.includes("stress") || tid.includes("strain") || tid.includes("young")) {
      return wrap(`
        ${title("Deformation of Solids")}
        <path d="M120,180 L200,180 L200,80 M200,80 Q240,45 280,80 L280,180 L360,180" fill="none" stroke="${P.accent}" stroke-width="3" stroke-linecap="round"/>
        ${label(200,60,"stress σ","#8b949e",8.5,"middle")} ${label(340,195,"strain ε","#8b949e",8.5,"middle")}
        ${label(145,155,"elastic","#22c55e",8.5,"middle")}
        ${label(250,90,"plastic","#f97316",8.5,"middle")}
        ${hexNode(470,80, 30,P.fill,P.stroke)} ${hexLabel(470,80, ["E = σ/ε","Young mod"],9.5)}
        ${hexNode(620,80, 28,P.fill,P.stroke)} ${hexLabel(620,80, ["Elastic","limit"],9.5)}
        ${hexNode(470,180,30,P.fill,P.stroke)} ${hexLabel(470,180,["Hooke's","F = kx"],10)}
        ${hexNode(620,180,28,P.fill,P.stroke)} ${hexLabel(620,180,["UTS","fracture"],9.5)}
        ${line(440,80,400,80,P.line,1,"3 2")} ${line(440,180,380,180,P.line,1,"3 2")}
        ${line(470,110,470,150,P.line,1,"2 2")} ${line(620,108,620,152,P.line,1,"2 2")}
      `);
    }

    // Measurements / Uncertainties
    if (tid.includes("measurement") || tid.includes("uncertainty") || tid.includes("error")) {
      return wrap(`
        ${title("Measurements & Uncertainties")}
        ${hexNode(350,115,40,P.fill,P.stroke)} ${hexLabel(350,115,["Uncertainty","analysis"],10)}
        ${hexNode(160,70, 32,P.fill,P.stroke)} ${hexLabel(160,70, ["Random","errors"],10)}
        ${hexNode(540,70, 32,P.fill,P.stroke)} ${hexLabel(540,70, ["Systematic","errors"],9.5)}
        ${hexNode(160,190,32,P.fill,P.stroke)} ${hexLabel(160,190,["Absolute","Δx"],11)}
        ${hexNode(540,190,32,P.fill,P.stroke)} ${hexLabel(540,190,["% uncert.","Δx/x × 100"],9)}
        ${hexNode(90, 130,26,P.fill,P.stroke)} ${hexLabel(90, 130,["Precision","repeat"],9)}
        ${hexNode(610,130,26,P.fill,P.stroke)} ${hexLabel(610,130,["Accuracy","calibrate"],9)}
        ${line(192,81,314,108,P.line)} ${line(508,81,386,108,P.line)}
        ${line(192,179,314,122,P.line)} ${line(508,179,386,122,P.line)}
        ${line(116,130,152,130,P.line,1,"3 2")} ${line(548,130,584,130,P.line,1,"3 2")}
        ${label(260,44,"add Δx for + and −","#8b949e",8.5)} ${label(468,44,"add % for × and ÷","#8b949e",8.5)}
      `);
    }

    // Generic physics fallback
    const phyLabels = [
      ...(topic.definitions||[]).map(d=>d.term),
      ...(topic.notes||[]).map(n=>n.heading),
    ].filter(Boolean).filter(l=>l.length>2).slice(0,5);
    while (phyLabels.length < 5) phyLabels.push(["Equation","Principle","Law","Graph","SI Units"][phyLabels.length]);
    return wrap(`
      ${title(topic.title)}
      ${hexNode(350,120,40,P.fill,P.stroke)} ${hexLabel(350,120,[phyLabels[0]],10)}
      ${hexNode(170,75, 30,P.fill,P.stroke)} ${hexLabel(170,75, [phyLabels[1]],9.5)}
      ${hexNode(530,75, 30,P.fill,P.stroke)} ${hexLabel(530,75, [phyLabels[2]],9.5)}
      ${hexNode(170,185,30,P.fill,P.stroke)} ${hexLabel(170,185,[phyLabels[3]],9.5)}
      ${hexNode(530,185,30,P.fill,P.stroke)} ${hexLabel(530,185,[phyLabels[4]],9.5)}
      ${line(200,86,314,112,P.line)} ${line(500,86,386,112,P.line)}
      ${line(200,174,314,128,P.line)} ${line(500,174,386,128,P.line)}
    `);
  }

  // Ultimate fallback
  return wrap(`
    ${title(topic.title)}
    ${hexNode(350,130,40,P.fill,P.stroke)} ${hexLabel(350,130,[topic.title.split(" ").slice(0,2).join(" ")],10)}
  `);
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
    hydrateWeeklyMinutes();
    hydrateStreak();

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

// ── Weekly minutes (resets each calendar week) ───────────────────────────────

function getISOWeek() {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.floor((now - startOfWeek1) / (7 * 86400000)) + 1 + "-" + now.getFullYear();
}

function hydrateWeeklyMinutes() {
  try {
    const savedWeek = localStorage.getItem(weeklyMinutesWeekKey);
    const thisWeek  = getISOWeek();
    if (savedWeek !== thisWeek) {
      // New week — reset
      state.weeklyMinutes = [0, 0, 0, 0, 0, 0, 0];
      localStorage.setItem(weeklyMinutesWeekKey, thisWeek);
      localStorage.setItem(weeklyMinutesKey, JSON.stringify(state.weeklyMinutes));
      return;
    }
    const raw = localStorage.getItem(weeklyMinutesKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 7) {
        state.weeklyMinutes = parsed.map(v => (typeof v === "number" ? v : 0));
      }
    }
  } catch { /* ignore */ }
}

function persistWeeklyMinutes() {
  localStorage.setItem(weeklyMinutesKey, JSON.stringify(state.weeklyMinutes));
  localStorage.setItem(weeklyMinutesWeekKey, getISOWeek());
}

function addStudyMinutes(minutes) {
  const todayIndex = (new Date().getDay() + 6) % 7;
  state.weeklyMinutes[todayIndex] = (state.weeklyMinutes[todayIndex] || 0) + minutes;
  persistWeeklyMinutes();
}

// ── Streak (persisted, increments once per calendar day) ────────────────────

function hydrateStreak() {
  try {
    const saved = parseInt(localStorage.getItem(streakKey) || "0", 10);
    const lastDate = localStorage.getItem(streakDateKey);
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (lastDate === today) {
      state.streak = saved;
    } else if (lastDate === yesterday) {
      // streak still alive, not yet incremented today
      state.streak = saved;
    } else if (lastDate) {
      // missed a day — reset streak
      state.streak = 0;
      localStorage.setItem(streakKey, "0");
    } else {
      state.streak = 0;
    }
  } catch { state.streak = 0; }
}

function touchStreakToday() {
  const today = new Date().toDateString();
  const lastDate = localStorage.getItem(streakDateKey);
  if (lastDate !== today) {
    state.streak = (state.streak || 0) + 1;
    localStorage.setItem(streakKey, String(state.streak));
    localStorage.setItem(streakDateKey, today);
    const countEl = byId("streak-count");
    if (countEl) countEl.textContent = String(state.streak);
  }
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
  if (target) {
    target.classList.add("active");
    target.classList.remove("view-enter");
    void target.offsetWidth; // force reflow
    target.classList.add("view-enter");
  }
  state.currentView = viewName;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// go() is defined in the new section below
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
    <div class="stat-item"><strong style="color:var(--phy)">${overall.total > 0 ? avgScore : 0}%</strong><span>Quiz average</span></div>
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

  const totalTarget  = 180;
  const current      = state.weeklyMinutes.reduce((sum, m) => sum + m, 0);
  const labels       = ["M", "T", "W", "T", "F", "S", "S"];
  const weeklyPct    = Math.round((current / totalTarget) * 100);
  const todayIndex   = (new Date().getDay() + 6) % 7;
  const todayMinutes = state.weeklyMinutes[todayIndex] || 0;
  const maxMin       = Math.max(...state.weeklyMinutes, 1);
  const weakest      = state.subjects
    .map((s) => ({ ...s, progress: getProgress(s.id).pct }))
    .sort((a, b) => a.progress - b.progress)[0];
  const nextUp = preview[0] || null;

  const recentQuizEvents = quizHistory().slice(-3).reverse();
  const activityItems = [
    `🔥 ${state.streak} day streak active`,
    `✅ ${overall.done} topics completed so far`,
    ...(nextUp ? [`📌 Next up: ${nextUp.name}`] : ["📌 All queued topics complete"]),
    ...recentQuizEvents.map((item) => {
      const date = new Date(item.at);
      return `📝 Quiz: ${item.scorePct}% on ${date.toLocaleDateString()}`;
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

  const isOver       = weeklyPct >= 100;
  const statusColor  = isOver ? "var(--success)" : weeklyPct >= 60 ? "var(--accent)" : "var(--warn)";
  const pctCapped    = Math.min(100, weeklyPct);
  const r            = 36;
  const circumference = +(2 * Math.PI * r).toFixed(2);
  const dashOffset   = +(circumference * (1 - pctCapped / 100)).toFixed(2);

  goalEl.innerHTML = `
    <div class="wg-header">
      <div class="wg-ring-wrap">
        <svg viewBox="0 0 80 80" width="76" height="76" style="display:block;flex-shrink:0">
          <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--bg3)" stroke-width="7"/>
          <circle cx="40" cy="40" r="${r}" fill="none"
            stroke="${statusColor}" stroke-width="7" stroke-linecap="round"
            stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
            transform="rotate(-90 40 40)"
            style="transition:stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)"/>
        </svg>
        <div class="wg-ring-label">
          <strong style="color:${statusColor}">${weeklyPct}%</strong>
          <span>of goal</span>
        </div>
      </div>
      <div class="wg-header-text">
        <p class="wg-title">Weekly Goal</p>
        <p class="wg-subtitle">${current} <span style="color:var(--text3)">/</span> ${totalTarget} min this week</p>
        <span class="wg-badge" style="--badge-color:${statusColor}">
          ${isOver ? "🎯 Goal smashed!" : `${totalTarget - current} min remaining`}
        </span>
      </div>
    </div>

    <div class="wg-bars">
      ${state.weeklyMinutes.map((min, i) => {
        const barPct  = Math.round((min / maxMin) * 100);
        const isToday = i === todayIndex;
        return `
          <div class="wg-day${isToday ? " wg-today" : ""}">
            <div class="wg-bar-track">
              <div class="wg-bar-fill" style="height:${barPct}%;background:${isToday ? statusColor : "var(--accent)"}${isToday ? "" : ";opacity:0.5"}"></div>
            </div>
            <span class="wg-day-label">${labels[i]}</span>
            ${min > 0 ? `<span class="wg-day-min">${min}m</span>` : `<span class="wg-day-min">&nbsp;</span>`}
          </div>
        `;
      }).join("")}
    </div>

    <div class="wg-stats">
      <div class="wg-stat">
        <span class="wg-stat-label">Today</span>
        <strong class="wg-stat-val">${todayMinutes} min</strong>
      </div>
      <div class="wg-stat">
        <span class="wg-stat-label">Streak</span>
        <strong class="wg-stat-val" style="color:var(--warn)">${state.streak} 🔥</strong>
      </div>
      <div class="wg-stat">
        <span class="wg-stat-label">Weakest area</span>
        <strong class="wg-stat-val">${weakest ? `${escapeHtml(weakest.name)} — ${weakest.progress}%` : "—"}</strong>
      </div>
    </div>

    <div class="wg-actions">
      ${nextUp
        ? `<button class="btn btn-primary btn-sm" onclick="App.go('topic',{topicId:'${nextUp.id}'})">▶ ${escapeHtml(nextUp.name)}</button>`
        : `<button class="btn btn-primary btn-sm" onclick="App.go('subjects')">Browse Topics</button>`}
      <button class="btn btn-outline btn-sm" onclick="App.go('quiz',{subjectId:'${weakest ? weakest.id : "chem"}'})">Quick Quiz</button>
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
      (item, i) => {
        // Data is either a plain string question OR a {q, a} object
        const question = typeof item === 'string' ? item : (item.q || '');
        const answer   = typeof item === 'string' ? null  : (item.a || '');
        const hasAnswer = answer !== null;
        return `
      <div class="recall-item" id="recall-${i}">
        <div class="recall-q">
          <span>${richText(question)}</span>
          <button class="pill-btn" onclick="App.toggleRecall(${i})">${hasAnswer ? 'Show answer' : 'Mark answered'}</button>
        </div>
        ${hasAnswer ? `<div class="recall-a" id="recall-a-${i}">${richText(answer)}</div>` : `<div class="recall-a" id="recall-a-${i}"><em style="color:var(--text2)">Write your answer, then check your notes.</em></div>`}
      </div>
    `;
      }
    )
    .join('');

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
  touchStreakToday();
  addStudyMinutes(15); // credit 15 min for completing a topic
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
    button.disabled = true;
    if (i === q.ans) {
      button.classList.add("correct", "anim-correct");
    } else if (i === index && i !== q.ans) {
      button.classList.add("wrong", "anim-wrong");
    }
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
  touchStreakToday();
  addStudyMinutes(10); // credit 10 min for a quiz session
  
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
    <p class="flashcard-hint">Tap card to flip</p>
    <div class="flashcard-scene" id="flashcard-scene" onclick="App.flipFlash()">
      <div class="flashcard-inner" id="flashcard-inner">
        <div class="flashcard-front">
          <div>
            <small>Question</small>
            <p>${richText(card.q)}</p>
          </div>
        </div>
        <div class="flashcard-back">
          <div>
            <small>Answer</small>
            <p>${richText(card.a)}</p>
          </div>
        </div>
      </div>
    </div>
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
  const scene = byId("flashcard-scene");
  if (scene) {
    scene.classList.toggle("is-flipped", state.flash.flipped);
  } else {
    renderFlashcard();
  }
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

// renderCommunity, renderChatSidebar, selectThread, selectChannel, sendChatMessage
// are all replaced by the updated versions defined later in this file.

function renderProfile() {
  const overall  = totalProgress();
  const avgQuiz  = quizHistory();
  const avgScore = avgQuiz.length
    ? Math.round(avgQuiz.reduce((sum, item) => sum + item.scorePct, 0) / avgQuiz.length)
    : 0;

  const user     = auth.user;
  const avatarEl = byId("profile-avatar");
  const nameEl   = byId("profile-name");
  const emailEl  = byId("profile-email");

  if (user) {
    const initials = user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl)   nameEl.textContent   = user.name;
    if (emailEl)  emailEl.textContent  = user.email;
    // Use server XP if available, else local state
    const xpDisplay = (user.stats?.xp ?? state.xp) || 0;
    byId("profile-xp").textContent     = xpDisplay.toLocaleString();
  } else {
    if (avatarEl) avatarEl.textContent = "?";
    if (nameEl) {
      nameEl.innerHTML = `<span style="color:var(--text2)">Not signed in</span>
        <button class="btn btn-primary btn-sm" style="margin-left:0.75rem" onclick="App.openAuthModal('login')">Sign In</button>`;
    }
    if (emailEl)  emailEl.textContent = "Sign in to sync your progress across devices";
    byId("profile-xp").textContent = "0";
  }

  byId("profile-topics").textContent = overall.total > 0 ? `${overall.done}/${overall.total}` : "0";
  byId("profile-avg").textContent    = `${avgScore}%`;

  byId("profile-progress").innerHTML = state.subjects
    .map((subject) => {
      const p = getProgress(subject.id);
      return `
      <div class="card card-sm" style="margin-top:0.7rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.45rem">
          <strong>${escapeHtml(subject.name)}</strong>
          <span style="color:var(--text2);font-size:0.85rem">${p.done}/${p.total} topics &mdash; ${p.pct}%</span>
        </div>
        <div class="quiz-bar"><div class="quiz-fill" style="width:${p.pct}%;background:${colorVar(subject.id)}"></div></div>
      </div>
    `;
    })
    .join("");

  if (!user) {
    byId("profile-progress").innerHTML += `
      <div class="card card-sm" style="margin-top:1rem;text-align:center;color:var(--text2)">
        <p style="margin:0.25rem 0">Progress is tracked locally. <button class="link-btn" onclick="App.openAuthModal('register')">Create an account</button> to save it to the cloud.</p>
      </div>`;
  }
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
    toast.classList.add("hiding");
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 220);
  }, 2600);
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

// bindBaseEvents is defined in the new section below

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
    byId("streak-count").textContent = String(state.streak || 0);
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

// saveTopic is defined in the new section below

function cancelEdit() {
  byId("editor-json").value = editorState.originalJson || "";
  showToast("Changes discarded");
}

// deleteCurrentTopic is defined in the new section below

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

// ============================================================================
// REAL-TIME CHAT — Socket.io client
// ============================================================================

let socket = null;
let typingTimer = null;
let currentChannelUserCount = 0;

function initSocket() {
  if (socket) return;
  try {
    socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('[Socket] connected:', socket.id);
      const offBanner = byId('chat-offline-banner');
      if (offBanner) offBanner.classList.remove('show');
      const dot = byId('chat-status-dot');
      if (dot) dot.classList.add('connected');
      // Rejoin current channel if any
      if (state.selectedChannelId) joinSocketChannel(state.selectedChannelId);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] disconnected');
      const offBanner = byId('chat-offline-banner');
      if (offBanner) offBanner.classList.add('show');
      const dot = byId('chat-status-dot');
      if (dot) dot.classList.remove('connected');
    });

    socket.on('new_message', (msg) => {
      // Add message to the active channel's live view
      if (msg.channelId !== state.selectedChannelId) return;
      appendChatMessage(msg);
      scrollChatToBottom();
    });

    socket.on('channel_users', (count) => {
      currentChannelUserCount = count;
      const el = byId('chat-user-count');
      if (el) el.textContent = `${count} online`;
    });

    socket.on('user_typing', ({ author }) => {
      const el = byId('chat-typing-indicator');
      if (!el) return;
      el.textContent = `${author} is typing…`;
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => { el.textContent = ''; }, 2500);
    });

  } catch (e) {
    console.warn('[Socket] init failed:', e.message);
  }
}

function joinSocketChannel(channelId) {
  if (!socket || !socket.connected) return;
  socket.emit('join_channel', {
    channelId,
    user: auth.user?.name || 'Anonymous',
  });
}

function leaveSocketChannel(channelId) {
  if (!socket || !socket.connected) return;
  socket.emit('leave_channel', { channelId });
}

function appendChatMessage(msg) {
  const container = byId('chat-messages');
  if (!container) return;
  const d = document.createElement('div');
  d.className = 'chat-message';
  const time = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  d.innerHTML = `
    <strong>${escapeHtml(msg.author)}</strong>
    <span class="msg-time">${time}</span>
    <p>${escapeHtml(msg.text)}</p>
  `;
  container.appendChild(d);
}

function scrollChatToBottom() {
  const el = byId('chat-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

// ============================================================================
// CHAT — updated render & send
// ============================================================================

async function renderChatSidebar() {
  // Channel list
  byId('chat-channel-list').innerHTML = state.community.chatChannels
    .map(ch => `
      <button class="chat-channel-btn ${ch.id === state.selectedChannelId ? 'active' : ''}"
              onclick="App.selectChannel('${ch.id}')">
        # ${escapeHtml(ch.name)}
      </button>
    `).join('');

  // Load messages from API
  const container = byId('chat-messages');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text2);padding:0.5rem;font-size:0.8rem">Loading messages…</p>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/community/chat/${state.selectedChannelId}/messages?limit=100`);
    const data = await res.json();
    const messages = data.data || [];
    container.innerHTML = '';
    messages.forEach(m => appendChatMessage(m));
    scrollChatToBottom();
  } catch {
    container.innerHTML = '<p style="color:var(--text2);padding:0.5rem;font-size:0.8rem">Could not load messages.</p>';
  }
}

async function sendChatMessage() {
  if (!auth.isLoggedIn) { showToast('Sign in to send messages'); openAuthModal('login'); return; }
  const input = byId('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';

  if (socket && socket.connected) {
    socket.emit('send_message', {
      channelId: state.selectedChannelId,
      text,
      author: auth.user?.name,
      token:  auth.token,
    });
  } else {
    // Fallback: REST
    try {
      await fetch(`${API_BASE_URL}/api/community/chat/messages`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ channelId: state.selectedChannelId, text }),
      });
    } catch { showToast('Failed to send message'); }
  }
}

function emitTyping() {
  if (!socket || !socket.connected || !auth.isLoggedIn) return;
  socket.emit('typing', { channelId: state.selectedChannelId, author: auth.user?.name || 'Someone' });
}

// ============================================================================
// FORUM — updated render with real data + new thread support
// ============================================================================

async function renderCommunity() {
  // Reload threads from API
  try {
    const res  = await fetch(`${API_BASE_URL}/api/community/forum?sort=pinned&limit=50`);
    const data = await res.json();
    if (data.success) state.community.forumThreads = data.data;
  } catch { /* use cached */ }

  const forumList   = byId('forum-list');
  const forumThread = byId('forum-thread');

  // Build thread list
  const forumItemsHtml = state.community.forumThreads.map(thread => {
    const subject     = state.subjectMap.get(thread.subject);
    const activeClass = thread.id === state.selectedThreadId || thread._id === state.selectedThreadId ? 'active' : '';
    const id          = thread._id || thread.id;
    const pinnedBadge = thread.pinned ? '<span class="thread-badge pinned">📌 Pinned</span>' : '';
    const lockedBadge = thread.locked ? '<span class="thread-badge locked">🔒 Locked</span>' : '';
    return `
      <button class="forum-item ${activeClass}" onclick="App.selectThread('${id}')">
        <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.25rem">
          <h3 style="margin:0;flex:1">${escapeHtml(thread.title)}</h3>
          ${pinnedBadge}${lockedBadge}
        </div>
        <p>${escapeHtml((thread.body || '').slice(0, 120))}${thread.body?.length > 120 ? '…' : ''}</p>
        <div class="forum-meta">
          <span class="subject-badge ${thread.subject}">${escapeHtml(subject?.name || thread.subject)}</span>
          <span>@${escapeHtml(thread.author)}</span>
          <span>${(thread.replies?.length || thread.replyCount || 0)} replies</span>
          <span>👍 ${thread.upvotes || 0}</span>
        </div>
      </button>
    `;
  }).join('');

  const isLoggedIn = auth.isLoggedIn;
  forumList.innerHTML = `
    <div class="forum-list-shell card">
      <div class="forum-actions-bar">
        <button class="btn btn-primary btn-sm" onclick="App.openNewThreadModal()">+ New Thread</button>
        <select style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text1);padding:0.3rem 0.6rem;font-size:0.8rem" onchange="App.filterForumBySubject(this.value)">
          <option value="">All Subjects</option>
          <option value="general">General</option>
          <option value="chem">Chemistry</option>
          <option value="bio">Biology</option>
          <option value="phy">Physics</option>
        </select>
      </div>
      <div class="forum-stack">
        ${forumItemsHtml || '<p style="color:var(--text2);padding:1rem">No threads yet. Be the first!</p>'}
      </div>
    </div>
  `;

  // Render selected thread detail
  await renderThreadDetail();

  // Chat sidebar
  await renderChatSidebar();

  // Socket
  initSocket();
  if (state.selectedChannelId) joinSocketChannel(state.selectedChannelId);
}

async function renderThreadDetail() {
  const forumThread = byId('forum-thread');
  if (!forumThread) return;

  const id = state.selectedThreadId;
  if (!id) { forumThread.innerHTML = ''; return; }

  let thread = state.community.forumThreads.find(t => (t._id || t.id) === id);

  // Fetch full thread from API to get replies
  try {
    const res  = await fetch(`${API_BASE_URL}/api/community/forum/${id}`);
    const data = await res.json();
    if (data.success) thread = data.data;
  } catch { /* use cached */ }

  if (!thread) { forumThread.innerHTML = ''; return; }

  const isAdmin  = auth.user?.role === 'admin';
  const isAuthor = auth.user?.name === thread.author;
  const replies  = thread.replies || [];

  const repliesHtml = replies.map(r => {
    const t    = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
    const canDel = auth.isLoggedIn && (isAdmin || auth.user?.name === r.author);
    return `
      <div class="forum-reply">
        <div class="forum-reply-header">
          <strong>${escapeHtml(r.author)}</strong>
          <small>${t}</small>
          ${canDel ? `<button class="btn btn-outline btn-micro btn-danger" style="margin-left:auto" onclick="App.deleteReply('${id}','${r._id}')">Delete</button>` : ''}
        </div>
        <p>${escapeHtml(r.body)}</p>
      </div>
    `;
  }).join('');

  const adminActions = isAdmin ? `
    <button class="btn btn-outline btn-sm" onclick="App.adminPinThread('${id}', ${!thread.pinned})">${thread.pinned ? '📌 Unpin' : '📌 Pin'}</button>
    <button class="btn btn-outline btn-sm" onclick="App.adminLockThread('${id}', ${!thread.locked})">${thread.locked ? '🔓 Unlock' : '🔒 Lock'}</button>
  ` : '';

  const deleteBtn = (isAdmin || isAuthor) ? `<button class="btn btn-outline btn-sm btn-danger" onclick="App.deleteThread('${id}')">Delete Thread</button>` : '';

  const replyBox = auth.isLoggedIn && !thread.locked ? `
    <div class="forum-reply-box">
      <textarea id="reply-input" placeholder="Write a reply…" rows="3" maxlength="2000"></textarea>
      <div class="reply-actions">
        <button class="btn btn-primary btn-sm" onclick="App.submitReply('${id}')">Post Reply</button>
      </div>
    </div>
  ` : auth.isLoggedIn && thread.locked ? `<p style="color:var(--text2);font-size:0.85rem;margin-top:0.75rem">🔒 This thread is locked.</p>`
    : `<p style="color:var(--text2);font-size:0.85rem;margin-top:0.75rem"><button class="link-btn" onclick="App.openAuthModal('login')">Sign in</button> to reply.</p>`;

  forumThread.innerHTML = `
    <h2>${escapeHtml(thread.title)}</h2>
    <p style="margin:0.5rem 0;line-height:1.6">${escapeHtml(thread.body)}</p>
    <p style="color:var(--text2);font-size:0.82rem">Posted by @${escapeHtml(thread.author)} · ${thread.createdAt ? new Date(thread.createdAt).toLocaleDateString() : ''} · 👍 ${thread.upvotes || 0} · 👁 ${thread.views || 0}</p>
    <div style="margin-top:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
      <button class="btn btn-outline btn-sm" onclick="App.upvoteThread('${id}')">👍 Upvote</button>
      ${adminActions}
      ${deleteBtn}
    </div>
    <div style="margin-top:1.25rem">
      <h4 style="margin-bottom:0.5rem">${replies.length} ${replies.length === 1 ? 'Reply' : 'Replies'}</h4>
      ${repliesHtml}
    </div>
    ${replyBox}
  `;
}

async function selectThread(threadId) {
  state.selectedThreadId = threadId;
  await renderThreadDetail();
  // Update active state in list
  document.querySelectorAll('.forum-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(threadId));
  });
}

async function selectChannel(channelId) {
  if (state.selectedChannelId) leaveSocketChannel(state.selectedChannelId);
  state.selectedChannelId = channelId;
  joinSocketChannel(channelId);
  await renderChatSidebar();
}

async function submitReply(threadId) {
  if (!auth.isLoggedIn) { openAuthModal('login'); return; }
  const input = byId('reply-input');
  const body  = input?.value.trim();
  if (!body) { showToast('Write something first'); return; }

  const btn = document.querySelector('.forum-reply-box .btn-primary');
  if (btn) { btn.textContent = 'Posting…'; btn.disabled = true; }

  try {
    const res  = await fetch(`${API_BASE_URL}/api/community/forum/${threadId}/replies`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ body }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed to post reply'); return; }
    showToast('Reply posted!');
    await renderThreadDetail();
  } catch { showToast('Network error'); }
  finally { if (btn) { btn.textContent = 'Post Reply'; btn.disabled = false; } }
}

async function deleteReply(threadId, replyId) {
  if (!confirm('Delete this reply?')) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/community/forum/${threadId}/replies/${replyId}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (res.ok) { showToast('Reply deleted'); await renderThreadDetail(); }
    else showToast('Failed to delete reply');
  } catch { showToast('Network error'); }
}

async function deleteThread(threadId) {
  if (!confirm('Delete this thread? This cannot be undone.')) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/community/forum/${threadId}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (res.ok) {
      showToast('Thread deleted');
      state.community.forumThreads = state.community.forumThreads.filter(t => (t._id || t.id) !== threadId);
      state.selectedThreadId = null;
      await renderCommunity();
    } else showToast('Failed to delete thread');
  } catch { showToast('Network error'); }
}

async function upvoteThread(threadId) {
  if (!auth.isLoggedIn) { openAuthModal('login'); return; }
  try {
    const res  = await fetch(`${API_BASE_URL}/api/community/forum/${threadId}/upvote`, {
      method: 'POST', headers: authHeaders(),
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`👍 ${data.upvotes} upvotes`);
      await renderThreadDetail();
    }
  } catch { showToast('Network error'); }
}

async function filterForumBySubject(subject) {
  try {
    const url = subject
      ? `${API_BASE_URL}/api/community/forum?subject=${subject}&sort=pinned`
      : `${API_BASE_URL}/api/community/forum?sort=pinned`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.success) {
      state.community.forumThreads = data.data;
      state.selectedThreadId = data.data[0]?._id || data.data[0]?.id || null;
      await renderCommunity();
    }
  } catch { showToast('Failed to filter'); }
}

// ============================================================================
// NEW THREAD MODAL
// ============================================================================

function openNewThreadModal() {
  if (!auth.isLoggedIn) { openAuthModal('login'); return; }
  let modal = byId('new-thread-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id        = 'new-thread-modal';
    modal.className = 'new-thread-modal-overlay';
    modal.innerHTML = `
      <div class="new-thread-modal">
        <h3>New Thread</h3>
        <label>Title
          <input type="text" id="ntm-title" maxlength="200" placeholder="What's your question?">
        </label>
        <label>Subject
          <select id="ntm-subject">
            <option value="general">General</option>
            <option value="chem">Chemistry</option>
            <option value="bio">Biology</option>
            <option value="phy">Physics</option>
          </select>
        </label>
        <label>Body
          <textarea id="ntm-body" rows="6" maxlength="5000" placeholder="Describe your question or topic…"></textarea>
        </label>
        <div id="ntm-error" class="auth-error"></div>
        <div style="display:flex;gap:0.6rem">
          <button class="btn btn-primary" onclick="App.submitNewThread()">Post Thread</button>
          <button class="btn btn-outline" onclick="App.closeNewThreadModal()">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeNewThreadModal(); });
  }
  modal.classList.add('open');
  setTimeout(() => byId('ntm-title')?.focus(), 50);
}

function closeNewThreadModal() {
  const m = byId('new-thread-modal');
  if (m) m.classList.remove('open');
}

async function submitNewThread() {
  const title   = byId('ntm-title')?.value.trim();
  const subject = byId('ntm-subject')?.value;
  const body    = byId('ntm-body')?.value.trim();
  const errEl   = byId('ntm-error');
  if (errEl) errEl.textContent = '';

  if (!title || !body) { if (errEl) errEl.textContent = 'Title and body are required.'; return; }

  const btn = document.querySelector('#new-thread-modal .btn-primary');
  if (btn) { btn.textContent = 'Posting…'; btn.disabled = true; }

  try {
    const res  = await fetch(`${API_BASE_URL}/api/community/forum`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ title, subject, body }),
    });
    const data = await res.json();
    if (!res.ok) { if (errEl) errEl.textContent = data.error || 'Failed to post.'; return; }
    showToast('Thread posted!');
    closeNewThreadModal();
    state.selectedThreadId = data.data._id;
    await renderCommunity();
  } catch { if (errEl) errEl.textContent = 'Network error.'; }
  finally { if (btn) { btn.textContent = 'Post Thread'; btn.disabled = false; } }
}

// ============================================================================
// ADMIN PANEL
// ============================================================================

let adminData = { users: [], threads: [] };

async function renderAdmin() {
  if (!auth.isLoggedIn || auth.user?.role !== 'admin') {
    showToast('Admin access required');
    go('home');
    return;
  }
  switchAdminTab('dashboard');
  await loadAdminStats();
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.toggle('active', p.id === `admin-tab-${tab}`));

  if (tab === 'users')   loadAdminUsers();
  if (tab === 'forum')   loadAdminForum();
  if (tab === 'pages')   { /* prompt user to pick subject */ }
  if (tab === 'dashboard') loadAdminStats();
}

async function loadAdminStats() {
  try {
    const res  = await fetch(`${API_BASE_URL}/api/admin/stats`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) return;
    const s = data.data;
    const setText = (id, val) => { const el = byId(id); if (el) el.textContent = val; };
    setText('astat-users',    s.totalUsers);
    setText('astat-threads',  s.totalThreads);
    setText('astat-messages', s.totalMessages);
    setText('astat-admins',   s.adminCount);

    // Recent users
    const ru = byId('admin-recent-users');
    if (ru) ru.innerHTML = (s.recentUsers || []).map(u => `
      <div class="admin-recent-item">
        <div><strong>${escapeHtml(u.name)}</strong><br><small>${escapeHtml(u.email)}</small></div>
        <small>${new Date(u.createdAt).toLocaleDateString()}</small>
      </div>`).join('') || '<p style="color:var(--text2);font-size:0.85rem">No users yet.</p>';

    // Recent threads
    const rt = byId('admin-recent-threads');
    if (rt) rt.innerHTML = (s.recentThreads || []).map(t => `
      <div class="admin-recent-item">
        <div><strong>${escapeHtml(t.title.slice(0, 50))}${t.title.length > 50 ? '…' : ''}</strong><br><small>by ${escapeHtml(t.author)} · ${t.subject}</small></div>
        <small>${new Date(t.createdAt).toLocaleDateString()}</small>
      </div>`).join('') || '<p style="color:var(--text2);font-size:0.85rem">No threads yet.</p>';
  } catch (e) { showToast('Failed to load stats'); }
}

async function loadAdminUsers() {
  const tbody = byId('admin-users-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text2);text-align:center;padding:1rem">Loading…</td></tr>';
  try {
    const res  = await fetch(`${API_BASE_URL}/api/admin/users`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) { tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444">Error: ${escapeHtml(data.error)}</td></tr>`; return; }
    adminData.users = data.data;
    renderAdminUsersTable(adminData.users);
  } catch { tbody.innerHTML = '<tr><td colspan="5" style="color:#ef4444">Network error</td></tr>'; }
}

function renderAdminUsersTable(users) {
  const tbody = byId('admin-users-tbody');
  if (!tbody) return;
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text2);text-align:center;padding:1rem">No users found.</td></tr>'; return; }
  tbody.innerHTML = users.map(u => {
    const isSelf  = u._id === auth.user?._id;
    const isAdmin = u.role === 'admin';
    const isBanned = u.banned;
    const roleBadge = `<span class="role-badge ${u.role}">${u.role}</span>${isBanned ? ' <span class="role-badge banned">banned</span>' : ''}`;
    const actions = isSelf ? '<em style="color:var(--text2);font-size:0.8rem">You</em>' : `
      <div class="action-cell">
        <button class="btn btn-outline btn-micro" onclick="App.toggleUserRole('${u._id}','${u.role}')">${isAdmin ? 'Demote' : 'Make Admin'}</button>
        <button class="btn btn-outline btn-micro ${isBanned ? '' : 'btn-danger'}" onclick="App.toggleUserBan('${u._id}',${!isBanned})">${isBanned ? 'Unban' : 'Ban'}</button>
        <button class="btn btn-danger btn-micro" onclick="App.adminDeleteUser('${u._id}','${escapeHtml(u.name)}')">Delete</button>
      </div>`;
    return `<tr>
      <td><strong>${escapeHtml(u.name)}</strong></td>
      <td style="color:var(--text2)">${escapeHtml(u.email)}</td>
      <td>${roleBadge}</td>
      <td style="color:var(--text2);font-size:0.8rem">${new Date(u.createdAt).toLocaleDateString()}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

function filterAdminUsers(q) {
  const filtered = q
    ? adminData.users.filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()))
    : adminData.users;
  renderAdminUsersTable(filtered);
}

async function toggleUserRole(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'student' : 'admin';
  if (!confirm(`Set user to ${newRole}?`)) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/role`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (res.ok) { showToast(data.message); loadAdminUsers(); }
    else showToast(data.error || 'Failed');
  } catch { showToast('Network error'); }
}

async function toggleUserBan(userId, banned) {
  if (!confirm(banned ? 'Ban this user?' : 'Unban this user?')) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/ban`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ banned }),
    });
    const data = await res.json();
    if (res.ok) { showToast(data.message); loadAdminUsers(); }
    else showToast(data.error || 'Failed');
  } catch { showToast('Network error'); }
}

async function adminDeleteUser(userId, name) {
  if (!confirm(`Permanently delete user "${name}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    const data = await res.json();
    if (res.ok) { showToast('User deleted'); loadAdminUsers(); }
    else showToast(data.error || 'Failed');
  } catch { showToast('Network error'); }
}

async function loadAdminForum() {
  const tbody = byId('admin-forum-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text2);text-align:center;padding:1rem">Loading…</td></tr>';
  try {
    const res  = await fetch(`${API_BASE_URL}/api/admin/forum`, { headers: authHeaders() });
    const data = await res.json();
    if (!data.success) { tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444">Error: ${escapeHtml(data.error)}</td></tr>`; return; }
    adminData.threads = data.data;
    renderAdminForumTable(adminData.threads);
  } catch { tbody.innerHTML = '<tr><td colspan="6" style="color:#ef4444">Network error</td></tr>'; }
}

function renderAdminForumTable(threads) {
  const tbody = byId('admin-forum-tbody');
  if (!tbody) return;
  if (!threads.length) { tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text2);text-align:center;padding:1rem">No threads.</td></tr>'; return; }
  tbody.innerHTML = threads.map(t => {
    const id      = t._id;
    const status  = [
      t.pinned ? '<span class="thread-badge pinned">📌 Pinned</span>' : '',
      t.locked ? '<span class="thread-badge locked">🔒 Locked</span>' : '',
    ].filter(Boolean).join(' ') || '<span style="color:var(--text2);font-size:0.8rem">Normal</span>';
    return `<tr>
      <td><strong>${escapeHtml(t.title.slice(0,60))}${t.title.length>60?'…':''}</strong></td>
      <td><span class="subject-badge ${t.subject}">${t.subject}</span></td>
      <td style="color:var(--text2)">${escapeHtml(t.author)}</td>
      <td style="text-align:center">${t.replies?.length || 0}</td>
      <td>${status}</td>
      <td>
        <div class="action-cell">
          <button class="btn btn-outline btn-micro" onclick="App.adminPinThread('${id}',${!t.pinned})">${t.pinned?'Unpin':'Pin'}</button>
          <button class="btn btn-outline btn-micro" onclick="App.adminLockThread('${id}',${!t.locked})">${t.locked?'Unlock':'Lock'}</button>
          <button class="btn btn-danger btn-micro" onclick="App.adminDeleteThread('${id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterAdminThreads(q) {
  const filtered = q
    ? adminData.threads.filter(t => t.title.toLowerCase().includes(q.toLowerCase()) || t.author.toLowerCase().includes(q.toLowerCase()))
    : adminData.threads;
  renderAdminForumTable(filtered);
}

async function adminPinThread(threadId, pinned) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/forum/${threadId}/pin`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ pinned }),
    });
    const data = await res.json();
    if (res.ok) { showToast(data.message); loadAdminForum(); if (state.currentView === 'community') renderCommunity(); }
    else showToast(data.error || 'Failed');
  } catch { showToast('Network error'); }
}

async function adminLockThread(threadId, locked) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/forum/${threadId}/lock`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ locked }),
    });
    const data = await res.json();
    if (res.ok) { showToast(data.message); loadAdminForum(); if (state.currentView === 'community') renderCommunity(); }
    else showToast(data.error || 'Failed');
  } catch { showToast('Network error'); }
}

async function adminDeleteThread(threadId) {
  if (!confirm('Delete this thread?')) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/forum/${threadId}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    const data = await res.json();
    if (res.ok) { showToast('Thread deleted'); loadAdminForum(); }
    else showToast(data.error || 'Failed');
  } catch { showToast('Network error'); }
}

// Admin: create thread from admin panel
async function adminCreateThread() {
  const title   = byId('nt-title')?.value.trim();
  const subject = byId('nt-subject')?.value;
  const body    = byId('nt-body')?.value.trim();
  const pinned  = byId('nt-pin')?.checked;
  const errEl   = byId('nt-error');
  if (errEl) errEl.textContent = '';

  if (!title || !body) { if (errEl) errEl.textContent = 'Title and body are required.'; return; }

  const btn = document.querySelector('#admin-tab-newthread .btn-primary');
  if (btn) { btn.textContent = 'Posting…'; btn.disabled = true; }

  try {
    const res  = await fetch(`${API_BASE_URL}/api/community/forum`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ title, subject, body }),
    });
    const data = await res.json();
    if (!res.ok) { if (errEl) errEl.textContent = data.error || 'Failed.'; return; }

    // Pin if checkbox is checked
    if (pinned && data.data?._id) {
      await fetch(`${API_BASE_URL}/api/admin/forum/${data.data._id}/pin`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ pinned: true }),
      });
    }

    showToast('Thread created!');
    if (byId('nt-title'))  byId('nt-title').value  = '';
    if (byId('nt-body'))   byId('nt-body').value   = '';
    if (byId('nt-pin'))    byId('nt-pin').checked  = false;
    switchAdminTab('forum');
  } catch { if (errEl) errEl.textContent = 'Network error.'; }
  finally { if (btn) { btn.textContent = 'Create Thread'; btn.disabled = false; } }
}

// Admin: load topic list
function loadAdminTopicList(subjectId) {
  const container = byId('admin-topic-list');
  if (!container || !subjectId) return;
  const subject = state.subjectMap.get(subjectId);
  if (!subject) { container.innerHTML = '<p style="color:var(--text2)">Subject not found.</p>'; return; }
  const allTopics = subject.units.flatMap(u => u.topics.map(t => ({ ...t, unitName: u.name })));
  if (!allTopics.length) { container.innerHTML = '<p style="color:var(--text2)">No topics in this subject.</p>'; return; }
  container.innerHTML = allTopics.map(t => `
    <div class="admin-topic-card">
      <strong>${escapeHtml(t.name)}</strong>
      <small>${escapeHtml(t.unitName)}</small>
      <small style="opacity:0.6">${escapeHtml(t.id)}</small>
      <div class="card-actions">
        <button class="btn btn-outline btn-micro" onclick="App.goToTopicEditor('${subjectId}','${t.id}')">Edit</button>
      </div>
    </div>
  `).join('');
}

function goToTopicEditor(subjectId, topicId) {
  go('editor');
  setTimeout(() => {
    const sel = byId('editor-subject-select');
    if (sel) { sel.value = subjectId; loadEditorSubject(subjectId); }
    setTimeout(() => openTopicInEditor(topicId), 100);
  }, 50);
}

// ============================================================================
// EDITOR: wire save to backend API
// ============================================================================

async function saveTopic() {
  if (!editorState.currentTopic) return;
  try {
    const jsonStr = byId('editor-json').value;
    const parsed  = JSON.parse(jsonStr);

    // If logged in as admin, persist to server
    if (auth.isLoggedIn && auth.user?.role === 'admin' && editorState.currentSubject) {
      const res = await fetch(`${API_BASE_URL}/api/topics/${editorState.currentTopic}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ subject: editorState.currentSubject, data: parsed }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`Save error: ${data.error}`); return; }
      showToast('Topic saved to server ✓');
    } else {
      showToast('Topic saved (in-memory — sign in as admin to persist)');
    }

    state.topics.set(editorState.currentTopic, parsed);
    editorState.originalJson = jsonStr;
    if (state.currentView === 'topic' && state.currentTopic === editorState.currentTopic) {
      renderTopicView(editorState.currentTopic);
    }
  } catch (error) {
    showToast(`Error: ${error.message}`);
  }
}

async function deleteCurrentTopic() {
  if (!editorState.currentTopic || !confirm('Really delete this topic? This cannot be undone.')) return;

  // If admin, delete from server
  if (auth.isLoggedIn && auth.user?.role === 'admin' && editorState.currentSubject) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/topics/${editorState.currentTopic}?subject=${editorState.currentSubject}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`Delete error: ${data.error}`); return; }
    } catch { showToast('Network error'); return; }
  }

  state.topics.delete(editorState.currentTopic);
  for (const subject of state.subjects) {
    for (const unit of subject.units) {
      const i = unit.topics.findIndex(t => t.id === editorState.currentTopic);
      if (i >= 0) unit.topics.splice(i, 1);
    }
  }

  editorState.currentTopic = null;
  byId('editor-title').textContent   = 'Select a topic to edit';
  byId('editor-json').value          = '';
  byId('editor-save-btn').style.display   = 'none';
  byId('editor-cancel-btn').style.display = 'none';
  byId('editor-delete-btn').style.display = 'none';

  loadEditorSubject(editorState.currentSubject);
  showToast('Topic deleted');
}

// ============================================================================
// NAV — show Admin button for admins
// ============================================================================

function updateNavForAuth() {
  const btn = byId('signin-btn'); if (!btn) return;
  const adminBtn = byId('admin-nav-btn');
  if (auth.isLoggedIn) {
    btn.textContent = auth.user?.name?.split(' ')[0] || 'Account';
    btn.title       = 'Click to sign out';
    btn.onclick     = () => { if (confirm('Sign out?')) handleSignOut(); };
    if (adminBtn) adminBtn.style.display = auth.user?.role === 'admin' ? '' : 'none';
  } else {
    btn.textContent = 'Sign In'; btn.title = '';
    btn.onclick     = () => openAuthModal('login');
    if (adminBtn) adminBtn.style.display = 'none';
  }
}

// ============================================================================
// go() — add admin route
// ============================================================================

function go(viewName, payload = {}) {
  setActiveView(viewName);
  if (viewName === 'home')        renderHome();
  if (viewName === 'subjects')    renderSubjectSelection();
  if (viewName === 'subject')     renderSubjectView(payload.subjectId || state.currentSubject);
  if (viewName === 'topic')       renderTopicView(payload.topicId || state.currentTopic);
  if (viewName === 'quiz')        startQuiz(payload);
  if (viewName === 'flash')       startFlashcards(payload);
  if (viewName === 'past-papers') renderPastPapers();
  if (viewName === 'community')   renderCommunity();
  if (viewName === 'profile')     renderProfile();
  if (viewName === 'admin')       renderAdmin();
  if (viewName === 'editor') {
    byId('editor-subject-select').value = '';
    byId('editor-topics-list').innerHTML = '';
    byId('editor-title').textContent    = 'Select a topic to edit';
    byId('editor-json').value           = '';
  }
}

// ============================================================================
// bindBaseEvents — add typing emitter + new route listener
// ============================================================================

function bindBaseEvents() {
  document.querySelectorAll('[data-route]').forEach(button => {
    button.addEventListener('click', () => go(button.getAttribute('data-route')));
  });

  updateNavForAuth();
  byId('theme-toggle').addEventListener('click', toggleTheme);
  byId('chat-send').addEventListener('click', sendChatMessage);
  byId('chat-input').addEventListener('keydown', event => {
    if (event.key === 'Enter') sendChatMessage();
    else emitTyping();
  });

  bindSearch();
}

// ============================================================================
// APP EXPORT
// ============================================================================

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
  // Editor
  loadEditorSubject,
  openTopicInEditor,
  saveTopic,
  cancelEdit,
  deleteCurrentTopic,
  createNewTopic,
  showEditorHelp,
  // Forum
  openNewThreadModal,
  closeNewThreadModal,
  submitNewThread,
  submitReply,
  deleteReply,
  deleteThread,
  upvoteThread,
  filterForumBySubject,
  // Admin
  switchAdminTab,
  loadAdminTopicList,
  filterAdminUsers,
  filterAdminThreads,
  toggleUserRole,
  toggleUserBan,
  adminDeleteUser,
  adminPinThread,
  adminLockThread,
  adminDeleteThread,
  adminCreateThread,
  goToTopicEditor,
  // Auth modal (expose so inline HTML can call it)
  openAuthModal,
};

window.App = App;
init();
