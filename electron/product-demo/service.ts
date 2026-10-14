import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AxcutDocument } from "../../src/lib/ai-edition/schema";
import {
	type DemoBrief,
	type DemoPage,
	type DemoPlan,
	type DemoStatus,
	demoBriefSchema,
	validateDemoPlan,
} from "../../src/lib/product-demo";
import type { DemoBrowser } from "./browser";
import { captureTake } from "./capture";
import { createDemoDocument, type DemoTake } from "./document";
import type { DemoPlanner } from "./plan";

interface DemoDependencies {
	root: string;
	createBrowser: () => DemoBrowser;
	planner: DemoPlanner;
	ffmpeg: () => string | null;
	saveDocument: (doc: AxcutDocument) => Promise<AxcutDocument>;
	capture?: typeof captureTake;
}

export class ProductDemoService {
	private state: DemoStatus = { phase: "idle" };
	private browser: DemoBrowser | null = null;
	private controller: AbortController | null = null;
	private brief: DemoBrief | null = null;
	private page: DemoPage | null = null;
	private active = false;
	private cancelRequested = false;

	constructor(private deps: DemoDependencies) {}
	status(): DemoStatus {
		return structuredClone(this.state);
	}

	private async persist(): Promise<void> {
		if (!this.state.folder) return;
		await fs.writeFile(
			path.join(this.state.folder, "production.json"),
			JSON.stringify(
				{
					...this.state,
					brief: this.brief,
					targets: this.page?.targets,
					capture: "Browser viewport only; silent; up to 12 sampled fps / 30 encoded fps",
				},
				null,
				2,
			),
		);
	}

	private async finish(): Promise<DemoStatus> {
		try {
			await this.persist();
		} catch (error) {
			this.state.error = `Could not save production status: ${String(error)}`;
		} finally {
			// Keep the job locked until its final status has reached disk.
			this.active = false;
			this.controller = null;
		}
		return this.status();
	}

	cancel(): DemoStatus {
		if (this.active || this.state.phase === "review") {
			this.cancelRequested = true;
			this.controller?.abort(new Error("Production cancelled."));
			this.browser?.close();
			this.state = { ...this.state, phase: "cancelled" };
			if (!this.active)
				void this.persist().catch((error) =>
					console.warn("Could not save cancelled production", error),
				);
		}
		return this.status();
	}

	async plan(input: DemoBrief): Promise<DemoStatus> {
		if (this.active) throw new Error("A production is already running.");
		const brief = demoBriefSchema.parse(input);
		if (!this.deps.ffmpeg()) throw new Error("The bundled video encoder is unavailable.");
		this.browser?.close();
		const browser = this.deps.createBrowser();
		const controller = new AbortController();
		this.browser = browser;
		this.controller = controller;
		this.brief = brief;
		this.page = null;
		this.active = true;
		this.cancelRequested = false;
		const jobId = randomUUID();
		this.state = { phase: "planning", jobId, folder: path.join(this.deps.root, jobId) };
		const deadline = setTimeout(() => {
			controller.abort(new Error("Planning timed out."));
			browser.close();
		}, 180_000);
		try {
			await fs.mkdir(this.state.folder!, { recursive: true });
			this.page = await browser.open(brief.url);
			controller.signal.throwIfAborted();
			const plan = validateDemoPlan(
				await this.deps.planner(brief, this.page, controller.signal),
				brief,
				this.page,
			);
			controller.signal.throwIfAborted();
			this.state = { ...this.state, phase: "review", plan, sceneCount: plan.scenes.length };
		} catch (error) {
			browser.close();
			this.state = {
				...this.state,
				phase: this.cancelRequested ? "cancelled" : "error",
				error: String(error),
			};
		} finally {
			clearTimeout(deadline);
		}
		return this.finish();
	}

	async record(jobId: string, input: DemoPlan): Promise<DemoStatus> {
		if (
			this.active ||
			this.state.phase !== "review" ||
			jobId !== this.state.jobId ||
			!this.brief ||
			!this.page ||
			!this.browser
		) {
			throw new Error("Review a current shot plan before recording.");
		}
		const plan = validateDemoPlan(input, this.brief, this.page);
		const ffmpeg = this.deps.ffmpeg();
		if (!ffmpeg) throw new Error("The video encoder is unavailable.");
		const browser = this.browser;
		const controller = new AbortController();
		this.controller = controller;
		this.active = true;
		this.cancelRequested = false;
		this.state = { ...this.state, phase: "recording", plan, sceneCount: plan.scenes.length };
		const folder = this.state.folder!;
		const takes: DemoTake[] = [];
		const deadline = setTimeout(() => {
			controller.abort(new Error("Production timed out."));
			browser.close();
		}, 900_000);
		try {
			await this.persist();
			for (const [index, scene] of plan.scenes.entries()) {
				controller.signal.throwIfAborted();
				this.state = { ...this.state, phase: "recording", sceneIndex: index };
				const target = this.page.targets.find((item) => item.id === scene.targetId)!;
				await browser.apply(target);
				controller.signal.throwIfAborted();
				takes.push(
					await (this.deps.capture ?? captureTake)(
						browser,
						path.join(folder, `shot-${index + 1}`),
						scene.durationSec,
						ffmpeg,
						controller.signal,
						() => {
							this.state = { ...this.state, phase: "encoding" };
						},
						scene.framing
							? { framing: scene.framing, observe: () => browser.observeFocus(target) }
							: undefined,
					),
				);
				await this.persist();
			}
			controller.signal.throwIfAborted();
			const doc = createDemoDocument(`proj_${randomUUID()}`, plan, takes);
			this.state.warnings = plan.scenes.flatMap((scene, index) =>
				scene.framing && !doc.zoomRanges.some((zoom) => zoom.id === `zoom_demo_${index}`)
					? [`${scene.title}: focus was unavailable, moving or too large; full view retained.`]
					: [],
			);
			await fs.writeFile(path.join(folder, "draft.openscreen"), JSON.stringify(doc, null, 2), {
				flag: "wx",
			});
			controller.signal.throwIfAborted();
			await this.deps.saveDocument(doc);
			// Saving is the commit point. A cancellation during save cannot undo
			// the persisted project, so keep its ID available to the user.
			this.state = { ...this.state, phase: "ready", projectId: doc.project.id };
		} catch (error) {
			this.state = {
				...this.state,
				phase: this.cancelRequested ? "cancelled" : "error",
				error: String(error),
			};
		} finally {
			clearTimeout(deadline);
			browser.close();
			this.browser = null;
		}
		return this.finish();
	}
}
