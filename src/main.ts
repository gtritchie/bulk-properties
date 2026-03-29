import {Plugin, TFile} from "obsidian";
import {BulkPropertiesSettingTab, BulkPropertiesSettings, DEFAULT_SETTINGS, PROPERTY_TYPES} from "./settings";
import {BulkEditModal} from "./bulk-edit-modal";
import {deselectAll} from "./deselect-all";
import {getSelectedFiles} from "./files";
import {removeSelectionProperty} from "./remove-selection-property";
import {isFileSelected, setSelection} from "./toggle-selection";

export default class BulkPropertiesPlugin extends Plugin {
	settings!: BulkPropertiesSettings;
	private statusBarEl: HTMLElement | null = null;
	private statusBarTimer: ReturnType<typeof setTimeout> | null = null;

	override async onload() {
		await this.loadSettings();

		this.statusBarEl = this.addStatusBarItem();

		this.addRibbonIcon("list-checks", "Bulk edit selected files", () => {
			new BulkEditModal(this.app, this).open();
		});

		this.addCommand({
			id: "bulk-edit-selected",
			name: "Bulk edit selected files",
			callback: () => {
				new BulkEditModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "deselect-all",
			name: "Deselect all files",
			callback: () => {
				void deselectAll(this.app, this.settings.selectionProperty);
			},
		});

		this.addCommand({
			id: "remove-selection-property",
			name: "Remove selection property from all files",
			callback: () => {
				removeSelectionProperty(
					this.app,
					this.settings.selectionProperty,
				);
			},
		});

		this.addSettingTab(new BulkPropertiesSettingTab(this.app, this));

		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				this.debouncedUpdateStatusBar();
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", () => {
				this.debouncedUpdateStatusBar();
			}),
		);

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu) => {
				menu.addItem((item) => {
					item.setTitle("Bulk edit selected files")
						.setIcon("list-checks")
						.onClick(() => {
							new BulkEditModal(this.app, this).open();
						});
				});
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				const selProp = this.settings.selectionProperty;
				const selected = isFileSelected(this.app, file, selProp);
				menu.addItem((item) => {
					item.setTitle(selected ? "Deselect for bulk edit" : "Select for bulk edit")
						.setIcon("list-checks")
						.onClick(() => {
							void setSelection(
								this.app,
								file,
								selProp,
								!selected,
								() => this.updateStatusBar(),
							);
						});
				});
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.updateStatusBar();
		});
	}

	override onunload() {
		if (this.statusBarTimer !== null) {
			clearTimeout(this.statusBarTimer);
			this.statusBarTimer = null;
		}
	}

	private debouncedUpdateStatusBar(): void {
		if (this.statusBarTimer !== null) {
			clearTimeout(this.statusBarTimer);
		}
		this.statusBarTimer = setTimeout(() => {
			this.statusBarTimer = null;
			this.updateStatusBar();
		}, 500);
	}

	updateStatusBar(): void {
		if (!this.statusBarEl) return;
		if (!this.settings.showStatusBarCount) {
			this.statusBarEl.empty();
			return;
		}
		const count = getSelectedFiles(
			this.app,
			this.settings.selectionProperty,
		).length;
		if (count > 0) {
			this.statusBarEl.setText(
				`${count} file${count === 1 ? "" : "s"} selected`,
			);
		} else {
			this.statusBarEl.empty();
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{}, DEFAULT_SETTINGS,
			await this.loadData() as Partial<BulkPropertiesSettings>,
		);

		if (typeof this.settings.selectionProperty !== "string"
			|| this.settings.selectionProperty.trim() === "") {
			this.settings.selectionProperty = DEFAULT_SETTINGS.selectionProperty;
		}

		if (!Array.isArray(this.settings.properties)) {
			this.settings.properties = [];
		} else {
			const validTypes: ReadonlySet<string> = new Set(PROPERTY_TYPES);
			const before = this.settings.properties.length;
			this.settings.properties = this.settings.properties.filter(
				(p): p is typeof p =>
					typeof p === "object"
					&& p !== null
					&& typeof p.name === "string"
					&& p.name.trim() !== ""
					&& validTypes.has(p.type),
			);
			if (this.settings.properties.length < before) {
				console.warn(
					`bulk-properties: discarded ${before - this.settings.properties.length} malformed property entries from settings`,
				);
			}
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
