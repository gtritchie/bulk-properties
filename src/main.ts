import {Plugin, TFile} from "obsidian";
import {BulkPropertiesSettingTab, BulkPropertiesSettings, DEFAULT_SETTINGS} from "./settings";
import {BulkEditModal} from "./bulk-edit-modal";
import {deselectAll} from "./deselect-all";
import {getSelectedFiles} from "./files";
import {removeSelectionProperty} from "./remove-selection-property";
import {isFileSelected, toggleSelection} from "./toggle-selection";

export default class BulkPropertiesPlugin extends Plugin {
	settings: BulkPropertiesSettings;
	private statusBarEl: HTMLElement | null = null;

	async onload() {
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
				this.updateStatusBar();
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", () => {
				this.updateStatusBar();
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
							void toggleSelection(
								this.app,
								file,
								selProp,
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<BulkPropertiesSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
