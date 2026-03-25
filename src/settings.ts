import {App, PluginSettingTab, Setting} from "obsidian";
import type BasepropPlugin from "./main";

export const PROPERTY_TYPES = [
	"text",
	"number",
	"checkbox",
	"date",
	"datetime",
	"tags",
	"aliases",
	"multitext",
] as const;

export type PropertyType = typeof PROPERTY_TYPES[number];

export interface PropertyConfig {
	name: string;
	type: PropertyType;
}

export interface BasepropSettings {
	deselectWhenFinished: boolean;
	selectionProperty: string;
	properties: PropertyConfig[];
}

export const DEFAULT_SETTINGS: BasepropSettings = {
	deselectWhenFinished: false,
	selectionProperty: "selected",
	properties: [],
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
			.setName("Selection property")
			.setDesc("The checkbox property used to mark files as selected")
			.addText(text => text
				.setPlaceholder("Selected")
				.setValue(this.plugin.settings.selectionProperty)
				.onChange(async (value) => {
					this.plugin.settings.selectionProperty = value.trim() || "selected";
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Deselect when finished")
			.setDesc("Default value for the deselect toggle in the bulk edit dialog")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.deselectWhenFinished)
				.onChange(async (value) => {
					this.plugin.settings.deselectWhenFinished = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Properties")
			.setHeading();

		containerEl.createEl("p", {
			text: "Configure which properties are available for bulk editing.",
			cls: "setting-item-description",
		});

		for (let i = 0; i < this.plugin.settings.properties.length; i++) {
			const prop = this.plugin.settings.properties[i]!;
			new Setting(containerEl)
				.setName(prop.name)
				.setDesc(prop.type)
				.addButton(btn => btn
					.setButtonText("Remove")
					.onClick(async () => {
						this.plugin.settings.properties.splice(i, 1);
						await this.plugin.saveSettings();
						this.display();
					}));
		}

		let newName = "";
		let newType: PropertyType = "text";

		const addSetting = new Setting(containerEl)
			.setName("Add property")
			.addText(text => text
				.setPlaceholder("Property name")
				.onChange(value => {
					newName = value.trim();
				}))
			.addDropdown(dropdown => {
				for (const t of PROPERTY_TYPES) {
					dropdown.addOption(t, t);
				}
				dropdown.setValue(newType);
				dropdown.onChange(value => {
					newType = value as PropertyType;
				});
			})
			.addButton(btn => btn
				.setButtonText("Add")
				.setCta()
				.onClick(async () => {
					if (!newName) return;
					const exists = this.plugin.settings.properties.some(p => p.name === newName);
					if (exists) return;
					this.plugin.settings.properties.push({name: newName, type: newType});
					await this.plugin.saveSettings();
					this.display();
				}));
		addSetting.settingEl.addClass("baseprop-add-property");
	}
}
