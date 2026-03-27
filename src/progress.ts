import {Notice, TFile} from "obsidian";

export interface ProgressResult {
	succeeded: number;
	failed: string[];
	cancelled: boolean;
	total: number;
}

/**
 * Iterates files with a cancelable progress notice, calling `action`
 * on each. Returns counts of succeeded/failed and whether the user
 * cancelled.
 */
export async function withProgress(
	files: TFile[],
	label: string,
	action: (file: TFile) => Promise<void>,
): Promise<ProgressResult> {
	let cancelled = false;
	const notice = new Notice("", 0);

	const cancelBtn = notice.messageEl.createEl("button", {
		text: "Cancel",
		cls: "mod-warning bulk-properties-cancel-btn",
	});
	cancelBtn.addEventListener("click", () => {
		cancelled = true;
	});

	let succeeded = 0;
	const failed: string[] = [];

	for (let i = 0; i < files.length; i++) {
		if (cancelled) break;
		const file = files[i]!;

		notice.setMessage(`${label} ${i + 1} / ${files.length}...`);
		notice.messageEl.appendChild(cancelBtn);

		try {
			await action(file);
			succeeded++;
		} catch (err: unknown) {
			console.error(
				`bulk-properties: ${label} failed on ${file.path}:`,
				err,
			);
			failed.push(file.path);
		}
	}

	notice.hide();
	return {succeeded, failed, cancelled, total: files.length};
}
