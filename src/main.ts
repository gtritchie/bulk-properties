import {Plugin} from "obsidian";
import {BulkPropertiesSettingTab, BulkPropertiesSettings, DEFAULT_SETTINGS} from "./settings";
import {BulkEditModal} from "./bulk-edit-modal";
import {deselectAll} from "./deselect-all";

export default class BulkPropertiesPlugin extends Plugin {
	settings: BulkPropertiesSettings;

	async onload() {
		await this.loadSettings();

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

		this.addSettingTab(new BulkPropertiesSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<BulkPropertiesSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
