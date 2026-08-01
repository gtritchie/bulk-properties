import {AbstractInputSuggest, App} from "obsidian";

function getAllPropertyNames(app: App): string[] {
	const names = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (cache?.frontmatter) {
			for (const key of Object.keys(cache.frontmatter)) {
				if (key !== "position") {
					names.add(key);
				}
			}
		}
	}
	return [...names].sort((a, b) => a.localeCompare(b));
}

export class PropertyNameSuggest extends AbstractInputSuggest<string> {
	onSuggestionSelected?: () => void;
	exclude: () => Set<string> = () => new Set();

	override getSuggestions(query: string): string[] {
		const lower = query.toLowerCase();
		const excluded = this.exclude();
		return getAllPropertyNames(this.app).filter(
			name => name.toLowerCase().includes(lower) && !excluded.has(name),
		);
	}

	override renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	override selectSuggestion(
		value: string,
		_evt: MouseEvent | KeyboardEvent,
	): void {
		this.setValue(value);
		this.close();
		this.onSuggestionSelected?.();
	}
}

export const PROPERTY_TYPES = [
	"text",
	"number",
	"checkbox",
	"date",
	"datetime",
	"tags",
	"aliases",
	"multitext",
] as const;

export type PropertyType = typeof PROPERTY_TYPES[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
	aliases: "Aliases",
	checkbox: "Checkbox",
	date: "Date",
	datetime: "Date & time",
	multitext: "List",
	number: "Number",
	tags: "Tags",
	text: "Text",
};

// metadataTypeManager is an undocumented internal API — not in
// obsidian.d.ts. Declared here as an optional property of App so all
// access is type-safe without reaching for `any`. All access is also
// runtime-guarded below.
type AppWithMetadataTypeManager = App & {
	metadataTypeManager?: {
		getPropertyInfo?: (name: string) => { widget?: string } | undefined;
	};
};

// Uses Obsidian's undocumented metadataTypeManager to look up the type
// assigned to a property in Settings → Properties. Returns null if the
// API is unavailable, the property is unknown, or the widget value
// doesn't match a recognized type.
export function detectPropertyType(app: App, name: string): PropertyType | null {
	try {
		// Only look up types for properties that exist in the vault.
		// metadataTypeManager returns a default widget ("text") for unknown
		// names, which would make callers treat unknown properties as Text.
		const known = new Set(getAllPropertyNames(app));
		if (!known.has(name)) return null;

		const mtm = (app as AppWithMetadataTypeManager).metadataTypeManager;
		if (!mtm || typeof mtm.getPropertyInfo !== "function") return null;
		const info = mtm.getPropertyInfo(name);
		if (!info || typeof info.widget !== "string") return null;
		const validTypes: ReadonlySet<string> = new Set(PROPERTY_TYPES);
		return validTypes.has(info.widget) ? info.widget as PropertyType : null;
	} catch {
		return null;
	}
}

export interface PropertyConfig {
	name: string;
	type: PropertyType;
}
