import {AbstractInputSuggest, App, ButtonComponent, DropdownComponent, Notice, PluginSettingTab, Setting} from "obsidian";
import type BulkPropertiesPlugin from "./main";
import {makeToggleAccessible, updateToggleAriaChecked} from "./accessible-toggle";

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
	exclude: () => Set<string> = () => new Set();

	override getSuggestions(query: string): string[] {
		const lower = query.toLowerCase();
		const excluded = this.exclude();
		return getAllPropertyNames(this.app).filter(
			name => name.toLowerCase().includes(lower) && !excluded.has(name),
		);
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

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
	aliases: "Aliases",
	checkbox: "Checkbox",
	date: "Date",
	datetime: "Date & time",
	multitext: "List",
	number: "Number",
	tags: "Tags",
	text: "Text",
};

// Uses Obsidian's undocumented metadataTypeManager to look up the type
// assigned to a property in Settings → Properties. Returns null if the
// API is unavailable, the property is unknown, or the widget value
// doesn't match a recognized type.
function detectPropertyType(app: App, name: string): PropertyType | null {
	try {
		// metadataTypeManager is an undocumented internal API — not in
		// obsidian.d.ts. All access is runtime-guarded; the any cast and
		// unsafe member accesses are intentional.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
		const mtm = (app as any).metadataTypeManager as
			| { getPropertyInfo?: (name: string) => { widget?: string } | undefined }
			| undefined;
		if (!mtm || typeof mtm.getPropertyInfo !== "function") return null;
		const info = mtm.getPropertyInfo(name);
		if (!info || typeof info.widget !== "string") return null;
		const validTypes: ReadonlySet<string> = new Set(PROPERTY_TYPES);
		return validTypes.has(info.widget) ? info.widget as PropertyType : null;
	} catch {
		return null;
	}
}

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

	constructor(app: App, plugin: BulkPropertiesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Updates a single setting key via the plugin's serialized
	 * copy-on-write save queue.
	 */
	private async updateSetting<K extends keyof BulkPropertiesSettings>(
		key: K,
		value: BulkPropertiesSettings[K],
	): Promise<boolean> {
		try {
			await this.plugin.updateSetting(key, value);
			return true;
		} catch (err: unknown) {
			console.error("bulk-properties: failed to save settings:", err);
			new Notice("Failed to save settings. Check disk space and permissions.");
			return false;
		}
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		const selectionSetting = new Setting(containerEl)
			.setName("Selection property")
			.setDesc("The checkbox property used to mark files as selected")
			.addSearch(search => {
				const isConflicting = (name: string) =>
					this.plugin.settings.properties.some(p => p.name === name);

				const updateWarning = () => {
					selectionSetting.descEl
						.querySelectorAll(".mod-warning")
						.forEach(el => el.remove());
					if (isConflicting(this.plugin.settings.selectionProperty)) {
						selectionSetting.descEl.createEl("br", {cls: "mod-warning"});
						selectionSetting.descEl.createEl("span", {
							text: `"${this.plugin.settings.selectionProperty}" is also a configured property and will be hidden in the bulk edit dialog`,
							cls: "mod-warning",
						});
					}
				};

				const commitSelectionProperty = async () => {
					const normalized = search.inputEl.value.trim() || "selected";
					if (normalized === this.plugin.settings.selectionProperty) {
						if (search.inputEl.value.trim() === "") {
							search.setValue(normalized);
						}
						return;
					}
					if (isConflicting(normalized)) {
						new Notice(
							`"${normalized}" is already a configured property`,
						);
						search.setValue(this.plugin.settings.selectionProperty);
						return;
					}
					const draft = search.inputEl.value;
					if (await this.updateSetting("selectionProperty", normalized)) {
						if (search.inputEl.value === draft) {
							search.setValue(normalized);
						}
						this.plugin.updateStatusBar();
						updateWarning();
					}
				};

				// Defer blur so a suggestion click can cancel it
				let pendingBlur = 0;

				search
					.setPlaceholder("Selected")
					.setValue(this.plugin.settings.selectionProperty);
				search.inputEl.addEventListener("blur", () => {
					pendingBlur = window.setTimeout(
						() => void commitSelectionProperty(), 0,
					);
				});
				const suggest = new PropertyNameSuggest(this.app, search.inputEl);
				suggest.exclude = () =>
					new Set(this.plugin.settings.properties.map(p => p.name));
				suggest.onSuggestionSelected = () => {
					window.clearTimeout(pendingBlur);
					void commitSelectionProperty();
				};
			});

		if (this.plugin.settings.properties.some(
			p => p.name === this.plugin.settings.selectionProperty,
		)) {
			selectionSetting.descEl.createEl("br", {cls: "mod-warning"});
			selectionSetting.descEl.createEl("span", {
				text: `"${this.plugin.settings.selectionProperty}" is also a configured property and will be hidden in the bulk edit dialog`,
				cls: "mod-warning",
			});
		}

		new Setting(containerEl)
			.setName("Deselect when finished")
			.setDesc("Default value for the deselect toggle in the bulk edit dialog")
			.addToggle(toggle => {
				makeToggleAccessible(toggle, "Deselect when finished", this.plugin.settings.deselectWhenFinished);
				toggle
					.setValue(this.plugin.settings.deselectWhenFinished)
					.onChange(async (value) => {
						updateToggleAriaChecked(toggle, value);
						await this.updateSetting("deselectWhenFinished", value);
					});
			});

		new Setting(containerEl)
			.setName("Show selection count in status bar")
			.setDesc("Display the number of selected files in the status bar")
			.addToggle(toggle => {
				makeToggleAccessible(toggle, "Show selection count in status bar", this.plugin.settings.showStatusBarCount);
				toggle
					.setValue(this.plugin.settings.showStatusBarCount)
					.onChange(async (value) => {
						updateToggleAriaChecked(toggle, value);
						if (await this.updateSetting("showStatusBarCount", value)) {
							this.plugin.updateStatusBar();
						}
					});
			});

		const propertiesHeading = new Setting(containerEl)
			.setName("Properties")
			.setHeading();
		propertiesHeading.descEl.appendText(
			"Configure which properties are available for bulk editing.",
		);
		propertiesHeading.descEl.createEl("br");
		propertiesHeading.descEl.createEl("strong", {
			text: "You must add at least one property to use the bulk-editing feature.",
		});

		for (let i = 0; i < this.plugin.settings.properties.length; i++) {
			const prop = this.plugin.settings.properties[i]!;
			new Setting(containerEl)
				.setName(prop.name)
				.setDesc(PROPERTY_TYPE_LABELS[prop.type])
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
		let typeDropdown: DropdownComponent;
		let lastDetectedName = "";

		function updateAddButton(): void {
			addBtn?.setDisabled(
				nameInputEl.value.trim() === "" || newType === "",
			);
		}

		const tryAutoDetect = (): void => {
			const name = nameInputEl.value.trim();
			if (name === lastDetectedName) return;
			lastDetectedName = name;
			if (name === "") {
				newType = "";
				typeDropdown.setValue("");
				return;
			}
			const detected = detectPropertyType(this.app, name);
			newType = detected ?? "";
			typeDropdown.setValue(detected ?? "");
		};

		const addSetting = new Setting(containerEl)
			.setName("Add property")
			.addSearch(search => {
				search.setPlaceholder("Property name");
				search.onChange(() => updateAddButton());
				nameInputEl = search.inputEl;
				const suggest = new PropertyNameSuggest(this.app, nameInputEl);
				suggest.exclude = () => {
					const names = this.plugin.settings.properties.map(p => p.name);
					names.push(this.plugin.settings.selectionProperty);
					return new Set(names);
				};
				suggest.onSuggestionSelected = () => {
					tryAutoDetect();
					updateAddButton();
				};
				nameInputEl.addEventListener("blur", () => {
					tryAutoDetect();
					updateAddButton();
				});
			})
			.addDropdown(dropdown => {
				typeDropdown = dropdown;
				const placeholder = dropdown.selectEl.createEl("option", {
					value: "",
					text: "Choose type\u2026",
				});
				placeholder.disabled = true;
				placeholder.selected = true;

				const sorted = Object.entries(PROPERTY_TYPE_LABELS)
					.sort(([, a], [, b]) => a.localeCompare(b));
				for (const [value, label] of sorted) {
					dropdown.addOption(value, label);
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
						if (newName === this.plugin.settings.selectionProperty) {
							new Notice(
								`"${newName}" is the selection property and cannot be added`,
							);
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
