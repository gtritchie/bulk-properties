import {App, ButtonComponent, DropdownComponent, Modal, Notice, Setting} from "obsidian";
import type BulkPropertiesPlugin from "./main";
import {
	detectPropertyType,
	PROPERTY_TYPE_LABELS,
	PropertyNameSuggest,
	type PropertyConfig,
	type PropertyType,
} from "./property-types";

/**
 * Form for adding a property to the bulk-editing list, opened from the
 * settings tab's property list. Collects a name (with vault-wide
 * autocomplete and type auto-detection) and a type, validating against
 * the selection property and already-configured properties.
 */
export class AddPropertyModal extends Modal {
	private readonly plugin: BulkPropertiesPlugin;
	private readonly onSubmit: (config: PropertyConfig) => void;

	constructor(
		app: App,
		plugin: BulkPropertiesPlugin,
		onSubmit: (config: PropertyConfig) => void,
	) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	override onOpen(): void {
		this.setTitle("Add property");
		const {contentEl} = this;

		let nameInputEl: HTMLInputElement;
		let selectedType: PropertyType | "" = "";
		let typeDropdown: DropdownComponent;
		let addBtn: ButtonComponent | undefined;
		let lastDetectedName = "";

		const updateAddButton = (): void => {
			addBtn?.setDisabled(
				nameInputEl.value.trim() === "" || selectedType === "",
			);
		};

		const tryAutoDetect = (): void => {
			const name = nameInputEl.value.trim();
			if (name === lastDetectedName) return;
			lastDetectedName = name;
			if (name === "") {
				selectedType = "";
				typeDropdown.setValue("");
				return;
			}
			const detected = detectPropertyType(this.app, name);
			selectedType = detected ?? "";
			typeDropdown.setValue(detected ?? "");
		};

		new Setting(contentEl)
			.setName("Name")
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
			});

		new Setting(contentEl)
			.setName("Type")
			.addDropdown(dropdown => {
				typeDropdown = dropdown;
				const placeholder = dropdown.selectEl.createEl("option", {
					value: "",
					text: "Choose type…",
				});
				placeholder.selected = true;

				const sorted = Object.entries(PROPERTY_TYPE_LABELS)
					.sort(([, a], [, b]) => a.localeCompare(b));
				for (const [value, label] of sorted) {
					dropdown.addOption(value, label);
				}
				dropdown.onChange(value => {
					selectedType = value as PropertyType | "";
					updateAddButton();
				});
			});

		new Setting(contentEl)
			.addButton(btn => {
				addBtn = btn;
				btn.setButtonText("Add")
					.setCta()
					.setDisabled(true)
					.onClick(() => {
						const name = nameInputEl.value.trim();
						if (!name || selectedType === "") {
							return;
						}
						if (name === this.plugin.settings.selectionProperty) {
							new Notice(
								`"${name}" is the selection property and cannot be added`,
							);
							return;
						}
						if (this.plugin.settings.properties.some(
							p => p.name === name,
						)) {
							new Notice(
								`Property "${name}" is already configured`,
							);
							return;
						}
						this.onSubmit({name, type: selectedType});
						this.close();
					});
			})
			.addButton(btn => btn
				.setButtonText("Cancel")
				.onClick(() => this.close()));
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
