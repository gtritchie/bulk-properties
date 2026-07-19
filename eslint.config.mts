import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
	{
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
		// We deliberately keep the imperative display() settings model for
		// now; migrating to getSettingDefinitions() is planned separately.
		files: ['**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}'],
		rules: {
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
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
