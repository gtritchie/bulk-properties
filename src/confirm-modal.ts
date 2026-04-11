import {App, Modal, Setting} from "obsidian";

interface ConfirmOptions {
	confirmText?: string;
	confirmStyle?: "cta" | "warning";
}

class ConfirmModal extends Modal {
	private resolved = false;
	private resolve: (value: boolean) => void;
	private readonly message: string;
	private readonly confirmText: string;
	private readonly confirmStyle: "cta" | "warning";

	constructor(
		app: App,
		message: string,
		resolve: (value: boolean) => void,
		options?: ConfirmOptions,
	) {
		super(app);
		this.message = message;
		this.resolve = resolve;
		this.confirmText = options?.confirmText ?? "Continue";
		this.confirmStyle = options?.confirmStyle ?? "cta";
	}

	override onOpen() {
		const {contentEl} = this;
		contentEl.createEl("p", {text: this.message});
		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText(this.confirmText);
				if (this.confirmStyle === "warning") {
					btn.setWarning();
				} else {
					btn.setCta();
				}
				btn.onClick(() => {
					this.resolved = true;
					this.resolve(true);
					this.close();
				});
			})
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
	const noun = fileCount === 1 ? "note" : "notes";
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
	const noun = fileCount === 1 ? "note" : "notes";
	const message = `New value is empty. This will clear "${property}" on ${fileCount} ${noun}.`;
	return new Promise<boolean>(resolve => {
		new ConfirmModal(app, message, resolve).open();
	});
}

export function confirmReplace(
	app: App,
	property: string,
	fileCount: number,
): Promise<boolean> {
	const noun = fileCount === 1 ? "note" : "notes";
	const message = `This will replace all existing "${property}" values on ${fileCount} ${noun}. Existing values will be lost.`;
	return new Promise<boolean>(resolve => {
		new ConfirmModal(app, message, resolve).open();
	});
}

export function confirmDeleteFiles(
	app: App,
	fileCount: number,
): Promise<boolean> {
	const noun = fileCount === 1 ? "note" : "notes";
	const message = `This will delete ${fileCount} ${noun}. Are you sure?`;
	return new Promise<boolean>(resolve => {
		new ConfirmModal(app, message, resolve, {
			confirmText: "Delete",
			confirmStyle: "warning",
		}).open();
	});
}
