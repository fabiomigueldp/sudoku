# Contributing to Absolute Sudoku

Absolute Sudoku is a local-first Sudoku application. Preserve its restrained
interface, keyboard accessibility, offline behavior and existing player data.
Read `PRODUCT.md` and `DESIGN.md` before changing product behavior or styling.

## Development

Use Node.js 24 and the committed npm lockfile:

```sh
npm ci
npm run dev
```

## Validation

Run the following checks before submitting a change:

```sh
npm run lint
npm test
npm run build
npx playwright install --with-deps
npm run test:ui
```

The build includes TypeScript checking. Browser tests start their own development
server on `127.0.0.1:4187`; keep that port available. The browser projects cover
Chromium, Firefox, WebKit and a mobile Chromium viewport. To investigate one
project, run `npm run test:ui -- --project=webkit`. Failed runs retain traces in
`test-results/`.

GitHub Actions runs the same checks on pushes to `main` and pull requests.
Browser jobs run independently and retain failure reports for seven days.
Do not commit generated builds, reports, local credentials or player backups.

## Data and interaction changes

- Preserve legacy saves and backups. Add migration and recovery tests when
  changing persistence, including independent attempts of the same puzzle.
- Keep active time, notes, colors, undo/redo and event history intact when
  switching games. Completion and deletion must affect only the chosen attempt.
- Validate backups before replacing local data. Never silently discard a save
  because storage is unavailable or a list has reached an arbitrary size.
- Verify pointer, keyboard and touch interactions, visible focus, narrow layouts,
  and light, dark and high-contrast appearances when changing the interface.
- Add regression tests for observable behavior rather than implementation details.

## Commits and releases

Write descriptive English commit messages and explain behavior, compatibility
and validation in pull requests. Keep changes focused and update `CHANGELOG.md`
under `Unreleased` until a release is intentionally prepared.

For a release, update both npm version files and create a dated changelog entry.
Follow the versioning policy in `CHANGELOG.md`: deterministic generation,
storage envelopes, archives, practice data, event logs and backups have separate
compatibility markers. Do not change puzzle seeds as a side effect of unrelated
UI or persistence work.
