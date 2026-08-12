# Changelog

All notable changes to Absolute Sudoku are documented here. The entries are
organized by application version and describe user-visible behavior together
with the relevant implementation details.

## Release policy

- Application versions follow Semantic Versioning (`MAJOR.MINOR.PATCH`).
- `package.json` and `package-lock.json` are the source of truth for the
  application version.
- Every versioned change must update this file with the affected product area,
  technical behavior, and compatibility implications.
- `GENERATOR_VERSION` must increase whenever deterministic puzzle generation or
  its seed namespace changes. The value is embedded in generated-game and
  daily-challenge seeds and in puzzle fingerprints.
- `EVENT_LOG_VERSION` identifies the replayable action-log format.
  `STORAGE_SCHEMA_VERSION` identifies the persisted session envelope. Any
  incompatible change to either format requires a schema increment and an
  explicit migration note.

## [0.2.0] - 2026-08-12

### Added

- Added a post-game analysis screen in `src/ui/Analysis.tsx` with:
  - a read-only board replay;
  - a timeline range control;
  - previous/next navigation;
  - human-readable action labels;
  - the hardest logical technique, logical step count, elapsed time, and hint
    usage summary.
- Added application-level event-log integration. New and imported games create
  a versioned `GameEventLog`; gameplay actions are recorded with sequence
  numbers and timestamps and can be replayed through the existing reducer.
- Added modal accessibility behavior for pause and completion overlays:
  `role="dialog"`, `aria-modal`, initial focus, focus trapping, inert sibling
  content, Escape dismissal, and focus restoration.
- Added the “Rever partida” completion action when a valid event log is
  available.
- Added support for read-only Sudoku boards so replay screens cannot mutate
  game state.
- Added logical analyzer techniques:
  hidden pairs, naked/hidden triples, naked/hidden quads, Skyscraper,
  Swordfish, XY-Wing, and Jellyfish.

### Changed

#### Human solver and hints

- Extended `LogicalTechnique`, scoring, and rank tables to cover the new
  techniques.
- Expanded the deterministic technique search order while preserving the
  explainable, non-branching solver contract.
- Updated hint labels and advanced-hint generation to support every elimination
  technique instead of only the earlier subset of locked candidates, pairs, and
  X-Wing.
- Added `hint/update` to the game reducer so intermediate hint phases are
  dispatched and therefore included in the event log and persistence flow.

#### Puzzle generation and difficulty calibration

- Replaced clue-density-only selection with measured human-solve calibration.
  A candidate is accepted only when it has exactly one solution, is solved by
  the logical analyzer, remains rotationally symmetric, and falls inside its
  difficulty profile's clue and technique-rank ranges.
- Added deterministic candidate scoring based on technique distance, clue
  distance, logical work distance, and attempt order.
- Increased the deterministic candidate pool per difficulty and stop generation
  after enough preferred candidates have been found.
- Published the current generation profiles:

  | Difficulty | Clue range | Logical rank range | Target rank | Attempts |
  | --- | ---: | ---: | ---: | ---: |
  | `relaxed` | 44–49 | 1–1 | 1 | 4 |
  | `focused` | 37–43 | 1–3 | 2 | 12 |
  | `challenging` | 30–45 | 3–5 | 3 | 56 |
  | `expert` | 26–42 | 5–6 | 6 | 56 |
  | `master` | 22–40 | 6–8 | 7 | 64 |

- Bumped `GENERATOR_VERSION` to `3`. Free-game seeds now use the `v2:g3`
  namespace, daily seeds use `v2:g3`, and puzzle fingerprints include `v3`.
  Identical semantic inputs can therefore produce different puzzles than the
  previous generator namespace while remaining deterministic within version 3.
- Updated difficulty descriptions to match the measured technique families.

#### Game state and persistence

- Reworked app dispatch to support batches of actions, event recording, and
  synchronized React/ref state without losing action order.
- Debounced active-session persistence by 180 ms and added persistence flushes
  on `visibilitychange` and `pagehide`.
- Serialized active-session writes through a queue so rapid actions cannot
  complete IndexedDB writes out of order.
- Preserved the pre-restart snapshot in undo/redo history when restarting a
  puzzle.
- Kept legacy state envelopes loadable; sessions without a valid event log are
  still migrated as game state but do not expose replay analysis.

#### Gameplay UI and accessibility

- Kept the pause control available when the timer is hidden and supplied
  status-appropriate accessible labels.
- Moved the pause overlay to a fixed top-level layer and adjusted responsive
  styling for the analysis layout and read-only cells.
- Added technique names for all newly supported logical deductions in the hint
  and completion surfaces.

#### Tests and documentation

- Extended generator tests to assert logical solvability, difficulty rank
  ranges, clue ranges, and rotational clue symmetry for every profile.
- Updated the README to describe rated generation, event-log replay, supported
  human techniques, linting, and the release-tracking workflow.

### Compatibility markers

- Application version: `0.2.0`
- `GENERATOR_VERSION`: `3`
- `EVENT_LOG_VERSION`: `1`
- `STORAGE_SCHEMA_VERSION`: `2`
- The persisted session envelope remains schema version 2 and accepts older
  direct-state/v1 shapes through `migrateSession`; the event log is optional so
  existing sessions remain recoverable without replay history.

## [0.1.0] - 2026-07-31

Initial product line and local-first Sudoku baseline. This version established
the core architecture and the feature set that preceded the replayable analysis
release:

- Classic, diagonal, and anti-knight Sudoku variants with deterministic seeds,
  exact solving, uniqueness checks, and a Web Worker generation path.
- Local IndexedDB persistence with fallback storage, migrations, statistics,
  autosave, resume, share/import, and offline PWA behavior.
- Cell, keyboard, multi-selection, corner/center notes, colors, candidates,
  undo/redo, hints, pause, timer, error policies, themes, high contrast, and
  reduced motion.
- Responsive React UI with WAI-ARIA board semantics and installable static
  assets.

### Development milestones included in the 0.1.0 line

These commits were shipped before the first versioned feature release and are
listed here so the Git history remains searchable by technical scope:

| Commit | Technical scope |
| --- | --- |
| [`d94ed97`](https://github.com/fabiomigueldp/sudoku/commit/d94ed97) | Initial application, engine, game state, UI, tests, and PWA assets. |
| [`70435e0`](https://github.com/fabiomigueldp/sudoku/commit/70435e0) | Application metadata, main-flow integration, catalog, statistics, and design/product documentation. |
| [`bdf5079`](https://github.com/fabiomigueldp/sudoku/commit/bdf5079) | Board presentation, responsive layout, and visual-system refinement. |
| [`eac4fcf`](https://github.com/fabiomigueldp/sudoku/commit/eac4fcf) | Gameplay controls, selection behavior, reducer feedback, and number-pad interaction. |
| [`65f35a6`](https://github.com/fabiomigueldp/sudoku/commit/65f35a6) | Keyboard focus hardening, modal accessibility, linting, and developer tooling. |
| [`ca87406`](https://github.com/fabiomigueldp/sudoku/commit/ca87406) | Home-screen simplification and focused action hierarchy. |
| [`449247b`](https://github.com/fabiomigueldp/sudoku/commit/449247b) | Removal of nonessential interface copy. |
| [`5f0a1de`](https://github.com/fabiomigueldp/sudoku/commit/5f0a1de) | Input-mode refinements and mobile PWA installation support. |

