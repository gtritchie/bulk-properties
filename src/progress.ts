import {App, EventRef, Notice, TFile} from "obsidian";

export interface ProgressResult {
	succeeded: number;
	failed: string[];
	cancelled: boolean;
	total: number;
}

export type AwaitConsistency = "metadata" | "vault-delete" | "none";

export interface WithProgressOptions {
	/** Max in-flight actions. Default 8. */
	concurrency?: number;
	/** Best-effort post-write settle strategy. Default "none". */
	awaitConsistency?: AwaitConsistency;
	/** Quiet period after the last relevant event. Default 500 ms. */
	quietWindowMs?: number;
	/** Minimum post-write delay if no relevant event has been seen. Default 250 ms. */
	minimumFallbackWaitMs?: number;
	/** Hard ceiling on settle wait. Default 1500 ms. */
	consistencyTimeoutMs?: number;
	/** Label shown during settle wait. Default "Finishing up". */
	indexingLabel?: string;
	/** Obsidian app, required when awaitConsistency !== "none". */
	app?: App;
}

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_QUIET_WINDOW_MS = 500;
const DEFAULT_MIN_FALLBACK_WAIT_MS = 250;
const DEFAULT_CONSISTENCY_TIMEOUT_MS = 1500;
const DEFAULT_INDEXING_LABEL = "Finishing up";
const SETTLE_POLL_INTERVAL_MS = 50;

/**
 * Iterates files with a cancelable progress notice, calling `action` on
 * each. Writes run with bounded concurrency. Optionally pauses after the
 * write phase to let Obsidian's metadata cache (or vault delete stream)
 * settle, so the completion notice does not visibly precede the status bar
 * catching up.
 *
 * Cancellation during the write phase stops claiming new work and awaits
 * in-flight actions; cancellation during the settle phase resolves
 * immediately and is treated as a successful completion.
 */
export async function withProgress(
	files: TFile[],
	label: string,
	action: (file: TFile) => Promise<void>,
	options: WithProgressOptions = {},
): Promise<ProgressResult> {
	const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
	const awaitConsistency = options.awaitConsistency ?? "none";
	const quietWindowMs = options.quietWindowMs ?? DEFAULT_QUIET_WINDOW_MS;
	const minimumFallbackWaitMs = options.minimumFallbackWaitMs ?? DEFAULT_MIN_FALLBACK_WAIT_MS;
	const consistencyTimeoutMs = options.consistencyTimeoutMs ?? DEFAULT_CONSISTENCY_TIMEOUT_MS;
	const indexingLabel = options.indexingLabel ?? DEFAULT_INDEXING_LABEL;
	const app = options.app;

	if (awaitConsistency !== "none" && !app) {
		throw new Error(
			"withProgress: `app` is required when `awaitConsistency` is enabled",
		);
	}

	let cancelRequested = false;
	const notice = new Notice("", 0);

	const cancelBtn = notice.messageEl.createEl("button", {
		text: "Cancel",
		cls: "mod-warning bulk-properties-cancel-btn",
	});
	cancelBtn.addEventListener("click", () => {
		cancelRequested = true;
	});

	const textEl = notice.messageEl.createSpan();
	notice.messageEl.appendChild(cancelBtn);

	let succeeded = 0;
	const failed: string[] = [];

	let eventSource: {offref(ref: EventRef): void} | null = null;
	let eventRef: EventRef | null = null;
	let lastRelevantEventAt = 0;
	let anyRelevantEventSeen = false;

	if (awaitConsistency !== "none" && app) {
		const onEvent = () => {
			lastRelevantEventAt = Date.now();
			anyRelevantEventSeen = true;
		};
		if (awaitConsistency === "metadata") {
			eventSource = app.metadataCache;
			eventRef = app.metadataCache.on("changed", onEvent);
		} else {
			eventSource = app.vault;
			eventRef = app.vault.on("delete", onEvent);
		}
	}

	try {
		textEl.textContent = `${label} 0 / ${files.length}...`;

		let nextIndex = 0;
		let completedCount = 0;
		const workerCount = Math.min(concurrency, files.length);

		const runWorker = async (): Promise<void> => {
			while (!cancelRequested) {
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
				if (!cancelRequested) {
					textEl.textContent = `${label} ${completedCount} / ${files.length}...`;
				}
			}
		};

		const workers: Promise<void>[] = [];
		for (let w = 0; w < workerCount; w++) {
			workers.push(runWorker());
		}
		await Promise.all(workers);

		// Settle phase: writes done, let Obsidian catch up briefly before
		// dropping the notice. Skipped if user cancelled mid-writes.
		const writesFullyProcessed = completedCount === files.length;
		if (writesFullyProcessed && awaitConsistency !== "none" && !cancelRequested) {
			textEl.textContent = `${indexingLabel}...`;

			const settleStartedAt = Date.now();
			while (!cancelRequested) {
				const now = Date.now();
				const totalElapsed = now - settleStartedAt;

				if (totalElapsed >= consistencyTimeoutMs) break;

				if (anyRelevantEventSeen) {
					if (now - lastRelevantEventAt >= quietWindowMs) break;
				} else if (totalElapsed >= minimumFallbackWaitMs) {
					break;
				}

				await new Promise(resolve =>
					setTimeout(resolve, SETTLE_POLL_INTERVAL_MS),
				);
			}
		}

		// "Cancelled" only counts if the user stopped new work mid-writes,
		// not if they clicked Cancel during the settle pause.
		const cancelled = cancelRequested && !writesFullyProcessed;
		return {succeeded, failed, cancelled, total: files.length};
	} finally {
		if (eventSource && eventRef) {
			eventSource.offref(eventRef);
		}
		notice.hide();
	}
}
