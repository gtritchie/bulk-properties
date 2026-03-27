import {App, Modal, Setting} from "obsidian";

class ConfirmModal extends Modal {
	private resolved = false;
	private resolve: (value: boolean) => void;
	private readonly message: string;

	constructor(app: App, message: string, resolve: (value: boolean) => void) {
		super(app);
		this.message = message;
		this.resolve = resolve;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.createEl("p", {text: this.message});
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText("Continue")
				.setCta()
				.onClick(() => {
					this.resolved = true;
					this.resolve(true);
					this.close();
				}))
			.addButton(btn => btn
				.setButtonText("Cancel")
				.onClick(() => {
					this.resolved = true;
					this.resolve(false);
					this.close();
				}));
	}

	onClose() {
		if (!this.resolved) {
			this.resolve(false);
		}
		this.contentEl.empty();
	}
}

const LIST_TYPES = new Set(["tags", "aliases", "multitext"]);

export function confirmEmptyValue(
	app: App,
	property: string,
	type: string,
	fileCount: number,
): Promise<boolean> {
	const noun = fileCount === 1 ? "file" : "files";
	const effect = LIST_TYPES.has(type)
		? `remove all values from "${property}"`
		: `set "${property}" to blank`;
	const message = `New value is empty. This will ${effect} on ${fileCount} ${noun}.`;
	return new Promise<boolean>(resolve => {
		new ConfirmModal(app, message, resolve).open();
	});
}
