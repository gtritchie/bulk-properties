import {Modal, Notice, Setting} from "obsidian";
import type BulkPropertiesPlugin from "./main";
import {makeToggleAccessible, updateToggleAriaChecked} from "./accessible-toggle";

export const LARGE_OPERATION_THRESHOLD = 25;

export function shouldWarnLargeOperation(
	plugin: BulkPropertiesPlugin,
	count: number,
): boolean {
	return count > LARGE_OPERATION_THRESHOLD
		&& plugin.settings.showLargeOperationWarning;
}

class LargeOperationNoticeModal extends Modal {
	private dontShowAgain = false;
	private readonly summary: string;
	private readonly count: number;
	private readonly onSuppress: () => void;

	constructor(
		plugin: BulkPropertiesPlugin,
		count: number,
		summary: string,
		onSuppress: () => void,
	) {
		super(plugin.app);
		this.summary = summary;
		this.count = count;
		this.onSuppress = onSuppress;
	}

	override onOpen() {
		const {contentEl} = this;

		new Setting(contentEl)
			.setName("Obsidian is updating its metadata cache")
			.setHeading();

		contentEl.createEl("p", {text: this.summary});

		contentEl.createEl("p", {
			text: `You modified ${this.count} notes. Obsidian will re-index its metadata cache in the background, which may take several minutes depending on your vault size and device speed. Until it finishes, Bases and the selection count in the status bar may be out of date.`,
		});

		new Setting(contentEl)
			.setName("Don't show this again")
			.setDesc("You can re-enable this warning in settings.")
			.addToggle(toggle => {
				makeToggleAccessible(toggle, "Don't show this again", false);
				toggle
					.setValue(false)
					.onChange(value => {
						updateToggleAriaChecked(toggle, value);
						this.dontShowAgain = value;
					});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText("Close")
				.setCta()
				.onClick(() => this.close()));
	}

	override onClose() {
		if (this.dontShowAgain) {
			this.onSuppress();
		}
		this.contentEl.empty();
	}
}

export function showLargeOperationNotice(
	plugin: BulkPropertiesPlugin,
	count: number,
	summary: string,
): void {
	const onSuppress = () => {
		plugin.updateSetting("showLargeOperationWarning", false)
			.catch((err: unknown) => {
				console.error(
					"bulk-properties: failed to save showLargeOperationWarning:",
					err,
				);
				new Notice(
					"Failed to save preference. The large-operation warning may appear again.",
				);
			});
	};
	new LargeOperationNoticeModal(plugin, count, summary, onSuppress).open();
}
