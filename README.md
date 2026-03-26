# Bulk Property Editor for Bases

An [Obsidian](https://obsidian.md) plugin that lets you bulk edit a property across multiple files in your vault.

Obsidian Bases don't support multi-select, so this plugin uses a checkbox property (default: `selected`) to track which files are selected. Check the box on the files you want to edit, run the command, and update a property across all of them at once.

**Note:** The plugin operates on all files in the vault that have the selection property checked, not just files visible in a particular Base. Make sure to uncheck the selection property on files you don't want to modify.

## Usage

1. Add a checkbox property (e.g. `selected`) to your Base view.
2. Check the box on each file you want to bulk edit.
3. Run the command **Bulk edit selected files** from the command palette.
4. Choose a property from the dropdown, enter the new value, and click **Update**.
5. Optionally enable **Deselect when finished** to uncheck all files after the update.

## Setup

Before using the command, configure the plugin in Settings → Bulk Property Editor for Bases:

- **Selection property** — the name of the checkbox property used to mark files as selected (default: `selected`).
- **Properties** — add the properties you want to be available for bulk editing, specifying the name and type for each. Supported types: text, number, checkbox, date, datetime, tags, aliases, multitext.
- **Deselect when finished** — the default value for the deselect toggle in the bulk edit dialog.

## Installing

Copy `main.js`, `styles.css`, and `manifest.json` to your vault at `.obsidian/plugins/baseprop/`.
