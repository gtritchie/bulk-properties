import {App, TFile} from "obsidian";

export function getSelectedFiles(
	app: App,
	selectionProperty: string,
): TFile[] {
	return getFilesWithProperty(app, selectionProperty, v => v === true);
}

/**
 * Returns markdown files whose frontmatter contains the given property.
 * Uses hasOwnProperty to avoid matching inherited prototype keys
 * like "constructor" or "toString".
 */
export function getFilesWithProperty(
	app: App,
	property: string,
	predicate?: (value: unknown) => boolean,
): TFile[] {
	const files: TFile[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) continue;
		if (!Object.prototype.hasOwnProperty.call(cache.frontmatter, property)) continue;
		if (predicate && !predicate(cache.frontmatter[property])) continue;
		files.push(file);
	}
	return files.sort((a, b) => a.path.localeCompare(b.path));
}
