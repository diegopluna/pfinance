# Research: TanStack Charts vs recharts + shadcn for pfinance

> Researched 2026-08-06 against primary sources only (tanstack.com, github.com/TanStack, the npm
> registry API). This file lives in `docs/research/` — a new directory; the repo previously had no
> research convention (`docs/` held only `adr/`, `agents/`, and loose guides), so `docs/research/`
> is introduced here as the home for background research write-ups.

## Summary

TanStack Charts is real but extremely new: the npm packages were first published **2026-07-29**
(eight days before this research) and the docs label the current release **pre-alpha**. It is a
typed, framework-neutral grammar-of-graphics engine (SVG by default, Canvas opt-in) with a React 19
adapter, strong stated a11y defaults, and a much smaller claimed bundle than recharts. It is _not_
the older `react-charts` library, whose repo is now archived. For this repo — which already ships a
recharts line chart through shadcn's chart wrapper — the recommendation is to **stay on
recharts + shadcn** for issues #18 and #19 and revisit when TanStack Charts stabilizes.

## 1. What it is

- **Core package:** `@tanstack/charts` — "A chart grammar for TypeScript and JavaScript" (npm
  registry description). Deps are granular `d3-*` packages only (`d3-array`, `d3-geo`, `d3-scale`,
  `d3-shape`). MIT. (Source: `registry.npmjs.org/@tanstack/charts`)
- **React adapter:** `@tanstack/react-charts` — depends on `@tanstack/charts`; peer deps
  `react: ^19.0.0`, `react-dom: ^19.0.0` (React 19 only). (Source: registry metadata)
- **Repo:** <https://github.com/TanStack/charts> (monorepo; core at `packages/charts-core`, React
  adapter at `packages/react-charts`). **Docs:** <https://tanstack.com/charts/latest>.
- **Not the same as the old library.** The unscoped npm package `react-charts`
  (repo `TanStack/react-charts`) is a separate, older project: latest stable tag `2.0.0-beta.7`
  published 2020-05-29, last `beta` tag `3.0.0-beta.57` (npm `time.modified` 2023-11-02), peer dep
  `react: ^16.6.3`, and the GitHub repo is **archived** (`archived: true`, last push 2025-03-10).
  The new TanStack Charts docs and comparison page do not mention it.

## 2. Maturity (as of 2026-08-06) — observed from npm/GitHub

- npm `created`: **2026-07-29**; latest version **0.6.5** published **2026-08-05**; **16 versions
  in ~7 days** (0.0.0 → 0.6.5), i.e. rapid pre-1.0 churn. (Source: registry `time` field)
