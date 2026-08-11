// Keyframe animation data model, playback, and save/load for animate.html.
// Deliberately has no DOM/MQTT knowledge — animate.html owns wiring this up
// to the sliders, keyframe list, and the live leader feed.

export const JOINT_NAMES = [
  "shoulder_pan",
  "shoulder_lift",
  "elbow_flex",
  "wrist_flex",
  "wrist_roll",
  "gripper",
];

// Generous placeholder ranges for local preview editing only — not sourced
// from hardware calibration. Real limit validation belongs in the pass that
// wires up Send, so it can cross-check follower.py's max_relative_target
// and the servo calibration ranges.
export const JOINT_RANGES = {
  shoulder_pan: [-100, 100],
  shoulder_lift: [-100, 100],
  elbow_flex: [-100, 100],
  wrist_flex: [-100, 100],
  wrist_roll: [-180, 180],
  gripper: [0, 100],
};

export const DEFAULT_INTERPOLATION_MS = 1000;
export const DEFAULT_HOLD_MS = 0;

export function emptyJoints() {
  const joints = {};
  for (const name of JOINT_NAMES) joints[name] = 0;
  return joints;
}

export function createAnimation(name = "untitled") {
  return { name, keyframes: [] };
}

export function createKeyframe(joints, interpolationMs = DEFAULT_INTERPOLATION_MS, holdMs = DEFAULT_HOLD_MS) {
  const kfJoints = {};
  for (const name of JOINT_NAMES) {
    kfJoints[name] = Number(joints[name]) || 0;
  }
  return { interpolationMs: Math.max(0, Number(interpolationMs) || 0), holdMs: Math.max(0, Number(holdMs) || 0), joints: kfJoints };
}

// MQTT leader messages carry keys like "shoulder_pan.pos"; keyframes store bare joint names.
export function normalizeJoints(rawJoints = {}) {
  const out = {};
  for (const name of JOINT_NAMES) {
    const value = rawJoints[name + ".pos"] !== undefined ? rawJoints[name + ".pos"] : rawJoints[name];
    out[name] = typeof value === "number" ? value : Number(value) || 0;
  }
  return out;
}

export function serializeAnimation(animation) {
  return JSON.stringify(animation, null, 2);
}

export function parseAnimation(jsonText) {
  const data = JSON.parse(jsonText);
  if (!data || !Array.isArray(data.keyframes)) {
    throw new Error("Invalid animation file: missing keyframes array");
  }
  for (const kf of data.keyframes) {
    if (!kf.joints || typeof kf.joints !== "object") {
      throw new Error("Invalid animation file: a keyframe is missing joint data");
    }
  }
  return {
    name: typeof data.name === "string" && data.name.trim() ? data.name : "untitled",
    keyframes: data.keyframes.map((kf) => createKeyframe(kf.joints, kf.interpolationMs, kf.holdMs)),
  };
}

export function downloadAnimation(animation) {
  const blob = new Blob([serializeAnimation(animation)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${animation.name || "untitled"}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function readAnimationFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseAnimation(reader.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Matches follower.py's default control_fps — the frame rate the physical
// follower will actually be stepped at once Send/loop playback exist.
export const DEFAULT_FPS = 24;

function totalCycleDurationMs(keyframes) {
  let total = 0;
  for (let i = 0; i < keyframes.length; i++) {
    const next = keyframes[(i + 1) % keyframes.length];
    total += keyframes[i].holdMs + next.interpolationMs;
  }
  return total;
}

// Pose at time t (ms) within one loop cycle: hold at each keyframe for its
// holdMs, then interpolate to the next keyframe over that next keyframe's
// interpolationMs, wrapping from the last keyframe back to the first.
function poseAtTime(keyframes, tMs) {
  const n = keyframes.length;
  if (n === 0) return null;
  if (n === 1) return { ...keyframes[0].joints };

  const total = totalCycleDurationMs(keyframes);
  let t = total === 0 ? 0 : ((tMs % total) + total) % total;

  for (let i = 0; i < n; i++) {
    const kf = keyframes[i];
    const next = keyframes[(i + 1) % n];
    const segDuration = kf.holdMs + next.interpolationMs;

    if (t < segDuration || i === n - 1) {
      if (t < kf.holdMs) return { ...kf.joints };
      const moveElapsed = t - kf.holdMs;
      const ratio = next.interpolationMs === 0 ? 1 : Math.min(1, moveElapsed / next.interpolationMs);
      const pose = {};
      for (const name of JOINT_NAMES) {
        const a = kf.joints[name] ?? 0;
        const b = next.joints[name] ?? 0;
        pose[name] = a + (b - a) * ratio;
      }
      return pose;
    }
    t -= segDuration;
  }
  return { ...keyframes[n - 1].joints };
}

// Samples one full loop cycle at a fixed fps into a concrete frame list —
// the same shape of data that will eventually get streamed to the follower
// at that rate, so Preview can honestly show what Send will actually do.
export function generateFrames(keyframes, fps = DEFAULT_FPS) {
  if (!keyframes || keyframes.length === 0) return [];
  const total = totalCycleDurationMs(keyframes);
  if (total === 0) return [{ ...keyframes[0].joints }];

  const frameIntervalMs = 1000 / fps;
  const frameCount = Math.max(1, Math.round(total / frameIntervalMs));
  const frames = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(poseAtTime(keyframes, i * frameIntervalMs));
  }
  return frames;
}

// Steps through an already-generated frame list (see generateFrames) at a
// fixed fps, looping. Takes frames rather than keyframes so callers can cache
// generateFrames's output across repeated plays instead of resampling every
// time — see animate.html's getFrames().
export function createPlaybackController(onFrame) {
  let rafId = null;
  let playing = false;

  function stop() {
    playing = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function play(frames, fps = DEFAULT_FPS) {
    stop();
    if (!frames || frames.length === 0) return;
    playing = true;

    const frameIntervalMs = 1000 / fps;
    const startTime = performance.now();

    function step(now) {
      if (!playing) return;
      const frameIndex = Math.floor((now - startTime) / frameIntervalMs) % frames.length;
      onFrame(frames[frameIndex]);
      rafId = requestAnimationFrame(step);
    }

    rafId = requestAnimationFrame(step);
  }

  return {
    play,
    stop,
    get isPlaying() {
      return playing;
    },
  };
}
