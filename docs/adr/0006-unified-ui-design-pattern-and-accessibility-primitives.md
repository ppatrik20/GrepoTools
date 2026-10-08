# Unified UI Design Pattern, Core Web Vitals Optimization, and Accessibility Primitives

## Context
As the tactical toolkit expanded across world maps, recall snipers, city specialization planners, battle report archivers, and team administration, user interface patterns became fragmented:
1. Components hand-rolled inconsistent button styles, hardcoded colors, disparate elevation cards, and arbitrary paddings.
2. Modals (`DeepDiveModal`, `IslandModal`, `TacticalPinModal`, etc.) duplicated backdrop markup, lacked accessible dialog properties (`role="dialog"`, `aria-modal="true"`, focus trapping, light-dismiss, body scroll lock), and risked conflicting event listeners.
3. The top navigation bar lacked responsive drawer navigation, breaking usability on viewports below 1024px.
4. Typography loading relied on render-blocking `@import url(...)` in `globals.css`, introducing sequential network waterfalls that degraded Largest Contentful Paint (LCP).
5. Audio feedback in the recall sniper held unclosed Web Audio `AudioContext` references and accumulated unbounded chirp identifiers over long-running sessions, causing memory leaks.

## Decision
We establish a clean, modular tactical design pattern:
1. **Design System Primitives (`src/components/ui/`)**:
   - `Button`: Standardized variants (`primary`, `secondary`, `tactical`, `emerald`, `danger`, `ghost`, `outline`), size tiers, accessible focus rings, and built-in loading spinners.
   - `Card` & `StatCard`: Glassmorphic tactical surfaces with customizable hover elevations and dedicated KPI stat tiles.
   - `Modal`: Accessible dialog primitive with light-dismiss, ESC dismissal, body scroll-locking, and clean entry transitions.
   - `Badge`: Semantic tactical status indicators with dot pulses and monospace styling options.
   - `Input`, `Select`, `FormField`: Standardized form controls with unified focus rings and validation states.
   - `PageHeader`: Standardized hero header with world/player badges, icon branding, and action slots.
   - `Skeleton` & `EmptyState`: Shimmer loading states and consistent fallback messaging.
2. **Core Web Vitals & LCP Optimization**:
   - Replaced render-blocking CSS font imports with Next.js 16 native `next/font/google` (`Outfit` and `JetBrains_Mono`), self-hosting font binaries at build time with `display: swap`.
   - Replaced rigid container padding with responsive clamp media queries (`px-4 sm:px-6 lg:px-8`).
3. **Memory Leak Rectification**:
   - Ensured proper Web Audio API `AudioContext.close()` lifecycle cleanup on component unmount in `src/app/snipe/recall/page.js`.
   - Enforced bounded pruning on the chirp deduplication cache.
4. **Responsive Navigation**:
   - Added a responsive mobile drawer with backdrop overlay to `src/components/Navigation.js`, ensuring full access to all tactical modules on mobile and tablet devices.

## Consequences
- Single source of truth for all UI atoms and compounds.
- 100% adherence to modern web standards, WCAG dialog accessibility, and Core Web Vitals.
- Comprehensive test coverage guarded by `tests/unit/ui_primitives.test.js`.
