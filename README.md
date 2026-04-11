# Bulk Properties

An [Obsidian](https://obsidian.md) plugin that lets you bulk edit properties on, or delete, multiple notes in your vault.

This plugin uses a checkbox property (default: `selected`) to track which notes are selected. Check the box on the notes you want to work with, run the command, then update a property across all of them at once or delete them. Works well with Obsidian Bases, where the selection property can be displayed as a checkbox column.

**Note:** The plugin operates on all notes in the vault that have the selection property checked, not just notes visible in a particular Base. Make sure to uncheck the selection property on notes you don't want to modify.

## Setup

Before using the command, configure the plugin in **Settings → Bulk Properties**:

- **Selection property** — the name of the checkbox property used to mark notes as selected (default: `selected`). Autocompletes from existing vault properties.
- **Properties** — add the properties you want to be available for bulk editing, specifying the name and type for each. Property names autocomplete from the vault. Supported types: Aliases, Checkbox, Date, Date & time, List, Number, Tags, Text.
- **Deselect when finished** — the default value for the deselect toggle in the bulk edit dialog (default: on).
- **Show selection count in status bar** — displays the number of selected notes in the status bar (default: on). The count updates automatically as you check or uncheck the selection property. Status bar items are not available on mobile.

## Usage

1. Add the selection property to your notes or Base view.
2. Check the box on each note you want to bulk edit.
3. Open the bulk edit dialog from the ribbon icon, the **Bulk edit selected notes** command, or the editor right-click menu.
4. Review the note checklist — uncheck any notes you don't want to modify, or re-check notes you do.
5. Choose a property from the dropdown, enter the new value, and select **Update properties**. For multi-value properties (Aliases, List, Tags), choose an action: **Merge** adds new values to existing ones, **Replace** overwrites the current values, and **Delete** removes matching values.
6. To delete the checked notes instead, select **Delete selected notes**. After a confirmation prompt, the notes are deleted following your **Settings → Files and links → Deleted files** preference — they may be moved to the system trash, moved to an Obsidian `.trash` folder, or permanently deleted, depending on how that preference is configured.
7. Optionally disable **Deselect when finished** to keep the notes selected after the update.

## Commands

- **Bulk edit selected notes** — opens the bulk edit dialog showing all notes with the selection property checked. Also available from the editor right-click menu.
- **Deselect all notes** — unchecks the selection property on every note in the vault that has it checked.
- **Remove selection property from all notes** — removes the selection property entirely from every note in the vault that has it.

## Context menus

- **Editor menu** — right-click inside an editor to open the bulk edit dialog.
- **File menu** — right-click a note in the file explorer or a Base view to toggle its selection. The menu item reads **Select for bulk edit** or **Deselect for bulk edit** based on the note's current state.

## Manual Installation

> [!NOTE]
> These instructions are for installing and testing the plugin before it is available in the Obsidian Community Plugins list.

Recommended approach is to use the BRAT plugin (available as a Community Plugin) and point it at this repository.

For a fully-manual installation, copy `main.js`, `styles.css`, and `manifest.json` to your vault at `.obsidian/plugins/bulk-properties/`.
