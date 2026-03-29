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

	override onOpen() {
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

	override onClose() {
		if (!this.resolved) {
			this.resolve(false);
		}
		this.contentEl.empty();
	}
}

export function confirmDeselectAll(
	app: App,
	fileCount: number,
): Promise<boolean> {
	const noun = fileCount === 1 ? "file" : "files";
	const message = `This will deselect ${fileCount} ${noun}. Are you sure?`;
	return new Promise<boolean>(resolve => {
		new ConfirmModal(app, message, resolve).open();
	});
}

export function confirmEmptyValue(
	app: App,
	property: string,
	fileCount: number,
): Promise<boolean> {
	const noun = fileCount === 1 ? "file" : "files";
	const message = `New value is empty. This will clear "${property}" on ${fileCount} ${noun}.`;
	return new Promise<boolean>(resolve => {
		new ConfirmModal(app, message, resolve).open();
	});
}
