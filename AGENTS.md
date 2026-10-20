# AGENTS.md

Guidance for coding agents working in this repository.

## What this project is

**四时之屋 / House of Seasons v2** — a Vite + TypeScript + Three.js 3D scene: a house with interior lights, driven by **continuous time of day (0–24h slider) × 4 seasons × 4 weather states** (晴/多云/雨/雪). All visual parameters flow from one data-driven pipeline.

## Project layout

```
index.html            # Vite entry: HUD skeleton + <script type="module" src="/src/main.ts">
package.json          # deps pinned exactly (no ^/~): three 0.160.0, vite 5.4.10, typescript 5.6.3, vitest 2.1.4
vite.config.ts        # base './' (relative paths, IGA Pages static-hosting safe)
tsconfig.json         # strict: true
eslint.config.js      # flat config + typescript-eslint
src/
  main.ts             # assembly: renderer/composer/systems/loop wiring
  config.ts           # all tunable constants (no magic numbers elsewhere)
  types.ts            # Season/Weather/TimeState/SceneParams/track types
  data/seasons.ts     # per-season keyframe tracks (visual truth for time-of-day)
  data/weather.ts     # weather modifier table + season→particle map
  core/               # PURE functions, unit-testable: state.ts resolve/lerp, interpolate.ts track sampling, solar.ts sun geometry + lampLevel, loop.ts rAF + adaptive DPR
  systems/            # side-effectful scene systems, each with apply(params): textures, sky (Sky+PMREM), sun, interior, house, vegetation, environment (ground/snow/fog/exposure/bloom), particles (5 modes), weather (clouds), camera (sweep/tour)
  ui/hud.ts           # slider/tabs/tour/readout bindings
  ui/style.css
tests/                # vitest: solar / interpolate / lamp
docs/项目方案.md      # design doc + v2 implementation record
```

## Running / developing

```bash
npm install
npm run dev       # vite dev server
npm run test      # vitest run (pure functions must stay green)
npm run lint      # eslint, 0 errors required
npm run build     # tsc --noEmit && vite build → dist/
npm run preview   # serve dist/
```

Deploy: `iga login` then `iga pages deploy` (IGA auto-detects Vite). Three.js is bundled — zero runtime CDN.

## Architecture rules (read before editing)

- **Single source of visual truth**: `data/seasons.ts` tracks + `data/weather.ts` modifiers. Systems only read interpolated `SceneParams`; never hardcode visual values in systems.
- **Adding a visual parameter**: add to `SceneParams` (types.ts) → add track column in `seasons.ts` (4 anchors per season: night/dawn/noon/dusk; night is auto-reused at h=24) → if numeric add to `NumKey` list in `state.ts` → write it in the owning system's `apply()`.
- **Derived values** (lamp, snow, ffGlow, particle mode) are computed in `core/state.ts` from `TimeState`, never stored in tracks.
- **core/ stays pure**: no THREE scene objects (THREE.Color math is allowed); DOM/WebGL only in `systems/`, `ui/`, `main.ts`.
- **Zero allocation in the frame loop**: reuse scratch `Vector3`/`Color`/`Spherical`; `resolveParams`/`lerpParams` write into preallocated objects.
- **Env-map re-bake** is dirty-flag driven (sun geometry or rayleigh actually changed) and throttled to `ENV_INTERVAL` — keep it that way.

## Conventions

- 2-space indent, single quotes, no semicolons; comments in Chinese, technical terms in English.
- TypeScript strict, no `any`; public functions get JSDoc (功能/参数/返回).
- Version pins are exact — do not introduce `^`/`~`.
- All textures are procedural (`systems/textures.ts`, Canvas-generated). No external image/model assets.

## Things to avoid

- No new frameworks (React/Vue) or state libs — vanilla TS + three is deliberate.
- No per-frame allocations, no per-frame DOM writes (HUD refresh only on interaction).
- Do not bypass `resolveParams` by mutating scene objects directly from UI code.
- Do not commit secrets or machine-specific paths; `.iga/`, `dist/`, `node_modules/` are gitignored.
