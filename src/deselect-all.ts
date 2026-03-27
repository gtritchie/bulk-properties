import {App, Notice} from "obsidian";
import {getSelectedFiles} from "./files";

export async function deselectAll(
	app: App,
	selectionProperty: string,
): Promise<void> {
	const files = getSelectedFiles(app, selectionProperty);

	if (files.length === 0) {
		new Notice("No files are selected");
		return;
	}

	let cancelled = false;
	const notice = new Notice("", 0);

	const cancelBtn = notice.messageEl.createEl("button", {
		text: "Cancel",
		cls: "mod-warning bulk-properties-cancel-btn",
	});
	cancelBtn.addEventListener("click", () => {
		cancelled = true;
	});

	let succeeded = 0;
	const failed: string[] = [];

	for (const file of files) {
		if (cancelled) break;

		notice.setMessage(
			`Deselecting ${succeeded + 1} / ${files.length}...`,
		);
		notice.messageEl.appendChild(cancelBtn);

		try {
			await app.fileManager.processFrontMatter(
				file,
				(fm: Record<string, unknown>) => {
					fm[selectionProperty] = false;
				},
			);
			succeeded++;
		} catch {
			failed.push(file.path);
		}
	}

	notice.hide();

	if (cancelled) {
		new Notice(
			`Deselected ${succeeded} of ${files.length} file${files.length === 1 ? "" : "s"} (cancelled)`,
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
