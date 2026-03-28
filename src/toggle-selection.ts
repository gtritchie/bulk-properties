import {App, Notice, TFile} from "obsidian";

export async function toggleSelection(
	app: App,
	file: TFile,
	selectionProperty: string,
	onComplete?: () => void,
): Promise<void> {
	try {
		await app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fm[selectionProperty] = fm[selectionProperty] !== true;
			},
		);
	} catch (err: unknown) {
		console.error("bulk-properties: failed to toggle selection:", err);
		new Notice(`Failed to update "${file.name}". Check the developer console.`);
	}
	onComplete?.();
}

export function isFileSelected(
	app: App,
	file: TFile,
	selectionProperty: string,
): boolean {
	const cache = app.metadataCache.getFileCache(file);
	return cache?.frontmatter?.[selectionProperty] === true;
}
