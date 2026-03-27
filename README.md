# Bulk Properties

An [Obsidian](https://obsidian.md) plugin that lets you bulk edit a property across multiple files in your vault.

This plugin uses a checkbox property (default: `selected`) to track which files are selected. Check the box on the files you want to edit, run the command, and update a property across all of them at once. Works well with Obsidian Bases, where the selection property can be displayed as a checkbox column.

**Note:** The plugin operates on all files in the vault that have the selection property checked, not just files visible in a particular Base. Make sure to uncheck the selection property on files you don't want to modify.

## Usage

1. Add a checkbox property (such as `selected`) to your notes or Base view.
2. Check the box on each file you want to bulk edit.
3. Run the command **Bulk edit selected files** from the command palette.
4. Review the file checklist — uncheck any files you don't want to modify, or re-check files you do.
5. Choose a property from the dropdown, enter the new value, and select **Update**.
6. Optionally enable **Deselect when finished** to uncheck all files after the update.

## Commands

- **Bulk edit selected files** — opens the bulk edit dialog showing all files with the selection property checked.
- **Deselect all files** — unchecks the selection property on every file in the vault that has it checked.
- **Remove selection property from all files** — removes the selection property entirely from every file in the vault that has it.

## Setup

Before using the command, configure the plugin in **Settings → Bulk Properties**:

- **Selection property** — the name of the checkbox property used to mark files as selected (default: `selected`). Autocompletes from existing vault properties.
- **Properties** — add the properties you want to be available for bulk editing, specifying the name and type for each. Property names autocomplete from the vault. Supported types: text, number, checkbox, date, datetime, tags, aliases, multitext.
- **Deselect when finished** — the default value for the deselect toggle in the bulk edit dialog (default: on).

## Installing

Copy `main.js`, `styles.css`, and `manifest.json` to your vault at `.obsidian/plugins/bulk-properties/`.
