# Prompts and API context for cellular automata

This file gives example prompt fragments and schemas so vibecoded agents know how to talk about and implement cellular automata.
You can treat these as building blocks for system prompts or tool specs.

## High-level system prompt fragment

> You have access to a knowledge pack about cellular automata.
> A cellular automaton is a discrete grid of cells, each with a state from a finite set.
> Time advances in steps; at each step, every cell updates simultaneously based on its current state and the states of its neighbors, according to a local transition rule.
> Use this to design, analyze, or implement cellular automata that are visually interesting and mathematically consistent.

## Design-intent prompt examples

### Pick a rule by vibe

> Given the `rules.json` catalog, choose a rule whose `behavior_tags` best match the requested vibe.
> For example, `chaotic` + `explosive` might map to the Seeds rule, while `labyrinthine` + `crystalline` might map to Maze.
> Explain briefly why the chosen rule fits the vibe.

### Map CA state to visuals

> Design a visual mapping from CA states to shader outputs.
> Use the CA state as a mask, palette index, or displacement factor.
> Preserve the underlying dynamics of the rule while emphasizing the requested mood (e.g., organic, mechanical, glitchy, cosmic).

### Explore rule space

> Suggest a small set of candidate rules (by id or B/S code) that span calm → edge_of_chaos → chaotic behaviors.
> For each one, include `family`, `code`, and a short visual description based on `visual_notes`.

## Tool/agent schema hints

You can describe a CA rule to tools with a compact JSON schema like:

```json
{
  "id": "life_b3s23",
  "family": "lifelike",
  "dimension": 2,
  "states": 2,
  "neighborhood": {
    "type": "moore",
    "range": 1
  },
  "code": {
    "lifelike": "B3/S23"
  }
}
```

For elementary rules:

```json
{
  "id": "elem_30",
  "family": "elementary",
  "dimension": 1,
  "states": 2,
  "neighborhood": {
    "type": "radius",
    "radius": 1
  },
  "code": {
    "wolfram": 30
  }
}
```

Agents can then combine these with the generic kernels in `kernels.md` to synthesize concrete implementations.

## Implementation-oriented prompts

### Generate a Life-like shader kernel

> Using the Life-like rule definition (B/S notation) and the generic 2D CA pseudocode, write a fragment shader that updates a CA stored in a 2D texture.
> Use ping-pong textures for `state_curr` and `state_next`.
> Implement the rule via `birth` and `survive` sets.
> Make boundary conditions explicit (wrap or clamp).

### Generate a 1D elementary CA update function

> Write a function that applies Wolfram elementary rule R to a 1D array of 0/1 states.
> Follow the index mapping from `(left, center, right)` to the 8-bit rule table.
> Include a short comment showing the binary pattern for the chosen rule.

### Map CA evolution to an animation

> Given an existing CA implementation, propose ways to turn its evolution into an animation:
> - color mapping
> - motion trails
> - layering with noise or feedback
> - time-based modulation of rule parameters (if allowed)

## Safety/constraints hints

- When generating code, avoid unbounded memory growth; keep grids finite and clearly sized.
- Make explicit whether the rule is deterministic or uses randomness (e.g., stochastic variants).
- Avoid implying that these visual systems simulate real-world physics unless specified (they are abstract dynamical systems).
