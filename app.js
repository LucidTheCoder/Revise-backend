
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
  const tid = (topic.id  || "").toLowerCase();
  const sub = (topic.subject || "chem");

  // ── Palette ─────────────────────────────────────────────────────────
  const PAL = {
    chem:{ac:"#f97316",st:"rgba(249,115,22,.7)",fi:"rgba(249,115,22,.2)",bg:"rgba(249,115,22,.08)",li:"rgba(249,115,22,.5)"},
    bio: {ac:"#22c55e",st:"rgba(34,197,94,.7)",  fi:"rgba(34,197,94,.2)", bg:"rgba(34,197,94,.08)", li:"rgba(34,197,94,.5)"},
    phy: {ac:"#818cf8",st:"rgba(129,140,248,.7)",fi:"rgba(129,140,248,.2)",bg:"rgba(129,140,248,.08)",li:"rgba(129,140,248,.5)"},
  };
  const P = PAL[sub] || PAL.chem;

  // Viewbox: 700 × 260. Title at y=32. Usable space: y 46–252.
  const W = 700, H = 260;

  const wrap = (inner) =>
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(topic.title)}">
  <defs>
    <radialGradient id="rg${tid}" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="${P.bg}"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <marker id="ah${tid}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7Z" fill="${P.st}"/>
    </marker>
    <marker id="ag${tid}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0 L7,3.5 L0,7Z" fill="#8b949e"/>
    </marker>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="url(#rg${tid})"/>
  <rect x="1" y="1" width="${W-2}" height="${H-2}" rx="18" fill="none" stroke="${P.st}" stroke-width="1.2"/>
  ${inner}
