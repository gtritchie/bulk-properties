import {Plugin} from "obsidian";
import {BasepropSettingTab, BasepropSettings, DEFAULT_SETTINGS} from "./settings";
import {BulkEditModal} from "./bulk-edit-modal";

export default class BasepropPlugin extends Plugin {
	settings: BasepropSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "bulk-edit-selected",
			name: "Bulk edit selected files",
			callback: () => {
				new BulkEditModal(this.app, this).open();
			},
		});

		this.addSettingTab(new BasepropSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<BasepropSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
