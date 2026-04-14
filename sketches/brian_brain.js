// ============================================================
//  BRIAN'S BRAIN + CYCLIC CA — 3-State Automata
//  Three.js / WebGL2 / JS5
//
//  Two spectacular multi-state CA rules that produce
//  very different emergent behavior:
//
//  ── BRIAN'S BRAIN ────────────────────────────────────────
//  3 states: OFF (0), FIRING (1), REFRACTORY (2)
//  Rules:
//    OFF → FIRING if exactly 2 neighbors are FIRING
//    FIRING → REFRACTORY (always)
//    REFRACTORY → OFF (always)
//
//  Produces: endless streams of "signals" (traveling glider-like
//  structures) that self-organize into dense, never-stable fields.
//  Almost nothing is static — everything is constantly propagating.
//  Resembles neural firing patterns.
//
//  ── CYCLIC CA (Greenberg-Hastings) ───────────────────────
//  N states (typically 8-16): each cell cycles 0 → 1 → 2 ... → N-1 → 0
//  Rule: a cell in state k advances to k+1 if it has at least
//  one neighbor in state k+1 (mod N).
//
//  Produces: expanding spiral waves, concentric rings, target patterns.
//  Resembles Belousov-Zhabotinsky reaction spirals.
//  With enough states, produces a permanent rotating field of spirals.
//
//  The sketch cycles between both rules.
// ============================================================

if (!canvas.__bbstate) {

  const W = canvas.width  = window.innerWidth;
  const H = canvas.height = window.innerHeight;
  const SW = 512, SH = 512;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: canvas.getContext('webgl2'),
  });
  renderer.setSize(W, H, false);
  renderer.autoClear = false;

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const rtOpts = {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat, type: THREE.FloatType,
  };
  const fbo = [
    new THREE.WebGLRenderTarget(SW, SH, rtOpts),
    new THREE.WebGLRenderTarget(SW, SH, rtOpts),
  ];
  let ping = 0;

  // Seed: random binary for Brian's Brain, random N-state for Cyclic
  function makeSeed(mode, nStates) {
    const data = new Float32Array(SW * SH * 4);
    for (let i = 0; i < SW * SH; i++) {
      data[i*4] = Math.floor(Math.random() * nStates) / (nStates - 1);
    }
    return data;
  }

  const seed = makeSeed('brian', 3);
  const seedTex = new THREE.DataTexture(seed, SW, SH, THREE.RGBAFormat, THREE.FloatType);
  seedTex.needsUpdate = true;

  const blitMat = new THREE.RawShaderMaterial({
    vertexShader:   `#version 300 es in vec2 position; void main(){gl_Position=vec4(position,0,1);}`,
    fragmentShader: `#version 300 es precision highp float;
      uniform sampler2D u_tex; uniform vec2 u_res; out vec4 f;
      void main(){f=texture(u_tex,gl_FragCoord.xy/u_res);}`,
    uniforms: { u_tex:{value:seedTex}, u_res:{value:new THREE.Vector2(SW,SH)} },
  });
  const blitScene = new THREE.Scene();
  blitScene.add(new THREE.Mesh(quadGeo, blitMat));
  renderer.setRenderTarget(fbo[0]);
  renderer.render(blitScene, quadCam);

  // ── Combined update shader ────────────────────────────────
  // mode 0 = Brian's Brain, mode 1 = Cyclic CA
  const updateMat = new THREE.RawShaderMaterial({
    vertexShader: `#version 300 es in vec2 position; void main(){gl_Position=vec4(position,0,1);}`,
    fragmentShader: `#version 300 es
      precision highp float;
      uniform sampler2D u_state;
      uniform vec2      u_res;
      uniform int       u_mode;     // 0=Brian, 1=Cyclic
      uniform int       u_nstates;  // for Cyclic (typically 8)
      out vec4 fragColor;

      float getCell(vec2 offset) {
        return texture(u_state, fract((gl_FragCoord.xy+offset)/u_res)).r;
      }

      void main() {
        float me = getCell(vec2(0));
        float next;

        if (u_mode == 0) {
          // ── Brian's Brain ────────────────────────────────
          // States: OFF=0, FIRING=0.5, REFRACTORY=1.0
          float off  = 0.0, fire = 0.5, refr = 1.0;
          float eps  = 0.1;

          if (abs(me - fire) < eps) {
            // FIRING → REFRACTORY
            next = refr;
          } else if (abs(me - refr) < eps) {
            // REFRACTORY → OFF
            next = off;
          } else {
            // OFF: count FIRING neighbors (Moore neighborhood)
            float count = 0.0;
            for (int dy = -1; dy <= 1; dy++)
              for (int dx = -1; dx <= 1; dx++)
                if (dx != 0 || dy != 0)
                  count += (abs(getCell(vec2(float(dx),float(dy))) - fire) < eps) ? 1.0 : 0.0;
            next = (abs(count - 2.0) < 0.5) ? fire : off;
          }
        } else {
          // ── Cyclic CA ────────────────────────────────────
          // States: 0, 1/N, 2/N, ... 1.0 (N discrete levels)
          float N = float(u_nstates);
          float state   = round(me * (N - 1.0));
          float nextSt  = mod(state + 1.0, N);
          float nextVal = nextSt / (N - 1.0);

          // Advance if any Moore neighbor is at nextSt
          bool advance = false;
          for (int dy = -1; dy <= 1; dy++)
            for (int dx = -1; dx <= 1; dx++)
              if (dx != 0 || dy != 0) {
                float nb = round(getCell(vec2(float(dx),float(dy))) * (N-1.0));
                if (abs(nb - nextSt) < 0.5) advance = true;
              }

          next = advance ? nextVal : me;
        }

        fragColor = vec4(next, next, next, 1.0);
      }`,
    uniforms: {
      u_state:   { value: fbo[0].texture },
      u_res:     { value: new THREE.Vector2(SW, SH) },
      u_mode:    { value: 0 },
      u_nstates: { value: 12 },
    },
  });
  const updateScene = new THREE.Scene();
  updateScene.add(new THREE.Mesh(quadGeo, updateMat));

  // ── Display shader ────────────────────────────────────────
  const displayMat = new THREE.RawShaderMaterial({
    vertexShader: `#version 300 es in vec2 p; out vec2 uv;
      void main(){uv=p*0.5+0.5; gl_Position=vec4(p,0,1);}`,
    fragmentShader: `#version 300 es
      precision highp float;
      uniform sampler2D u_state;
      uniform int       u_mode;
      uniform float     u_time;
      in vec2 uv; out vec4 fragColor;

      vec3 brianPalette(float v) {
        // OFF=deep void, FIRING=bright neon, REFRACTORY=dim ember
        if (v < 0.1)  return vec3(0.02, 0.01, 0.04);           // off
        if (v < 0.75) return vec3(0.0, 0.9+sin(u_time)*0.1, 0.4); // firing
        return vec3(0.5, 0.1, 0.0);                             // refractory
      }

      vec3 cyclicPalette(float v, float t) {
        // Full spectral sweep — spirals appear as rainbow bands
        vec3 a = vec3(0.5), b = vec3(0.5);
        vec3 c = vec3(1.0, 0.8, 0.6);
        vec3 d = vec3(v*0.8 + t*0.05, 0.15, 0.3);
        return a + b * cos(6.28318 * (c * v + d));
      }

      void main() {
        float v = texture(u_state, uv).r;
        vec3 col = (u_mode == 0)
          ? brianPalette(v)
          : cyclicPalette(v, u_time);
        fragColor = vec4(col, 1.0);
      }`,
    uniforms: {
      u_state: { value: fbo[0].texture },
      u_mode:  { value: 0 },
      u_time:  { value: 0.0 },
    },
  });
  const displayScene = new THREE.Scene();
  displayScene.add(new THREE.Mesh(quadGeo, displayMat));

  canvas.__bbstate = {
    renderer, quadCam, fbo, ping,
    updateMat, updateScene, displayMat, displayScene,
    blitScene, blitMat, quadGeo,
    mode: 0, modeTimer: 0, lastTime: 0,
  };
}

