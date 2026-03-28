import {AbstractInputSuggest, App, ButtonComponent, Notice, PluginSettingTab, Setting} from "obsidian";
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
	onSuggestionSelected?: () => void;

	override getSuggestions(query: string): string[] {
		const lower = query.toLowerCase();
		return getAllPropertyNames(this.app).filter(name => name.toLowerCase().includes(lower));
	}

	override renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	override selectSuggestion(
		value: string,
		_evt: MouseEvent | KeyboardEvent,
	): void {
		this.setValue(value);
		this.close();
		this.onSuggestionSelected?.();
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
	lastSelectedProperty: string;
	showStatusBarCount: boolean;
}

export const DEFAULT_SETTINGS: BulkPropertiesSettings = {
	deselectWhenFinished: true,
	selectionProperty: "selected",
	properties: [],
	lastSelectedProperty: "",
	showStatusBarCount: true,
};

export class BulkPropertiesSettingTab extends PluginSettingTab {
	plugin: BulkPropertiesPlugin;
	private saveQueue: Promise<void> = Promise.resolve();

	constructor(app: App, plugin: BulkPropertiesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Serializes settings writes through a queue so overlapping
	 * onChange calls cannot race. Each call snapshots the live
	 * settings only after all prior saves have committed.
	 */
	private updateSetting<K extends keyof BulkPropertiesSettings>(
		key: K,
		value: BulkPropertiesSettings[K],
	): Promise<boolean> {
		const result = this.saveQueue.then(async () => {
			const candidate = {...this.plugin.settings, [key]: value};
			try {
				await this.plugin.saveData(candidate);
				this.plugin.settings = candidate;
				return true;
			} catch (err: unknown) {
				console.error("bulk-properties: failed to save settings:", err);
				new Notice("Failed to save settings. Check disk space and permissions.");
				return false;
			}
		});
		this.saveQueue = result.then(() => {});
		return result;
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
						const normalized = value.trim() || "selected";
						if (normalized === this.plugin.settings.selectionProperty) {
							if (value.trim() === "") {
								search.setValue(normalized);
							}
							return;
						}
						if (await this.updateSetting("selectionProperty", normalized)) {
							// Only reset the input if the user hasn't typed
							// something new while the save was in flight
							if (search.inputEl.value === value) {
								search.setValue(normalized);
							}
							this.plugin.updateStatusBar();
						}
					});
				new PropertyNameSuggest(this.app, search.inputEl);
			});

		new Setting(containerEl)
			.setName("Deselect when finished")
			.setDesc("Default value for the deselect toggle in the bulk edit dialog")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.deselectWhenFinished)
				.onChange(async (value) => {
					await this.updateSetting("deselectWhenFinished", value);
				}));

		new Setting(containerEl)
			.setName("Show selection count in status bar")
			.setDesc("Display the number of selected files in the status bar")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showStatusBarCount)
				.onChange(async (value) => {
					if (await this.updateSetting("showStatusBarCount", value)) {
						this.plugin.updateStatusBar();
					}
				}));

		new Setting(containerEl)
			.setName("Properties")
			.then(setting => {
					setting.descEl.empty();
					setting.descEl.appendText(
						"Configure which properties are available for bulk editing. ",
					);
					setting.descEl.createEl("em", {
						text: "You must add at least one property to use the bulk-editing feature.",
					});
				})
			.setHeading();

		for (let i = 0; i < this.plugin.settings.properties.length; i++) {
			const prop = this.plugin.settings.properties[i]!;
			new Setting(containerEl)
				.setName(prop.name)
				.setDesc(prop.type)
				.addButton(btn => btn
					.setButtonText("Remove")
					.onClick(async () => {
						const updated = this.plugin.settings.properties.filter(
							(_, idx) => idx !== i,
						);
						if (await this.updateSetting("properties", updated)) {
							this.display();
						}
					}));
		}

		let nameInputEl: HTMLInputElement;
		let newType: PropertyType | "" = "";
		let addBtn: ButtonComponent | undefined;

		function updateAddButton(): void {
			addBtn?.setDisabled(
				nameInputEl.value.trim() === "" || newType === "",
			);
		}

		const addSetting = new Setting(containerEl)
			.setName("Add property")
			.addSearch(search => {
				search.setPlaceholder("Property name");
				search.onChange(() => updateAddButton());
				nameInputEl = search.inputEl;
				const suggest = new PropertyNameSuggest(this.app, nameInputEl);
				suggest.onSuggestionSelected = updateAddButton;
			})
			.addDropdown(dropdown => {
				const placeholder = dropdown.selectEl.createEl("option", {
					value: "",
					text: "Choose type\u2026",
				});
				placeholder.disabled = true;
				placeholder.selected = true;

				for (const t of PROPERTY_TYPES) {
					dropdown.addOption(t, t);
				}
				dropdown.onChange(value => {
					newType = value as PropertyType;
					updateAddButton();
				});
			})
			.addButton(btn => {
				addBtn = btn;
				btn.setButtonText("Add")
					.setCta()
					.setDisabled(true)
					.onClick(async () => {
						const newName = nameInputEl.value.trim();
						if (!newName || newType === "") {
							return;
						}
						if (this.plugin.settings.properties.some(
							p => p.name === newName,
						)) {
							new Notice(
								`Property "${newName}" is already configured`,
							);
							return;
						}
						const updated = [
							...this.plugin.settings.properties,
							{name: newName, type: newType},
						];
						if (await this.updateSetting("properties", updated)) {
							this.display();
						}
					});
			});
		addSetting.settingEl.addClass("bulk-properties-add-property");
	}
}
