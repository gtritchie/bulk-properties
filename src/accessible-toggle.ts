import type {ToggleComponent} from "obsidian";

/**
 * Fix Obsidian ToggleComponent keyboard and screen reader accessibility.
 *
 * Obsidian's toggle has a label (toggleEl) with tabindex=0 containing a
 * hidden native checkbox whose checked state is inverted from the visual
 * state. This helper:
 * - removes the native input from the tab order and accessibility tree
 * - adds role="switch" with correct aria-checked on the label
 * - handles Space key to toggle
 *
 * Callers must update aria-checked in their onChange callback via
 * `updateToggleAriaChecked`.
 */
export function makeToggleAccessible(
	toggle: ToggleComponent,
	label: string,
	initialValue: boolean,
): void {
	const el = toggle.toggleEl;
	el.setAttribute("role", "switch");
	el.setAttribute("aria-label", label);
	el.setAttribute("aria-checked", String(initialValue));
	el.addEventListener("keydown", (e: KeyboardEvent) => {
		if (e.key === " ") {
			e.preventDefault();
			toggle.onClick();
		}
	});

	const input = el.querySelector("input");
	if (input) {
		input.setAttribute("tabindex", "-1");
		input.setAttribute("aria-hidden", "true");
	}
}

export function updateToggleAriaChecked(
	toggle: ToggleComponent,
	value: boolean,
): void {
	toggle.toggleEl.setAttribute("aria-checked", String(value));
}
