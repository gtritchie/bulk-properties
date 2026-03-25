import {App, PluginSettingTab, Setting} from "obsidian";
import type BasepropPlugin from "./main";

export interface BasepropSettings {
	deselectWhenFinished: boolean;
}

export const DEFAULT_SETTINGS: BasepropSettings = {
	deselectWhenFinished: false,
};

export class BasepropSettingTab extends PluginSettingTab {
	plugin: BasepropPlugin;

	constructor(app: App, plugin: BasepropPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Deselect when finished")
			.setDesc("Default value for the deselect toggle in the bulk edit dialog")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.deselectWhenFinished)
				.onChange(async (value) => {
					this.plugin.settings.deselectWhenFinished = value;
					await this.plugin.saveSettings();
				}));
	}
}
