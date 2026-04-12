import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		// Report directive comments that silence rules which never fired.
		// Obsidian's plugin reviewer enables this; without it, stale
		// eslint-disable comments slip through local lint.
		linterOptions: {
			reportUnusedDisableDirectives: "error",
		},
		languageOptions: {
			globals: {
				...globals.browser,
			},
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