- Docs state plainly: "TanStack Charts `0.6.5` is a pre-alpha release. Its API may change between
  releases" and it is not ready for production use.
  (Source: <https://tanstack.com/charts/latest/docs/overview>)
- The quick-start already contains a migration note for a renamed tooltip import — evidence of
  in-flight API breakage. (Source: React quick-start page)
- GitHub repo created 2026-07-28; 324 stars; 7 open issues; active (pushed 2026-08-05); GitHub
  releases exist for each v0.6.x. Too young for meaningful maintenance-signal judgment.

## 3. API model

- **Grammar-of-graphics, not component-per-chart-type:** you build a typed chart _definition_
  (`defineChart`, marks like `barY`, scales like `scaleLinear`/`scaleBand`) and the engine compiles
  it into a "renderer-neutral keyed scene". (Sources: npm description; React quick-start)
- **Not headless:** it renders "accessible SVG by default, with Canvas available as an opt-in
  surface"; the React adapter exposes a `<Chart>` component. Server rendering is supported with
  browser-side adoption of the markup. (Source: docs overview / quick-start)
- **Adapters:** React, Preact, Vue, Solid, Svelte, Angular, Lit, Alpine, Octane, plus an
  experimental React Native adapter. React adapter requires React 19 (observed peer dep).
- **TypeScript:** typed grammar with inference over field names, datum types, and scales — no
  casts, per docs overview.
- **Theming:** "Light and dark mode defaults based on inherited color and CSS variables" — CSS-
  variable driven, so Tailwind v4 / shadcn token wiring is plausible but there is no shadcn
  integration; wrapper glue (the equivalent of shadcn's `ChartContainer`) would be hand-rolled.

## 4. Bundle size

- Docs' own claims: a compact React line consumer is **16.48 KiB gzip**; the framework-neutral
  scene is **8.12 KiB**. The comparison page lists TanStack Charts at **34.03–39.56 KiB** vs
  recharts **153.08–168.27 KiB** (94.96–109.96 KiB with React externalized). These are the
  project's _self-reported_ numbers — treat as estimates, not independently verified.
  (Sources: docs overview; <https://tanstack.com/charts/latest/docs/comparison>)
- Observed npm `unpackedSize`: `@tanstack/charts` 1,241,079 bytes (includes types/sourcemaps);
  `@tanstack/react-charts` 23,465 bytes; recharts 3.10.1 is 7,452,998 bytes unpacked.
- Bundlephobia figures: unverified (not checked against a primary source).

## 5. Accessibility

Documented (docs overview + concepts pages; depth not independently tested):

- Accessible SVG output by default; keyboard focus is enabled by default when an `ariaLabel` is
  supplied; chart definitions include a keyboard policy and spatial indexing; grouped focus,
  selection callbacks, and native tooltips are documented under "Focus and interaction".
- This is a stronger _stated_ a11y posture than recharts, but at pre-alpha it is a promise, not a
  track record. Specific ARIA patterns used: unverified.

## 6. Fit for this repo

Repo context: React 19 + Vite + Tailwind v4 + shadcn (base-luma), pnpm catalog pins
`recharts: ^3.10.1` (`pnpm-workspace.yaml`; consumed in `apps/web/package.json`). Net-worth
monthly line chart is already shipped on recharts via shadcn's chart wrapper. Upcoming: #18
spending-by-category (pie/bar), #19 income-vs-expense (grouped/stacked bars).

| Dimension        | recharts 3.10.1 + shadcn                          | TanStack Charts 0.6.5                                               |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| Stability        | Stable, 3.x line, latest 2026-07-25               | Pre-alpha; API churn within days                                    |
| React 19         | Supported (peer `^16.8‖17‖18‖19`)                 | Required (`^19.0.0`) — fine here                                    |
| Needs of #18/#19 | Pie, bar, grouped/stacked bars all first-class    | Marks exist (`barY` etc.); pie/stacked coverage at 0.6.x unverified |
| Theming          | shadcn `ChartContainer` already maps chart tokens | CSS-variable based, but no shadcn wrapper — custom glue             |
| Bundle           | Large (self-reported ~95–168 KiB)                 | Small (self-reported ~16–40 KiB)                                    |
| A11y             | Limited built-in keyboard support                 | Keyboard focus + ARIA by default (documented, untested)             |
| Migration cost   | Zero — already shipped                            | Rewrite shipped chart + build theming layer, on a moving API        |

## Recommendation

**Stay on recharts + shadcn now.** Build #18 and #19 on the existing recharts/`ChartContainer`
stack. TanStack Charts is eight days old and self-labeled pre-alpha with explicit API-breakage
warnings; adopting it would trade a shipped, themed, working chart stack for rewrite work on an
unstable base, with no shadcn integration to lean on.

**Revisit triggers** (any of):

1. TanStack Charts reaches **beta or 1.0** with a stated stability guarantee (watch
   <https://github.com/TanStack/charts/releases>).
2. **shadcn/ui ships a chart wrapper** targeting TanStack Charts (or drops recharts), which would
   remove the theming-glue cost.
3. Recharts bundle size becomes a **measured** problem for `apps/web` (verify with a build
   analysis before acting), or a needed chart requires Canvas/large-data rendering recharts
   can't do.
4. A concrete **accessibility requirement** (keyboard-navigable data points) that recharts cannot
   meet — TanStack's documented keyboard model would then justify a spike.
