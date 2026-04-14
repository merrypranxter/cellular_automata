// ============================================================
//  ELEMENTARY CELLULAR AUTOMATA — Spacetime Visualizer
//  Canvas 2D / JS5
//
//  Renders 1D cellular automata as 2D spacetime diagrams.
//  Each row = one generation. Time flows downward.
//  Each column = one cell position.
//
//  The 256 elementary CA rules (Wolfram) produce wildly
//  different behaviors from the same simple 3-neighbor rule.
//
//  Key rules:
//    Rule 30   — chaotic, pseudo-random (used in Mathematica)
//    Rule 90   — Sierpiński triangle (XOR of neighbors)
//    Rule 110  — complex, universal computation
//    Rule 184  — traffic flow model
//    Rule 150  — additive (XOR-based) patterns
//    Rule 22   — Class III chaos with symmetric structure
//    Rule 54   — complex with traveling structures
//    Rule 73   — periodic with complex boundary behavior
//
//  Features:
//    - Animated scrolling (time flows, new rows added top)
//    - Slow cycling through curated rule set
//    - Color mapped from age + rule identity
//    - Zoom controls via mouse.y
//    - Initial condition: single cell OR random OR specific patterns
// ============================================================

if (!canvas.__ecastate) {
  const W = canvas.width  = window.innerWidth;
  const H = canvas.height = window.innerHeight;

  // Grid dimensions
  const COLS = Math.floor(W / 3);   // 3px per cell
  const ROWS = Math.floor(H / 3);

  // Curated rules with their character
  const RULE_LIST = [
    { rule: 30,  name: "Chaos",         initMode: "single" },
    { rule: 90,  name: "Sierpiński",    initMode: "single" },
    { rule: 110, name: "Universal",     initMode: "single" },
    { rule: 150, name: "XOR Fractal",   initMode: "single" },
    { rule: 184, name: "Traffic Flow",  initMode: "random" },
    { rule: 54,  name: "Complex",       initMode: "single" },
    { rule: 22,  name: "Symmetric Chaos",initMode:"single" },
    { rule: 73,  name: "Periodic",      initMode: "single" },
    { rule: 18,  name: "Cantor Dust",   initMode: "single" },
    { rule: 126, name: "Organic",       initMode: "random" },
  ];

  let ruleListIdx = 0;
  let ruleTimer   = 0;

  // Build lookup table for current rule
  function buildTable(rule) {
    const table = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      table[i] = (rule >> i) & 1;
    }
    return table;
  }

  // Generate initial row
  function makeInitRow(mode) {
    const row = new Uint8Array(COLS);
    if (mode === 'single') {
      row[Math.floor(COLS / 2)] = 1;
    } else {
      for (let i = 0; i < COLS; i++) {
        row[i] = Math.random() < 0.4 ? 1 : 0;
      }
    }
    return row;
  }

  // State: ring buffer of rows
  const grid    = [];
  const ages    = [];  // age (consecutive alive frames) per cell
  const HISTORY = ROWS + 10;

  let curEntry = RULE_LIST[0];
  let table    = buildTable(curEntry.rule);

  // Fill with initial state
  const initRow = makeInitRow(curEntry.initMode);
  grid.push(new Uint8Array(initRow));
  ages.push(new Uint8Array(COLS));

  for (let r = 1; r < HISTORY; r++) {
    const prev = grid[r - 1];
    const next = new Uint8Array(COLS);
    const ageRow = new Uint8Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const l = prev[(c - 1 + COLS) % COLS];
      const m = prev[c];
      const ri = prev[(c + 1) % COLS];
      const idx = (l << 2) | (m << 1) | ri;
      next[c] = table[idx];
      ageRow[c] = next[c] ? Math.min(ages[r-1][c] + 1, 255) : 0;
    }
    grid.push(next);
    ages.push(ageRow);
  }

  canvas.__ecastate = {
    grid, ages, table,
    ruleListIdx, ruleTimer,
    curEntry, COLS, ROWS, HISTORY,
    lastTime: 0,
    frameCount: 0,
  };
}

// ── Per-frame ─────────────────────────────────────────────────
const s = canvas.__ecastate;
const dt = Math.min((time - s.lastTime) / 1000, 0.05);
s.lastTime = time;
s.ruleTimer += dt;
s.frameCount++;

// Rebuild lookup tables in local scope
function buildTable(rule) {
  const t = new Uint8Array(8);
  for (let i = 0; i < 8; i++) t[i] = (rule >> i) & 1;
  return t;
}

