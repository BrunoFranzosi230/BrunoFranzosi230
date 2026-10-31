// Gera os SVGs do README (banner, stack, diagnóstico, atividade).
// Uso: GH_TOKEN=xxx node scripts/generate.mjs   (sem token -> dados de exemplo)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(ROOT, "profile.config.json"), "utf8"));
const OUT = join(ROOT, "assets");
mkdirSync(OUT, { recursive: true });

// ---------- paleta ----------
const C = {
  bg: "#020805",
  panel: "#03100a",
  g: "#00ff88",       // verde neon
  g2: "#00c46a",
  dim: "#0d4a2c",
  line: "#0f6b3e",
  txt: "#6fcf9c",
  hi: "#d6ffea",      // destaque (RUNNING / OPEN / GRANTED)
};
const FONT = `'JetBrains Mono','Share Tech Mono','Consolas','Courier New',monospace`;
const DISPLAY = `'Orbitron','Rajdhani','Bahnschrift','Arial Narrow','Consolas',monospace`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pad = (n, l = 2) => String(n).padStart(l, "0");

// polígono com cantos chanfrados: corners = "tl tr br bl"
function chamfer(x, y, w, h, c, corners = "tl br") {
  const has = (k) => corners.includes(k);
  const p = [];
  p.push(has("tl") ? [x + c, y] : [x, y]);
  if (has("tr")) p.push([x + w - c, y], [x + w, y + c]); else p.push([x + w, y]);
  if (has("br")) p.push([x + w, y + h - c], [x + w - c, y + h]); else p.push([x + w, y + h]);
  if (has("bl")) p.push([x + c, y + h], [x, y + h - c]); else p.push([x, y + h]);
  if (has("tl")) p.push([x, y + c]);
  return p.map(([a, b]) => `${a},${b}`).join(" ");
}

const baseDefs = `
  <pattern id="hstripe" width="6" height="4" patternUnits="userSpaceOnUse">
    <rect width="6" height="2" fill="${C.g}" opacity=".85"/>
  </pattern>
  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
    <path d="M20 0H0V20" fill="none" stroke="${C.g}" stroke-opacity=".05"/>
  </pattern>
  <pattern id="scan" width="4" height="3" patternUnits="userSpaceOnUse">
    <rect width="4" height="1" fill="#000" opacity=".35"/>
  </pattern>
  <filter id="glow" x="-20%" y="-40%" width="140%" height="180%">
    <feGaussianBlur stdDeviation="3" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="softglow" x="-10%" y="-40%" width="120%" height="180%">
    <feGaussianBlur stdDeviation="1.4" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

const baseStyle = `
  text{font-family:${FONT}}
  .d{font-family:${DISPLAY};font-weight:800}
  @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
  @keyframes flick{0%,92%,100%{opacity:1}93%{opacity:.35}95%{opacity:1}97%{opacity:.6}}
  @keyframes sweep{0%{transform:translateY(-40px)}100%{transform:translateY(400px)}}
  @keyframes glitch{0%,88%,100%{transform:translate(0,0);opacity:0}89%{transform:translate(-4px,1px);opacity:.7}91%{transform:translate(3px,-1px);opacity:.6}93%{opacity:0}}
  @keyframes draw{to{stroke-dashoffset:0}}
  @keyframes fadein{from{opacity:0}to{opacity:1}}
  @keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
  .blink{animation:blink 1.1s steps(1) infinite}
  .flick{animation:flick 4s infinite}
  .pulse{animation:pulse 2.4s ease-in-out infinite}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

