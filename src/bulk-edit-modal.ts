import {App, Modal, Notice, Setting, TFile} from "obsidian";
import type BulkPropertiesPlugin from "./main";
import {getSelectedFiles} from "./files";
import {confirmEmptyValue} from "./confirm-modal";
import {withProgress} from "./progress";

function coerceValue(raw: string, type: string): unknown {
	switch (type) {
		case "number":
			return raw === "" ? null : Number(raw);
		case "checkbox":
			return raw === "true";
		case "date":
		case "datetime":
			return raw === "" ? null : raw;
		case "tags":
		case "aliases":
		case "multitext":
			return raw
				.split(",")
				.map(s => s.trim())
				.filter(s => s.length > 0);
		default:
			return raw;
	}
}

export class BulkEditModal extends Modal {
	private plugin: BulkPropertiesPlugin;
	private fileSelection: Map<TFile, boolean>;
	private selectedProperty = "";
	private rawValue = "";
	private deselectWhenFinished: boolean;
	private valueContainerEl: HTMLElement;
	private countEl: HTMLElement;
	private pendingSaves: Map<TFile, Promise<void>> = new Map();
	private fileCheckboxes: HTMLInputElement[] = [];
	private updateBtn: HTMLButtonElement;
	private uiLocked = false;

	constructor(app: App, plugin: BulkPropertiesPlugin) {
		super(app);
		this.plugin = plugin;
		this.deselectWhenFinished = plugin.settings.deselectWhenFinished;
		const files = getSelectedFiles(app, plugin.settings.selectionProperty);
		this.fileSelection = new Map(files.map(f => [f, true]));
	}

	onOpen() {
		const {contentEl} = this;
		const {settings} = this.plugin;
		contentEl.addClass("bulk-properties-modal");

		new Setting(contentEl).setName("Bulk edit properties").setHeading();

		if (this.fileSelection.size === 0) {
			contentEl.createEl("p", {
				text: `No files have the "${settings.selectionProperty}" property checked. Mark files by setting their "${settings.selectionProperty}" checkbox property to true.`,
			});
			return;
		}

		this.countEl = contentEl.createEl("p");
		this.updateCountText();

		const listEl = contentEl.createDiv({cls: "bulk-properties-file-list"});
		for (const [file, checked] of this.fileSelection) {
			const row = listEl.createDiv({cls: "bulk-properties-file-row"});
			const checkbox = row.createEl("input", {type: "checkbox"});
			checkbox.type = "checkbox";
			checkbox.checked = checked;
			this.fileCheckboxes.push(checkbox);
			row.createEl("span", {text: file.path, cls: "bulk-properties-file-path"});
			checkbox.addEventListener("change", () => {
				void this.toggleSelection(file, checkbox);
			});
		}

		const editableProperties = settings.properties.filter(p => p.name !== settings.selectionProperty);

		if (editableProperties.length === 0) {
			contentEl.createEl("p", {text: "No properties configured. Add properties in the plugin settings."});
			return;
		}

		this.selectedProperty = editableProperties[0]?.name ?? "";

		new Setting(contentEl)
			.setName("Property")
			.addDropdown(dropdown => {
				for (const prop of editableProperties) {
					dropdown.addOption(prop.name, prop.name);
				}
				dropdown.setValue(this.selectedProperty);
				dropdown.onChange(value => {
					this.selectedProperty = value;
					this.renderValueInput();
				});
			});

		this.valueContainerEl = contentEl.createDiv();
		this.renderValueInput();

		new Setting(contentEl)
			.setName("Deselect when finished")
			.addToggle(toggle => toggle
				.setValue(this.deselectWhenFinished)
				.onChange(value => {
					this.deselectWhenFinished = value;
				}));

		new Setting(contentEl)
			.addButton(btn => {
				btn
					.setButtonText("Update")
					.setCta()
					.onClick(() => {
						void this.doUpdate();
					});
				this.updateBtn = btn.buttonEl;
			});
	}

	onClose() {
		this.contentEl.empty();
	}

	private getCheckedFiles(): TFile[] {
		return [...this.fileSelection.entries()]
			.filter(([, checked]) => checked)
			.map(([file]) => file);
	}

	private updateCountText() {
		const checked = this.getCheckedFiles().length;
		const total = this.fileSelection.size;
		this.countEl.setText(`${checked} of ${total} file${total === 1 ? "" : "s"} selected`);
	}

