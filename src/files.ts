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

/**
 * Returns sorted unique string values for a given frontmatter property
 * across all markdown files in the vault.
 */
export function getPropertyValues(
	app: App,
	propertyName: string,
): string[] {
	const values = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) continue;
		if (!Object.prototype.hasOwnProperty.call(cache.frontmatter, propertyName)) continue;
		const raw: unknown = cache.frontmatter[propertyName];
		if (Array.isArray(raw)) {
			for (const item of raw) {
				if (typeof item === "string" && item !== "") {
					values.add(item);
				}
			}
		} else if (typeof raw === "string" && raw !== "") {
			values.add(raw);
		}
	}
	return [...values].sort((a, b) => a.localeCompare(b));
}
