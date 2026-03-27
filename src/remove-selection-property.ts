import {App, Modal, Notice, Setting} from "obsidian";

function getFilesWithProperty(app: App, property: string) {
	const files = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.frontmatter && Object.prototype.hasOwnProperty.call(cache.frontmatter, property)) {
			files.push(file);
		}
	}
	return files.sort((a, b) => a.path.localeCompare(b.path));
}

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
			text: `This will modify all ${n} file${n === 1 ? "" : "s"} in your vault by removing the "${this.property}" property from them. Are you sure?`,
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
		void doRemove(app, selectionProperty, files);
	}).open();
}

async function doRemove(
	app: App,
	selectionProperty: string,
	files: ReturnType<typeof getFilesWithProperty>,
): Promise<void> {
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

	for (let i = 0; i < files.length; i++) {
		if (cancelled) break;
		const file = files[i]!;

		notice.setMessage(
			`Removing "${selectionProperty}" ${i + 1} / ${files.length}...`,
		);
		notice.messageEl.appendChild(cancelBtn);

		try {
			await app.fileManager.processFrontMatter(
				file,
				(fm: Record<string, unknown>) => {
					delete fm[selectionProperty];
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
			`Removed "${selectionProperty}" from ${succeeded} of ${files.length} file${files.length === 1 ? "" : "s"} (cancelled)`,
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
