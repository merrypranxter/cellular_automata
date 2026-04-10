# cellular_automata

Context and reference material on cellular automata for vibecoded shader/code art and generative systems.

## Purpose

This repo is a knowledge pack rather than a finished app. It gives your agents and tools enough mathematical, scientific, and visual context to treat cellular automata as a design primitive. You can plug it into larger systems to synthesize prompts, shaders, textures, and procedural structures that are grounded in how cellular automata actually work.

## What is a cellular automaton?

A cellular automaton (CA) is a discrete dynamical system built on a regular grid of cells. Each cell stores a value from a finite set of states (for example, 0/1, a small set of integers, or a small palette of symbols). Time advances in discrete steps, and at each step every cell is updated simultaneously according to a local rule that only looks at that cell and its neighbors.

Key ideas:
- Space is a lattice of cells (1D line, 2D grid, 3D volume, or more exotic topologies).
- Time is discrete; updates happen in generations.
- States come from a finite alphabet (binary, multi‑state, etc.).
- A neighborhood (like von Neumann or Moore) selects which nearby cells influence a given cell.
- A local transition rule maps neighborhood states to the next state of the center cell.

## Classic examples

### Elementary cellular automata (1D)

- 1D lattice of cells with two states (0/1).
- Neighborhood is the cell plus its immediate left and right neighbors (radius 1).
- The rule is a lookup table from 3‑bit patterns to a single output bit, usually encoded as a Wolfram rule number from 0–255.
- Certain rules are iconic:
  - Rule 30: produces chaotic, seemingly random triangular patterns from simple initial conditions.
  - Rule 110: known to be capable of universal computation, making it one of the simplest systems that can emulate any computation in principle.

These 1D rules are great for line‑based textures, scanline‑driven shaders, and time‑evolving stripes.

### Conway’s Game of Life (2D)

- 2D grid where each cell is alive or dead.
- Moore neighborhood: the 8 surrounding cells.
- Standard Life rule is often written as B3/S23:
  - Birth (B3): a dead cell becomes alive if it has exactly 3 live neighbors.
  - Survival (S23): a live cell stays alive if it has 2 or 3 live neighbors; otherwise it dies.

From these rules emerge classic motifs like still lifes, oscillators, gliders, and glider guns. These make strong visual metaphors for growth, decay, and self‑organization.

## Mathematical model (informal)

A cellular automaton can be summarized as a tuple (G, E, N, f):
- G: the grid or lattice of cells (their positions in 1D/2D/3D, with chosen boundary conditions).
- E: the finite set of possible cell states.
- N: the neighborhood function that, for each cell, selects which surrounding cells are sampled.
- f: the local update rule, a function mapping the neighborhood’s current states to the next state of the center cell.

Iterating f across G produces a global evolution: a sequence of configurations that can show order, randomness, or something in between.

## Visual and artistic directions

A few core strategies for turning cellular automata into visuals:

- State → color or glyph
  - Map each state to colors, gradients, glyphs, or character sets (for ASCII art, shader‑driven type, etc.).
  - Use multi‑channel states (e.g., RGBA, or small integers packed into bits) to drive layered visual properties like color, brightness, displacement, or distortion.

- CA as texture / heightfield
  - Treat the CA grid as a texture sampled in a fragment shader.
  - Use the evolving pattern as a heightfield, normal map, mask, or mixing weight between materials, palettes, or feedback buffers.

- Time as a design axis
  - Render single generations as static compositions, or accumulate multiple generations into trails, motion blur, or feedback loops.
  - Slice through spacetime (e.g., draw 1D CA over time as a 2D image, or 2D CA over time as a 3D volume or scroll texture).

- Rule exploration
  - Treat rule space (e.g., the 0–255 elementary rules, or Life‑like B/S rules) as a parameter space for vibe: calm vs chaotic, crystalline vs noisy, stable vs explosive.
  - Interpolate, randomize, or modulate rules over time to morph between behaviors.

- Hybrids and extensions
  - Combine CA with noise fields, reaction‑diffusion systems, or shader feedback for richer organic dynamics.
  - Use stochastic rules (probabilistic births/deaths) for grainy, filmic, or glitchy textures.

## Next steps for this repo

This initial version focuses on conceptual scaffolding. Future additions can include:
- A rule catalog with tags like "chaotic", "crystalline", "edge‑of‑chaos", and visual exemplars.
- Language‑agnostic pseudocode and shader‑friendly formulations.
- Prompts/snippets designed for LLMs and creative agents to synthesize concrete implementations (GLSL, HLSL, JS, Python, etc.).

For now, you can treat this repo as a cellular‑automata primer wired for generative art and shader‑based experimentation.
