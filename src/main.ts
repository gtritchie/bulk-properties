import {Plugin} from "obsidian";
import {BulkPropertiesSettingTab, BulkPropertiesSettings, DEFAULT_SETTINGS} from "./settings";
import {BulkEditModal} from "./bulk-edit-modal";
import {deselectAll} from "./deselect-all";
import {getSelectedFiles} from "./files";
import {removeSelectionProperty} from "./remove-selection-property";

export default class BulkPropertiesPlugin extends Plugin {
	settings: BulkPropertiesSettings;
	private statusBarEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		this.statusBarEl = this.addStatusBarItem();

		this.addCommand({
			id: "bulk-edit-selected",
			name: "Bulk edit selected files",
			callback: () => {
				new BulkEditModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "deselect-all",
			name: "Deselect all files",
			callback: () => {
				void deselectAll(this.app, this.settings.selectionProperty);
			},
		});

		this.addCommand({
			id: "remove-selection-property",
			name: "Remove selection property from all files",
			callback: () => {
				removeSelectionProperty(
					this.app,
					this.settings.selectionProperty,
				);
			},
		});

		this.addSettingTab(new BulkPropertiesSettingTab(this.app, this));

		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				this.updateStatusBar();
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", () => {
				this.updateStatusBar();
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.updateStatusBar();
		});
	}

	updateStatusBar(): void {
		if (!this.statusBarEl) return;
		if (!this.settings.showStatusBarCount) {
			this.statusBarEl.empty();
			return;
		}
		const count = getSelectedFiles(
			this.app,
			this.settings.selectionProperty,
		).length;
		if (count > 0) {
			this.statusBarEl.setText(
				`${count} file${count === 1 ? "" : "s"} selected`,
			);
		} else {
			this.statusBarEl.empty();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<BulkPropertiesSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
