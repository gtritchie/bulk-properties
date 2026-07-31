# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Obsidian community plugin (TypeScript) for bulk editing frontmatter properties. Lives inside a vault at `.obsidian/plugins/bulk-properties/`.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Type-check (tsc -noEmit) then production build (esbuild, minified)
npm run lint         # ESLint with obsidianmd plugin + typescript-eslint
npm run dev          # esbuild watch — long-running, do not run in an agent session
npm version patch    # Bump version in manifest.json, package.json, versions.json
```

## Verification

There are no automated tests. The gate before any commit is:

```bash
npm run build
npm run lint
```

`npm run build` is what Obsidian picks up — `npm run dev` is a watch process that blocks and does not trigger an Obsidian reload, so it is useless in an agent session.

Build and lint only prove the code compiles and conforms. Behavioral changes need manual testing in the vault at `/Users/gary/code/PluginDev/` — ask the user to reload the plugin and confirm the behavior rather than claiming it works.

## Architecture

Entry point `src/main.ts` → bundled to `main.js` (CJS) by esbuild. Modules:

- `main.ts` — lifecycle only: onload/onunload, addCommand, addSettingTab, status bar
- `bulk-edit-modal.ts` — the bulk edit dialog; the bulk of the logic lives here
- `settings.ts` — `BulkPropertiesSettings`, defaults, `BulkPropertiesSettingTab`
- `files.ts` — vault queries: `getSelectedFiles()`, `getFilesWithProperty()`, `getPropertyValues()`
- `toggle-selection.ts` / `deselect-all.ts` / `remove-selection-property.ts` — selection-property commands
- `confirm-modal.ts`, `progress.ts`, `large-operation-notice.ts`, `accessible-toggle.ts` — shared UI helpers

**Concurrency (`bulk-edit-modal.ts`):** writes are serialized per file through `pendingSaves: Map<TFile, Promise<void>>`, and `uiLocked` stops `toggleSelection` from re-enabling checkboxes once a bulk update has started. `doUpdate()` sets `uiLocked`, disables the UI, awaits all pending saves, then operates on checked files only. Preserve both mechanisms when touching save paths — breaking them still passes build and lint.

**Build:** `esbuild.config.mjs` bundles all source into a single `main.js`. **Lint:** `eslint.config.mts` (`.mts` config requires `jiti`). **Release artifacts:** `main.js`, `manifest.json`, `styles.css` at repo root.

## Constraints discovered the hard way

- Property **names** come from a vault frontmatter scan (`getAllPropertyNames()`, `src/settings.ts:5`), used both for settings autocomplete and as a guard. Property **types** are looked up by `detectPropertyType()` (`:84`) through `metadataTypeManager`, an undocumented internal API absent from `obsidian.d.ts`. It returns a default `"text"` widget for names it does not know, so the scanned name set gates the lookup — remove that guard and unknown properties silently pre-fill as Text. Detection only pre-fills the dropdown; the type stored in settings is the source of truth when editing.
- Selection is vault-wide. There is no public API to scope it to the active Base view; `README.md:7` documents this as a known limitation.
- `minAppVersion` is `1.13.0`, driven by `setDestructive()` (`src/confirm-modal.ts:35`, `src/remove-selection-property.ts:46`) and `SettingTab.update()`, called as `this.update()` (`src/settings.ts:312`, `:411`) — `BulkPropertiesSettingTab` extends `PluginSettingTab extends SettingTab`, and `update()` is `@since 1.13.0`. Using an API newer than that means bumping `minAppVersion` and `versions.json` deliberately.

## Key constraints

- `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` are runtime externals — never bundle them
- Output format must be CJS (`format: "cjs"`) — Obsidian's plugin loader requires it
- `manifest.json` `id` must never change after release; it must match the plugin folder name for local dev
- `version` is semver; keep `minAppVersion` accurate. Canonical validation rules: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml
- Use `this.register*` helpers for all DOM events, intervals, and workspace listeners — ensures cleanup on unload
- Mobile compatibility by default (`isDesktopOnly: false`) — avoid Node/Electron-only APIs unless that is toggled
- Target current Obsidian only. Users on older app versions are served the last compatible release via `versions.json`, so new APIs may be adopted directly — never add back-compat shims or dual code paths for pre-1.13 Obsidian

## Security & privacy

Per Obsidian's Developer policies and Plugin guidelines:

- Local and offline by default. No network calls without user-facing justification and explicit opt-in
- No hidden telemetry. Do not collect vault contents, filenames, or personal information
- Never execute remote code or auto-update plugin code outside normal releases
- Read and write only what is necessary inside the vault; never touch files outside it

## Conventions

- Keep `main.ts` minimal — lifecycle only. Delegate logic to separate modules
- Persist settings via `this.loadData()` / `this.saveData()` with the `Object.assign({}, DEFAULT_SETTINGS, data)` pattern
- Command IDs are stable once released — never rename them
- Prefer `async`/`await` over promise chains
- UI text follows the [Obsidian style guide](https://help.obsidian.md/style-guide): sentence case for headings, buttons, and titles; "select" rather than "click" or "tap"; `→` for navigation paths (**Settings → Community plugins**); Global English, no idioms

## References

- Releasing: `reference/HOW-TO-RELEASE.md` (tag must match `manifest.json` version, no leading `v`; CI builds the draft release)
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
