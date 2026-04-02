import {App, Modal, Notice, setIcon, Setting, TFile} from "obsidian";
import type BulkPropertiesPlugin from "./main";
import {getSelectedFiles} from "./files";
import {confirmEmptyValue} from "./confirm-modal";
import {withProgress} from "./progress";

/**
 * Validates a tag name against Obsidian's naming rules.
 * Returns null if valid, or a reason string if invalid.
 */
function validateTag(tag: string): string | null {
	if (/\s/.test(tag)) {
		return "Tags can\u2019t contain spaces";
	}
	if (/^\d+$/.test(tag)) {
		return "Tags must contain at least one non-numerical character";
	}
	// Allowed: word chars, hyphens, forward slashes, non-ASCII (emoji, symbols, etc.)
	if (/[^\w\-/\u{0080}-\u{10FFFF}]/u.test(tag)) {
		return "Tags can only contain letters, numbers, underscores, hyphens, and forward slashes";
	}
	return null;
}

function coerceValue(raw: string, type: string): unknown {
	switch (type) {
		case "number": {
			if (raw === "") return null;
			const n = Number(raw);
			if (isNaN(n)) {
				throw new Error(`Invalid number: "${raw}"`);
			}
			return n;
		}
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
	private valueContainerEl!: HTMLElement;
	private countEl!: HTMLElement;
	private pendingSaves: Map<TFile, Promise<void>> = new Map();
	private fileCheckboxes: Map<TFile, HTMLInputElement> = new Map();
	private updateBtn!: HTMLButtonElement;
	private selectAllBtn!: HTMLButtonElement;
	private deselectAllBtn!: HTMLButtonElement;
	private uiLocked = false;

	constructor(app: App, plugin: BulkPropertiesPlugin) {
		super(app);
		this.plugin = plugin;
		this.deselectWhenFinished = plugin.settings.deselectWhenFinished;
		const files = getSelectedFiles(app, plugin.settings.selectionProperty);
		this.fileSelection = new Map(files.map(f => [f, true]));
	}

	override onOpen() {
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
			this.fileCheckboxes.set(file, checkbox);
			row.createEl("span", {text: file.path, cls: "bulk-properties-file-path"});
			checkbox.addEventListener("change", () => {
				void this.toggleSelection(file, checkbox);
			});
		}

		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText("Select all").onClick(() => {
					void this.bulkSetSelection(true);
				});
				this.selectAllBtn = btn.buttonEl;
			})
			.addButton(btn => {
				btn.setButtonText("Deselect all").onClick(() => {
					void this.bulkSetSelection(false);
				});
				this.deselectAllBtn = btn.buttonEl;
			});

		const editableProperties = settings.properties.filter(p => p.name !== settings.selectionProperty);

		if (editableProperties.length === 0) {
			contentEl.createEl("p", {text: "No properties configured. Add properties in the plugin settings."});
			return;
		}

		const lastSelected = settings.lastSelectedProperty;
		const rememberedExists = lastSelected && editableProperties.some(p => p.name === lastSelected);
		this.selectedProperty = rememberedExists ? lastSelected : editableProperties[0]?.name ?? "";

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

	override onClose() {
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
		if (this.updateBtn && !this.uiLocked) {
			this.updateBtn.disabled = checked === 0;
		}
	}

	private async writeSelection(file: TFile, selected: boolean): Promise<void> {
		const selProp = this.plugin.settings.selectionProperty;
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm[selProp] = selected;
		});
		this.fileSelection.set(file, selected);
	}

	private async toggleSelection(file: TFile, checkbox: HTMLInputElement) {
		const desired = checkbox.checked;
		checkbox.disabled = true;

		const previous = this.pendingSaves.get(file) ?? Promise.resolve();
		const save = previous.then(async () => {
			try {
				await this.writeSelection(file, desired);
			} catch (err: unknown) {
				console.error(`bulk-properties: failed to toggle selection for ${file.path}:`, err);
				checkbox.checked = !desired;
				new Notice(`Failed to update selection for ${file.path}`);
			} finally {
				if (this.pendingSaves.get(file) === save) {
					this.pendingSaves.delete(file);
				}
			}
			this.updateCountText();
			if (!this.uiLocked) {
				checkbox.disabled = false;
			}
		});
		this.pendingSaves.set(file, save);
	}

	private async bulkSetSelection(selected: boolean) {
		this.uiLocked = true;
		this.setUIEnabled(false);
		try {
			await Promise.all(this.pendingSaves.values());

			const filesToChange = [...this.fileSelection.entries()]
				.filter(([, current]) => current !== selected)
				.map(([file]) => file);

			const failed: string[] = [];
			const saves = filesToChange.map((file) => {
				const previous = this.pendingSaves.get(file) ?? Promise.resolve();
				const save = previous.then(async () => {
					try {
						await this.writeSelection(file, selected);
						const checkbox = this.fileCheckboxes.get(file);
						if (checkbox) {
							checkbox.checked = selected;
						}
					} catch (err: unknown) {
						console.error(`bulk-properties: failed to set selection for ${file.path}:`, err);
						failed.push(file.path);
					} finally {
						if (this.pendingSaves.get(file) === save) {
							this.pendingSaves.delete(file);
						}
					}
				});
				this.pendingSaves.set(file, save);
				return save;
			});
			await Promise.all(saves);

			this.updateCountText();
			if (failed.length > 0) {
				new Notice(`Failed to update selection for ${failed.length} file${failed.length === 1 ? "" : "s"}: ${failed.join(", ")}`);
			}
		} finally {
			this.uiLocked = false;
			this.setUIEnabled(true);
		}
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
			case "multitext": {
				const pills: string[] = [];
				const dedupTypes = new Set(["tags", "aliases"]);
				const shouldDedup = dedupTypes.has(type);

				const syncRawValue = () => {
					this.rawValue = pills.join(",");
				};

				const pillContainer = setting.controlEl.createDiv({
					cls: "bulk-properties-pill-container",
				});
				const pillInput = pillContainer.createEl("input", {
					cls: "bulk-properties-pill-input",
					attr: {placeholder: "Type and press enter"},
				});

				const renderPills = () => {
					pillContainer
						.querySelectorAll(".multi-select-pill")
						.forEach(el => el.remove());
					for (let i = 0; i < pills.length; i++) {
						const value = pills[i] ?? "";
						const pill = pillContainer.createSpan({
							cls: "multi-select-pill",
						});
						pill.createSpan({
							cls: "multi-select-pill-content",
							text: value,
						});
						const removeBtn = pill.createSpan({
							cls: "multi-select-pill-remove-button",
							attr: {
								"aria-label": `Remove ${value}`,
								"role": "button",
								"tabindex": "0",
							},
						});
						setIcon(removeBtn, "x");
						const idx = i;
						const doRemove = () => {
							pills.splice(idx, 1);
							renderPills();
							syncRawValue();
							pillInput.focus();
						};
						removeBtn.addEventListener("click", doRemove);
						removeBtn.addEventListener("keydown", (e: KeyboardEvent) => {
							if (e.key === "Enter") {
								e.preventDefault();
								doRemove();
							} else if (e.key === " ") {
								e.preventDefault();
							}
						});
						removeBtn.addEventListener("keyup", (e: KeyboardEvent) => {
							if (e.key === " ") {
								e.preventDefault();
								doRemove();
							}
						});
					}
					pillContainer.appendChild(pillInput);
				};

				const addPill = (text: string) => {
					let trimmed = text.trim();
					if (trimmed === "") return;
					if (type === "tags") {
						trimmed = trimmed.replace(/^#/, "");
						if (trimmed === "") {
							new Notice("Tag name can\u2019t be empty");
							return;
						}
						const reason = validateTag(trimmed);
						if (reason !== null) {
							new Notice(reason);
							return;
						}
					}
					if (shouldDedup && pills.includes(trimmed)) return;
					pills.push(trimmed);
					renderPills();
					syncRawValue();
				};

				const removeLast = () => {
					if (pills.length === 0) return;
					pills.pop();
					renderPills();
					syncRawValue();
				};

				pillInput.addEventListener("keydown", (e: KeyboardEvent) => {
					if (e.isComposing) return;
					if (e.key === "Enter" || e.key === ",") {
						e.preventDefault();
						addPill(pillInput.value);
						pillInput.value = "";
					} else if (
						e.key === "Backspace" &&
						pillInput.value === ""
					) {
						removeLast();
					}
				});

				pillInput.addEventListener("paste", (e: ClipboardEvent) => {
					e.preventDefault();
					const pasted =
						e.clipboardData?.getData("text") ?? "";
					const start = pillInput.selectionStart ?? 0;
					const end = pillInput.selectionEnd ?? 0;
					const before = pillInput.value.slice(0, start);
					const after = pillInput.value.slice(end);
					const combined = before + pasted + after;
					const parts = combined.split(",");
					const trailing = parts.pop() ?? "";
					for (const part of parts) {
						addPill(part);
					}
					pillInput.value = trailing;
				});

				pillContainer.addEventListener("focusout", (e: FocusEvent) => {
					const next = e.relatedTarget;
					if (
						next instanceof Node &&
						pillContainer.contains(next)
					) {
						return;
					}
					if (pillInput.value.trim() !== "") {
						addPill(pillInput.value);
						pillInput.value = "";
					}
				});

				pillContainer.addEventListener("click", (e: MouseEvent) => {
					if (e.target === pillContainer) {
						pillInput.focus();
					}
				});
				break;
			}

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
		for (const cb of this.fileCheckboxes.values()) {
			cb.disabled = !enabled;
		}
		if (this.selectAllBtn) this.selectAllBtn.disabled = !enabled;
		if (this.deselectAllBtn) this.deselectAllBtn.disabled = !enabled;
		if (this.updateBtn) {
			this.updateBtn.disabled = !enabled || this.getCheckedFiles().length === 0;
		}
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

		let value: unknown;
		try {
			value = coerceValue(this.rawValue, type);
		} catch (err: unknown) {
			this.uiLocked = false;
			this.setUIEnabled(true);
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(msg);
			return;
		}

		const selProp = this.plugin.settings.selectionProperty;
		const deselect = this.deselectWhenFinished;

		this.plugin.settings.lastSelectedProperty = property;
		try {
			await this.plugin.saveSettings();
		} catch (err: unknown) {
			console.warn("bulk-properties: failed to save lastSelectedProperty:", err);
		}

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
