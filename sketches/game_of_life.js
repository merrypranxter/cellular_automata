// ============================================================
//  GAME OF LIFE + LIFE-LIKE CA — GPU Ping-Pong
//  Three.js / WebGL2 / JS5
//
//  Full GPU cellular automaton using ping-pong render targets.
//  State is stored as 0/1 in the RED channel of a float texture.
//
//  Runs MULTIPLE generations per frame for speed.
//  Cycles through 8 Life-like rules automatically.
//
//  Life-like rule encoding: B (birth) and S (survival) neighbor counts.
//  Format: "B3/S23" = born at 3 neighbors, survives at 2 or 3.
//
//  Rules included:
//    B3/S23     Conway's Game of Life   — the classic
//    B36/S23    HighLife                — self-replicators
//    B2/S       Seeds                  — explosive sparks
//    B3/S12345  Maze                   — crystalline labyrinths
//    B3678/S34678 Day & Night          — dual-stable domains
//    B25/S4     Assimilation            — blob-like growth
//    B34/S34    34 Life                — coral-like structures
//    B3/S45678  Long Life              — slow stable organisms
// ============================================================

if (!canvas.__castate) {

  const W = canvas.width  = window.innerWidth;
  const H = canvas.height = window.innerHeight;

  // Simulation resolution (lower = faster, coarser cells)
  const SW = 512, SH = 512;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: canvas.getContext('webgl2'),
  });
  renderer.setSize(W, H, false);
  renderer.autoClear = false;

  // ── Life-like rule definitions ──────────────────────────
  const RULES = [
    { name: "Conway's Life",  birth: [3],           survive: [2,3] },
    { name: "HighLife",       birth: [3,6],          survive: [2,3] },
    { name: "Seeds",          birth: [2],            survive: [] },
    { name: "Maze",           birth: [3],            survive: [1,2,3,4,5] },
    { name: "Day & Night",    birth: [3,6,7,8],      survive: [3,4,6,7,8] },
    { name: "Assimilation",   birth: [3,4,5],        survive: [4,5,6,7] },
    { name: "34 Life",        birth: [3,4],          survive: [3,4] },
    { name: "Long Life",      birth: [3],            survive: [4,5,6,7,8] },
  ];

  // Encode rule as bitmasks (bit N set = N neighbors triggers birth/survive)
  function encodeBitmask(arr) {
    return arr.reduce((m, n) => m | (1 << n), 0);
  }

  let ruleIdx  = 0;
  let ruleTimer = 0;
  const RULE_DURATION = 18.0; // seconds per rule

  // ── Render targets (ping-pong) ───────────────────────────
  const rtOpts = {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format:    THREE.RGBAFormat,
    type:      THREE.FloatType,
  };
  const fbo = [
    new THREE.WebGLRenderTarget(SW, SH, rtOpts),
    new THREE.WebGLRenderTarget(SW, SH, rtOpts),
  ];
  let ping = 0;

  // ── Geometry ─────────────────────────────────────────────
  const quadGeo  = new THREE.PlaneGeometry(2, 2);
  const quadCam  = new THREE.OrthographicCamera(-1,1,1,-1,0,1);

  // ── Seed initial state ───────────────────────────────────
  const seed = new Float32Array(SW * SH * 4);
  for (let i = 0; i < SW * SH; i++) {
    seed[i*4] = Math.random() < 0.35 ? 1.0 : 0.0;  // ~35% alive
  }
  const seedTex = new THREE.DataTexture(seed, SW, SH, THREE.RGBAFormat, THREE.FloatType);
  seedTex.needsUpdate = true;

  // Blit seed into fbo[0]
  const blitMat = new THREE.RawShaderMaterial({
    vertexShader: `#version 300 es
      in vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }`,
    fragmentShader: `#version 300 es
      precision highp float;
      uniform sampler2D u_tex;
      uniform vec2 u_res;
      out vec4 fragColor;
      void main() {
        vec2 uv = gl_FragCoord.xy / u_res;
        fragColor = texture(u_tex, uv);
      }`,
    uniforms: {
      u_tex: { value: seedTex },
      u_res: { value: new THREE.Vector2(SW, SH) },
    },
  });
  const blitMesh = new THREE.Mesh(quadGeo, blitMat);
  const blitScene = new THREE.Scene();
  blitScene.add(blitMesh);
  renderer.setRenderTarget(fbo[0]);
  renderer.render(blitScene, quadCam);

  // ── CA update shader ─────────────────────────────────────
  const updateMat = new THREE.RawShaderMaterial({
    vertexShader: `#version 300 es
      in vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }`,
    fragmentShader: `#version 300 es
      precision highp float;
      uniform sampler2D u_state;
      uniform vec2      u_res;
      uniform int       u_birth;    // bitmask
      uniform int       u_survive;  // bitmask
      out vec4 fragColor;

      float cell(vec2 offset) {
        vec2 uv = (gl_FragCoord.xy + offset) / u_res;
        // Wrap (toroidal)
        uv = fract(uv);
        return texture(u_state, uv).r > 0.5 ? 1.0 : 0.0;
      }

      void main() {
        float me = cell(vec2(0));
        int count = int(
          cell(vec2(-1,-1)) + cell(vec2(0,-1)) + cell(vec2(1,-1)) +
          cell(vec2(-1, 0))                    + cell(vec2(1, 0)) +
          cell(vec2(-1, 1)) + cell(vec2(0, 1)) + cell(vec2(1, 1))
        );

        float next = 0.0;
        if (me < 0.5) {
          // Dead cell: birth?
          if ((u_birth & (1 << count)) != 0) next = 1.0;
        } else {
          // Live cell: survive?
          if ((u_survive & (1 << count)) != 0) next = 1.0;
        }
        fragColor = vec4(next, next, next, 1.0);
      }`,
    uniforms: {
      u_state:   { value: fbo[0].texture },
      u_res:     { value: new THREE.Vector2(SW, SH) },
      u_birth:   { value: encodeBitmask(RULES[0].birth) },
      u_survive: { value: encodeBitmask(RULES[0].survive) },
    },
  });
  const updateMesh  = new THREE.Mesh(quadGeo, updateMat);
  const updateScene = new THREE.Scene();
  updateScene.add(updateMesh);

  // ── Display shader ────────────────────────────────────────
  // Renders the CA state to screen with color based on alive/dead
  // Uses a short history trail: store age in green channel
  const ageMat = new THREE.RawShaderMaterial({
    vertexShader: `#version 300 es
      in vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }`,
    fragmentShader: `#version 300 es
      precision highp float;
      uniform sampler2D u_prev;   // previous frame (with age)
      uniform sampler2D u_curr;   // current CA state
      uniform vec2      u_res;
      out vec4 fragColor;

      void main() {
        vec2 uv   = gl_FragCoord.xy / u_res;
        float alive = texture(u_curr, uv).r > 0.5 ? 1.0 : 0.0;
        vec4  prev  = texture(u_prev, uv);

        float age;
        if (alive > 0.5) {
          age = min(prev.g + 0.04, 1.0);  // accumulate age
        } else {
          age = prev.g * 0.85;            // decay on death
        }
        fragColor = vec4(alive, age, 0.0, 1.0);
      }`,
    uniforms: {
      u_prev: { value: null },
      u_curr: { value: fbo[0].texture },
      u_res:  { value: new THREE.Vector2(SW, SH) },
    },
  });

  // Two age FBOs for temporal blending
  const ageFBO = [
    new THREE.WebGLRenderTarget(SW, SH, rtOpts),
    new THREE.WebGLRenderTarget(SW, SH, rtOpts),
  ];
  let agePing = 0;
  const ageMesh  = new THREE.Mesh(quadGeo, ageMat);
  const ageScene = new THREE.Scene();
  ageScene.add(ageMesh);

  // ── Final display shader ──────────────────────────────────
  const displayMat = new THREE.RawShaderMaterial({
    vertexShader: `#version 300 es
      in vec2 position;
      out vec2 v_uv;
      void main() {
        v_uv = position * 0.5 + 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }`,
    fragmentShader: `#version 300 es
      precision highp float;
      uniform sampler2D u_age;
      uniform float     u_rule_t;  // 0..1 within current rule period
      in vec2 v_uv;
      out vec4 fragColor;

      vec3 palette(float t, float phase) {
        vec3 a = vec3(0.5), b = vec3(0.5);
        vec3 c = vec3(1.0, 0.7, 0.4), d = vec3(0.0, 0.25, 0.1);
        return a + b * cos(6.28318 * (c * (t + phase) + d));
      }

      void main() {
        vec4  ag    = texture(u_age, v_uv);
        float alive = ag.r;
        float age   = ag.g;

        vec3 dead_col  = vec3(0.03, 0.02, 0.04);
        vec3 alive_col = palette(age, u_rule_t * 0.5);
        vec3 birth_col = vec3(0.8, 1.0, 0.9);  // bright flash on birth

        float birth_flash = alive * exp(-age * 10.0) * 0.4;
        vec3 col = alive > 0.5
          ? mix(alive_col, birth_col, birth_flash)
          : dead_col + alive_col * age * 0.3;

        // Subtle grid lines at cell boundaries
        vec2 cell_uv = fract(v_uv * vec2(512.0));
        float grid = max(
          smoothstep(0.96, 1.0, cell_uv.x),
          smoothstep(0.96, 1.0, cell_uv.y)
        );
        col = mix(col, col * 0.6, grid * 0.15);

        fragColor = vec4(col, 1.0);
      }`,
    uniforms: {
      u_age:    { value: ageFBO[0].texture },
      u_rule_t: { value: 0.0 },
    },
  });
  const displayMesh  = new THREE.Mesh(quadGeo, displayMat);
  const displayScene = new THREE.Scene();
  displayScene.add(displayMesh);

  // ── Store state ───────────────────────────────────────────
  canvas.__castate = {
    renderer, quadCam,
    fbo, ping,
    updateMat, updateScene,
    ageMat, ageFBO, agePing, ageScene,
    displayMat, displayScene,
    ruleIdx, ruleTimer,
    lastTime: 0,
  };
}

