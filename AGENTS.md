# Repository Guidelines

## Project Structure & Module Organization

MemoPaste is an Electron clipboard manager built with Vue 3 and TypeScript.

- `src/`: renderer UI, including views, components, Pinia stores, composables, and themes.
- `electron/`: main process, preload bridge, desktop services, native utilities, and SQLite access in `database/`.
- `shared/`: utilities shared between processes, including search, shortcuts, and content types.
- `tests/`: Node regression tests, Electron UI smoke tests, and fixtures.
- `public/` and `src/assets/`: application assets; `assets/` contains README imagery.
- `dist/`, `dist-electron/`, and `release/`: generated build outputs; do not edit directly.

## Build, Test, and Development Commands

Use Node.js 22.13+ for development verification; search tests depend on built-in SQLite.

- `npm install`: install dependencies.
- `npm run dev`: start Vite and the Electron development app.
- `npm run sqlite3-rebuild`: rebuild `better-sqlite3` when native module compatibility fails.
- `npm test`: run `tests/*.test.mjs` with Node's test runner.
- `npx vue-tsc --noEmit`: check TypeScript and Vue types.
- `npm run lint`: run ESLint.
- `npm run format`: apply Prettier repository-wide; review unrelated changes before committing.
- `npx vite build` followed by `npm run test:ui`: build and run Electron UI smoke tests.
- `npm run build`: build and package installers into `release/<version>/`.

## Coding Style & Naming Conventions

Use two-space indentation, double quotes, semicolons, trailing commas, and LF endings. Prettier sets a 100-character print width; ESLint checks Vue and TypeScript. TypeScript strict mode is enabled.

Use PascalCase for reusable Vue components (`DetailPanel.vue`), `useX` for composables (`useSearch.ts`), and kebab-case for Electron services (`clipboard-service.ts`). Existing view entry points use `index.vue`. Use `@/` for renderer imports and `@shared/` for shared utilities.

## Testing Guidelines

Add regression tests as `tests/<feature>.test.mjs` using `node:test` and `node:assert/strict`. No numeric coverage threshold is configured. Cover changed behavior and edge cases, then run tests, type checking, and linting. UI smoke tests use isolated temporary data and report screenshot locations. Manually verify automatic paste into external applications.

## Commit & Pull Request Guidelines

Follow the history's Conventional Commit style: `feat:`, `fix(clipboard):`, `style:`, or `chore:` with a concise description. Chinese and English descriptions are both established.

Keep PRs focused. Explain behavior changes, link relevant issues, report validation, and include screenshots for UI changes.

## Security & Data Handling

Keep renderer access behind narrow preload APIs; validate IPC inputs in the main process. Use synthetic clipboard data in tests and screenshots, and exclude local databases and private clipboard contents from commits.
