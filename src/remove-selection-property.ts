import {App, Modal, Notice, Setting} from "obsidian";
import {getFilesWithProperty} from "./files";
import {withProgress} from "./progress";

class ConfirmRemoveModal extends Modal {
	private confirmed = false;
	private readonly property: string;
	private readonly fileCount: number;
	private readonly onConfirm: () => void;

	constructor(
		app: App,
		property: string,
		fileCount: number,
		onConfirm: () => void,
	) {
		super(app);
		this.property = property;
		this.fileCount = fileCount;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const {contentEl} = this;

		new Setting(contentEl)
			.setName("Remove selection property")
			.setHeading();

		const n = this.fileCount;
		contentEl.createEl("p", {
			text: `This will modify ${n} file${n === 1 ? "" : "s"} in your vault by removing the "${this.property}" property from them. Are you sure?`,
		});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText("Cancel")
				.onClick(() => this.close()))
			.addButton(btn => btn
				.setButtonText("Remove")
				.setWarning()
				.onClick(() => {
					this.confirmed = true;
					this.close();
				}));
	}

	onClose() {
		this.contentEl.empty();
		if (this.confirmed) {
			this.onConfirm();
		}
	}
}

/**
 * Scans for files containing the selection property, confirms with
 * the user, then removes the property from all matching files with
 * a cancelable progress notice.
 */
export function removeSelectionProperty(
	app: App,
	selectionProperty: string,
): void {
	const files = getFilesWithProperty(app, selectionProperty);

	if (files.length === 0) {
		new Notice(
			`No files have the "${selectionProperty}" property`,
		);
		return;
	}

	new ConfirmRemoveModal(app, selectionProperty, files.length, () => {
		void doRemove(app, selectionProperty, files).catch(
			(err: unknown) => {
				console.error(
					"bulk-properties: unexpected error during property removal:",
					err,
				);
				new Notice(
					"An unexpected error occurred. Check the developer console.",
				);
			},
		);
	}).open();
}

async function doRemove(
	app: App,
	selectionProperty: string,
	files: ReturnType<typeof getFilesWithProperty>,
): Promise<void> {
	const result = await withProgress(
		files,
		`Removing "${selectionProperty}"`,
		async (file) => {
			await app.fileManager.processFrontMatter(
				file,
				(fm: Record<string, unknown>) => {
					delete fm[selectionProperty];
				},
			);
		},
	);

	const {succeeded, failed, cancelled, total} = result;
	if (cancelled) {
		new Notice(
			`Removed "${selectionProperty}" from ${succeeded} of ${total} file${total === 1 ? "" : "s"} (cancelled)`,
		);
	} else if (failed.length === 0) {
		new Notice(
			`Removed "${selectionProperty}" from ${succeeded} file${succeeded === 1 ? "" : "s"}`,
		);
	} else {
		new Notice(
			`Removed from ${succeeded} file${succeeded === 1 ? "" : "s"}, failed on ${failed.length}: ${failed.join(", ")}`,
		);
	}
}
