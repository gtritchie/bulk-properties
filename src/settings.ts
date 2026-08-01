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
				render: setting => this.renderSelectionProperty(setting),
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
				// The declarative API has no slot for text under a group
				// heading, so the guidance the imperative tab showed there
				// lives in the empty state — shown exactly when it applies.
				emptyState: createFragment(fragment => {
					fragment.appendText(
						"Configure which properties are available for bulk editing.",
					);
					fragment.createEl("br");
					fragment.createEl("strong", {
						text: "You must add at least one property to use the bulk-editing feature.",
					});
				}),
				addItem: {
					name: "Add property",
					action: () => {
						this.openAddPropertyModal();
					},
				},
				onDelete: index => {
					// Out-of-range indices are reachable: on mobile the
					// add-item row shares the list element, and the
					// keyboard delete handler indexes across all rows.
					const name = rendered[index]?.name;
					if (name === undefined) return;
					void this.mutateProperties(current =>
						current.filter(p => p.name !== name));
				},
				onReorder: (oldIndex, newIndex) => {
					this.reorderProperty(rendered, oldIndex, newIndex);
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
		// The casts below erase compile-time checking, so fail fast on a
		// key or value a future control definition could get wrong —
		// otherwise the bad write would persist silently into data.json.
		if (!(key in DEFAULT_SETTINGS)
			|| typeof value !== typeof DEFAULT_SETTINGS[key as keyof BulkPropertiesSettings]) {
			console.error(
				`bulk-properties: rejected control write for "${key}": unknown key or mismatched value type`,
			);
			return;
		}
		const k = key as keyof BulkPropertiesSettings;
		// Captured before the await: if the save fails, only the element
		// that was focused when the user changed this control may be
		// blurred — focus may have since moved to an unrelated control
		// (blurring the selection-property input would commit its draft).
		const activeBefore = this.containerEl.doc.activeElement;
		const saved = await this.saveSetting(
			k,
			value as BulkPropertiesSettings[keyof BulkPropertiesSettings],
		);
		if (!saved) {
			// The framework skips re-rendering a control row that holds
			// focus, so drop focus first or the revert won't reach the
			// control the user just changed.
			const active = this.containerEl.doc.activeElement;
			if (active instanceof HTMLElement && active === activeBefore) {
				active.blur();
			}
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

	private renderSelectionProperty(setting: Setting): () => void {
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

		let flushPendingCommit = (): void => {};

		setting.addSearch(search => {
			// The value the input was last set to programmatically. A
			// commit proceeds only when the user edited past this
			// baseline, so a stale replacement row rendered while an
			// earlier save was in flight can never commit its unedited
			// value back over the newer save — focus or blur on an
			// untouched input is not commit intent.
			let baseline = this.plugin.settings.selectionProperty;

			const commitSelectionProperty = async () => {
				if (search.inputEl.value === baseline) return;
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
					baseline = this.plugin.settings.selectionProperty;
					return;
				}
				const draft = search.inputEl.value;
				if (await this.saveSetting("selectionProperty", normalized)) {
					baseline = normalized;
					if (!search.inputEl.isConnected) {
						// The row was torn down while the save was in
						// flight; re-render so the replacement row shows
						// the newly stored value instead of a stale one.
						this.plugin.updateStatusBar();
						this.update();
						return;
					}
					if (search.inputEl.value === draft) {
						search.setValue(normalized);
					}
					this.plugin.updateStatusBar();
					updateWarning();
				} else if (search.inputEl.value === draft) {
					// Save failed: revert the draft so the input shows
					// the stored value, like every other failure path.
					search.setValue(this.plugin.settings.selectionProperty);
					baseline = this.plugin.settings.selectionProperty;
				}
			};

			// Defer blur so a suggestion click can cancel it
			let pendingBlur = 0;
			const win = search.inputEl.win;

			// Runs when the framework tears the row down (modal closed,
			// or update() re-rendering the tab). Commit only on real
			// intent — a scheduled blur commit, or the input still
			// holding focus (closing the modal fires no blur) — so the
			// cleanup of an untouched replacement row can never commit
			// its stale rendered value back over a newer save.
			flushPendingCommit = () => {
				const focused =
					search.inputEl.doc.activeElement === search.inputEl;
				if (pendingBlur !== 0 || focused) {
					win.clearTimeout(pendingBlur);
					pendingBlur = 0;
					void commitSelectionProperty();
				}
			};

			search
				.setPlaceholder("Selected")
				.setValue(this.plugin.settings.selectionProperty);
			search.inputEl.addEventListener("blur", () => {
				pendingBlur = win.setTimeout(() => {
					pendingBlur = 0;
					void commitSelectionProperty();
				}, 0);
			});
			const suggest = new PropertyNameSuggest(this.app, search.inputEl);
			suggest.exclude = () =>
				new Set(this.plugin.settings.properties.map(p => p.name));
			suggest.onSuggestionSelected = () => {
				win.clearTimeout(pendingBlur);
				pendingBlur = 0;
				void commitSelectionProperty();
			};
		});

		updateWarning();
		return () => flushPendingCommit();
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
	 * Queues a reorder captured as identities rather than positions: the
	 * moved row plus all rendered rows on each side of its destination.
	 * Indices alone would target the wrong entry if another mutation
	 * composes ahead of this one in the queue. The transform inserts
	 * before the nearest surviving successor, else after the nearest
	 * surviving predecessor, and falls back to the numeric index only
	 * when nothing around the destination survives.
	 */
	private reorderProperty(
		rendered: PropertyConfig[],
		oldIndex: number,
		newIndex: number,
	): void {
		// Same out-of-range guard as onDelete: the mobile add-item row
		// shares the list element, so bad indices are reachable.
		const moved = rendered[oldIndex];
		if (!moved) return;
		const remaining = rendered.filter((_, i) => i !== oldIndex);
		const successors = remaining.slice(newIndex).map(p => p.name);
		const predecessors = remaining.slice(0, newIndex).map(p => p.name).reverse();

		void this.mutateProperties(current => {
			const item = current.find(p => p.name === moved.name);
			if (!item) return current;
			const rest = current.filter(p => p !== item);
			let to = -1;
			for (const name of successors) {
				to = rest.findIndex(p => p.name === name);
				if (to >= 0) break;
			}
			if (to < 0) {
				for (const name of predecessors) {
					const at = rest.findIndex(p => p.name === name);
					if (at >= 0) {
						to = at + 1;
						break;
					}
				}
			}
			if (to < 0) {
				to = Math.min(newIndex, rest.length);
			}
			return [...rest.slice(0, to), item, ...rest.slice(to)];
		});
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