const svg = (w, h, body, extraStyle = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>${baseDefs}</defs>
<style>${baseStyle}${extraStyle}</style>
${body}
</svg>`;

function sectionHeader(y, title, right, w) {
  return `
  <rect x="2" y="${y - 20}" width="5" height="24" fill="${C.g}" filter="url(#softglow)"/>
  <text x="18" y="${y}" class="d" font-size="21" letter-spacing="2.5" fill="${C.g}" filter="url(#softglow)">${esc(title)}</text>
  <text x="${w - 2}" y="${y - 2}" text-anchor="end" font-size="10.5" letter-spacing="1.5" fill="${C.g2}">${esc(right)}</text>
  <line x1="0" y1="${y + 12}" x2="${w}" y2="${y + 12}" stroke="${C.line}" stroke-width="1"/>
  <line x1="0" y1="${y + 12}" x2="160" y2="${y + 12}" stroke="${C.g}" stroke-width="2"/>`;
}

// ---------- dados ----------
async function gql(query, variables, token) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "readme-gen" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function fetchData() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) return mockData();
  const q = `query($login:String!){ user(login:$login){
    allRepos: repositories(ownerAffiliations:OWNER, privacy:PUBLIC){ totalCount }
    repos: repositories(ownerAffiliations:OWNER, privacy:PUBLIC, isFork:false, first:100){
      nodes{ stargazerCount languages(first:15, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name } } } } }
    contributionsCollection{ totalCommitContributions totalPullRequestContributions
      contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } }
  } }`;
  const { user } = (await gql(q, { login: cfg.username }, token)) || {};
  if (!user) throw new Error(`Usuário "${cfg.username}" não encontrado — confira "username" em profile.config.json`);
  const langs = {};
  let stars = 0;
  for (const r of user.repos.nodes) {
    stars += r.stargazerCount;
    for (const e of r.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;
  }
  const cc = user.contributionsCollection;
  const days = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  return {
    contributions: cc.contributionCalendar.totalContributions,
    commits: cc.totalCommitContributions,
    prs: cc.totalPullRequestContributions,
    repos: user.allRepos.totalCount,
    stars,
    langs,
    days,
  };
}

function mockData() {
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const days = [];
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const c = rnd() < 0.45 ? 0 : Math.floor(rnd() * 9);
    days.push({ date: d.toISOString().slice(0, 10), contributionCount: c });
  }
  return {
    contributions: days.reduce((a, d) => a + d.contributionCount, 0),
    commits: 412, prs: 37, repos: 24, stars: 31,
    langs: { TypeScript: 820000, HTML: 172000, JavaScript: 37000, PowerShell: 12600, CSS: 6300, Java: 3200 },
    days,
  };
}

function streaks(days) {
  let longest = 0, run = 0;
  for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = days.length - 1, current = 0;
  if (i >= 0 && days[i].contributionCount === 0) i--; // hoje ainda pode estar vazio
  for (; i >= 0 && days[i].contributionCount > 0; i--) current++;
  return { current, longest };
}

// ---------- 1. banner ----------
function banner() {
  const W = 1000, H = 340;
  const kana = [...cfg.katakana];
  const kanaStep = Math.min(28, 270 / kana.length);
  const kanaY0 = (H - kanaStep * (kana.length - 1)) / 2 + 8;
  const rows = [
    ["UID", cfg.username],
    ["IDENT", cfg.ident],
    ["CLASS", cfg.class],
    ["SPEC", cfg.spec],
    ["NODE", cfg.node],
  ];
  const px = 612, py = 118, pw = 372, ph = 190;
  const handleSize = Math.min(86, Math.floor(470 / (cfg.handle.length * 0.72)));

  return svg(W, H, `
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>

  <!-- faixa lateral -->
  <rect x="0" y="0" width="70" height="${H}" fill="url(#hstripe)" opacity=".55"/>
  <rect x="18" y="0" width="34" height="${H}" fill="${C.bg}"/>
  ${kana.map((k, i) => `<text x="35" y="${(kanaY0 + i * kanaStep).toFixed(1)}" text-anchor="middle" font-size="20" fill="${C.g}" class="flick" style="font-family:'Noto Sans JP','Yu Gothic','Meiryo',sans-serif">${esc(k)}</text>`).join("")}
  <rect x="74" y="0" width="6" height="${H}" fill="${C.g}" opacity=".9"/>

  <!-- cunha diagonal -->
  <polygon points="80,0 ${W},0 ${W},10 80,98" fill="url(#hstripe)" opacity=".75"/>
  <line x1="80" y1="98" x2="${W}" y2="10" stroke="${C.g}" stroke-width="2"/>
  <line x1="80" y1="106" x2="${W}" y2="18" stroke="${C.g}" stroke-width=".6" opacity=".5"/>

  <!-- título -->
  <g transform="translate(104 212)">
    <text class="d" font-size="${handleSize}" letter-spacing="6" fill="${C.g}" filter="url(#glow)">${esc(cfg.handle)}</text>
    <text class="d" font-size="${handleSize}" letter-spacing="6" fill="url(#scan)">${esc(cfg.handle)}</text>
    <text class="d" font-size="${handleSize}" letter-spacing="6" fill="${C.hi}" style="animation:glitch 3.7s infinite">${esc(cfg.handle)}</text>
  </g>
  <text x="106" y="242" font-size="15" font-weight="700" letter-spacing="4" fill="${C.g}">${esc(cfg.subtitle)}</text>
  <text x="106" y="262" font-size="11" fill="${C.g2}" letter-spacing="1">//////////</text>
  <line x1="200" y1="258" x2="560" y2="258" stroke="${C.g2}" stroke-width="1"/>
  <text x="106" y="279" font-size="10" letter-spacing="1" fill="${C.txt}">CURR_NETWORK: <tspan fill="${C.g}">GITHUB.COM/${esc(cfg.username.toUpperCase())}</tspan></text>
  <text x="106" y="293" font-size="10" letter-spacing="1" fill="${C.txt}">NL_PORT_STATUS: <tspan fill="${C.hi}" font-weight="700">OPEN</tspan></text>
  <text x="104" y="322" class="d" font-size="27" letter-spacing="5" fill="${C.g}" filter="url(#softglow)">127.0.0.1<tspan class="blink" fill="${C.hi}">_</tspan></text>

  <!-- painel login -->
  <polygon points="${chamfer(px, py, pw, ph, 18, "tl")}" fill="${C.panel}" stroke="${C.g}" stroke-width="1.2"/>
  <polygon points="${chamfer(px + 5, py + 5, pw - 10, ph - 10, 15, "tl")}" fill="none" stroke="${C.dim}" stroke-width="1"/>
  <text x="${px + pw / 2}" y="${py + 26}" text-anchor="middle" font-size="11" letter-spacing="3" fill="${C.g}">SECURITY LOGIN</text>
  <line x1="${px + 16}" y1="${py + 38}" x2="${px + pw - 16}" y2="${py + 38}" stroke="${C.line}" stroke-dasharray="3 3"/>
  ${rows.map(([k, v], i) => `<text x="${px + 18}" y="${py + 60 + i * 19}" font-size="10.5" fill="${C.txt}" letter-spacing=".8">${k.padEnd(6, " ").replace(/ /g, " ")}<tspan fill="${C.g2}">:: </tspan><tspan fill="${C.g}">${esc(v.toUpperCase())}</tspan></text>`).join("")}
  <text x="${px + 18}" y="${py + 170}" font-size="10.5" fill="${C.txt}" letter-spacing=".8">ACCESS <tspan fill="${C.g2}">:: </tspan><tspan fill="${C.hi}" font-weight="700" class="blink">GRANTED</tspan></text>
  <text x="${W - 14}" y="${H - 8}" text-anchor="end" font-size="9" letter-spacing="1" fill="${C.g2}">${esc(cfg.handle)}-SYS v2.0.77 // BUILD ${new Date().getFullYear()}</text>

  <!-- scanline -->
  <rect x="80" y="0" width="${W - 80}" height="36" fill="${C.g}" opacity=".05" style="animation:sweep 5s linear infinite"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${C.dim}"/>
  `);
}

// ---------- 2. stack ----------
function stack() {
  const W = 1000, cols = 6, gap = 10, cw = (W - gap * (cols - 1)) / cols, ch = 46;
  const rowsN = Math.ceil(cfg.stack.length / cols);
  const H = 54 + rowsN * (ch + gap);
  const cards = cfg.stack.map((name, i) => {
    const x = (i % cols) * (cw + gap), y = 50 + Math.floor(i / cols) * (ch + gap);
    const tag = i % 5 === 1 || i % 5 === 2 || i % 7 === 3;
    return `<g>
      <polygon points="${chamfer(x + .5, y + .5, cw - 1, ch - 1, 10, "tr bl")}" fill="${C.panel}" stroke="${C.g2}" stroke-width="1"/>
      <text x="${x + 11}" y="${y + 16}" font-size="8.5" fill="${C.txt}" letter-spacing="1">MOD_${pad(i + 1)}</text>
      <text x="${x + 11}" y="${y + 35}" class="d" font-size="14" letter-spacing="1.5" fill="${C.g}">${esc(name)}</text>
      ${tag ? `<rect x="${x + cw - 26}" y="${y + 6}" width="12" height="3" fill="${C.g}" class="pulse"/>` : ""}
    </g>`;
  }).join("");
  return svg(W, H, `${sectionHeader(26, "INSTALLED CYBERWARE", "STACK // LOADOUT", W)}${cards}`);
}

// ---------- 3. diagnóstico ----------
function diagnostics(d, st) {
  const W = 1000, H = 318, pw = 490, ph = 262, top = 48;
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: cfg.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(now);

  const status = [
    ["SERVICE STATUS", "RUNNING", true],
    ["CONTRIBUTIONS [1Y]", d.contributions],
    ["COMMITS [1Y]", d.commits],
    ["PULL REQUESTS [1Y]", d.prs],
    ["PUBLIC REPOS", d.repos],
    ["STARS EARNED", d.stars],
    ["CURRENT STREAK", `${st.current} DAYS`],
    ["LONGEST STREAK", `${st.longest} DAYS`],
  ];

  const panel = (x, title) => `
    <polygon points="${chamfer(x, top, pw, ph, 14, "tl br")}" fill="${C.panel}" stroke="${C.g2}" stroke-width="1.2"/>
    <path d="M${x + pw - 34} ${top - 4}H${x + pw + 4}V${top + 30}" fill="none" stroke="${C.g}" stroke-width="1.5"/>
    <path d="M${x - 4} ${top + ph - 30}V${top + ph + 4}H${x + 34}" fill="none" stroke="${C.g}" stroke-width="1.5"/>
    <text x="${x + pw / 2}" y="${top + 26}" text-anchor="middle" font-size="11" letter-spacing="3.5" fill="${C.g}">${title}</text>
    <line x1="${x + 18}" y1="${top + 38}" x2="${x + pw - 18}" y2="${top + 38}" stroke="${C.line}" stroke-dasharray="3 3"/>`;

  const left = status.map(([k, v, hi], i) => {
    const y = top + 62 + i * 20;
    return `<text x="20" y="${y}" font-size="10.5" letter-spacing=".8" fill="${C.txt}">${k}</text>
      <line x1="${22 + k.length * 7.2}" y1="${y - 3}" x2="${pw - 22 - String(v).length * 7.2}" y2="${y - 3}" stroke="${C.dim}" stroke-dasharray="1 3"/>
      <text x="${pw - 18}" y="${y}" text-anchor="end" font-size="10.5" letter-spacing=".8" fill="${hi ? C.hi : C.g}" ${hi ? 'font-weight="700" class="pulse"' : ""}>${esc(v)}</text>`;
  }).join("");

  const total = Object.values(d.langs).reduce((a, b) => a + b, 0) || 1;
  const langs = Object.entries(d.langs).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const lx = 510, segW = 12, segGap = 2.5, barW = pw - 40, nSeg = Math.floor(barW / (segW + segGap));
  const right = langs.map(([name, v], i) => {
    const pct = (v / total) * 100;
    const y = top + 62 + i * 30;
    const on = Math.max(1, Math.round((pct / 100) * nSeg));
    let segs = "";
    for (let s = 0; s < nSeg; s++) {
      const sx = lx + 20 + s * (segW + segGap);
      segs += s < on
        ? `<rect x="${sx}" y="${y + 6}" width="${segW}" height="6" fill="${C.g}"${s === on - 1 ? ' class="pulse"' : ""}/>`
        : `<rect x="${sx}" y="${y + 6}" width="${segW}" height="6" fill="${C.dim}" opacity=".45"/>`;
    }
    return `<text x="${lx + 20}" y="${y}" font-size="10.5" letter-spacing=".8" fill="${C.g}">${esc(name.toUpperCase())}</text>
      <text x="${lx + pw - 20}" y="${y}" text-anchor="end" font-size="10.5" fill="${C.g}">${pct.toFixed(1)}%</text>${segs}`;
  }).join("");

  return svg(W, H, `
  ${sectionHeader(26, "SYSTEM DIAGNOSTICS", "AUTO-SYNC // 2x DAY", W)}
  ${panel(0, "SYSTEM STATUS")}
  ${left}
  <line x1="18" y1="${top + 222}" x2="${pw - 18}" y2="${top + 222}" stroke="${C.line}"/>
  <text x="20" y="${top + 240}" font-size="10.5" letter-spacing="1.5" fill="${C.g}">OVERALL SYSTEM STATUS: <tspan fill="${C.hi}" font-weight="700">NOMINAL</tspan><tspan class="blink" fill="${C.g}"> █</tspan></text>
  <text x="${pw - 18}" y="${top + 254}" text-anchor="end" font-size="8.5" letter-spacing="1" fill="${C.g2}">LAST SYNC ${fmt} ${esc(cfg.tzLabel)}</text>
  ${panel(lx, "LANGUAGE MATRIX")}
  ${right}
  <text x="${lx + pw - 18}" y="${top + 254}" text-anchor="end" font-size="8.5" letter-spacing="1" fill="${C.g2}">BY BYTES // PUBLIC REPOS</text>
  `);
}

// ---------- 4. atividade ----------
function activity(d) {
  const W = 1000, H = 290;
  const days = d.days.slice(-31);
  const vals = days.map((x) => x.contributionCount);
  const total = vals.reduce((a, b) => a + b, 0);
  const peak = Math.max(...vals, 0);
  const st = streaks(d.days);
  const yMax = Math.max(4, Math.ceil(peak / 4) * 4);
  const cx = 54, cy = 66, cw = W - cx - 30, chh = 168;
  const X = (i) => cx + (i / (days.length - 1)) * cw;
  const Y = (v) => cy + chh - (v / yMax) * chh;

  let grid = "";
  for (let k = 0; k <= 4; k++) {
    const v = (yMax / 4) * k, y = Y(v);
    grid += `<line x1="${cx}" y1="${y}" x2="${cx + cw}" y2="${y}" stroke="${C.g}" stroke-opacity="${k === 0 ? .5 : .1}" ${k ? 'stroke-dasharray="2 4"' : ""}/>
      <text x="${cx - 12}" y="${y + 3}" text-anchor="end" font-size="9" fill="${C.txt}">${Math.round(v)}</text>`;
  }
  let xl = "";
  days.forEach((dd, i) => {
    if (i % 5 === 0 || i === days.length - 1) {
      const [, m, dy] = dd.date.split("-");
      xl += `<text x="${X(i)}" y="${cy + chh + 18}" text-anchor="middle" font-size="9" fill="${C.txt}">${dy}/${m}</text>
        <line x1="${X(i)}" y1="${cy + chh}" x2="${X(i)}" y2="${cy + chh + 4}" stroke="${C.g2}"/>`;
    }
  });
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${X(days.length - 1)},${Y(0)} L${X(0)},${Y(0)} Z`;
  const dots = vals.map((v, i) => v > 0 ? `<rect x="${X(i) - 2.5}" y="${Y(v) - 2.5}" width="5" height="5" fill="${v === peak ? C.hi : C.g}"/>` : "").join("");

  return svg(W, H, `
  <defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.g}" stop-opacity=".35"/><stop offset="1" stop-color="${C.g}" stop-opacity="0"/></linearGradient></defs>
  <polygon points="${chamfer(1, 1, W - 2, H - 2, 16, "tl br")}" fill="${C.panel}" stroke="${C.g2}" stroke-width="1.2"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="url(#grid)"/>
  <text x="22" y="36" class="d" font-size="19" letter-spacing="2" fill="${C.g}" filter="url(#softglow)">NEURAL ACTIVITY <tspan font-family="${FONT}" font-size="10.5" font-weight="400" fill="${C.g2}" letter-spacing="1">// CONTRIBUTIONS, LAST 31 DAYS</tspan></text>
  <text x="${W - 22}" y="34" text-anchor="end" font-size="10.5" letter-spacing="1.2" fill="${C.g}">TOTAL ${total} <tspan fill="${C.g2}">//</tspan> PEAK ${peak} <tspan fill="${C.g2}">//</tspan> STREAK ${st.current}</text>
  <line x1="22" y1="46" x2="${W - 22}" y2="46" stroke="${C.line}"/>
  ${grid}${xl}
  <path d="${area}" fill="url(#ar)"/>
  <path d="${line}" fill="none" stroke="${C.g}" stroke-width="2" stroke-linejoin="round" filter="url(#softglow)"/>
  ${dots}
  <rect x="${cx}" y="${cy}" width="2" height="${chh}" fill="${C.g}" opacity=".25" style="animation:scanx 6s linear infinite"/>
  `, `@keyframes scanx{0%{transform:translateX(0)}100%{transform:translateX(${cw}px)}}`);
}

// ---------- run ----------
const data = await fetchData();
const st = streaks(data.days);
writeFileSync(join(OUT, "banner.svg"), banner());
writeFileSync(join(OUT, "stack.svg"), stack());
writeFileSync(join(OUT, "diagnostics.svg"), diagnostics(data, st));
writeFileSync(join(OUT, "activity.svg"), activity(data));
console.log("SVGs gerados em assets/", process.env.GH_TOKEN || process.env.GITHUB_TOKEN ? "(dados reais)" : "(dados de exemplo)");
