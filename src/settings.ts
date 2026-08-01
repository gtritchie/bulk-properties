import {App, Notice, PluginSettingTab, type Setting, type SettingDefinitionItem} from "obsidian";
import type BulkPropertiesPlugin from "./main";
import {AddPropertyModal} from "./add-property-modal";
import {
	detectPropertyType,
	PROPERTY_TYPE_LABELS,
	PropertyNameSuggest,
	type PropertyConfig,
} from "./property-types";

export interface BulkPropertiesSettings {
	deselectWhenFinished: boolean;
	selectionProperty: string;
	properties: PropertyConfig[];
	lastSelectedProperty: string;
	showStatusBarCount: boolean;
	showLargeOperationWarning: boolean;
}

export const DEFAULT_SETTINGS: BulkPropertiesSettings = {
	deselectWhenFinished: true,
	selectionProperty: "selected",
	properties: [],
	lastSelectedProperty: "",
	showStatusBarCount: true,
	showLargeOperationWarning: true,
};

export class BulkPropertiesSettingTab extends PluginSettingTab {
	plugin: BulkPropertiesPlugin;

	constructor(app: App, plugin: BulkPropertiesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		// Snapshot of the list this render was built from. The framework
		// reports delete indices relative to the rendered rows, so names
		// are resolved against this snapshot, not the live settings,
		// which a queued save may have already advanced.
		const rendered = this.plugin.settings.properties;
		return [
			{
				name: "Selection property",
				desc: "The checkbox property used to mark notes as selected",
				render: setting => {
					this.renderSelectionProperty(setting);
				},
			},
			{
				name: "Deselect when finished",
				desc: "Default value for the deselect toggle in the bulk edit dialog",
				control: {type: "toggle", key: "deselectWhenFinished"},
			},
			{
				name: "Show selection count in status bar",
				desc: "Display the number of selected notes in the status bar",
				control: {type: "toggle", key: "showStatusBarCount"},
			},
			{
				name: "Warn after large operations",
				desc: "Re-enable the metadata cache warning after dismissing it. Shown after operations that modify many notes.",
				control: {type: "toggle", key: "showLargeOperationWarning"},
			},
			{
				type: "list",
				heading: "Properties",
				emptyState: "No properties configured. Add at least one property to use the bulk-editing feature.",
				addItem: {
					name: "Add property",
					action: () => {
						this.openAddPropertyModal();
					},
				},
				onDelete: index => {
					const name = rendered[index]?.name;
					if (name === undefined) return;
					void this.mutateProperties(current =>
						current.filter(p => p.name !== name));
				},
				onReorder: (oldIndex, newIndex) => {
					void this.mutateProperties(current => {
						const updated = [...current];
						const [moved] = updated.splice(oldIndex, 1);
						if (!moved) return current;
						updated.splice(newIndex, 0, moved);
						return updated;
					});
				},
				items: rendered.map(prop => ({
					name: prop.name,
					desc: PROPERTY_TYPE_LABELS[prop.type],
					searchable: false,
				})),
			},
		];
	}

	/**
	 * Framework write path for `control` definitions. Routes through the
	 * plugin's serialized copy-on-write save queue instead of the default
	 * direct mutation + saveData(), and re-renders on failure so the
	 * control reverts to the stored value.
	 */
	override async setControlValue(key: string, value: unknown): Promise<void> {
		const k = key as keyof BulkPropertiesSettings;
		const saved = await this.saveSetting(
			k,
			value as BulkPropertiesSettings[keyof BulkPropertiesSettings],
		);
		if (!saved) {
			this.update();
			return;
		}
		if (k === "showStatusBarCount") {
			this.plugin.updateStatusBar();
		}
	}

	/**
	 * Persists a single setting through the plugin's serialized
	 * copy-on-write save queue. Returns false after notifying the user
	 * when the write fails.
	 */
	private async saveSetting<K extends keyof BulkPropertiesSettings>(
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

	private renderSelectionProperty(setting: Setting): void {
		const isConflicting = (name: string) =>
			this.plugin.settings.properties.some(p => p.name === name);

		const updateWarning = () => {
			setting.descEl
				.querySelectorAll(".mod-warning")
				.forEach(el => el.remove());
			if (isConflicting(this.plugin.settings.selectionProperty)) {
				setting.descEl.createEl("br", {cls: "mod-warning"});
				setting.descEl.createSpan({
					text: `"${this.plugin.settings.selectionProperty}" is also a configured property and will be hidden in the bulk edit dialog`,
					cls: "mod-warning",
				});
			}
			const type = detectPropertyType(this.app, this.plugin.settings.selectionProperty);
			if (type !== null && type !== "checkbox") {
				setting.descEl.createEl("br", {cls: "mod-warning"});
				setting.descEl.createSpan({
					text: `The selection property must be a Checkbox type; this property has the ${PROPERTY_TYPE_LABELS[type]} type`,
					cls: "mod-warning",
				});
			}
		};

		setting.addSearch(search => {
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
				if (await this.saveSetting("selectionProperty", normalized)) {
					if (search.inputEl.value === draft) {
						search.setValue(normalized);
					}
					this.plugin.updateStatusBar();
					updateWarning();
				}
			};

			// Defer blur so a suggestion click can cancel it
			let pendingBlur = 0;
			const win = search.inputEl.win;

			search
				.setPlaceholder("Selected")
				.setValue(this.plugin.settings.selectionProperty);
			search.inputEl.addEventListener("blur", () => {
				pendingBlur = win.setTimeout(
					() => void commitSelectionProperty(), 0,
				);
			});
			const suggest = new PropertyNameSuggest(this.app, search.inputEl);
			suggest.exclude = () =>
				new Set(this.plugin.settings.properties.map(p => p.name));
			suggest.onSuggestionSelected = () => {
				win.clearTimeout(pendingBlur);
				void commitSelectionProperty();
			};
		});

		updateWarning();
	}

	private openAddPropertyModal(): void {
		new AddPropertyModal(this.app, this.plugin, config => {
			void this.mutateProperties(current =>
				current.some(p => p.name === config.name)
					? current
					: [...current, config],
			);
		}).open();
	}

	/**
	 * Applies a transformation to the properties list through the save
	 * queue. The transform must not mutate its input: it receives the
	 * latest saved list (so rapid list actions compose instead of
	 * overwriting each other) and returns a new array. Re-renders from
	 * stored settings afterwards, which also reverts the UI when the
	 * save fails.
	 */
	private async mutateProperties(
		transform: (current: PropertyConfig[]) => PropertyConfig[],
	): Promise<void> {
		try {
			await this.plugin.updateSettingWith("properties", transform);
		} catch (err: unknown) {
			console.error("bulk-properties: failed to save settings:", err);
			new Notice("Failed to save settings. Check disk space and permissions.");
		}
		this.update();
	}
}
