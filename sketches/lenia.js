// ============================================================
//  LENIA — Continuous Cellular Automaton
//  Three.js / WebGL2 / JS5
//
//  Lenia is a continuous generalization of Conway's Game of Life,
//  developed by Bert Wang-Chak Chan (2019). States are real-valued
//  (0.0 to 1.0 per cell), and updates use a circular kernel
//  (instead of discrete Moore neighborhood) with a continuous
//  growth function (instead of binary birth/survive rules).
//
//  Update rule:
//    1. Convolve grid with circular kernel K to get neighborhood
//       potential U (essentially a weighted-average of nearby cells)
//    2. Apply growth function G(U): a bell-curve-shaped function
//       centered at mu with width sigma
//    3. New state: A(t+dt) = clip(A(t) + dt * (2*G(U) - 1), 0, 1)
//
//  The bell-curve growth function:
//    G(u) = exp( -( (u - mu)^2 / (2*sigma^2) ) )
//    G maps "just right" neighborhood density to growth (+1),
//    too sparse or too dense to death (-1).
//
//  Different (mu, sigma, kernel_radius) combinations produce
//  different creatures: orbium (glider), hydrogeminium, scutium...
//
//  Implemented here using:
//    - Approximate convolution: sample K at multiple radii using
//      averaging rings (cheap GPU-friendly approximation)
//    - Animated parameter drift between known species configs
// ============================================================

if (!canvas.__lenia) {

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

  // ── Lenia species parameters ──────────────────────────────
  // Format: { mu, sigma, radius, dt, name }
  // mu     = center of growth bell curve (ideal neighborhood density)
  // sigma  = width of growth bell curve
  // radius = kernel radius in cells
  // dt     = time step per frame
  const SPECIES = [
    { mu: 0.15, sigma: 0.015, radius: 13, dt: 0.1, name: "Orbium (Glider)" },
    { mu: 0.14, sigma: 0.014, radius: 13, dt: 0.1, name: "Hydrogeminium" },
    { mu: 0.26, sigma: 0.036, radius: 10, dt: 0.1, name: "Scutium" },
    { mu: 0.27, sigma: 0.060, radius: 15, dt: 0.1, name: "Dendritia" },
    { mu: 0.20, sigma: 0.040, radius: 12, dt: 0.1, name: "Cosmicium" },
  ];
  let speciesIdx  = 0;
  let speciesTimer = 0;

  // ── Ping-pong FBOs ────────────────────────────────────────
  const rtOpts = {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat, type: THREE.FloatType,
  };
  const fbo = [
    new THREE.WebGLRenderTarget(SW, SH, rtOpts),
    new THREE.WebGLRenderTarget(SW, SH, rtOpts),
  ];
  let ping = 0;

  // ── Seed with random blobs ────────────────────────────────
  const seed = new Float32Array(SW * SH * 4);
  for (let i = 0; i < SW * SH; i++) {
    const x = (i % SW) / SW - 0.5;
    const y = (Math.floor(i / SW)) / SH - 0.5;
    const r = Math.sqrt(x*x + y*y);
    // Random blobs in center region
    seed[i*4] = (r < 0.3 && Math.random() < 0.4) ? Math.random() : 0.0;
  }
  const seedTex = new THREE.DataTexture(seed, SW, SH, THREE.RGBAFormat, THREE.FloatType);
  seedTex.needsUpdate = true;

  // Blit seed
  const blitMat = new THREE.RawShaderMaterial({
    vertexShader: `#version 300 es
      in vec2 position; void main(){gl_Position=vec4(position,0,1);}`,
    fragmentShader: `#version 300 es
      precision highp float;
      uniform sampler2D u_tex; uniform vec2 u_res;
      out vec4 f;
      void main(){f=texture(u_tex,gl_FragCoord.xy/u_res);}`,
    uniforms: { u_tex:{value:seedTex}, u_res:{value:new THREE.Vector2(SW,SH)} },
  });
  const blitScene = new THREE.Scene();
  blitScene.add(new THREE.Mesh(quadGeo, blitMat));
  renderer.setRenderTarget(fbo[0]);
  renderer.render(blitScene, quadCam);

  // ── Lenia update shader ───────────────────────────────────
  // Approximate circular kernel with multiple ring samples
  const updateMat = new THREE.RawShaderMaterial({
    vertexShader: `#version 300 es
      in vec2 position; void main(){gl_Position=vec4(position,0,1);}`,
    fragmentShader: `#version 300 es
      precision highp float;
      uniform sampler2D u_state;
      uniform vec2      u_res;
      uniform float     u_mu;
      uniform float     u_sigma;
      uniform float     u_radius;
      uniform float     u_dt;
      out vec4 fragColor;

      float getCell(vec2 offset) {
        vec2 uv = fract((gl_FragCoord.xy + offset) / u_res);
        return texture(u_state, uv).r;
      }

      // Bell-curve growth function
      float growth(float u) {
        float diff = u - u_mu;
        return exp(-(diff*diff) / (2.0*u_sigma*u_sigma));
      }

      void main() {
        float me = getCell(vec2(0.0));

        // Sample circular kernel at multiple radii
        // Use a uniform ring at radius r, normalized by sample count
        float U = 0.0;
        float total_weight = 0.0;
        int R = int(u_radius);

        for (int dy = -20; dy <= 20; dy++) {
          for (int dx = -20; dx <= 20; dx++) {
            if (abs(dx) > R || abs(dy) > R) continue;
            float dist = sqrt(float(dx*dx + dy*dy));
            if (dist > u_radius) continue;

            // Kernel weight: ring function (peaks at radius/2)
            float norm_dist = dist / u_radius;
            // Smooth hat kernel
            float w = (norm_dist < 1.0)
              ? exp(-0.5 * norm_dist * norm_dist / 0.2)
              : 0.0;
            U += getCell(vec2(float(dx), float(dy))) * w;
            total_weight += w;
          }
        }
        U /= max(total_weight, 0.001);

        // Growth function: maps potential to growth rate [-1, +1]
        float G = 2.0 * growth(U) - 1.0;

        // Time step
        float next = clamp(me + u_dt * G, 0.0, 1.0);
        fragColor = vec4(next, next, next, 1.0);
      }`,
    uniforms: {
      u_state:  { value: fbo[0].texture },
      u_res:    { value: new THREE.Vector2(SW, SH) },
      u_mu:     { value: SPECIES[0].mu },
      u_sigma:  { value: SPECIES[0].sigma },
      u_radius: { value: SPECIES[0].radius },
      u_dt:     { value: SPECIES[0].dt },
    },
  });
  const updateScene = new THREE.Scene();
  updateScene.add(new THREE.Mesh(quadGeo, updateMat));

  // ── Display shader ────────────────────────────────────────
  const displayMat = new THREE.RawShaderMaterial({
    vertexShader: `#version 300 es
      in vec2 position; out vec2 v_uv;
      void main(){v_uv=position*0.5+0.5; gl_Position=vec4(position,0,1);}`,
    fragmentShader: `#version 300 es
      precision highp float;
      uniform sampler2D u_state;
      uniform float     u_time;
      uniform float     u_species_t;
      in vec2 v_uv;
      out vec4 fragColor;

      vec3 palette(float t, float phase) {
        vec3 a=vec3(0.5),b=vec3(0.5);
        vec3 c=vec3(1.0,0.7,0.4),d=vec3(0.0,0.3,0.6);
        return a+b*cos(6.28318*(c*(t+phase)+d));
      }

      void main() {
        float v = texture(u_state, v_uv).r;
        float phase = u_time * 0.03 + u_species_t * 0.7;
        vec3 col = v < 0.01
          ? vec3(0.02, 0.01, 0.03)
          : palette(v, phase) * (0.3 + v * 0.7);
        // Glow
        col += palette(v * 0.5, phase + 0.2) * v * v * 0.4;
        fragColor = vec4(col, 1.0);
      }`,
    uniforms: {
      u_state:     { value: fbo[0].texture },
      u_time:      { value: 0.0 },
      u_species_t: { value: 0.0 },
    },
  });
  const displayScene = new THREE.Scene();
  displayScene.add(new THREE.Mesh(quadGeo, displayMat));

  canvas.__lenia = {
    renderer, quadCam,
    fbo, ping, SPECIES, speciesIdx, speciesTimer,
    updateMat, updateScene,
    displayMat, displayScene,
    lastTime: 0, blitScene, blitMat, seedTex, quadGeo,
  };
}

