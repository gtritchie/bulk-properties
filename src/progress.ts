import {Notice, TFile} from "obsidian";

export interface ProgressResult {
	succeeded: number;
	failed: string[];
	cancelled: boolean;
	total: number;
}

const CONCURRENCY = 8;

/**
 * Iterates files with a cancelable progress notice, calling `action`
 * on each with bounded concurrency. Returns counts of succeeded/failed
 * and whether the user cancelled.
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

	const textEl = notice.messageEl.createSpan();
	notice.messageEl.appendChild(cancelBtn);

	let succeeded = 0;
	const failed: string[] = [];
	let nextIndex = 0;
	let completedCount = 0;

	try {
		textEl.textContent = `${label} 0 / ${files.length}...`;

		const workerCount = Math.min(CONCURRENCY, files.length);
		const runWorker = async (): Promise<void> => {
			while (!cancelled) {
				const i = nextIndex++;
				if (i >= files.length) return;
				const file = files[i]!;
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
				completedCount++;
				if (!cancelled) {
					textEl.textContent = `${label} ${completedCount} / ${files.length}...`;
				}
			}
		};

		const workers: Promise<void>[] = [];
		for (let w = 0; w < workerCount; w++) {
			workers.push(runWorker());
		}
		await Promise.all(workers);
	} finally {
		notice.hide();
	}
	return {succeeded, failed, cancelled, total: files.length};
}
