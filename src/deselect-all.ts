import {App, Notice} from "obsidian";
import {getSelectedFiles} from "./files";
import {withProgress} from "./progress";

export async function deselectAll(
	app: App,
	selectionProperty: string,
): Promise<void> {
	const files = getSelectedFiles(app, selectionProperty);

	if (files.length === 0) {
		new Notice("No files are selected");
		return;
	}

	const result = await withProgress(
		files,
		"Deselecting",
		async (file) => {
			await app.fileManager.processFrontMatter(
				file,
				(fm: Record<string, unknown>) => {
					fm[selectionProperty] = false;
				},
			);
		},
	);

	const {succeeded, failed, cancelled, total} = result;
	if (cancelled) {
		new Notice(
			`Deselected ${succeeded} of ${total} file${total === 1 ? "" : "s"} (cancelled)`,
		);
	} else if (failed.length === 0) {
		new Notice(
			`Deselected ${succeeded} file${succeeded === 1 ? "" : "s"}`,
		);
	} else {
		new Notice(
			`Deselected ${succeeded} file${succeeded === 1 ? "" : "s"}, failed on ${failed.length}: ${failed.join(", ")}`,
		);
	}
}