// ── Animate ───────────────────────────────────────────────────
const s = canvas.__castate;
const dt = Math.min((time - s.lastTime) / 1000, 0.05);
s.lastTime = time;
s.ruleTimer += dt;

// Cycle rules
if (s.ruleTimer > 18.0) {
  s.ruleTimer  = 0;
  s.ruleIdx    = (s.ruleIdx + 1) % RULES.length;
  const r      = RULES[s.ruleIdx];
  s.updateMat.uniforms.u_birth.value   = encodeBitmask(r.birth);
  s.updateMat.uniforms.u_survive.value = encodeBitmask(r.survive);

  // Re-seed on rule change for fresh start
  const seed2 = new Float32Array(SW * SH * 4);
  for (let i = 0; i < SW * SH; i++) seed2[i*4] = Math.random() < 0.35 ? 1.0 : 0.0;
  const st2 = new THREE.DataTexture(seed2, SW, SH, THREE.RGBAFormat, THREE.FloatType);
  st2.needsUpdate = true;
  blitMat.uniforms.u_tex.value = st2;
  s.renderer.setRenderTarget(s.fbo[s.ping]);
  s.renderer.render(blitScene, s.quadCam);
}

// Run multiple CA steps per frame (speed control)
const STEPS_PER_FRAME = 3;
for (let step = 0; step < STEPS_PER_FRAME; step++) {
  const next = 1 - s.ping;
  s.updateMat.uniforms.u_state.value = s.fbo[s.ping].texture;
  s.renderer.setRenderTarget(s.fbo[next]);
  s.renderer.render(s.updateScene, s.quadCam);
  s.ping = next;
}

// Update age buffer
const nextAge = 1 - s.agePing;
s.ageMat.uniforms.u_prev.value = s.ageFBO[s.agePing].texture;
s.ageMat.uniforms.u_curr.value = s.fbo[s.ping].texture;
s.renderer.setRenderTarget(s.ageFBO[nextAge]);
s.renderer.render(s.ageScene, s.quadCam);
s.agePing = nextAge;

// Display
s.displayMat.uniforms.u_age.value    = s.ageFBO[s.agePing].texture;
s.displayMat.uniforms.u_rule_t.value = s.ruleTimer / 18.0;
s.renderer.setRenderTarget(null);
s.renderer.setSize(canvas.width, canvas.height, false);
s.renderer.render(s.displayScene, s.quadCam);

function encodeBitmask(arr) {
  return arr.reduce((m, n) => m | (1 << n), 0);
}
