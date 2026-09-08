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
  `STORAGE_SCHEMA_VERSION` identifies the persisted-data envelope. Archive,
  practice, and backup formats have independent version markers. Any
  incompatible change requires a schema increment and an explicit migration
  note.

## Unreleased

### Daily generation recovery

- Fix the September 8, 2026 diagonal/challenging daily, whose v3 seed exhausted
  all 56 search attempts without a sufficiently difficult puzzle. Exhaustion
  now uses a bounded, deterministic transformation of validated reserve grids
  covering every daily profile. Recheck logical difficulty before accepting a
  transformed board; keep the rated original as the final fallback. Uniqueness,
  variant constraints, clue ranges and rotational symmetry are preserved.
- Increment `GENERATOR_VERSION` to 4 for the new recovery behavior and generated
  identities. Retain the v3 carving stream for successful explicit seeds and
  targeted practice generation. Existing boards and replay logs need no migration.
- Resume a saved daily by calendar date and mode across generator versions,
  preserving its original grid and progress. Derive the schedule and seed from
  the same captured local date, including around midnight. Daily failures no
  longer ask the player to choose a different seed or difficulty.
- Add the exact failing-seed regression, reserve validation for every daily
  profile, a two-week calendar sweep and browser tests using the real worker
  and a daily saved before the generator upgrade.

### Added

- Offer an explicit automatic finish for the last 1–10 empty cells only when
  naked and hidden singles prove the entire remaining solution. Revalidate on
  activation, preserve existing entries and colors, count one hint, and record
  one reversible action with a named assistance moment in replay. Add undo to
  the completion screen. Existing saves and puzzle generation remain compatible.
- Update a completed attempt's statistics and archive on re-completion instead
  of counting undo/redo as another game. Preserve legacy completion identities
  during checkpoint recovery.

- Run lint, unit tests, the production build and Chromium, Firefox, WebKit
  and mobile browser regressions on GitHub pushes and pull requests. Pin
  workflow actions to commits and retain diagnostic artifacts on failure.
- Keep independent in-progress attempts with automatic saving, a lightweight
  preview index, and a restrained saved-games list accessible from home and
  the board menu. Preserve notes, colors, selection, hints, undo/redo, event
  history and active time when switching. No fixed slot limit or automatic
  eviction of older attempts.
- Resume an existing daily attempt instead of replacing it, and keep repeated
  imports independent. Completed attempts move to the archive while other
  saved games remain available through Continue.
- Reveal individual deletion through Organize, with inline confirmation,
  keyboard focus restoration, an empty state and explicit list pagination.
- Surface a warning if neither IndexedDB nor localStorage can persist progress.

### Compatibility

- Increase `STORAGE_SCHEMA_VERSION` to 4 and IndexedDB to 5. Lazily migrate the
  original active save and recovery checkpoint into independent attempts.
  Existing archives, event logs, practice data and puzzle seeds are unchanged.
- Increase `DATA_BACKUP_VERSION` to 2 to include every saved attempt. Version 1
  backups still import, with the original active game added to the saved list.
  Validate the complete collection before replacing data and reject malformed
  or duplicate attempts. IndexedDB replacement remains transactional.

### Fixed

- Start selection at pointer-down, include the starting cell in drags, and
  prevent old selections or drags started outside the board from changing
  unintended cells. Capture and finish mouse, pen and touch gestures, ignore
  secondary pointers, and tolerate small movements near cell borders.
- Keep range endpoints and keyboard focus aligned with the actual selection.
  Keyboard digits and undo/redo remain available after using input tools;
  key auto-repeat no longer toggles digits or cycles modes repeatedly, and
  Shift-number shortcuts also work when the keyboard produces punctuation.
- Keep all keypad digits available for correction, even at nine occurrences,
  and clamp remaining counts to zero.
- Respect on-demand and completion-only error display settings.
- Preserve a synchronous recovery checkpoint when hiding or closing the page,
  so a rapid reload cannot lose moves still waiting for the debounced IndexedDB
  write. Restore the newest session and clear checkpoints on data replacement.
- Restore the completed status when redoing a final move. Do not apply hints
  while paused or erase an already-correct hinted value; informational hints
  now close with an actionable acknowledgement.

### Tests

- Add browser regression tests for selection, keyboard and touch input, tools,
  hints, pause/menu isolation, error policies and session restoration.
- Add deterministic mixed-action checks across all three variants for input
  targeting, immutable givens, state immutability and event replay.
