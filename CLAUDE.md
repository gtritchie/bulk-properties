# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Obsidian community plugin (TypeScript). Currently based on the sample plugin template — rename classes/interfaces before release. The plugin lives inside a vault at `.obsidian/plugins/baseprop/`.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Build + watch mode (esbuild)
npm run build        # Type-check (tsc) then production build (esbuild, minified)
npm run lint         # ESLint with obsidianmd plugin + typescript-eslint
npm version patch    # Bump version in manifest.json, package.json, versions.json
```

## Architecture

- **Entry point:** `src/main.ts` → bundled to `main.js` (CJS format) by esbuild
- **Settings:** `src/settings.ts` — `MyPluginSettings` interface, defaults, and `SampleSettingTab`
- **Build:** `esbuild.config.mjs` — bundles all source into single `main.js`, externalizes `obsidian`, `electron`, CodeMirror, and Lezer packages (provided by Obsidian at runtime)
- **Lint:** `eslint.config.mts` — uses `typescript-eslint` + `eslint-plugin-obsidianmd` recommended rules (requires `jiti` for `.mts` config)
- **Release artifacts:** `main.js`, `manifest.json`, `styles.css` at repo root

## Key constraints

- `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` are runtime externals — never bundle them
- Output format must be CJS (`format: "cjs"`) — Obsidian's plugin loader requires it
- `manifest.json` `id` must not change after release; must match the plugin folder name for local dev
- Use `this.register*` helpers for all DOM events, intervals, and workspace listeners — ensures cleanup on unload
- No network calls without user-facing justification and explicit opt-in
- Mobile compatibility by default (`isDesktopOnly: false`) — avoid Node/Electron-only APIs unless toggled

## Conventions

- Keep `main.ts` minimal: lifecycle only (onload/onunload, addCommand, addSettingTab). Delegate logic to separate modules.
- Persist settings via `this.loadData()` / `this.saveData()` with `Object.assign({}, DEFAULT_SETTINGS, data)` pattern.
- Command IDs are stable once released — never rename them.
- Sentence case for UI text. Use `→` arrow notation for navigation paths.

## AGENTS.md

See `AGENTS.md` for detailed Obsidian plugin development guidelines, manifest rules, security/privacy policies, UX copy standards, and code examples.