	private async toggleSelection(file: TFile, checkbox: HTMLInputElement) {
		const desired = checkbox.checked;
		checkbox.disabled = true;

		const previous = this.pendingSaves.get(file) ?? Promise.resolve();
		const save = previous.then(async () => {
			const selProp = this.plugin.settings.selectionProperty;
			try {
				await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
					fm[selProp] = desired;
				});
				this.fileSelection.set(file, desired);
			} catch (err: unknown) {
				console.error(`bulk-properties: failed to toggle selection for ${file.path}:`, err);
				checkbox.checked = !desired;
				new Notice(`Failed to update selection for ${file.path}`);
			}
			this.updateCountText();
			if (!this.uiLocked) {
				checkbox.disabled = false;
			}
		});
		this.pendingSaves.set(file, save);
	}

	private getPropertyType(name: string): string {
		const prop = this.plugin.settings.properties.find(p => p.name === name);
		return prop?.type ?? "text";
	}

	private renderValueInput() {
		this.valueContainerEl.empty();
		this.rawValue = "";
		const type = this.getPropertyType(this.selectedProperty);

		const setting = new Setting(this.valueContainerEl).setName("New value");

		switch (type) {
			case "checkbox":
				this.rawValue = "false";
				setting.addToggle(toggle => toggle
					.setValue(false)
					.onChange(value => {
						this.rawValue = String(value);
					}));
				break;

			case "number": {
				const numInput = document.createElement("input");
				numInput.type = "number";
				numInput.className = "bulk-properties-number-input";
				numInput.addEventListener("input", () => {
					this.rawValue = numInput.value;
				});
				setting.controlEl.appendChild(numInput);
				break;
			}

			case "date": {
				const dateInput = document.createElement("input");
				dateInput.type = "date";
				dateInput.className = "bulk-properties-date-input";
				dateInput.addEventListener("input", () => {
					this.rawValue = dateInput.value;
				});
				setting.controlEl.appendChild(dateInput);
				break;
			}

			case "datetime": {
				const dtInput = document.createElement("input");
				dtInput.type = "datetime-local";
				dtInput.className = "bulk-properties-date-input";
				dtInput.addEventListener("input", () => {
					this.rawValue = dtInput.value;
				});
				setting.controlEl.appendChild(dtInput);
				break;
			}

			case "tags":
			case "aliases":
			case "multitext":
				setting.setDesc("Comma-separated values");
				setting.addTextArea(area => area
					.setPlaceholder("Value1, value2, value3")
					.onChange(value => {
						this.rawValue = value;
					}));
				break;

			default:
				setting.addText(text => text
					.setPlaceholder("Enter value")
					.onChange(value => {
						this.rawValue = value;
					}));
				break;
		}
	}

	private setUIEnabled(enabled: boolean) {
		for (const cb of this.fileCheckboxes) {
			cb.disabled = !enabled;
		}
		this.updateBtn.disabled = !enabled;
	}

	private async doUpdate() {
		this.uiLocked = true;
		this.setUIEnabled(false);
		await Promise.all(this.pendingSaves.values());

		const property = this.selectedProperty;
		const type = this.getPropertyType(property);
		const filesToUpdate = this.getCheckedFiles();

		if (type !== "checkbox" && this.rawValue.trim() === "") {
			const confirmed = await confirmEmptyValue(this.app, property, filesToUpdate.length);
			if (!confirmed) {
				this.uiLocked = false;
				this.setUIEnabled(true);
				return;
			}
		}

		const value = coerceValue(this.rawValue, type);
		const selProp = this.plugin.settings.selectionProperty;
		const deselect = this.deselectWhenFinished;

		this.close();

		const result = await withProgress(
			filesToUpdate,
			"Updating",
			async (file) => {
				await this.app.fileManager.processFrontMatter(
					file,
					(fm: Record<string, unknown>) => {
						fm[property] = value;
						if (deselect) {
							fm[selProp] = false;
						}
					},
				);
			},
		);

		const {succeeded, failed, cancelled, total} = result;
		let msg = `Updated "${property}" in ${succeeded} file${succeeded === 1 ? "" : "s"}`;
		if (cancelled) {
			msg = `Updated "${property}" in ${succeeded} of ${total} file${total === 1 ? "" : "s"} (cancelled)`;
		}
		if (failed.length > 0) {
			msg += `, failed on ${failed.length}: ${failed.join(", ")}`;
		}
		new Notice(msg);
	}
}
