# Cellular automata kernels (pseudocode)

Language-agnostic sketches of how to implement core cellular automata families.
These are written so an LLM or codegen system can easily translate them into GLSL/HLSL/JS/Python/etc.

## Data model

We assume:
- A discrete grid `grid[x, y]` (for 2D) or `grid[i]` (for 1D).
- Finite states represented as small integers (0, 1, 2, ...).
- Two buffers or textures: `state_curr` (read-only this step) and `state_next` (write-only this step).
- Synchronous updates: all cells read from `state_curr` and write to `state_next`, then swap.

### Boundary conditions

Common options:
- Wrap (toroidal): indices outside the grid wrap around.
- Clamp: indices outside are clamped to the edge.
- Fixed: outside cells are treated as a fixed state (often 0).

In shader contexts, wrap = tiling textures; clamp/fixed = border behaviors.

## Generic 2D CA kernel (Moore neighborhood)

```pseudo
for each cell (x, y):
  sum_neighbors = 0
  for dy in [-1, 0, 1]:
    for dx in [-1, 0, 1]:
      if dx == 0 and dy == 0:
        continue
      nx = wrap_or_clamp(x + dx)
      ny = wrap_or_clamp(y + dy)
      sum_neighbors += state_curr[nx, ny]

  current = state_curr[x, y]
  next = transition_rule(current, sum_neighbors)
  state_next[x, y] = next
```

Here `transition_rule` is a function or lookup that encodes the specific CA rule (Life-like, etc.).

## Conway's Game of Life (B3/S23)

```pseudo
function transition_rule(current, sum_neighbors):
  if current == 1:
    if sum_neighbors == 2 or sum_neighbors == 3:
      return 1  # survive
    else:
      return 0  # death by isolation or overcrowding
  else:  # current == 0
    if sum_neighbors == 3:
      return 1  # birth
    else:
      return 0
```

## Life-like rule using B/S strings

Represent a rule as two sets:
- `birth = { ... }` neighbor counts that cause birth when `current == 0`.
- `survive = { ... }` neighbor counts that allow a live cell to survive.

```pseudo
function transition_rule(current, sum_neighbors, birth_set, survive_set):
  if current == 1:
    if sum_neighbors in survive_set:
      return 1
    else:
      return 0
  else:
    if sum_neighbors in birth_set:
      return 1
    else:
      return 0
```

Examples:
- Life: `birth = {3}`, `survive = {2, 3}` (B3/S23).
- HighLife: `birth = {3, 6}`, `survive = {2, 3}` (B36/S23).
- Seeds: `birth = {2}`, `survive = {}` (B2/S).

## Elementary 1D CA (Wolfram rules)

We work on a 1D array `state_curr[i]` of 0/1 cells and a radius-1 neighborhood.
Each cell's next state depends on `(left, center, right)`.

### Encoding the rule

For a given Wolfram rule number R (0–255), precompute an 8-bit binary mask.
The neighborhood `(left, center, right)` can be mapped to an index 0–7.

```pseudo
# neighborhood bits are ordered 111, 110, 101, 100, 011, 010, 001, 000
# index = 7 - (left*4 + center*2 + right)

function apply_elementary_rule(R, state_curr):
  rule_bits = to_8bit_binary(R)  # array[8] of 0/1

  for each index i:
    left  = state_curr[i - 1 wrapped]
    center = state_curr[i]
    right = state_curr[i + 1 wrapped]

    pattern_index = 7 - (left*4 + center*2 + right)
    next_value = rule_bits[pattern_index]

    state_next[i] = next_value
```

For Rule 30, `R = 30` and the binary pattern is `00011110` (from 111 to 000).

## Shader-oriented notes

### Texture-based implementation (fragment shader)

- Store the CA state in a 2D texture `state_tex`.
- Render a full-screen quad; in the fragment shader, sample neighbors as offsets from the current UV.
- Write the next state into a framebuffer/texture `state_next_tex`.
- Swap textures between frames (ping-pong).

```pseudo
// fragment shader pseudocode
uniform sampler2D state_tex;
uniform vec2 texel_size;  // (1.0/width, 1.0/height)

vec2 offsets[8] = {
  (-1, -1), (0, -1), (1, -1),
  (-1,  0),           (1,  0),
  (-1,  1), (0,  1), (1,  1)
};

void main() {
  vec2 uv = gl_FragCoord.xy * texel_size;

  float current = texture(state_tex, uv).r;  // assume 0 or 1 stored in red
  int sum_neighbors = 0;
  for each o in offsets:
    vec2 neighbor_uv = uv + o * texel_size;  // wrap or clamp as needed
    float v = texture(state_tex, neighbor_uv).r;
    sum_neighbors += int(round(v));

  float next_state = life_transition(current, sum_neighbors);

  // Map state to color or keep as mask
  vec3 color = vec3(next_state);
  fragColor = vec4(color, 1.0);
}
```

`life_transition` implements the Life-like rule in shader-friendly form.

### Mapping state to visuals

- Use the raw state as a mask to mix two or more textures.
- Use multiple bits or channels to encode additional properties (age, velocity, type) and map them to color, emission, distortion, etc.
- Combine CA with feedback: use previous frame's rendered color as an input along with the state texture.

## Notes for LLM / agent usage

- Prefer small, explicit functions (`transition_rule`, `apply_elementary_rule`) that can be re-targeted to different languages.
- Keep neighbor sampling logic separate from rule logic so you can swap rules without changing grid plumbing.
- Always mention boundary conditions in generated code to avoid undefined behavior at edges.