- Add save-library regression coverage for migration, independent attempts,
  checkpoint recovery, completion, fallback failures and backup round-trips;
  browser coverage includes switching, clocks, daily resumption, deletion,
  narrow-screen organization and backup restoration through Settings.
- Puzzle generation and gameplay event formats remain compatible.

## [0.5.0] - 2026-08-12

This release completes the local-first archive, focused technique practice,
and semantic post-game review milestones. It intentionally ships them as one
coherent data and learning release instead of exposing intermediate formats.

### Added

#### Permanent game archive

- Added a versioned `ArchivedGame` format that preserves every newly completed
  game, including its final state, completion metadata, replay settings, game
  kind, and event log when that log reproduces the archived board exactly.
- Added a lightweight archive index for fast activity-list loading and a full
  archive store for on-demand replay. Completed standard, daily, and practice
  games remain available without a backend.
- Extended the statistics screen with a permanent chronological archive,
  replay navigation, incremental history disclosure, mistake counts, and
  compatibility rows for legacy summary-only records.
- Added safe degradation for old or incompatible logs: the completed board is
  retained and remains reviewable even when its original timeline cannot be
  reconstructed.

#### Complete local backup lifecycle

- Added a portable, versioned JSON backup containing the active session,
  settings, statistics, completed-game archive, replay logs, and practice
  progress.
- Added deterministic payload integrity verification, strict archive/session
  migration, a restore preview, explicit replacement confirmation, and a 50 MB
  import guard.
- Added two-step local-data deletion. Backup, restore, and deletion are exposed
  as quiet inline actions in Settings rather than modal interruptions or toast
  notifications.
- Serialized all persistence mutations through one write queue so autosave,
  completion, restore, settings, and deletion cannot finish out of order.

#### Technique practice

- Added an offline practice library for ten human-solving techniques: naked
  and hidden singles, pointing and claiming locked candidates, naked and
  hidden pairs, naked triples, X-Wing, Skyscraper, and XY-Wing.
- Added deterministic technique-targeted generation in the existing Web
  Worker. Curated base seeds are validated against the logical path and then
  transformed through Sudoku-preserving symmetries and digit permutations,
  producing varied sessions without network access or compromising uniqueness.
- Added separate practice progress with session count, clean completions, and
  median time per technique. Practice sessions are archived but do not distort
  normal solve statistics.
- Added practice context to Home, the game header, completion, archive rows,
  and post-game analysis.

#### Semantic post-game review

- Replaced state-only replay inspection with a frame model that classifies
  value entries, candidate work, colors, assistance, revision, incorrect
  values, valid alternative paths, and moves matching the logical solver.
- Added per-step board deltas, logical-pattern overlays, short explanations,
  an important-moment navigator, mistake totals, and static final-state review
  for games without a compatible log.
- Stored the candidate-removal setting on digit events so replay remains exact
  if the player changes that preference during a game.

### Changed

- Upgraded persisted storage to schema 3 and IndexedDB layout 4 with dedicated
  `archives`, `archiveIndex`, and `practice` stores. Existing sessions,
  settings, and statistics migrate lazily and remain readable.
- Completion writes now update statistics, archive, archive index, and practice
  progress atomically in IndexedDB, with a mirrored fallback path.
- Extended generator requests with an optional target technique used only by
  practice. Normal generator-v3 seeds and puzzle fingerprints remain unchanged,
  so existing daily challenges and shared identities stay compatible.
- Refined archive-only statistics, mutually exclusive restore/delete
  confirmations, responsive practice layouts, and analysis typography without
  introducing cards, badges, gamification, or routine toasts.

### Validation

- Added deterministic practice coverage for all ten published techniques,
  uniqueness, target-path presence, rotational clue symmetry, and repeatable
  transforms.
- Added archive, replay-compatibility, full backup/restore, checksum-corruption,
  and semantic review tests.

### Compatibility markers

- Application version: `0.5.0`
- `GENERATOR_VERSION`: `3`
- `EVENT_LOG_VERSION`: `1`
- `STORAGE_SCHEMA_VERSION`: `3`
- `ARCHIVED_GAME_VERSION`: `1`
- `PRACTICE_VERSION`: `1`
- `PRACTICE_PROGRESS_VERSION`: `1`
- `DATA_BACKUP_VERSION`: `1`
- Existing generator-v3 puzzle identities are preserved. Existing schema-2
  sessions are migrated in place. Legacy statistical summaries remain listed,
  while only games completed after this release can include a permanent board
  and replay timeline.

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
