import {Notice} from "obsidian";
import type BulkPropertiesPlugin from "./main";
import {confirmDeselectAll} from "./confirm-modal";
import {getSelectedFiles} from "./files";
import {
	shouldWarnLargeOperation,
	showLargeOperationNotice,
} from "./large-operation-notice";
import {withProgress} from "./progress";

export async function deselectAll(
	plugin: BulkPropertiesPlugin,
): Promise<void> {
	const {app} = plugin;
	const selectionProperty = plugin.settings.selectionProperty;
	const files = getSelectedFiles(app, selectionProperty);

	if (files.length === 0) {
		new Notice("No notes are selected");
		return;
	}

	const confirmed = await confirmDeselectAll(app, files.length);
	if (!confirmed) return;

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
	let msg: string;
	if (cancelled) {
		msg = `Deselected ${succeeded} of ${total} note${total === 1 ? "" : "s"} (cancelled)`;
	} else if (failed.length === 0) {
		msg = `Deselected ${succeeded} note${succeeded === 1 ? "" : "s"}`;
	} else {
		msg = `Deselected ${succeeded} note${succeeded === 1 ? "" : "s"}, failed on ${failed.length}: ${failed.join(", ")}`;
	}

	if (shouldWarnLargeOperation(plugin, succeeded)) {
		showLargeOperationNotice(plugin, succeeded, msg);
	} else {
		new Notice(msg);
	}
}
