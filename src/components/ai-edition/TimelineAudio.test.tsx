// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TimelineAudio } from "./TimelineAudio";

type MediaState = { duration: number; ready: number; time: number; paused: boolean };
let states: WeakMap<HTMLMediaElement, MediaState>;
let starts: number[];
function state(audio: HTMLMediaElement) {
	let value = states.get(audio);
	if (!value) {
		value = { duration: NaN, ready: 0, time: 0, paused: true };
		states.set(audio, value);
	}
	return value;
}
function load(audio: HTMLMediaElement) {
	Object.assign(state(audio), { duration: 90, ready: 1 });
	fireEvent.loadedMetadata(audio);
}
beforeEach(() => {
	states = new WeakMap();
	starts = [];
	vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockImplementation(function (
		this: HTMLMediaElement,
	) {
		return state(this).duration;
	});
	vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockImplementation(function (
		this: HTMLMediaElement,
	) {
		return state(this).ready;
	});
	vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (
		this: HTMLMediaElement,
	) {
		return state(this).paused;
	});
	vi.spyOn(HTMLMediaElement.prototype, "currentTime", "get").mockImplementation(function (
		this: HTMLMediaElement,
	) {
		return state(this).time;
	});
	vi.spyOn(HTMLMediaElement.prototype, "currentTime", "set").mockImplementation(function (
		this: HTMLMediaElement,
		value,
	) {
		state(this).time = value;
	});
	vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
		this: HTMLMediaElement,
	) {
		state(this).paused = true;
	});
	vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
		this: HTMLMediaElement,
	) {
		starts.push(state(this).time);
		state(this).paused = false;
		return Promise.resolve();
	});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it("waits for metadata and starts at the latest requested position, never zero", () => {
	const ui = render(<TimelineAudio src="a.wav" time={3} playing />);
	const audio = ui.container.querySelector("audio")!;
	ui.rerender(<TimelineAudio src="a.wav" time={5} playing />);
	expect(starts).toEqual([]);
	load(audio);
	expect(starts).toEqual([5]);
	expect(audio.currentTime).toBe(5);
});

it("applies a paused frame-sized seek and remains silent before the offset", () => {
	const ui = render(<TimelineAudio src="a.wav" time={3} playing={false} />);
	const audio = ui.container.querySelector("audio")!;
	load(audio);
	ui.rerender(<TimelineAudio src="a.wav" time={3 + 1 / 30} playing={false} />);
	expect(audio.currentTime).toBeCloseTo(3 + 1 / 30);
	ui.rerender(<TimelineAudio src="a.wav" time={-1} playing />);
	expect(audio.currentTime).toBe(0);
	expect(audio.paused).toBe(true);
	expect(starts).toEqual([]);
});

it("pauses the old source and seeks the replacement after its metadata arrives", () => {
	const ui = render(<TimelineAudio src="a.wav" time={5} playing gain={0.4} />);
	const first = ui.container.querySelector("audio")!;
	load(first);
	ui.rerender(<TimelineAudio src="b.wav" time={5} playing gain={0.4} />);
	const second = ui.container.querySelector("audio")!;
	expect(first.paused).toBe(true);
	expect(starts).toEqual([5]);
	load(second);
	expect(starts).toEqual([5, 5]);
	expect(second.volume).toBe(0.4);
	ui.unmount();
	expect(second.paused).toBe(true);
});

it("corrects a clip-boundary jump, tolerates small live jitter, and stops at EOF", () => {
	const ui = render(<TimelineAudio src="a.wav" time={7} playing />);
	const audio = ui.container.querySelector("audio")!;
	load(audio);
	ui.rerender(<TimelineAudio src="a.wav" time={42} playing />);
	expect(audio.currentTime).toBe(42);
	ui.rerender(<TimelineAudio src="a.wav" time={42.04} playing />);
	expect(audio.currentTime).toBe(42);
	ui.rerender(<TimelineAudio src="a.wav" time={42.2} playing />);
	expect(audio.currentTime).toBe(42.2);
	ui.rerender(<TimelineAudio src="a.wav" time={91} playing />);
	expect(audio.paused).toBe(true);
	expect(audio.currentTime).toBe(90);
});