const RULE_LIST = [
  { rule: 30,  name: "Chaos",          initMode: "single" },
  { rule: 90,  name: "Sierpiński",     initMode: "single" },
  { rule: 110, name: "Universal",      initMode: "single" },
  { rule: 150, name: "XOR Fractal",    initMode: "single" },
  { rule: 184, name: "Traffic Flow",   initMode: "random" },
  { rule: 54,  name: "Complex",        initMode: "single" },
  { rule: 22,  name: "Symmetric Chaos",initMode: "single" },
  { rule: 73,  name: "Periodic",       initMode: "single" },
  { rule: 18,  name: "Cantor Dust",    initMode: "single" },
  { rule: 126, name: "Organic",        initMode: "random" },
];

// Cycle rules every 12 seconds
if (s.ruleTimer > 12.0) {
  s.ruleTimer    = 0;
  s.ruleListIdx  = (s.ruleListIdx + 1) % RULE_LIST.length;
  s.curEntry     = RULE_LIST[s.ruleListIdx];
  s.table        = buildTable(s.curEntry.rule);

  // Fresh initial condition
  const { COLS, HISTORY } = s;
  const init = s.curEntry.initMode === 'single'
    ? (() => { const r = new Uint8Array(COLS); r[Math.floor(COLS/2)] = 1; return r; })()
    : (() => { const r = new Uint8Array(COLS); for (let i=0;i<COLS;i++) r[i]=Math.random()<0.4?1:0; return r; })();

  s.grid.length = 0;
  s.ages.length = 0;
  s.grid.push(new Uint8Array(init));
  s.ages.push(new Uint8Array(COLS));
  for (let r = 1; r < HISTORY; r++) {
    const prev = s.grid[r-1];
    const next = new Uint8Array(COLS);
    const ageRow = new Uint8Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const l  = prev[(c-1+COLS)%COLS], m = prev[c], ri = prev[(c+1)%COLS];
      next[c]  = s.table[(l<<2)|(m<<1)|ri];
      ageRow[c] = next[c] ? Math.min(s.ages[r-1]?.[c] ?? 0 + 1, 255) : 0;
    }
    s.grid.push(next);
    s.ages.push(ageRow);
  }
}

// Add new rows (2 per frame = animation speed)
const STEPS = 2;
for (let step = 0; step < STEPS; step++) {
  const prev = s.grid[s.grid.length - 1];
  const prevAge = s.ages[s.ages.length - 1];
  const next = new Uint8Array(s.COLS);
  const ageRow = new Uint8Array(s.COLS);
  for (let c = 0; c < s.COLS; c++) {
    const l  = prev[(c-1+s.COLS)%s.COLS];
    const m  = prev[c];
    const ri = prev[(c+1)%s.COLS];
    next[c]  = s.table[(l<<2)|(m<<1)|ri];
    ageRow[c] = next[c] ? Math.min((prevAge[c] || 0) + 1, 255) : 0;
  }
  s.grid.push(next);
  s.ages.push(ageRow);
  if (s.grid.length > s.HISTORY) {
    s.grid.shift();
    s.ages.shift();
  }
}

// ── Render ────────────────────────────────────────────────────
const W = canvas.width, H = canvas.height;
ctx.fillStyle = '#060408';
ctx.fillRect(0, 0, W, H);

const cellW = W / s.COLS;
const cellH = H / s.ROWS;

// Color palette per rule
const ruleHue = (s.curEntry.rule / 256.0) * 360;

for (let r = 0; r < Math.min(s.grid.length, s.ROWS); r++) {
  const row    = s.grid[s.grid.length - 1 - r];
  const ageRow = s.ages[s.ages.length - 1 - r];
  const y      = H - (r + 1) * cellH;

  for (let c = 0; c < s.COLS; c++) {
    if (!row[c]) continue;

    const age = ageRow[c] / 255.0;
    const rowFade = 1.0 - (r / s.ROWS) * 0.7;

    // Color: hue from rule, brightness from age + row position
    const hue  = (ruleHue + age * 40) % 360;
    const sat  = 70 + age * 30;
    const lum  = 20 + age * 50 * rowFade;

    ctx.fillStyle = `hsl(${hue},${sat}%,${lum}%)`;
    ctx.fillRect(c * cellW, y, cellW - 0.5, cellH - 0.5);
  }
}

// Rule label
ctx.font = `${Math.max(12, Math.floor(H * 0.025))}px monospace`;
ctx.fillStyle = `hsla(${ruleHue},60%,70%,0.7)`;
ctx.fillText(`Rule ${s.curEntry.rule} — ${s.curEntry.name}`, 16, H - 16);