</svg>`;

  // Flat-top hexagon centred at (cx,cy) with outer radius r
  const hexPts = (cx,cy,r) => {
    const pts=[];
    for(let i=0;i<6;i++){const a=Math.PI/3*i;pts.push(`${(cx+r*Math.cos(a)).toFixed(1)},${(cy+r*Math.sin(a)).toFixed(1)}`);}
    return pts.join(" ");
  };
  const H6  = (cx,cy,r,fi,st)  => `<polygon points="${hexPts(cx,cy,r)}" fill="${fi}" stroke="${st}" stroke-width="1.5" stroke-linejoin="round"/>`;
  const HT  = (cx,cy,lines,sz=11) => {
    if(!Array.isArray(lines))lines=[lines];
    const lh=sz*1.35, tot=lines.length*lh;
    const y0=cy - tot/2 + lh*0.78;
    return lines.map((l,i)=>`<text x="${cx}" y="${(y0+i*lh).toFixed(1)}" text-anchor="middle" dominant-baseline="auto" fill="#e6edf3" font-size="${sz}" font-family="DM Sans" font-weight="500">${escapeXml(String(l||""))}</text>`).join("");
  };
  const TT  = (t) => `<text x="22" y="30" fill="${P.ac}" font-size="12.5" font-family="DM Sans" font-weight="700" letter-spacing=".3">${escapeXml(t)}</text>`;
  const LN  = (x1,y1,x2,y2,col,w=1.8,dash="") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col||P.li}" stroke-width="${w}" stroke-linecap="round"${dash?` stroke-dasharray="${dash}"`:""}/>`; 
  const AR  = (x1,y1,x2,y2,col) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col||P.li}" stroke-width="1.8" stroke-linecap="round" marker-end="url(#ah${tid})"/>`;
  const LB  = (x,y,t,col,sz=9.5,a="middle") => `<text x="${x}" y="${y}" text-anchor="${a}" fill="${col||"#8b949e"}" font-size="${sz}" font-family="DM Sans">${escapeXml(String(t||""))}</text>`;
  const CRV = (d,col,w=2) => `<path d="${d}" fill="none" stroke="${col||P.li}" stroke-width="${w}" stroke-linecap="round"/>`;

  // Helper: hub-and-spoke layout for N satellite hexes around a centre hex
  // Returns {cx,cy} positions: [0]=centre, [1..N]=satellites
  const spoke = (cx,cy,r,n,startAngle=0) => {
    const pos=[{cx,cy}];
    for(let i=0;i<n;i++){
      const a=(startAngle + i*(360/n))*Math.PI/180;
      pos.push({cx:cx+r*Math.cos(a), cy:cy+r*Math.sin(a)});
    }
    return pos;
  };

  // ════════════════════════════════════════════════════════════════════
  //  CHEMISTRY
  // ════════════════════════════════════════════════════════════════════
  if(sub==="chem"){

    // Atomic structure
    if(tid.includes("atomic-structure")){
      // Shell diagram left; property hex grid right
      return wrap(`
        ${TT("Atomic Structure")}
        ${H6(130,150,38,P.fi,P.st)} ${HT(130,150,["nucleus","p⁺ n⁰"],10.5)}
        <circle cx="130" cy="150" r="60" fill="none" stroke="${P.li}" stroke-width="1.2" stroke-dasharray="4 3"/>
        <circle cx="130" cy="150" r="86" fill="none" stroke="${P.li}" stroke-width="1" stroke-dasharray="3 4" opacity=".6"/>
        <circle cx="130" cy="90"  r="5.5" fill="${P.ac}"/>
        <circle cx="190" cy="150" r="5.5" fill="${P.ac}"/>
        <circle cx="130" cy="210" r="5.5" fill="${P.ac}"/>
        <circle cx="70"  cy="150" r="5.5" fill="${P.ac}"/>
        ${LB(130,85,"e⁻",P.ac,9)} ${LB(197,153,"e⁻",P.ac,9)} ${LB(130,222,"e⁻",P.ac,9)} ${LB(63,153,"e⁻",P.ac,9)}
        ${LN(235,55,680,55,P.li,1,"2 3")}
        ${H6(310,100,32,P.fi,P.st)} ${HT(310,100,["1s²2s²","2p⁶…"],9.5)}
        ${H6(460,100,32,P.fi,P.st)} ${HT(460,100,["Isotopes","same Z,diff A"],8.5)}
        ${H6(610,100,32,P.fi,P.st)} ${HT(610,100,["1st IE","definition"],9)}
        ${H6(310,185,32,P.fi,P.st)} ${HT(310,185,["Orbitals","s p d f"],9.5)}
        ${H6(460,185,32,P.fi,P.st)} ${HT(460,185,["Aufbau","Hund Pauli"],8.5)}
        ${H6(610,185,32,P.fi,P.st)} ${HT(610,185,["Successive","IE trend"],9)}
        ${LN(310,67,310,55,P.li,1)} ${LN(460,67,460,55,P.li,1)} ${LN(610,67,610,55,P.li,1)}
        ${LN(310,153,310,218,P.li,1,"3 2")} ${LN(460,153,460,218,P.li,1,"3 2")} ${LN(610,153,610,218,P.li,1,"3 2")}
        ${LB(350,46,"Electron Configuration",P.ac,9)}
        ${LB(540,46,"Isotopes & Ionisation",P.ac,9)}
      `);
    }

    // Stoichiometry — mole conversion wheel
    if(tid.includes("stoichiometry")){
      const sp=spoke(350,148,95,4,-45);
      return wrap(`
        ${TT("Stoichiometry — The Mole")}
        ${H6(sp[0].cx,sp[0].cy,42,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Mole","n"],14)}
        ${H6(sp[1].cx,sp[1].cy,32,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["mass","n = m / Mᵣ"],9)}
        ${H6(sp[2].cx,sp[2].cy,32,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["volume","n = V / 24"],9)}
        ${H6(sp[3].cx,sp[3].cy,32,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["particles","n = N / Nₐ"],9)}
        ${H6(sp[4].cx,sp[4].cy,32,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["conc × vol","n = c × V"],9)}
        ${AR(sp[0].cx,sp[0].cy,sp[1].cx+36,sp[1].cy-2,P.li)}
        ${AR(sp[0].cx,sp[0].cy,sp[2].cx+2,sp[2].cy-36,P.li)}
        ${AR(sp[0].cx,sp[0].cy,sp[3].cx-36,sp[3].cy+2,P.li)}
        ${AR(sp[0].cx,sp[0].cy,sp[4].cx-2,sp[4].cy+36,P.li)}
        ${H6(100,148,26,"rgba(249,115,22,.1)",P.st)} ${HT(100,148,["Mᵣ"],11)}
        ${H6(600,148,26,"rgba(249,115,22,.1)",P.st)} ${HT(600,148,["Nₐ"],11)}
        ${LN(128,148,260,148,P.li,1,"3 2")} ${LN(440,148,574,148,P.li,1,"3 2")}
      `);
    }

    // Chemical bonding
    if(tid.includes("chemical-bonding")){
      const sp=spoke(350,148,96,4,-45);
      return wrap(`
        ${TT("Chemical Bonding")}
        ${H6(sp[0].cx,sp[0].cy,38,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Bond","Types"],12)}
        ${H6(sp[1].cx,sp[1].cy,34,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Ionic","e⁻ transfer"],9.5)}
        ${H6(sp[2].cx,sp[2].cy,34,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Covalent","shared e⁻"],9.5)}
        ${H6(sp[3].cx,sp[3].cy,34,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Metallic","e⁻ sea"],9.5)}
        ${H6(sp[4].cx,sp[4].cy,34,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Dative","lone pair"],9.5)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        ${H6(90,148,28,P.fi,P.st)}  ${HT(90,148,["Giant","lattice"],8.5)}
        ${H6(610,148,28,P.fi,P.st)} ${HT(610,148,["VSEPR","shapes"],8.5)}
        ${LN(124,148,200,148,P.li,1,"3 2")} ${LN(500,148,582,148,P.li,1,"3 2")}
      `);
    }

    // Energetics — enthalpy profiles
    // Layout: exo profile left (x 60-340), endo profile right (x 380-650)
    // Reference baseline y=205; profile heights above it
    if(tid.includes("energetics")){
      const BY=205, EXH=90, ENH=60; // baseline y, exo height, endo height drop
      return wrap(`
        ${TT("Energetics — Enthalpy")}
        ${LB(350,248,"← exothermic (ΔH < 0)     endothermic (ΔH > 0) →","#8b949e",8.5)}
        <rect x="55" y="${BY}" width="590" height="3" rx="1" fill="${P.li}" opacity=".35"/>
        <rect x="55" y="${BY+3}" width="590" height="28" fill="${P.fi}" opacity=".25" rx="0"/>
        ${LB(350,223,"reference baseline","#8b949e",8.5)}
        <path d="M80,${BY} L80,${BY-EXH} L250,${BY-EXH} L250,${BY}" fill="none" stroke="${P.ac}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M250,${BY-EXH} L310,${BY-EXH}" fill="none" stroke="${P.ac}" stroke-width="1.5" stroke-dasharray="5 4" opacity=".6"/>
        <path d="M380,${BY} L380,${BY-ENH-40} L560,${BY-ENH-40} L560,${BY}" fill="none" stroke="#818cf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${H6(165,BY-EXH,28,"rgba(249,115,22,.25)",P.st)} ${HT(165,BY-EXH,["Exo","ΔH<0"],10)}
        ${H6(470,BY-ENH-40,28,"rgba(129,140,248,.25)","rgba(129,140,248,.7)")} ${HT(470,BY-ENH-40,["Endo","ΔH>0"],10)}
        ${H6(310,BY-EXH-42,26,P.fi,P.st)} ${HT(310,BY-EXH-42,["Eₐ"],12)}
        ${AR(270,BY-EXH-42,288,BY-EXH-42,P.li)}
        ${LB(80,BY-EXH-8,"start","#8b949e",8)} ${LB(250,BY-EXH-8,"end","#8b949e",8)}
        ${LB(380,BY-ENH-50,"start","#8b949e",8)} ${LB(560,BY-ENH-50,"end","#8b949e",8)}
        ${LN(250,BY-EXH,310,BY-EXH-28,P.li,1,"3 3")}
      `);
    }

    // Kinetics
    if(tid.includes("kinetics")){
      const sp=spoke(295,152,86,4,0);
      return wrap(`
        ${TT("Reaction Kinetics")}
        ${H6(sp[0].cx,sp[0].cy,38,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Rate","Factors"],12)}
        ${H6(sp[1].cx,sp[1].cy,30,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Temp","↑ rate"],9.5)}
        ${H6(sp[2].cx,sp[2].cy,30,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Conc","↑ rate"],9.5)}
        ${H6(sp[3].cx,sp[3].cy,30,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Surface","Area"],9.5)}
        ${H6(sp[4].cx,sp[4].cy,30,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Catalyst","↓ Eₐ"],9.5)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        <rect x="480" y="55" width="185" height="180" rx="12" fill="${P.bg}" stroke="${P.st}" stroke-width="1.2"/>
        ${LB(572,75,"Maxwell-Boltzmann",P.ac,9)}
        <path d="M495,218 Q510,175 530,148 Q560,110 590,100 Q620,95 650,105 Q665,112 655,130" fill="none" stroke="${P.ac}" stroke-width="2.2" stroke-linecap="round"/>
        ${LB(635,130,"Eₐ","#8b949e",8.5)} ${LN(635,132,635,218,P.li,1,"3 3")}
        ${LB(572,235,"f(E)  →  energy","#8b949e",8)}
        ${LN(384,152,450,152,P.li,1,"3 2")}
      `);
    }

    // Equilibria
    if(tid.includes("equilibria")){
      return wrap(`
        ${TT("Chemical Equilibria")}
        ${H6(180,148,38,P.fi,P.st)} ${HT(180,148,["Reactants"],11)}
        ${H6(520,148,38,P.fi,P.st)} ${HT(520,148,["Products"],11)}
        ${AR(225,135,475,135,P.ac)} ${LB(350,128,"kf  (forward)",P.ac,9)}
        ${AR(475,161,225,161,"#818cf8")} ${LB(350,175,"kr  (reverse)","#818cf8",9)}
        ${H6(350,80, 28,P.fi,P.st)} ${HT(350,80, ["Kc","[P]/[R]"],9.5)}
        ${H6(100,80, 28,P.fi,P.st)} ${HT(100,80, ["Le","Chatelier"],9)}
        ${H6(600,80, 28,P.fi,P.st)} ${HT(600,80, ["Kp","partial p"],9.5)}
        ${H6(100,220,28,P.fi,P.st)} ${HT(100,220,["Haber","Process"],9)}
        ${H6(600,220,28,P.fi,P.st)} ${HT(600,220,["Contact","Process"],9)}
        ${H6(350,220,28,P.fi,P.st)} ${HT(350,220,["Dynamic","Equil."],9)}
        ${LN(180,110,180,90,P.li,1,"3 2")} ${LN(180,90,122,85,P.li,1,"3 2")} ${LN(180,90,324,83,P.li,1,"3 2")}
        ${LN(520,110,520,90,P.li,1,"3 2")} ${LN(520,90,578,85,P.li,1,"3 2")}
        ${LN(100,108,100,192,P.li,1,"3 2")} ${LN(600,108,600,192,P.li,1,"3 2")} ${LN(350,108,350,192,P.li,1,"3 2")}
      `);
    }

    // Electrochemistry
    if(tid.includes("electrochem")){
      return wrap(`
        ${TT("Electrochemistry")}
        <rect x="60" y="90" width="245" height="115" rx="12" fill="${P.fi}" stroke="${P.st}" stroke-width="1.4"/>
        <rect x="395" y="90" width="245" height="115" rx="12" fill="rgba(129,140,248,.15)" stroke="rgba(129,140,248,.65)" stroke-width="1.4"/>
        ${LB(182,112,"Anode (−)  oxidation",P.ac,9.5)} ${LB(518,112,"Cathode (+)  reduction","#818cf8",9.5)}
        ${LB(182,148,"M → Mⁿ⁺ + ne⁻","#e6edf3",9.5)} ${LB(518,148,"Mⁿ⁺ + ne⁻ → M","#e6edf3",9.5)}
        <rect x="301" y="138" width="98" height="18" rx="6" fill="${P.bg}" stroke="${P.li}"/>
        ${LB(350,151,"salt bridge","#8b949e",8.5)}
        <path d="M182,90 L182,62 L518,62 L518,90" fill="none" stroke="${P.ac}" stroke-width="2.5" stroke-linecap="round"/>
        <rect x="330" y="55" width="40" height="10" rx="2" fill="${P.ac}"/>
        ${LB(350,52,"e⁻ →",P.ac,9)}
        ${H6(182,215,24,P.fi,P.st)} ${HT(182,215,["Oxidation","State"],8.5)}
        ${H6(350,215,24,P.fi,P.st)} ${HT(350,215,["E°cell","= E°cat−E°an"],8)}
        ${H6(518,215,24,"rgba(129,140,248,.2)","rgba(129,140,248,.65)")} ${HT(518,215,["Reduction","State"],8.5)}
        ${LN(182,195,182,205,P.li,1)} ${LN(350,190,350,205,P.li,1)} ${LN(518,195,518,205,P.li,1)}
      `);
    }

    // Organic / hydrocarbons
    if(tid.includes("organic")||tid.includes("hydrocarbons")){
      const xs=[80,210,340,470,600], y1=100, y2=190;
      return wrap(`
        ${TT("Organic Chemistry — Functional Groups")}
        ${H6(xs[0],y1,34,P.fi,P.st)} ${HT(xs[0],y1,["Alkanes","CₙH₂ₙ₊₂"],9.5)}
        ${H6(xs[1],y1,34,P.fi,P.st)} ${HT(xs[1],y1,["Alkenes","CₙH₂ₙ"],9.5)}
        ${H6(xs[2],y1,34,P.fi,P.st)} ${HT(xs[2],y1,["Alcohols","–OH"],9.5)}
        ${H6(xs[3],y1,34,P.fi,P.st)} ${HT(xs[3],y1,["Carbonyls","C=O"],9.5)}
        ${H6(xs[4],y1,34,P.fi,P.st)} ${HT(xs[4],y1,["Carboxyl","–COOH"],9.5)}
        ${H6(xs[0],y2,28,P.fi,P.st)} ${HT(xs[0],y2,["Subst.","reaction"],8.5)}
        ${H6(xs[1],y2,28,P.fi,P.st)} ${HT(xs[1],y2,["Add.","reaction"],8.5)}
        ${H6(xs[2],y2,28,P.fi,P.st)} ${HT(xs[2],y2,["Oxidation","Esterific."],8.5)}
        ${H6(xs[3],y2,28,P.fi,P.st)} ${HT(xs[3],y2,["Reduc.","Nucleoph."],8.5)}
        ${H6(xs[4],y2,28,P.fi,P.st)} ${HT(xs[4],y2,["Ester","Acyl Cl."],8.5)}
        ${xs.map(x=>`${LN(x,134,x,162,P.li)}`).join("")}
        ${AR(xs[0]+34,y1,xs[1]-34,y1,P.li)} ${AR(xs[1]+34,y1,xs[2]-34,y1,P.li)}
        ${AR(xs[2]+34,y1,xs[3]-34,y1,P.li)} ${AR(xs[3]+34,y1,xs[4]-34,y1,P.li)}
      `);
    }

    // Halogen compounds
    if(tid.includes("halogen")){
      const sp=spoke(350,148,94,4,-45);
      return wrap(`
        ${TT("Halogen Compounds")}
        ${H6(sp[0].cx,sp[0].cy,36,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["C–X","Bond"],13)}
        ${H6(sp[1].cx,sp[1].cy,32,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["SN1","tertiary"],9.5)}
        ${H6(sp[2].cx,sp[2].cy,32,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["SN2","primary"],9.5)}
        ${H6(sp[3].cx,sp[3].cy,32,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Elim-","ination"],9.5)}
        ${H6(sp[4].cx,sp[4].cy,32,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Nucleo-","phile Nu⁻"],9)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        ${H6(88,148,26,P.fi,P.st)}  ${HT(88,148,["F Cl","Br I"],9.5)}
        ${H6(612,148,26,P.fi,P.st)} ${HT(612,148,["Reactiv.","F<Cl<Br<I"],8)}
        ${LN(116,148,220,148,P.li,1,"3 2")} ${LN(480,148,586,148,P.li,1,"3 2")}
      `);
    }

    // Periodicity
    if(tid.includes("periodicity")){
      const els=["Na","Mg","Al","Si","P","S","Cl","Ar"];
      const xs=els.map((_,i)=>78+i*78);
      return wrap(`
        ${TT("Periodicity — Period 3")}
        <rect x="50" y="60" width="602" height="34" rx="8" fill="${P.fi}" stroke="${P.st}" stroke-width="1.2"/>
        ${LB(350,83,"Atomic radius ↓     IE (generally) ↑     Electronegativity ↑",P.ac,8.5)}
        ${els.map((el,i)=>`${H6(xs[i],165,30,P.fi,P.st)}${HT(xs[i],165,[el],14)}`).join("")}
        ${xs.map((x,i)=>`${LN(x,100,x,133,P.li,1.2)}`).join("")}
        ${LB(78,220,"metal",P.ac,8.5,"start")} ${LB(390,220,"metalloid","#8b949e",8.5)} ${LB(622,220,"non-metal",P.ac,8.5,"end")}
        ${LB(350,240,"Group 1→8: properties change systematically across the period","#8b949e",8.5)}
        <path d="M78,220 L622,220" stroke="${P.li}" stroke-width="1" stroke-dasharray="3 3"/>
      `);
    }

    // Group 2
    if(tid.includes("group-2")){
      const els=["Be","Mg","Ca","Sr","Ba","Ra"];
      const xs=els.map((_,i)=>80+i*108);
      return wrap(`
        ${TT("Group 2 — Alkaline Earth Metals")}
        ${els.map((el,i)=>`${H6(xs[i],115,28+i*2,"rgba(249,115,22,.15)",P.st)}${HT(xs[i],115,[el],13)}`).join("")}
        ${LN(60,148,648,148,P.li,1,"3 4")} 
        <path d="M80,155 Q188,180 296,172 Q404,164 512,178 Q570,186 620,196" fill="none" stroke="${P.ac}" stroke-width="2.5" stroke-linecap="round"/>
        ${LB(350,215,"Reactivity with O₂ and H₂O increases down group","#8b949e",9.5)}
        ${LB(80,230,"IE ↑","#8b949e",9,"start")} ${LB(620,230,"IE ↓","#8b949e",9,"end")}
        ${LB(350,245,"Thermal decomposition of carbonates: harder down group","#8b949e",8.5)}
      `);
    }

    // Group 17
    if(tid.includes("group-17")){
      const data=[["F","pale yellow gas"],["Cl","yellow-green gas"],["Br","red-brown liquid"],["I","grey-black solid"]];
      const xs=[110,260,440,590];
      return wrap(`
        ${TT("Group 17 — The Halogens")}
        ${data.map(([el,st],i)=>`${H6(xs[i],110,36,"rgba(249,115,22,.16)",P.st)}${HT(xs[i],110,[el],17)}${LB(xs[i],162,st,"#8b949e",8.5)}`).join("")}
        <path d="M110,142 Q260,168 440,155 Q515,150 590,145" fill="none" stroke="${P.ac}" stroke-width="2.5" stroke-linecap="round"/>
        ${LN(60,142,648,142,P.li,1,"3 4")}
        ${LB(350,195,"Oxidising power: F > Cl > Br > I","#8b949e",9.5)}
        ${LB(350,213,"Boiling point increases down the group","#8b949e",9.5)}
        ${LB(350,231,"Reactivity with H₂: F > Cl > Br > I","#8b949e",9.5)}
      `);
    }

    // Carbonyl compounds
    if(tid.includes("carbonyl")){
      return wrap(`
        ${TT("Carbonyl Compounds")}
        ${H6(175,120,34,P.fi,P.st)} ${HT(175,120,["Aldehydes","R–CHO"],10)}
        ${H6(350,85, 30,P.fi,P.st)} ${HT(350,85, ["Nucleophilic","Addition"],9.5)}
        ${H6(525,120,34,P.fi,P.st)} ${HT(525,120,["Ketones","R–CO–R"],10)}
        ${H6(140,210,28,P.fi,P.st)} ${HT(140,210,["2,4-DNPH","orange ppt"],8.5)}
        ${H6(280,210,28,P.fi,P.st)} ${HT(280,210,["Tollens'","silver mirror"],8.5)}
        ${H6(420,210,28,P.fi,P.st)} ${HT(420,210,["Fehling's","brick red"],8.5)}
        ${H6(560,210,28,P.fi,P.st)} ${HT(560,210,["NaBH₄","reduction"],8.5)}
        ${LN(175,86,175,100,P.li,1,"3 2")} ${LN(525,86,525,100,P.li,1,"3 2")}
        ${LN(209,111,320,91,P.li)} ${LN(491,111,380,91,P.li)}
        ${LN(175,154,175,182,P.li)} ${LN(280,182,280,154,P.li,1,"3 2")} ${LN(420,182,420,154,P.li,1,"3 2")} ${LN(525,154,525,182,P.li)}
        ${LB(350,53,"C=O group",P.ac,12)}
      `);
    }

    // Nitrogen compounds
    if(tid.includes("nitrogen")){
      const sp=spoke(320,148,90,4,-45);
      return wrap(`
        ${TT("Nitrogen Compounds")}
        ${H6(sp[0].cx,sp[0].cy,36,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Amines","–NH₂"],12)}
        ${H6(sp[1].cx,sp[1].cy,30,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Primary","R–NH₂"],9.5)}
        ${H6(sp[2].cx,sp[2].cy,30,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Secondary","R₂NH"],9.5)}
        ${H6(sp[3].cx,sp[3].cy,30,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Amides","–CONH₂"],9.5)}
        ${H6(sp[4].cx,sp[4].cy,30,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Amino","Acids"],9.5)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        ${H6(565,100,34,P.fi,P.st)} ${HT(565,100,["Peptide","–CO–NH–"],9.5)}
        ${H6(565,200,34,P.fi,P.st)} ${HT(565,200,["Diazonium","salts"],9.5)}
        ${LN(488,148,531,120,P.li,1,"3 2")} ${LN(488,148,531,176,P.li,1,"3 2")}
      `);
    }

    // Carboxylic acids
    if(tid.includes("carboxylic")){
      const sp=spoke(350,148,90,4,-45);
      return wrap(`
        ${TT("Carboxylic Acids & Derivatives")}
        ${H6(sp[0].cx,sp[0].cy,38,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["–COOH"],12)}
        ${H6(sp[1].cx,sp[1].cy,30,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Acyl","Chloride"],9.5)}
        ${H6(sp[2].cx,sp[2].cy,30,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Ester","R–COO–R"],9.5)}
        ${H6(sp[3].cx,sp[3].cy,30,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Amide","–CONH₂"],9.5)}
        ${H6(sp[4].cx,sp[4].cy,30,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Anhydride","R–CO–O–CO"],9)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        ${H6(90,148,26,P.fi,P.st)}  ${HT(90,148,["PCl₅","→ acyl Cl"],8)}
        ${H6(610,148,26,P.fi,P.st)} ${HT(610,148,["Sapon-","ification"],8.5)}
        ${LN(118,148,220,148,P.li,1,"3 2")} ${LN(480,148,584,148,P.li,1,"3 2")}
      `);
    }

    // Hydroxy compounds (alcohols)
    if(tid.includes("hydroxy")){
      const sp=spoke(350,148,90,5,-90);
      return wrap(`
        ${TT("Hydroxy Compounds — Alcohols")}
        ${H6(sp[0].cx,sp[0].cy,38,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["–OH","Alcohol"],12)}
        ${H6(sp[1].cx,sp[1].cy,30,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Primary","1°  R–CH₂OH"],8.5)}
        ${H6(sp[2].cx,sp[2].cy,30,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Oxidation","→ aldehyde"],8.5)}
        ${H6(sp[3].cx,sp[3].cy,30,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Esterific.","+ acid"],8.5)}
        ${H6(sp[4].cx,sp[4].cy,30,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Dehydr.","→ alkene"],8.5)}
        ${H6(sp[5].cx,sp[5].cy,30,P.fi,P.st)} ${HT(sp[5].cx,sp[5].cy,["Substitut.","→ halogen"],8.5)}
        ${[1,2,3,4,5].map(i=>`${LN(sp[0].cx,sp[0].cy,sp[i].cx,sp[i].cy,P.li)}`).join("")}
      `);
    }

    // Analytical techniques
    if(tid.includes("analytical")){
      const cols=[
        ["Mass Spec","M/z ratio","Mol. formula"],
        ["IR Spec","fingerprint","C=O ~1700"],
        ["NMR","chem. shift δ","splitting"],
        ["Chromat.","Rf value","separation"],
      ];
      const xs=[100,250,450,600];
      return wrap(`
        ${TT("Analytical Techniques")}
        ${cols.map(([h,l1,l2],i)=>`
          ${H6(xs[i],110,40,P.fi,P.st)}${HT(xs[i],110,[h],9.5)}
          ${H6(xs[i],195,28,P.fi,P.st)}${HT(xs[i],195,[l1,l2],8.2)}
          ${LN(xs[i],150,xs[i],167,P.li)}
        `).join("")}
        ${AR(140,110,210,110,P.li)} ${AR(290,110,410,110,P.li)} ${AR(490,110,560,110,P.li)}
        ${LB(350,245,"Used to determine molecular formula, structure and purity","#8b949e",8.5)}
      `);
    }

    // Polymerisation
    if(tid.includes("polymer")){
      return wrap(`
        ${TT("Polymerisation")}
        ${H6(175,120,36,P.fi,P.st)} ${HT(175,120,["Addition","Polymer."],10.5)}
        ${H6(525,120,36,P.fi,P.st)} ${HT(525,120,["Condensation","Polymer."],9.5)}
        ${H6(90, 210,28,P.fi,P.st)} ${HT(90, 210,["Alkene","monomer"],8.5)}
        ${H6(200,210,28,P.fi,P.st)} ${HT(200,210,["Poly-","ethene"],8.5)}
        ${H6(400,210,28,P.fi,P.st)} ${HT(400,210,["Polyester","–COO–"],8.5)}
        ${H6(510,210,28,P.fi,P.st)} ${HT(510,210,["Polyamide","–CONH–"],8.5)}
        ${H6(620,210,28,P.fi,P.st)} ${HT(620,210,["H₂O","by-product"],8.5)}
        ${H6(350,70, 26,P.fi,P.st)} ${HT(350,70, ["No","by-product"],8.5)}
        ${LN(175,84,175,70,P.li,1,"3 2")} ${LN(175,70,324,70,P.li,1,"3 2")}
        ${LN(525,84,525,70,P.li,1,"3 2")} ${LN(525,70,376,70,P.li,1,"3 2")}
        ${LN(175,156,175,182,P.li)} ${LN(90,182,90,196,P.li)} ${LN(200,182,200,196,P.li)}
        ${LN(525,156,525,182,P.li)} ${LN(400,182,400,196,P.li)} ${LN(510,182,510,196,P.li)} ${LN(620,182,620,196,P.li)}
        ${AR(211,120,489,120,P.ac)} ${LB(350,113,"no by-product        small molecule lost",P.ac,8.5)}
      `);
    }

    // States of matter
    if(tid.includes("states")){
      const states=[["Solid","ordered\nlattice",110],["Liquid","flowing\nrandom",350],["Gas","random\nhigh KE",590]];
      return wrap(`
        ${TT("States of Matter")}
        ${states.map(([s,d,x])=>`${H6(x,128,44,P.fi,P.st)}${HT(x,128,[s],13)}`).join("")}
        ${AR(160,115,300,115,P.ac)} ${LB(230,108,"melting / dissolve",P.ac,8.5)}
        ${AR(400,115,540,115,P.ac)} ${LB(470,108,"boiling / vapour.",P.ac,8.5)}
        ${AR(540,142,400,142,"#818cf8")} ${LB(470,158,"condensation","#818cf8",8.5)}
        ${AR(298,142,162,142,"#818cf8")} ${LB(230,158,"freezing","#818cf8",8.5)}
        ${H6(110,215,26,P.fi,P.st)} ${HT(110,215,["Strong","IMF"],8.5)}
        ${H6(350,215,26,P.fi,P.st)} ${HT(350,215,["pV = nRT","ideal gas"],9)}
        ${H6(590,215,26,P.fi,P.st)} ${HT(590,215,["Weak","IMF"],8.5)}
        ${LN(110,172,110,189,P.li,1,"3 2")} ${LN(350,172,350,189,P.li,1,"3 2")} ${LN(590,172,590,189,P.li,1,"3 2")}
      `);
    }

    // Chem fallback
    {
      const labs=[(topic.definitions||[]).map(d=>d.term),(topic.notes||[]).map(n=>n.heading)].flat().filter(l=>l&&l.length>2).slice(0,5);
      while(labs.length<5)labs.push(["Reaction","Structure","Property","Mechanism","Equation"][labs.length]);
      const sp=spoke(350,148,96,5,-90);
      return wrap(`
        ${TT(topic.title)}
        ${sp.map((p,i)=>`${H6(p.cx,p.cy,i===0?40:30,P.fi,P.st)}${HT(p.cx,p.cy,[i===0?topic.title.split(" ")[0]:labs[i-1]],i===0?11:9)}`).join("")}
        ${[1,2,3,4,5].map(i=>`${LN(sp[0].cx,sp[0].cy,sp[i].cx,sp[i].cy,P.li)}`).join("")}
      `);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  BIOLOGY
  // ════════════════════════════════════════════════════════════════════
  if(sub==="bio"){

    if(tid.includes("cell-structure")){
      return wrap(`
        ${TT("Cell Structure")}
        <ellipse cx="350" cy="148" rx="185" ry="90" fill="${P.fi}" stroke="${P.st}" stroke-width="1.5"/>
        <ellipse cx="350" cy="148" rx="58" ry="38" fill="rgba(34,197,94,.30)" stroke="${P.st}" stroke-width="1.8"/>
        ${LB(350,152,"Nucleus","#e6edf3",10.5)}
        ${H6(100,78, 28,P.fi,P.st)} ${HT(100,78, ["Mito-","chondria"],9)}
        ${H6(100,218,28,P.fi,P.st)} ${HT(100,218,["Rough","ER"],9)}
        ${H6(600,78, 28,P.fi,P.st)} ${HT(600,78, ["Golgi","apparatus"],9)}
        ${H6(600,218,28,P.fi,P.st)} ${HT(600,218,["Ribosome","80S/70S"],8.5)}
        ${H6(350,58, 24,P.fi,P.st)} ${HT(350,58, ["Cell","membrane"],8.5)}
        ${H6(350,240,24,P.fi,P.st)} ${HT(350,240,["Vacuole","(plant)"],8.5)}
        ${LN(128,88, 180,110,P.li,1,"3 2")} ${LN(128,208,180,186,P.li,1,"3 2")}
        ${LN(572,88, 520,110,P.li,1,"3 2")} ${LN(572,208,520,186,P.li,1,"3 2")}
      `);
    }

    if(tid.includes("cell-membrane")||tid.includes("membrane")){
      return wrap(`
        ${TT("Cell Membranes — Fluid Mosaic Model")}
        <rect x="55"  y="118" width="590" height="14" rx="5" fill="${P.ac}" opacity=".4"/>
        <rect x="55"  y="162" width="590" height="14" rx="5" fill="${P.ac}" opacity=".4"/>
        <rect x="55"  y="132" width="590" height="30" fill="${P.fi}" opacity=".18"/>
        ${LB(350,152,"phospholipid bilayer","#e6edf3",9.5)}
        ${H6(110,90, 28,P.fi,P.st)} ${HT(110,90, ["Channel","protein"],8.5)}
        ${H6(260,90, 28,P.fi,P.st)} ${HT(260,90, ["Carrier","protein"],8.5)}
        ${H6(440,90, 28,P.fi,P.st)} ${HT(440,90, ["Glyco-","protein"],8.5)}
        ${H6(590,90, 28,P.fi,P.st)} ${HT(590,90, ["Cholest-","erol"],8.5)}
        ${H6(140,210,28,P.fi,P.st)} ${HT(140,210,["Osmosis","↓ ψ"],9)}
        ${H6(300,210,28,P.fi,P.st)} ${HT(300,210,["Diffusion","passive"],9)}
        ${H6(460,210,28,P.fi,P.st)} ${HT(460,210,["Active","transport"],9)}
        ${H6(590,210,28,P.fi,P.st)} ${HT(590,210,["Co-trans-","port"],8.5)}
        ${[110,260,440,590].map(x=>`${LN(x,118,x,104,P.li,1.2)}`).join("")}
        ${[140,300,460,590].map(x=>`${LN(x,176,x,182,P.li,1.2)}`).join("")}
      `);
    }

    if(tid.includes("biological-molecule")){
      const sp=spoke(350,145,96,4,-45);
      return wrap(`
        ${TT("Biological Molecules")}
        ${H6(sp[0].cx,sp[0].cy,38,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Monomers","→ Polymers"],9.5)}
        ${H6(sp[1].cx,sp[1].cy,32,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Carbo-","hydrates"],9.5)}
        ${H6(sp[2].cx,sp[2].cy,32,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Proteins","amino acids"],9)}
        ${H6(sp[3].cx,sp[3].cy,32,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Lipids","fatty acid"],9.5)}
        ${H6(sp[4].cx,sp[4].cy,32,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Nucleic","Acids"],9.5)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        ${H6(90,145,26,P.fi,P.st)}  ${HT(90,145,["glucose","starch"],8.5)}
        ${H6(610,145,26,P.fi,P.st)} ${HT(610,145,["DNA","RNA"],9)}
        ${LN(118,145,220,145,P.li,1,"3 2")} ${LN(480,145,584,145,P.li,1,"3 2")}
      `);
    }

    if(tid.includes("enzyme")){
      return wrap(`
        ${TT("Enzymes")}
        <path d="M190,90 Q225,52 265,90 Q305,130 265,168 Q225,206 190,168 Q155,130 190,90Z" fill="${P.fi}" stroke="${P.st}" stroke-width="1.8"/>
        ${LB(228,138,"Active","#e6edf3",10)} ${LB(228,152,"site","#e6edf3",10)}
        <path d="M256,126 Q278,112 298,126 Q278,146 256,126Z" fill="${P.ac}" opacity=".55"/>
        ${LB(277,132,"S","#e6edf3",12)}
        ${H6(450,82, 30,P.fi,P.st)} ${HT(450,82, ["Lock &","Key"],9.5)}
        ${H6(590,82, 30,P.fi,P.st)} ${HT(590,82, ["Induced","Fit"],9.5)}
        ${H6(450,175,30,P.fi,P.st)} ${HT(450,175,["Compet.","inhibitor"],9)}
        ${H6(590,175,30,P.fi,P.st)} ${HT(590,175,["Non-comp.","inhibitor"],9)}
        ${H6(350,55, 26,P.fi,P.st)} ${HT(350,55, ["Specificity"],8.5)}
        ${H6(350,242,26,P.fi,P.st)} ${HT(350,242,["Temp/pH","denat."],8.5)}
        ${AR(270,130,420,90,P.li)} ${AR(270,145,420,175,P.li)}
        ${LN(450,52,450,62,P.li,1,"3 2")} ${LN(590,112,590,145,P.li,1,"2 2")}
        ${LN(450,112,450,145,P.li,1,"2 2")}
        ${LB(80,248,"E + S ⇌ ES → E + P",P.ac,10,"start")}
      `);
    }

    if(tid.includes("gas-exchange")||tid.includes("transport-gas")){
      const sp=spoke(350,148,92,4,-45);
      return wrap(`
        ${TT("Gas Exchange")}
        ${H6(sp[0].cx,sp[0].cy,38,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Fick's","Law"],13)}
        ${H6(sp[1].cx,sp[1].cy,30,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Large","surf. area"],9)}
        ${H6(sp[2].cx,sp[2].cy,30,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Thin","membrane"],9)}
        ${H6(sp[3].cx,sp[3].cy,30,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Conc.","gradient"],9)}
        ${H6(sp[4].cx,sp[4].cy,30,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Ventil-","ation"],9)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        ${H6(90,148,26,P.fi,P.st)}  ${HT(90,148,["Alveoli"],8.5)}
        ${H6(610,148,26,P.fi,P.st)} ${HT(610,148,["Gill","lamella"],8.5)}
        ${LN(118,148,222,148,P.li,1,"3 2")} ${LN(478,148,584,148,P.li,1,"3 2")}
        ${LB(350,46,"Rate = (SA × conc. diff.) ÷ thickness",P.ac,9.5)}
      `);
    }

    if(tid.includes("genetics")||tid.includes("nucleic")){
      return wrap(`
        ${TT("Genetics & Nucleic Acids")}
        <path d="M195,55 Q232,95 195,135 Q158,175 195,215" fill="none" stroke="${P.ac}" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M235,55 Q198,95 235,135 Q272,175 235,215" fill="none" stroke="${P.ac}" stroke-width="2.5" stroke-linecap="round"/>
        ${[70,95,120,145,170,195].map(y=>`${LN(195,y,235,y,P.li,1.8)}`).join("")}
        ${LB(215,238,"DNA double helix","#8b949e",8.5)}
        ${H6(430,75, 30,P.fi,P.st)} ${HT(430,75, ["Codons","triplet code"],9)}
        ${H6(580,75, 30,P.fi,P.st)} ${HT(580,75, ["mRNA","transcription"],8.5)}
        ${H6(430,148,30,P.fi,P.st)} ${HT(430,148,["tRNA","translation"],9.5)}
        ${H6(580,148,30,P.fi,P.st)} ${HT(580,148,["Ribosome","protein"],9)}
        ${H6(430,220,30,P.fi,P.st)} ${HT(430,220,["Alleles","dom./rec."],9)}
        ${H6(580,220,30,P.fi,P.st)} ${HT(580,220,["Punnett","square"],9)}
        ${LN(305,75, 400,75, P.li,1,"3 2")} ${LN(305,148,400,148,P.li,1,"3 2")} ${LN(305,220,400,220,P.li,1,"3 2")}
        ${LN(460,75, 550,75, P.li,1,"2 2")} ${LN(460,148,550,148,P.li,1,"2 2")} ${LN(460,220,550,220,P.li,1,"2 2")}
      `);
    }

    if(tid.includes("mitotic")||tid.includes("cell-cycle")){
      return wrap(`
        ${TT("Mitotic Cell Cycle")}
        <circle cx="350" cy="148" r="88" fill="none" stroke="${P.li}" stroke-width="1.4" stroke-dasharray="5 4"/>
        ${H6(350,55, 28,P.fi,P.st)} ${HT(350,55, ["G1","growth"],9.5)}
        ${H6(444,100,28,P.fi,P.st)} ${HT(444,100,["S","DNA rep."],9.5)}
        ${H6(444,196,28,P.fi,P.st)} ${HT(444,196,["G2","check"],9.5)}
        ${H6(350,238,28,P.fi,P.st)} ${HT(350,238,["M","PMAT"],9.5)}
        ${H6(256,196,28,P.fi,P.st)} ${HT(256,196,["Cyto-","kinesis"],9)}
        ${H6(256,100,28,P.fi,P.st)} ${HT(256,100,["Interp-","hase"],9)}
        ${H6(350,148,36,"rgba(34,197,94,.3)",P.st)} ${HT(350,148,["Cell","Cycle"],11)}
        ${H6(590,90, 28,P.fi,P.st)} ${HT(590,90, ["Checkpt","p53 gene"],8.5)}
        ${H6(590,210,28,P.fi,P.st)} ${HT(590,210,["Cancer","uncontrolled"],8)}
        ${LN(474,105,562,100,P.li,1,"3 2")} ${LN(474,191,562,205,P.li,1,"3 2")}
      `);
    }

    if(tid.includes("immun")){
      const sp=spoke(350,148,94,4,-45);
      return wrap(`
        ${TT("Immunity")}
        ${H6(sp[0].cx,sp[0].cy,38,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Specific","Immunity"],10.5)}
        ${H6(sp[1].cx,sp[1].cy,30,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["B cells","antibodies"],9)}
        ${H6(sp[2].cx,sp[2].cy,30,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["T cells","cytotoxic"],9)}
        ${H6(sp[3].cx,sp[3].cy,30,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Memory","cells"],9.5)}
        ${H6(sp[4].cx,sp[4].cy,30,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Vaccines","herd immun."],8.5)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        ${H6(90,148,28,P.fi,P.st)}  ${HT(90,148,["Phago-","cytosis"],9)}
        ${H6(610,148,28,P.fi,P.st)} ${HT(610,148,["Clonal","selection"],8.5)}
        ${LN(118,148,220,148,P.li,1,"3 2")} ${LN(480,148,582,148,P.li,1,"3 2")}
        ${LB(350,48,"Antigen → lymphocyte activation → antibody / cytotoxic response",P.ac,8.5)}
      `);
    }

    if(tid.includes("transport-in-mammals")){
      return wrap(`
        ${TT("Transport in Mammals")}
        <path d="M312,82 Q316,54 350,68 Q384,54 388,82 Q415,108 388,138 Q369,158 350,172 Q331,158 312,138 Q285,108 312,82Z" fill="${P.fi}" stroke="${P.st}" stroke-width="2"/>
        ${LB(350,125,"Heart","#e6edf3",11)}
        ${H6(130,75, 30,P.fi,P.st)} ${HT(130,75, ["Pulmon-","ary circ."],9)}
        ${H6(130,222,30,P.fi,P.st)} ${HT(130,222,["Systemic","circ."],9.5)}
        ${H6(570,75, 30,P.fi,P.st)} ${HT(570,75, ["Arteries","thick wall"],8.5)}
        ${H6(570,222,30,P.fi,P.st)} ${HT(570,222,["Veins","valves"],9.5)}
        ${H6(350,48, 26,P.fi,P.st)} ${HT(350,48, ["Double","circulation"],8.5)}
        ${H6(350,240,26,P.fi,P.st)} ${HT(350,240,["Capillaries","exchange"],8.5)}
        ${AR(160,82, 298,96, P.li)} ${AR(160,215,298,158,P.li)}
        ${AR(402,96, 540,82, P.li)} ${AR(402,158,540,215,P.li)}
        ${LN(350,74, 350,62,P.li,1,"3 2")} ${LN(350,172,350,228,P.li,1,"3 2")}
      `);
    }

    if(tid.includes("transport-in-plants")){
      return wrap(`
        ${TT("Transport in Plants")}
        <rect x="240" y="52" width="44" height="178" rx="8" fill="${P.fi}" stroke="${P.st}" stroke-width="1.6"/>
        <rect x="312" y="52" width="44" height="178" rx="8" fill="rgba(34,197,94,.10)" stroke="${P.st}" stroke-width="1.6"/>
        ${LB(262,44,"Xylem",P.ac,9)} ${LB(334,44,"Phloem",P.ac,9)}
        ${[68,92,116,140,164,188].map(y=>`${LN(240,y,284,y,P.ac,1,"5 4")}`).join("")}
        ${LN(334,52,334,230,P.li,1.2,"5 4")}
        ${H6(115,80, 30,P.fi,P.st)} ${HT(115,80, ["Cohesion","tension"],9)}
        ${H6(115,200,30,P.fi,P.st)} ${HT(115,200,["Root hair","active up."],8.5)}
        ${H6(540,80, 30,P.fi,P.st)} ${HT(540,80, ["Source","to sink"],9.5)}
        ${H6(540,200,30,P.fi,P.st)} ${HT(540,200,["Transpir-","ation"],9)}
        ${H6(620,140,26,P.fi,P.st)} ${HT(620,140,["Stomata","guard cells"],8.5)}
        ${AR(145,80, 238,100,P.li)} ${AR(145,200,238,180,P.li)}
        ${AR(356,95, 510,88, P.li)} ${AR(356,175,510,192,P.li)}
        ${LN(566,110,598,128,P.li,1,"3 2")} ${LN(566,170,598,152,P.li,1,"3 2")}
      `);
    }

    if(tid.includes("infectious")){
      const sp=spoke(350,148,95,4,-45);
      return wrap(`
        ${TT("Infectious Diseases")}
        ${H6(sp[0].cx,sp[0].cy,38,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Patho-","gens"],12)}
        ${H6(sp[1].cx,sp[1].cy,30,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Bacteria","prokaryote"],8.5)}
        ${H6(sp[2].cx,sp[2].cy,30,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Viruses","non-living"],8.5)}
        ${H6(sp[3].cx,sp[3].cy,30,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Fungi","eukaryote"],9)}
        ${H6(sp[4].cx,sp[4].cy,30,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Parasites","vectors"],9)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        ${H6(90,148,26,P.fi,P.st)}  ${HT(90,148,["Antibiotics"],8)}
        ${H6(610,148,26,P.fi,P.st)} ${HT(610,148,["Resistance"],8)}
        ${LN(116,148,220,148,P.li,1,"3 2")} ${LN(480,148,584,148,P.li,1,"3 2")}
        ${LB(350,46,"Transmission: direct, droplet, vector, faecal-oral",P.ac,9)}
      `);
    }

    // Bio fallback
    {
      const labs=[(topic.definitions||[]).map(d=>d.term),(topic.notes||[]).map(n=>n.heading)].flat().filter(l=>l&&l.length>2).slice(0,5);
      while(labs.length<5)labs.push(["Structure","Function","Process","Regulation","Adaptation"][labs.length]);
      const sp=spoke(350,148,95,5,-90);
      return wrap(`
        ${TT(topic.title)}
        ${sp.map((p,i)=>`${H6(p.cx,p.cy,i===0?40:28,P.fi,P.st)}${HT(p.cx,p.cy,[i===0?topic.title.split(" ")[0]:labs[i-1]],i===0?11:9)}`).join("")}
        ${[1,2,3,4,5].map(i=>`${LN(sp[0].cx,sp[0].cy,sp[i].cx,sp[i].cy,P.li)}`).join("")}
      `);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  PHYSICS
  // ════════════════════════════════════════════════════════════════════
  if(sub==="phy"){

    if(tid.includes("kinematics")){
      const AX=58, AY=218, BX=658, BY=218, TY=58;
      return wrap(`
        ${TT("Kinematics — SUVAT")}
        ${LN(AX,AY,BX,AY,"#8b949e",1.5)}
        ${LN(AX,AY,AX,TY,"#8b949e",1.5)}
        <path d="M${AX},${AY} Q158,155 258,168 Q358,180 458,108 Q508,78 ${BX},62" fill="none" stroke="${P.ac}" stroke-width="3" stroke-linecap="round"/>
        ${LB(660,62,"v",P.ac,11,"start")} ${LB(AX-8,TY,"","#8b949e",9)} ${LB(660,225,"t","#8b949e",10,"start")}
        ${LB(40,AY,"0","#8b949e",9)} ${LB(200,140,"gradient = a","#8b949e",8.5)} ${LB(480,215,"area under = s","#8b949e",8.5)}
        ${H6(200,58,26,P.fi,P.st)} ${HT(200,58,["v=u+at"],9.5)}
        ${H6(370,50,26,P.fi,P.st)} ${HT(370,50,["s=ut+½at²"],8.5)}
        ${H6(550,58,26,P.fi,P.st)} ${HT(550,58,["v²=u²+2as"],8.5)}
        ${LN(200,84,200,95,P.li,1,"3 2")} ${LN(370,76,370,95,P.li,1,"3 2")} ${LN(550,84,550,95,P.li,1,"3 2")}
        ${LB(38,58,"v",P.ac,10)}
      `);
    }

    if(tid.includes("dynamics")||tid.includes("forces-energy")){
      const sp=spoke(350,148,94,5,-90);
      return wrap(`
        ${TT("Dynamics — Newton's Laws")}
        ${H6(sp[0].cx,sp[0].cy,40,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["F = ma"],14)}
        ${H6(sp[1].cx,sp[1].cy,30,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["1st Law","inertia"],9.5)}
        ${H6(sp[2].cx,sp[2].cy,30,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["3rd Law","equal &","opp."],9)}
        ${H6(sp[3].cx,sp[3].cy,30,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Friction","μ = F/N"],9.5)}
        ${H6(sp[4].cx,sp[4].cy,30,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Momentum","p = mv"],9.5)}
        ${H6(sp[5].cx,sp[5].cy,30,P.fi,P.st)} ${HT(sp[5].cx,sp[5].cy,["Weight","W = mg"],9.5)}
        ${[1,2,3,4,5].map(i=>`${LN(sp[0].cx,sp[0].cy,sp[i].cx,sp[i].cy,P.li)}`).join("")}
        ${H6(90,148,26,P.fi,P.st)}  ${HT(90,148,["Impulse","FΔt=Δp"],8.5)}
        ${LN(116,148,222,148,P.li,1,"3 2")}
      `);
    }

    if(tid.includes("work-energy-power")||tid.includes("work-energy")){
      const sp=spoke(350,148,94,4,-45);
      return wrap(`
        ${TT("Work, Energy & Power")}
        ${H6(sp[0].cx,sp[0].cy,40,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Energy","conserv."],11)}
        ${H6(sp[1].cx,sp[1].cy,32,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["KE","½mv²"],12)}
        ${H6(sp[2].cx,sp[2].cy,32,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["GPE","mgh"],12)}
        ${H6(sp[3].cx,sp[3].cy,32,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Work","Fs cosθ"],9.5)}
        ${H6(sp[4].cx,sp[4].cy,32,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Power","P = Fv"],9.5)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        ${H6(90,148,26,P.fi,P.st)}  ${HT(90,148,["Effic.","useful/total"],8)}
        ${H6(610,148,26,P.fi,P.st)} ${HT(610,148,["Elastic","PE = ½kx²"],8)}
        ${LN(116,148,220,148,P.li,1,"3 2")} ${LN(480,148,584,148,P.li,1,"3 2")}
        ${LB(350,46,"KE ↔ GPE  (conservation of energy)",P.ac,9.5)}
      `);
    }

    if(tid.includes("wave")||tid.includes("superposition")){
      return wrap(`
        ${TT("Waves & Superposition")}
        <path d="M52,148 Q92,78 132,148 Q172,218 212,148 Q252,78 292,148 Q332,218 372,148 Q412,78 452,148 Q492,218 532,148 Q572,78 612,148" fill="none" stroke="${P.ac}" stroke-width="2.8" stroke-linecap="round"/>
        ${LN(52,148,52,55,"#8b949e",1.2)} ${LN(132,148,132,55,"#8b949e",1.2)}
        ${LN(52,148,648,148,"#8b949e",1,"4 3")}
        <path d="M52,55 L132,55" stroke="${P.li}" stroke-width="1.5" stroke-dasharray="3 3"/>
        ${LB(92,50,"λ = wavelength",P.ac,9)}
        ${LB(52,80,"A","#e6edf3",10,"start")}
        ${H6(90,220, 24,P.fi,P.st)} ${HT(90,220, ["v = fλ"],9.5)}
        ${H6(260,220,24,P.fi,P.st)} ${HT(260,220,["T = 1/f"],9.5)}
        ${H6(430,220,24,P.fi,P.st)} ${HT(430,220,["I ∝ A²"],9.5)}
        ${H6(600,220,24,P.fi,P.st)} ${HT(600,220,["Refract.","n = sin i"],8.5)}
        ${LB(350,44,"transverse (EM) vs longitudinal (sound)","#8b949e",8.5)}
      `);
    }

    if(tid.includes("electric")||tid.includes("dc-circuit")){
      const sp=spoke(350,148,94,4,-45);
      return wrap(`
        ${TT("Electricity & Circuits")}
        ${H6(sp[0].cx,sp[0].cy,40,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["V = IR","Ohm's"],12)}
        ${H6(sp[1].cx,sp[1].cy,30,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Series","ΣR = R₁+R₂"],8.5)}
        ${H6(sp[2].cx,sp[2].cy,30,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Parallel","1/R=Σ1/Rₙ"],8.5)}
        ${H6(sp[3].cx,sp[3].cy,30,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Power","P=IV=I²R"],9)}
        ${H6(sp[4].cx,sp[4].cy,30,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["EMF","ε=I(R+r)"],9.5)}
        ${LN(sp[0].cx,sp[0].cy,sp[1].cx,sp[1].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[2].cx,sp[2].cy,P.li)}
        ${LN(sp[0].cx,sp[0].cy,sp[3].cx,sp[3].cy,P.li)} ${LN(sp[0].cx,sp[0].cy,sp[4].cx,sp[4].cy,P.li)}
        ${H6(90,148,26,P.fi,P.st)}  ${HT(90,148,["Q = It","charge"],8.5)}
        ${H6(610,148,26,P.fi,P.st)} ${HT(610,148,["Kirchhoff","I & V laws"],8)}
        ${LN(116,148,220,148,P.li,1,"3 2")} ${LN(480,148,584,148,P.li,1,"3 2")}
      `);
    }

    if(tid.includes("particle")){
      const sp=spoke(350,148,95,5,-90);
      return wrap(`
        ${TT("Particle Physics")}
        ${H6(sp[0].cx,sp[0].cy,40,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Standard","Model"],11)}
        ${H6(sp[1].cx,sp[1].cy,28,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Quarks","u d s c b t"],8.5)}
        ${H6(sp[2].cx,sp[2].cy,28,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Leptons","e⁻ μ τ ν"],9)}
        ${H6(sp[3].cx,sp[3].cy,28,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Bosons","force carr."],8.5)}
        ${H6(sp[4].cx,sp[4].cy,28,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["Antimat-","ter"],9.5)}
        ${H6(sp[5].cx,sp[5].cy,28,P.fi,P.st)} ${HT(sp[5].cx,sp[5].cy,["Hadrons","baryon/meson"],8)}
        ${[1,2,3,4,5].map(i=>`${LN(sp[0].cx,sp[0].cy,sp[i].cx,sp[i].cy,P.li)}`).join("")}
        ${H6(90,148,24,P.fi,P.st)}  ${HT(90,148,["E=hf","photon"],8.5)}
        ${LN(114,148,222,148,P.li,1,"3 2")}
        ${LB(350,46,"Conservation laws: charge, baryon no., lepton no.",P.ac,8.5)}
      `);
    }

    if(tid.includes("deformation")){
      return wrap(`
        ${TT("Deformation of Solids")}
        ${LN(110,220,110,60,"#8b949e",1.5)} ${LN(110,220,650,220,"#8b949e",1.5)}
        <path d="M110,220 L210,220 L210,130 Q240,80 280,110 L400,220" fill="none" stroke="${P.ac}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
        ${LB(155,232,"elastic","#22c55e",9)} ${LB(310,232,"plastic","#f97316",9)}
        ${LN(210,130,210,220,"#8b949e",1,"3 3")}
        ${LB(213,142,"elastic limit","#8b949e",8.5,"start")}
        ${LB(118,55,"stress σ","#8b949e",9,"start")} ${LB(640,228,"strain ε","#8b949e",9,"end")}
        ${H6(510,90, 34,P.fi,P.st)} ${HT(510,90, ["Young","E = σ/ε"],10)}
        ${H6(620,90, 30,P.fi,P.st)} ${HT(620,90, ["Elastic","limit"],9.5)}
        ${H6(510,180,34,P.fi,P.st)} ${HT(510,180,["Hooke's","F = kx"],10)}
        ${H6(620,180,30,P.fi,P.st)} ${HT(620,180,["UTS","fracture"],9.5)}
        ${LN(480,90, 420,100,P.li,1,"3 2")} ${LN(480,180,420,190,P.li,1,"3 2")}
        ${LN(510,124,510,146,P.li,1,"2 2")} ${LN(620,120,620,150,P.li,1,"2 2")}
      `);
    }

    if(tid.includes("measurement")){
      const sp=spoke(350,148,95,5,-90);
      return wrap(`
        ${TT("Measurements & Uncertainties")}
        ${H6(sp[0].cx,sp[0].cy,40,P.fi,P.st)} ${HT(sp[0].cx,sp[0].cy,["Uncert-","ainty"],11)}
        ${H6(sp[1].cx,sp[1].cy,28,P.fi,P.st)} ${HT(sp[1].cx,sp[1].cy,["Random","scatter"],9.5)}
        ${H6(sp[2].cx,sp[2].cy,28,P.fi,P.st)} ${HT(sp[2].cx,sp[2].cy,["Systematic","zero err."],8.5)}
        ${H6(sp[3].cx,sp[3].cy,28,P.fi,P.st)} ${HT(sp[3].cx,sp[3].cy,["Absolute","± Δx"],9.5)}
        ${H6(sp[4].cx,sp[4].cy,28,P.fi,P.st)} ${HT(sp[4].cx,sp[4].cy,["% uncert.","Δx/x×100"],8.5)}
        ${H6(sp[5].cx,sp[5].cy,28,P.fi,P.st)} ${HT(sp[5].cx,sp[5].cy,["Precision","repeat"],9.5)}
        ${[1,2,3,4,5].map(i=>`${LN(sp[0].cx,sp[0].cy,sp[i].cx,sp[i].cy,P.li)}`).join("")}
        ${H6(90,148,24,P.fi,P.st)}  ${HT(90,148,["Accuracy","calibrate"],7.5)}
        ${LN(114,148,222,148,P.li,1,"3 2")}
        ${LB(350,46,"Add Δx for + and −;  add %Δx for × and ÷",P.ac,9)}
      `);
    }

    // Phy fallback
    {
      const labs=[(topic.definitions||[]).map(d=>d.term),(topic.notes||[]).map(n=>n.heading)].flat().filter(l=>l&&l.length>2).slice(0,5);
      while(labs.length<5)labs.push(["Equation","Principle","Law","Graph","SI Units"][labs.length]);
      const sp=spoke(350,148,95,5,-90);
      return wrap(`
        ${TT(topic.title)}
        ${sp.map((p,i)=>`${H6(p.cx,p.cy,i===0?40:28,P.fi,P.st)}${HT(p.cx,p.cy,[i===0?topic.title.split(" ")[0]:labs[i-1]],i===0?11:9)}`).join("")}
        ${[1,2,3,4,5].map(i=>`${LN(sp[0].cx,sp[0].cy,sp[i].cx,sp[i].cy,P.li)}`).join("")}
      `);
    }
  }

  // Ultimate fallback
  const sp=spoke(350,148,95,5,-90);
  return wrap(`
    ${TT(topic.title)}
    ${sp.map((p,i)=>`${H6(p.cx,p.cy,i===0?40:28,P.fi,P.st)}${HT(p.cx,p.cy,[i===0?topic.title.split(" ")[0]:"—"],i===0?11:9)}`).join("")}
    ${[1,2,3,4,5].map(i=>`${LN(sp[0].cx,sp[0].cy,sp[i].cx,sp[i].cy,P.li)}`).join("")}
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
  if (!auth.isLoggedIn) return; // never save if not logged in

  try {
    const subject = state.topics.get(topicId)?.subject || state.currentSubject || 'chem';
    const response = await fetch(`${API_BASE_URL}/api/user/progress`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        topicId,
        subject,
        confidence: typeof confidence === 'number' ? confidence : 0,
        isComplete: true,
        quizScore: typeof quizScore === 'number' ? quizScore : null,
      })
    });
    if (response.ok) console.log('✅ Progress saved to backend');
  } catch (error) {
    console.warn('Backend progress save failed:', error);
  }
}

/**
 * Update user stats on backend (XP, streak, study time)
 */
async function updateStatsOnBackend(xpGain, minutesStudied = 0) {
  if (!USE_BACKEND) return;
  if (!auth.isLoggedIn) return; // never update stats if not logged in

  try {
    const response = await fetch(`${API_BASE_URL}/api/user/stats/update`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        xpGain,
        addToStreak: true,
        minutesStudied,
      })
    });
    if (response.ok) console.log('✅ Stats updated on backend');
  } catch (error) {
    console.warn('Backend stats update failed:', error);
  }
}

/**
 * Load user analytics from backend
 */
async function loadUserAnalytics() {
  if (!USE_BACKEND || !auth.isLoggedIn) return null;
  try {
    const r = await fetch(`${API_BASE_URL}/api/user/analytics`, { headers: authHeaders() });
    if (r.ok) return (await r.json()).data;
  } catch (e) { console.warn('Analytics load failed:', e); }
  return null;
}

async function getTopicProgressFromBackend(topicId) {
  if (!USE_BACKEND || !auth.isLoggedIn) return null;
  try {
    const r = await fetch(`${API_BASE_URL}/api/user/progress/${topicId}`, { headers: authHeaders() });
    if (r.ok) return (await r.json()).data;
  } catch (e) { console.warn('Topic progress load failed:', e); }
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
      <div class="ai-panel-header">
        <div class="ai-panel-title">
          <span class="ai-icon">✦</span>
          <h2>AI Study Coach</h2>
        </div>
        ${auth.isLoggedIn ? `<div class="ai-quick-btns">
          <button class="pill-btn ai-quick" onclick="App.aiQuick('${topic.id}','explain')">Explain this</button>
          <button class="pill-btn ai-quick" onclick="App.aiQuick('${topic.id}','quiz')">Test me</button>
          <button class="pill-btn ai-quick" onclick="App.aiQuick('${topic.id}','mistake')">Common mistakes</button>
          <button class="pill-btn ai-quick" onclick="App.aiQuick('${topic.id}','exam')">Exam tips</button>
        </div>` : ''}
      </div>
      ${auth.isLoggedIn ? `
      <div class="ai-chat-history" id="ai-chat-history"></div>
      <div class="ai-compose">
        <textarea id="ai-prompt" placeholder="Ask anything about ${escapeHtml(topic.title)}…" rows="2"></textarea>
        <button class="btn btn-primary" id="ai-send-btn" onclick="App.askAi('${topic.id}')">
          <span class="ai-send-icon">↑</span>
        </button>
      </div>` : `
      <div class="ai-signin-gate">
        <p>Sign in to unlock the AI Study Coach — get instant explanations, practice questions, and exam tips for every topic.</p>
        <button class="btn btn-primary" onclick="App.openAuthModal('login')">Sign In to Use AI</button>
        <button class="btn btn-outline" onclick="App.openAuthModal('register')">Create Free Account</button>
      </div>`}
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
// ── AI Study Coach ────────────────────────────────────────────────────────────

// Per-topic chat history stored in memory (cleared on navigation)
const aiChatHistory = {};

function aiQuick(topicId, type) {
  const prompts = {
    explain:  `Give me a clear, concise explanation of the key concepts in ${state.topics.get(topicId)?.title || topicId}. Use simple language and bullet points.`,
    quiz:     `Give me 3 exam-style questions on ${state.topics.get(topicId)?.title || topicId} with mark scheme answers. Format as Q1, Q2, Q3.`,
    mistake:  `What are the most common mistakes students make on ${state.topics.get(topicId)?.title || topicId}? Give specific examples and how to avoid them.`,
    exam:     `Give me the top 5 exam tips for ${state.topics.get(topicId)?.title || topicId} specifically for Cambridge AS Level.`,
  };
  const input = byId('ai-prompt');
  if (input) input.value = prompts[type] || '';
  askAi(topicId);
}

async function askAi(topicId) {
  const promptEl = byId('ai-prompt');
  const histEl   = byId('ai-chat-history');
  const sendBtn  = byId('ai-send-btn');
  if (!promptEl || !histEl) return;

  const userText = promptEl.value.trim();
  if (!userText) { showToast('Type a question first'); return; }

  // Append user bubble
  if (!aiChatHistory[topicId]) aiChatHistory[topicId] = [];
  aiChatHistory[topicId].push({ role: 'user', text: userText });
  promptEl.value = '';
  renderAiChat(topicId);

  // Show loading bubble
  const loadingId = `ai-loading-${Date.now()}`;
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'ai-bubble ai-bubble-assistant ai-bubble-loading';
  loadingDiv.id = loadingId;
  loadingDiv.innerHTML = '<span class="ai-dots"><span></span><span></span><span></span></span>';
  histEl.appendChild(loadingDiv);
  histEl.scrollTop = histEl.scrollHeight;

  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '…'; }

  try {
    const topic   = state.topics.get(topicId);
    const context = buildAiContext(topic);

    const res = await fetch(`${API_BASE_URL}/api/ai-tutor`, {
      method:  'POST',
      headers: authHeaders(),
      body:    JSON.stringify({
        topicId,
        topicTitle:   topic?.title || topicId,
        subjectId:    topic?.subject || state.currentSubject,
        context,
        prompt:       userText,
        history:      aiChatHistory[topicId].slice(-8), // send last 8 turns for context
      }),
    });

    const data = await res.json();
    loadingDiv.remove();

    if (!res.ok) {
      const errText = data.error || `Server error ${res.status}`;
      aiChatHistory[topicId].push({ role: 'error', text: errText });
    } else {
      aiChatHistory[topicId].push({ role: 'assistant', text: data.answer });
    }
  } catch (err) {
    loadingDiv.remove();
    aiChatHistory[topicId].push({ role: 'error', text: 'Network error — check your connection and try again.' });
  }

  if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<span class="ai-send-icon">↑</span>'; }
  renderAiChat(topicId);
}

function buildAiContext(topic) {
  if (!topic) return '';
  const parts = [];
  if (topic.concept?.length) parts.push('Concepts: ' + topic.concept.slice(0,2).join(' '));
  if (topic.definitions?.length) parts.push('Key terms: ' + topic.definitions.slice(0,4).map(d => `${d.term}: ${d.body}`).join('; '));
  if (topic.notes?.length) parts.push('Notes sections: ' + topic.notes.slice(0,3).map(n => n.heading).join(', '));
  if (topic.tips?.length) parts.push('Exam tips: ' + topic.tips.slice(0,2).join('; '));
  return parts.join('\n').slice(0, 1200);
}

function renderAiChat(topicId) {
  const histEl = byId('ai-chat-history');
  if (!histEl) return;
  const history = aiChatHistory[topicId] || [];
  if (!history.length) { histEl.innerHTML = '<p class="ai-empty">Ask anything about this topic — I\'ll help you understand, practise, or prepare for exams.</p>'; return; }
  histEl.innerHTML = history.map(msg => {
    if (msg.role === 'user') {
      return `<div class="ai-bubble ai-bubble-user"><p>${escapeHtml(msg.text)}</p></div>`;
    }
    if (msg.role === 'error') {
      return `<div class="ai-bubble ai-bubble-error"><p>⚠ ${escapeHtml(msg.text)}</p></div>`;
    }
    // assistant — render markdown-lite (bold, code, bullet points)
    const html = msg.text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/^#{1,3}\s+(.+)$/gm,'<strong>$1</strong>')
      .replace(/^\*\s+(.+)$/gm,'• $1')
      .replace(/^-\s+(.+)$/gm,'• $1')
      .replace(/\n{2,}/g,'</p><p>')
      .replace(/\n/g,'<br>');
    return `<div class="ai-bubble ai-bubble-assistant"><p>${html}</p></div>`;
  }).join('');
  histEl.scrollTop = histEl.scrollHeight;
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
  aiQuick,
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
