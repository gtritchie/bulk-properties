import {AbstractInputSuggest, App, Modal, Notice, setIcon, Setting, TFile} from "obsidian";
import type BulkPropertiesPlugin from "./main";
import {getPropertyValues, getSelectedFiles} from "./files";
import {confirmDeleteFiles, confirmEmptyValue, confirmReplace} from "./confirm-modal";
import {
	shouldWarnLargeOperation,
	showLargeOperationNotice,
} from "./large-operation-notice";
import {withProgress} from "./progress";
import {makeToggleAccessible, updateToggleAriaChecked} from "./accessible-toggle";

// `app.setting` is an undocumented internal API used by core plugins to
// open the settings pane. Declared here as an optional property so it
// can be accessed type-safely without reaching for `any`; all usages
// are runtime-guarded.
type AppWithSetting = App & {
	setting?: {
		open?: () => void;
		openTabById?: (id: string) => void;
	};
};

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

type ArrayAction = "merge" | "replace" | "delete";

const ARRAY_TYPES = new Set(["tags", "aliases", "multitext"]);
const DEDUP_TYPES = new Set(["tags", "aliases"]);

class PropertyValueSuggest extends AbstractInputSuggest<string> {
	private knownValues: string[];
	private currentPills: () => string[];
	private normalizeFn: (v: string) => string;

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		knownValues: string[],
		currentPills: () => string[],
		normalize: (v: string) => string,
	) {
		super(app, inputEl);
		this.knownValues = knownValues;
		this.currentPills = currentPills;
		this.normalizeFn = normalize;
	}

	override getSuggestions(query: string): string[] {
		const lower = this.normalizeFn(query).toLowerCase();
		const existing = new Set(this.currentPills().map(this.normalizeFn));
		return this.knownValues.filter(v =>
			this.normalizeFn(v).toLowerCase().includes(lower)
			&& !existing.has(this.normalizeFn(v)),
		);
	}

	override renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	onValueSelected?: (value: string, evt: MouseEvent | KeyboardEvent) => void;

	override selectSuggestion(
		value: string,
		evt: MouseEvent | KeyboardEvent,
	): void {
		if (evt instanceof MouseEvent) {
			this.didSelect = true;
		}
		this.setValue("");
		this.close();
		this.onValueSelected?.(value, evt);
	}

	/**
	 * Set to true when a suggestion is selected via mouse click. The pill
	 * container's focusout handler defers its commit and checks this flag
	 * to avoid committing partial query text as a pill. Only mouse clicks
	 * cause the focusout race; keyboard selections are captured by the
	 * suggest's Scope before focusout fires.
	 */
	didSelect = false;
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
	private updateBtn?: HTMLButtonElement;
	private deleteBtn!: HTMLButtonElement;
	private selectAllBtn!: HTMLButtonElement;
	private deselectAllBtn!: HTMLButtonElement;
	private uiLocked = false;
	private activePillInput: HTMLInputElement | null = null;
	private arrayAction: ArrayAction = "merge";
	private valueLabelEl: HTMLElement | null = null;

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

		new Setting(contentEl).setName("Bulk edit selected notes").setHeading();

		if (this.fileSelection.size === 0) {
			contentEl.createEl("p", {
				text: `No notes have the "${settings.selectionProperty}" property checked. Mark notes by setting their "${settings.selectionProperty}" checkbox property to true.`,
			});
			return;
		}

		this.countEl = contentEl.createEl("p");
		this.updateCountText();

		const listEl = contentEl.createDiv({cls: "bulk-properties-file-list"});
		for (const [file, checked] of this.fileSelection) {
			const row = listEl.createEl("label", {cls: "bulk-properties-file-row"});
			const checkbox = row.createEl("input", {type: "checkbox"});
			checkbox.type = "checkbox";
			checkbox.checked = checked;
			this.fileCheckboxes.set(file, checkbox);
			row.createEl("span", {text: file.path, cls: "bulk-properties-file-path"});
			checkbox.addEventListener("change", () => {
				this.toggleSelection(file, checkbox);
			});
		}

		const selectionRow = new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText("Delete selected").onClick(() => {
					void this.doDelete();
				});
				this.deleteBtn = btn.buttonEl;
				this.deleteBtn.addClass("bulk-properties-delete-btn");
			})
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
		selectionRow.settingEl.addClass("bulk-properties-selection-row");

		const editableProperties = settings.properties.filter(p => p.name !== settings.selectionProperty);
		const hasEditableProperties = editableProperties.length > 0;

		if (!hasEditableProperties) {
			const p = contentEl.createEl("p");
			p.appendText("No properties configured. ");
			const link = p.createEl("a", {text: "Open settings to configure properties", href: "#"});
			link.addEventListener("click", (e) => {
				e.preventDefault();
				this.close();
				const {setting} = this.app as AppWithSetting;
				if (typeof setting?.open === "function" && typeof setting?.openTabById === "function") {
					setting.open();
					setting.openTabById(this.plugin.manifest.id);
				} else {
					new Notice("Open the settings pane to configure properties.");
				}
			});
			p.appendText(".");
		}

		if (hasEditableProperties) {
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

			this.valueContainerEl = contentEl.createDiv({cls: "bulk-properties-value-container"});
			this.renderValueInput();

			new Setting(contentEl)
				.setName("Deselect when finished")
				.addToggle(toggle => {
					makeToggleAccessible(toggle, "Deselect when finished", this.deselectWhenFinished);
					toggle
						.setValue(this.deselectWhenFinished)
						.onChange(value => {
							this.deselectWhenFinished = value;
							updateToggleAriaChecked(toggle, value);
						});
				});

			new Setting(contentEl).addButton(btn => {
				btn
					.setButtonText("Update properties")
					.setCta()
					.onClick(() => {
						void this.doUpdate();
					});
				this.updateBtn = btn.buttonEl;
			});
		}
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
		this.countEl.setText(`${checked} of ${total} note${total === 1 ? "" : "s"} selected`);
		if (!this.uiLocked) {
			if (this.updateBtn) {
				const hasUncommitted = this.activePillInput !== null
					&& this.activePillInput.value.trim() !== "";
				this.updateBtn.disabled = checked === 0 || hasUncommitted;
			}
			if (this.deleteBtn) {
				this.deleteBtn.disabled = checked === 0;
			}
		}
	}

	private async writeSelection(file: TFile, selected: boolean): Promise<void> {
		const selProp = this.plugin.settings.selectionProperty;
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			fm[selProp] = selected;
		});
		this.fileSelection.set(file, selected);
	}

	private toggleSelection(file: TFile, checkbox: HTMLInputElement): void {
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
				const doc = checkbox.ownerDocument;
				if (doc.activeElement === doc.body) {
					checkbox.focus();
				}
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
				new Notice(`Failed to update selection for ${failed.length} note${failed.length === 1 ? "" : "s"}: ${failed.join(", ")}`);
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

	private updateValueLabel() {
		if (!this.valueLabelEl) return;
		switch (this.arrayAction) {
			case "merge":
				this.valueLabelEl.textContent = "Values to add";
				break;
			case "delete":
				this.valueLabelEl.textContent = "Values to remove";
				break;
			default:
				this.valueLabelEl.textContent = "New value";
		}
	}

	private renderValueInput() {
		this.valueContainerEl.empty();
		this.rawValue = "";
		this.activePillInput = null;
		this.valueLabelEl = null;
		this.updateCountText();
		const type = this.getPropertyType(this.selectedProperty);
		const isArrayType = ARRAY_TYPES.has(type);

		if (isArrayType) {
			this.arrayAction = "merge";
			new Setting(this.valueContainerEl)
				.setName("Action")
				.addDropdown(dropdown => {
					dropdown.addOption("merge", "Merge");
					dropdown.addOption("replace", "Replace");
					dropdown.addOption("delete", "Delete");
					dropdown.setValue(this.arrayAction);
					dropdown.onChange((value: string) => {
						this.arrayAction = value as ArrayAction;
						this.updateValueLabel();
					});
				});
		}

		const setting = new Setting(this.valueContainerEl)
			.setName(isArrayType ? "Values to add" : "New value");
		if (isArrayType) {
			this.valueLabelEl = setting.nameEl;
		}

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
				const numInput = setting.controlEl.ownerDocument.createElement("input");
				numInput.type = "number";
				numInput.className = "bulk-properties-number-input";
				numInput.addEventListener("input", () => {
					this.rawValue = numInput.value;
				});
				setting.controlEl.appendChild(numInput);
				break;
			}

			case "date": {
				const dateInput = setting.controlEl.ownerDocument.createElement("input");
				dateInput.type = "date";
				dateInput.className = "bulk-properties-date-input";
				dateInput.addEventListener("input", () => {
					this.rawValue = dateInput.value;
				});
				setting.controlEl.appendChild(dateInput);
				break;
			}

			case "datetime": {
				const dtInput = setting.controlEl.ownerDocument.createElement("input");
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
				const shouldDedup = DEDUP_TYPES.has(type);

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
				this.activePillInput = pillInput;

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

				const addPill = (text: string, refocus = false): boolean => {
					let trimmed = text.trim();
					if (trimmed === "") return true;
					if (type === "tags") {
						trimmed = trimmed.replace(/^#/, "");
						if (trimmed === "") {
							new Notice("Tag name can\u2019t be empty");
							return false;
						}
						const reason = validateTag(trimmed);
						if (reason !== null) {
							new Notice(reason);
							return false;
						}
					}
					if (shouldDedup && pills.includes(trimmed)) return true;
					pills.push(trimmed);
					renderPills();
					syncRawValue();
					if (refocus) pillInput.focus();
					return true;
				};

				const removeLast = () => {
					if (pills.length === 0) return;
					pills.pop();
					renderPills();
					syncRawValue();
					pillInput.focus();
				};

				let suggest: PropertyValueSuggest | null = null;
				const normalize = type === "tags"
					? (v: string) => v.replace(/^#/, "")
					: (v: string) => v;
				const knownValues = [...new Set(
					getPropertyValues(this.app, this.selectedProperty)
						.map(normalize)
						.filter(v => v !== ""),
				)].sort((a, b) => a.localeCompare(b));
				if (knownValues.length > 0) {
					suggest = new PropertyValueSuggest(
						this.app,
						pillInput,
						knownValues,
						() => pills,
						normalize,
					);
					suggest.onValueSelected = (value) => {
						addPill(value, true);
						this.updateCountText();
					};
				}

				pillInput.addEventListener("keydown", (e: KeyboardEvent) => {
					if (e.isComposing) return;
					if (e.key === "Enter" || e.key === ",") {
						e.preventDefault();
						const val = pillInput.value;
						pillInput.value = "";
						if (!addPill(val, true)) {
							pillInput.value = val;
						}
						this.updateCountText();
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
					pillInput.value = "";
					const rejected: string[] = [];
					for (const part of parts) {
						if (!addPill(part, true)) {
							const t = part.trim();
							if (t !== "") rejected.push(t);
						}
					}
					pillInput.value = rejected.length > 0
						? rejected.join(",") + "," + trailing
						: trailing;
					this.updateCountText();
				});

				pillContainer.addEventListener("focusout", (e: FocusEvent) => {
					const next = e.relatedTarget;
					if (
						next instanceof Node &&
						pillContainer.contains(next)
					) {
						return;
					}
					const commitPending = () => {
						if (suggest?.didSelect) {
							suggest.didSelect = false;
							return;
						}
						if (pillInput.value.trim() !== "") {
							const val = pillInput.value;
							pillInput.value = "";
							if (!addPill(val)) {
								pillInput.value = val;
							}
							this.updateCountText();
						}
					};
					if (suggest) {
						requestAnimationFrame(commitPending);
					} else {
						commitPending();
					}
				});

				pillInput.addEventListener("input", () => {
					this.updateCountText();
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
		const checkedCount = this.getCheckedFiles().length;
		if (this.updateBtn) {
			const hasUncommitted = this.activePillInput !== null
				&& this.activePillInput.value.trim() !== "";
			this.updateBtn.disabled = !enabled || checkedCount === 0 || hasUncommitted;
		}
		if (this.deleteBtn) {
			this.deleteBtn.disabled = !enabled || checkedCount === 0;
		}
	}

	private async doUpdate() {
		if (this.activePillInput && this.activePillInput.value.trim() !== "") {
			new Notice("Commit or clear the text in the input field before updating");
			return;
		}
		this.uiLocked = true;
		this.setUIEnabled(false);
		await Promise.all(this.pendingSaves.values());

		const property = this.selectedProperty;
		const type = this.getPropertyType(property);
		const isArrayType = ARRAY_TYPES.has(type);
		const action = isArrayType ? this.arrayAction : "replace";
		const filesToUpdate = this.getCheckedFiles();

		if (isArrayType && action !== "replace" && this.rawValue.trim() === "") {
			this.uiLocked = false;
			this.setUIEnabled(true);
			new Notice("No values specified");
			return;
		}

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

		if (isArrayType && action === "replace" && this.rawValue.trim() !== "") {
			const confirmed = await confirmReplace(this.app, property, filesToUpdate.length);
			if (!confirmed) {
				this.uiLocked = false;
				this.setUIEnabled(true);
				return;
			}
		}

		const selProp = this.plugin.settings.selectionProperty;
		const deselect = this.deselectWhenFinished;

		try {
			await this.plugin.updateSetting("lastSelectedProperty", property);
		} catch (err: unknown) {
			console.warn("bulk-properties: failed to save lastSelectedProperty:", err);
		}

		this.close();

		let skippedCount = 0;
		const result = await withProgress(
			filesToUpdate,
			"Updating",
			async (file) => {
				let skipped = false;
				await this.app.fileManager.processFrontMatter(
					file,
					(fm: Record<string, unknown>) => {
						if (action === "replace") {
							fm[property] = value;
						} else {
							const existing = fm[property];
							let current: unknown[];
							if (existing === undefined || existing === null) {
								current = [];
							} else if (Array.isArray(existing)) {
								current = existing;
							} else if (typeof existing === "string") {
								current = existing === "" ? [] : [existing];
							} else {
								skipped = true;
								return;
							}
							const newValues = value as string[];
							if (action === "merge") {
								if (DEDUP_TYPES.has(type)) {
									const seen = new Set(current.map(String));
									const toAdd: string[] = [];
									for (const v of newValues) {
										if (!seen.has(v)) {
											seen.add(v);
											toAdd.push(v);
										}
									}
									fm[property] = [...current, ...toAdd];
								} else {
									fm[property] = [...current, ...newValues];
								}
							} else {
								if (existing === undefined || existing === null) {
									if (deselect) fm[selProp] = false;
									return;
								}
								const removeSet = new Set(newValues);
								fm[property] = current.filter(
									v => !removeSet.has(String(v)),
								);
							}
						}
						if (deselect) {
							fm[selProp] = false;
						}
					},
				);
				if (skipped) skippedCount++;
			},
		);

		const actualSucceeded = result.succeeded - skippedCount;
		const {failed, cancelled, total} = result;
		let msg = `Updated "${property}" in ${actualSucceeded} note${actualSucceeded === 1 ? "" : "s"}`;
		if (cancelled) {
			msg = `Updated "${property}" in ${actualSucceeded} of ${total} note${total === 1 ? "" : "s"} (cancelled)`;
		}
		if (skippedCount > 0) {
			msg += `, skipped ${skippedCount} (non-list values)`;
		}
		if (failed.length > 0) {
			msg += `, failed on ${failed.length}: ${failed.join(", ")}`;
		}
		if (shouldWarnLargeOperation(this.plugin, actualSucceeded)) {
			showLargeOperationNotice(this.plugin, actualSucceeded, msg);
		} else {
			new Notice(msg);
		}
	}

	private async doDelete() {
		this.uiLocked = true;
		this.setUIEnabled(false);
		await Promise.all(this.pendingSaves.values());

		const filesToDelete = this.getCheckedFiles();
		if (filesToDelete.length === 0) {
			this.uiLocked = false;
			this.setUIEnabled(true);
			new Notice("No notes selected");
			return;
		}

		const confirmed = await confirmDeleteFiles(this.app, filesToDelete.length);
		if (!confirmed) {
			this.uiLocked = false;
			this.setUIEnabled(true);
			return;
		}

		this.close();

		const result = await withProgress(
			filesToDelete,
			"Deleting",
			(file) => this.app.fileManager.trashFile(file),
			1,
		);

		const {succeeded, failed, cancelled, total} = result;
		let msg = `Deleted ${succeeded} note${succeeded === 1 ? "" : "s"}`;
		if (cancelled) {
			msg = `Deleted ${succeeded} of ${total} note${total === 1 ? "" : "s"} (cancelled)`;
		}
		if (failed.length > 0) {
			msg += `, failed on ${failed.length}: ${failed.join(", ")}`;
		}
		new Notice(msg);
	}
}
