import {App, Modal, Notice, Setting, TFile} from "obsidian";
import type BasepropPlugin from "./main";

function getSelectedFiles(app: App, selectionProperty: string): TFile[] {
	const files: TFile[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.frontmatter?.[selectionProperty] === true) {
			files.push(file);
		}
	}
	return files;
}

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
	private plugin: BasepropPlugin;
	private selectedFiles: TFile[];
	private selectedProperty = "";
	private rawValue = "";
	private deselectWhenFinished: boolean;
	private valueContainerEl: HTMLElement;

	constructor(app: App, plugin: BasepropPlugin) {
		super(app);
		this.plugin = plugin;
		this.deselectWhenFinished = plugin.settings.deselectWhenFinished;
		this.selectedFiles = getSelectedFiles(app, plugin.settings.selectionProperty);
	}

	onOpen() {
		const {contentEl} = this;
		const {settings} = this.plugin;
		contentEl.addClass("baseprop-modal");

		contentEl.createEl("h2", {text: "Bulk edit properties"});

		if (this.selectedFiles.length === 0) {
			contentEl.createEl("p", {
				text: `No files have the "${settings.selectionProperty}" property checked. Mark files by setting their "${settings.selectionProperty}" checkbox property to true.`,
			});
			return;
		}

		contentEl.createEl("p", {
			text: `${this.selectedFiles.length} file${this.selectedFiles.length === 1 ? "" : "s"} selected`,
		});

		if (settings.properties.length === 0) {
			contentEl.createEl("p", {text: "No properties configured. Add properties in the plugin settings."});
			return;
		}

		this.selectedProperty = settings.properties[0]?.name ?? "";

		new Setting(contentEl)
			.setName("Property")
			.addDropdown(dropdown => {
				for (const prop of settings.properties) {
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
			.addButton(btn => btn
				.setButtonText("Update")
				.setCta()
				.onClick(() => {
					void this.doUpdate();
				}));
	}

	onClose() {
		this.contentEl.empty();
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
				numInput.className = "baseprop-number-input";
				numInput.addEventListener("input", () => {
					this.rawValue = numInput.value;
				});
				setting.controlEl.appendChild(numInput);
				break;
			}

			case "date": {
				const dateInput = document.createElement("input");
				dateInput.type = "date";
				dateInput.className = "baseprop-date-input";
				dateInput.addEventListener("input", () => {
					this.rawValue = dateInput.value;
				});
				setting.controlEl.appendChild(dateInput);
				break;
			}

			case "datetime": {
				const dtInput = document.createElement("input");
				dtInput.type = "datetime-local";
				dtInput.className = "baseprop-date-input";
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

	private async doUpdate() {
		const property = this.selectedProperty;
		const type = this.getPropertyType(property);
		const value = coerceValue(this.rawValue, type);
		const selProp = this.plugin.settings.selectionProperty;

		let succeeded = 0;
		const failed: string[] = [];
		for (const file of this.selectedFiles) {
			try {
				await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
					fm[property] = value;
					if (this.deselectWhenFinished) {
						fm[selProp] = false;
					}
				});
				succeeded++;
			} catch {
				failed.push(file.path);
			}
		}

		if (failed.length === 0) {
			new Notice(`Updated "${property}" in ${succeeded} file${succeeded === 1 ? "" : "s"}`);
		} else {
			new Notice(`Updated ${succeeded} file${succeeded === 1 ? "" : "s"}, failed on ${failed.length}: ${failed.join(", ")}`);
		}
		this.close();
	}
}