// ── Animate ───────────────────────────────────────────────────
const s = canvas.__lenia;
const dt = Math.min((time - s.lastTime) / 1000, 0.05);
s.lastTime    = time;
s.speciesTimer += dt;

const SPECIES = s.SPECIES;

// Cycle species
if (s.speciesTimer > 20.0) {
  s.speciesTimer = 0;
  s.speciesIdx   = (s.speciesIdx + 1) % SPECIES.length;
  const sp = SPECIES[s.speciesIdx];
  s.updateMat.uniforms.u_mu.value     = sp.mu;
  s.updateMat.uniforms.u_sigma.value  = sp.sigma;
  s.updateMat.uniforms.u_radius.value = sp.radius;
  s.updateMat.uniforms.u_dt.value     = sp.dt;

  // Re-seed
  const seed2 = new Float32Array(512*512*4);
  for (let i = 0; i < 512*512; i++) {
    const x=(i%512)/512-0.5, y=Math.floor(i/512)/512-0.5;
    seed2[i*4] = (Math.sqrt(x*x+y*y)<0.25 && Math.random()<0.4) ? Math.random() : 0;
  }
  const st2 = new THREE.DataTexture(seed2,512,512,THREE.RGBAFormat,THREE.FloatType);
  st2.needsUpdate = true;
  s.blitMat.uniforms.u_tex.value = st2;
  s.renderer.setRenderTarget(s.fbo[s.ping]);
  s.renderer.render(s.blitScene, s.quadCam);
}

// CA step
const next = 1 - s.ping;
s.updateMat.uniforms.u_state.value = s.fbo[s.ping].texture;
s.renderer.setRenderTarget(s.fbo[next]);
s.renderer.render(s.updateScene, s.quadCam);
s.ping = next;

// Display
s.displayMat.uniforms.u_state.value     = s.fbo[s.ping].texture;
s.displayMat.uniforms.u_time.value      = time / 1000;
s.displayMat.uniforms.u_species_t.value = s.speciesIdx / SPECIES.length;
s.renderer.setRenderTarget(null);
s.renderer.setSize(canvas.width, canvas.height, false);
s.renderer.render(s.displayScene, s.quadCam);
