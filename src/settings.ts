import {AbstractInputSuggest, App, PluginSettingTab, Setting} from "obsidian";
import type BulkPropertiesPlugin from "./main";

function getAllPropertyNames(app: App): string[] {
	const names = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.frontmatter) {
			for (const key of Object.keys(cache.frontmatter)) {
				if (key !== "position") {
					names.add(key);
				}
			}
		}
	}
	return [...names].sort((a, b) => a.localeCompare(b));
}

class PropertyNameSuggest extends AbstractInputSuggest<string> {
	getSuggestions(query: string): string[] {
		const lower = query.toLowerCase();
		return getAllPropertyNames(this.app).filter(name => name.toLowerCase().includes(lower));
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.setValue(value);
		this.close();
	}
}

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

export interface BulkPropertiesSettings {
	deselectWhenFinished: boolean;
	selectionProperty: string;
	properties: PropertyConfig[];
}

export const DEFAULT_SETTINGS: BulkPropertiesSettings = {
	deselectWhenFinished: true,
	selectionProperty: "selected",
	properties: [],
};

export class BulkPropertiesSettingTab extends PluginSettingTab {
	plugin: BulkPropertiesPlugin;

	constructor(app: App, plugin: BulkPropertiesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Selection property")
			.setDesc("The checkbox property used to mark files as selected")
			.addSearch(search => {
				search
					.setPlaceholder("Selected")
					.setValue(this.plugin.settings.selectionProperty)
					.onChange(async (value) => {
						this.plugin.settings.selectionProperty = value.trim() || "selected";
						await this.plugin.saveSettings();
					});
				new PropertyNameSuggest(this.app, search.inputEl);
			});

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
			.setDesc("Configure which properties are available for bulk editing.")
			.setHeading();

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

		let nameInputEl: HTMLInputElement;
		let newType: PropertyType = "text";

		const addSetting = new Setting(containerEl)
			.setName("Add property")
			.addSearch(search => {
				search.setPlaceholder("Property name");
				nameInputEl = search.inputEl;
				new PropertyNameSuggest(this.app, nameInputEl);
			})
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
					const newName = nameInputEl.value.trim();
					if (!newName) return;
					const exists = this.plugin.settings.properties.some(p => p.name === newName);
					if (exists) return;
					this.plugin.settings.properties.push({name: newName, type: newType});
					await this.plugin.saveSettings();
					this.display();
				}));
		addSetting.settingEl.addClass("bulk-properties-add-property");
	}
}
