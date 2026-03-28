# Obsidian plugin development guidelines

## Manifest rules (`manifest.json`)

- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- `version` uses Semantic Versioning (`x.y.z`).
- Canonical validation: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Versioning & releases

- Bump `version` in `manifest.json` and update `versions.json` to map plugin version to minimum app version.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json`, `main.js`, and `styles.css` to the release as individual assets.

## Security & privacy

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. Require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Register and clean up all DOM, app, and interval listeners using `this.register*` helpers so the plugin unloads safely.

## UX & copy

- Follow the [Obsidian style guide](https://help.obsidian.md/style-guide).
- Sentence case for headings, buttons, and titles.
- Use "select" for interactions, not "click" or "tap".
- Use → for navigation paths: **Settings → Community plugins**.
- Use Global English — avoid idioms and culturally-specific expressions.
- Command IDs are stable once released — never rename them.

## Coding conventions

- Keep `main.ts` minimal: lifecycle only (onload/onunload, addCommand, addSettingTab). Delegate logic to separate modules.
- `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` are runtime externals — never bundle them.
- Output format must be CJS (`format: "cjs"`).
- Avoid Node/Electron APIs unless `isDesktopOnly` is `true`.
- Prefer `async/await` over promise chains; handle errors gracefully.
- Persist settings via `this.loadData()` / `this.saveData()` with `Object.assign({}, DEFAULT_SETTINGS, data)` pattern.

## References

- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
