import {App, TFile} from "obsidian";

export function getSelectedFiles(
	app: App,
	selectionProperty: string,
): TFile[] {
	const files: TFile[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.frontmatter?.[selectionProperty] === true) {
			files.push(file);
		}
	}
	return files.sort((a, b) => a.path.localeCompare(b.path));
}