const s = canvas.__bbstate;
const dt = Math.min((time - s.lastTime) / 1000, 0.05);
s.lastTime  = time;
s.modeTimer += dt;

// Switch modes every 20 seconds
if (s.modeTimer > 20.0) {
  s.modeTimer = 0;
  s.mode = 1 - s.mode;
  s.updateMat.uniforms.u_mode.value  = s.mode;
  s.displayMat.uniforms.u_mode.value = s.mode;

  const ns = s.mode === 0 ? 3 : 12;
  const sd = new Float32Array(512*512*4);
  for (let i = 0; i < 512*512; i++)
    sd[i*4] = Math.floor(Math.random() * ns) / (ns - 1);
  const st = new THREE.DataTexture(sd, 512, 512, THREE.RGBAFormat, THREE.FloatType);
  st.needsUpdate = true;
  s.blitMat.uniforms.u_tex.value = st;
  s.renderer.setRenderTarget(s.fbo[s.ping]);
  s.renderer.render(s.blitScene, s.quadCam);
}

// CA steps
const STEPS = s.mode === 0 ? 2 : 1;
for (let i = 0; i < STEPS; i++) {
  const next = 1 - s.ping;
  s.updateMat.uniforms.u_state.value = s.fbo[s.ping].texture;
  s.renderer.setRenderTarget(s.fbo[next]);
  s.renderer.render(s.updateScene, s.quadCam);
  s.ping = next;
}

s.displayMat.uniforms.u_state.value = s.fbo[s.ping].texture;
s.displayMat.uniforms.u_time.value  = time / 1000;
s.renderer.setRenderTarget(null);
s.renderer.setSize(canvas.width, canvas.height, false);
s.renderer.render(s.displayScene, s.quadCam);
