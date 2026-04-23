import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
	{
		// Report directive comments that silence rules which never fired.
		// Obsidian's plugin reviewer enables this; without it, stale
		// eslint-disable comments slip through local lint.
		linterOptions: {
			reportUnusedDisableDirectives: "error",
		},
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// The obsidianmd preset disables require-await, but Obsidian's
		// reviewer enforces it. Re-enable so local lint matches.
		files: ['**/*.ts', '**/*.tsx'],
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			"@typescript-eslint/require-await": "error",
		},
	},
	{
		// The obsidianmd 0.2.x preset spreads its TS-typed rules globally,
		// so they also apply to the package.json block that uses json/json
		// (no parser services → crash). Match the preset's scope and
		// disable the type-aware rules here; the preset's JSON-aware
		// rules (validate-license, depend/ban-dependencies) still run.
		files: ['package.json'],
		rules: {
			'obsidianmd/no-plugin-as-component': 'off',
			'obsidianmd/no-view-references-in-plugin': 'off',
			'obsidianmd/prefer-file-manager-trash-file': 'off',
			'obsidianmd/prefer-instanceof': 'off',
			'obsidianmd/no-unsupported-api': 'off',
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.mts",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
