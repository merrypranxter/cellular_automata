# GLSL Implementation Guide for Cellular Automata

Cellular automata on the GPU need a different mental model than CPU implementations. The key constraint: **you cannot write to a texture while reading from it**. Every CA step needs two textures — one you read, one you write — then swap. This is called ping-pong buffering.

---

## Core Architecture: Ping-Pong FBOs

```javascript
// Setup: two WebGL render targets
const fbo = [
  new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType }),
  new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType }),
];
let ping = 0;

// Each frame:
function step() {
  const next = 1 - ping;
  updateShader.uniforms.u_state.value = fbo[ping].texture;  // read from current
  renderer.setRenderTarget(fbo[next]);                       // write to other
  renderer.render(updateScene, quadCam);
  ping = next;                                               // swap
}
```

The update shader reads the current state texture and writes a new state. The display shader reads the latest state and renders to screen.

---

## State Encoding in Textures

### Binary CA (Game of Life)
Store alive=1.0, dead=0.0 in the RED channel. Float texture (`THREE.FloatType`) allows exact storage.

```glsl
// In update shader
float me = texture(u_state, uv).r;  // 0.0 or 1.0
```

### Multi-state CA (Brian's Brain: 3 states)
Map states to discrete float values:
- OFF → 0.0
- FIRING → 0.5  
- REFRACTORY → 1.0

```glsl
float me = texture(u_state, uv).r;
bool isFiring    = abs(me - 0.5) < 0.1;
bool isRefractory = abs(me - 1.0) < 0.1;
bool isOff        = me < 0.1;
```

### Continuous CA (Lenia)
Store state as a float in [0, 1] directly. No quantization.

```glsl
float state = texture(u_state, uv).r;  // 0.0 to 1.0 continuous
```

### Multiple channels
Use RGBA channels for multi-channel CA or to track history:
- `.r` = current state
- `.g` = age (consecutive frames alive)
- `.b` = previous state (for transition detection)
- `.a` = auxiliary data

---

## Neighborhood Sampling

### Moore Neighborhood (8 neighbors, square)
```glsl
float getCell(vec2 offset) {
  // fract() = toroidal wrapping
  vec2 uv = fract((gl_FragCoord.xy + offset) / u_res);
  return texture(u_state, uv).r;
}

// Count live Moore neighbors
float count = 0.0;
for (int dy = -1; dy <= 1; dy++)
  for (int dx = -1; dx <= 1; dx++)
    if (dx != 0 || dy != 0)
      count += getCell(vec2(float(dx), float(dy)));
```

### Von Neumann Neighborhood (4 neighbors, cross)
```glsl
float n = getCell(vec2( 0, 1));
float s = getCell(vec2( 0,-1));
float e = getCell(vec2( 1, 0));
float w = getCell(vec2(-1, 0));
float count = n + s + e + w;
```

### Circular Neighborhood (Lenia)
Sample a disk of radius R with weighted averaging:
```glsl
float U = 0.0, totalW = 0.0;
int R = 13;
for (int dy = -R; dy <= R; dy++) {
  for (int dx = -R; dx <= R; dx++) {
    float dist = sqrt(float(dx*dx + dy*dy));
    if (dist > float(R)) continue;
    float w = exp(-dist * dist / (2.0 * float(R) * 0.3));  // Gaussian weight
    U += getCell(vec2(float(dx), float(dy))) * w;
    totalW += w;
  }
}
U /= totalW;
```

---

## Life-like Rule Encoding

Life-like rules are specified as `B{birth_neighbors}/S{survive_neighbors}`.
Encode birth/survive as integer bitmasks for efficient GLSL lookup:

```javascript
// JavaScript: encode rule "B3/S23" as bitmasks
function encodeBitmask(arr) {
  return arr.reduce((mask, n) => mask | (1 << n), 0);
}
const birth   = encodeBitmask([3]);     // bit 3 set
const survive = encodeBitmask([2, 3]);  // bits 2 and 3 set
```

```glsl
// GLSL: check if count is in birth/survive set
uniform int u_birth;
uniform int u_survive;

bool isBirth   = (u_birth   & (1 << int(count))) != 0;
bool isSurvive = (u_survive & (1 << int(count))) != 0;

float next = (alive > 0.5)
  ? (isSurvive ? 1.0 : 0.0)
  : (isBirth   ? 1.0 : 0.0);
```

---

## Coloring Strategies

### Simple alive/dead binary color
```glsl
vec3 col = alive > 0.5 ? vec3(0.0, 0.9, 0.4) : vec3(0.02, 0.01, 0.03);
```

### Age-based coloring (track in green channel)
```glsl
// In update pass: accumulate age in .g channel
float new_age = alive > 0.5 ? min(prev_age + 0.02, 1.0) : prev_age * 0.9;

// In display: use age for hue shift
float hue = alive * 120.0 + age * 60.0;  // green → yellow → orange
```

### Birth/death flash coloring
```glsl
// Track transitions: prev state in .b channel
float prev  = texture(u_state, uv).b;
float birth = (prev < 0.5 && next > 0.5) ? 1.0 : 0.0;  // just born = flash
float death = (prev > 0.5 && next < 0.5) ? 1.0 : 0.0;  // just died = ember

vec3 col = alive > 0.5
  ? mix(alive_color, birth_flash_color, birth * 0.7)
  : mix(dead_color, death_ember_color, death * 0.4);
```

### Cyclic CA spectral coloring
```glsl
// For N-state cyclic CA, map state index to hue
float hue = state_normalized * 360.0;  // full spectrum per cycle
// Use HSV → RGB conversion or cosine palette
```

---

## Performance Tips

### Steps per frame
Running multiple CA steps per visual frame speeds up the simulation:
```javascript
const STEPS_PER_FRAME = 3;
for (let i = 0; i < STEPS_PER_FRAME; i++) {
  runCaStep();
}
```

### Simulation resolution vs display resolution
The CA grid doesn't need to match screen resolution. A 512×512 CA grid displayed on a 1920×1080 screen with `NEAREST` filtering gives crisp pixel cells. Use `LINEAR` for smoother appearance.

### Reduced-precision state
For binary CA, you can store state in the 8-bit RGBA texture (no float needed), which uses 4× less GPU memory and often runs faster:
```javascript
{ type: THREE.UnsignedByteType }
// In shader: state is 0 or 255, normalize to 0.0/1.0
float me = texture(u_state, uv).r;  // already 0..1
```

### Re-seeding
When switching rules or creating fresh starts, use the blit pattern:
```javascript
const data = new Float32Array(W * H * 4);
// Fill with initial state...
const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
tex.needsUpdate = true;
// Blit to FBO using a copy shader
```

---

## Common Bugs

**Reading and writing the same texture**: Always check that your update shader reads from `fbo[ping]` and writes to `fbo[1-ping]`. Never bind the same texture as both input and output.

**Texture coordinate wrapping**: For toroidal CA, use `fract(uv)` to wrap at edges. Without this, cells at the border have truncated neighborhoods.

**Float precision**: For multi-state CA using quantized float values (0.0, 0.5, 1.0), use a tolerance when comparing: `abs(state - 0.5) < 0.1` not `state == 0.5`.

**Rule cycling with `1 << n` in GLSL**: GLSL ES 3.0 supports bitwise ops but `1 << n` where `n` is a runtime int may behave differently across drivers. Test with explicit comparisons if you see glitches.
