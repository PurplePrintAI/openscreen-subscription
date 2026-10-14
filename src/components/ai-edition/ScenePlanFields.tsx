import type { AxcutDocument } from "@/lib/ai-edition/schema";
import type { PlannedScene } from "@/lib/scene-plan";
import styles from "./ScenePlanDialog.module.css";

export function ScenePlanFields({
	scene,
	assets,
	i,
	ko,
	onChange,
}: {
	scene: PlannedScene;
	assets: AxcutDocument["assets"];
	i: number;
	ko: boolean;
	onChange: (patch: Partial<PlannedScene>) => void;
}) {
	return (
		<>
			<div className={styles.row}>
				<label>
					{ko ? "장면 제목" : "Scene title"}
					<input
						aria-label={`${i + 1} ${ko ? "장면 제목" : "scene title"}`}
						value={scene.title}
						maxLength={100}
						onChange={(e) => onChange({ title: e.target.value })}
					/>
				</label>
				<label>
					{ko ? "영상 소스" : "Media"}
					<select
						aria-label={`${i + 1} ${ko ? "영상 소스" : "media"}`}
						value={scene.assetId}
						onChange={(e) => onChange({ assetId: e.target.value })}
					>
						{assets.map((a) => (
							<option key={a.id} value={a.id}>
								{a.label}
							</option>
						))}
					</select>
				</label>
			</div>
			<div className={styles.row}>
				<label>
					{ko ? "원본 시작 초" : "Source start seconds"}
					<input
						aria-label={`${i + 1} ${ko ? "원본 시작 초" : "source start seconds"}`}
						type="number"
						min={0}
						step={1 / 30}
						value={Number.isFinite(scene.inSec) ? scene.inSec : ""}
						onChange={(e) => onChange({ inSec: e.target.valueAsNumber })}
					/>
				</label>
				<label>
					{ko ? "장면 길이 초" : "Duration seconds"}
					<input
						aria-label={`${i + 1} ${ko ? "장면 길이 초" : "duration seconds"}`}
						type="number"
						min={1 / 30}
						step={1 / 30}
						value={
							Number.isFinite(scene.outSec - scene.inSec)
								? Number((scene.outSec - scene.inSec).toFixed(4))
								: ""
						}
						onChange={(e) => onChange({ outSec: scene.inSec + e.target.valueAsNumber })}
					/>
				</label>
			</div>
			<label>
				{ko ? "화면에 표시할 문장" : "On-screen sentence"}
				<textarea
					aria-label={`${i + 1} ${ko ? "화면에 표시할 문장" : "on-screen sentence"}`}
					rows={2}
					value={scene.caption}
					maxLength={300}
					onChange={(e) => onChange({ caption: e.target.value })}
				/>
			</label>
			<label className={styles.check}>
				<input
					type="checkbox"
					checked={!!scene.zoom}
					onChange={(e) =>
						onChange({
							zoom: e.target.checked ? { scale: 1.5, cx: 0.5, cy: 0.5 } : undefined,
						})
					}
				/>
				{ko ? "수동 초점 줌" : "Manual focus zoom"}
			</label>
			{scene.zoom && (
				<div className={styles.zoom}>
					{(["scale", "cx", "cy"] as const).map((key) => (
						<label key={key}>
							{key === "scale" ? (ko ? "배율" : "Scale") : `${key === "cx" ? "X" : "Y"} (0–1)`}
							<input
								aria-label={`${i + 1} ${key}`}
								type="number"
								step={0.05}
								min={key === "scale" ? 1.05 : 0}
								max={key === "scale" ? 3 : 1}
								value={Number.isFinite(scene.zoom![key]) ? scene.zoom![key] : ""}
								onChange={(e) =>
									onChange({
										zoom: { ...scene.zoom!, [key]: e.target.valueAsNumber },
									})
								}
							/>
						</label>
					))}
				</div>
			)}
		</>
	);
}
