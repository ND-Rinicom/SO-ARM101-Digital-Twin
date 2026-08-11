# Joint dial interaction (animate.html) — design discussion

Not started. This documents a discussion about replacing the joint sliders
in `animate.html` with direct manipulation in the 3D previewer, so the
reasoning survives past the conversation it came from.

## Motivation

The joint sliders in `animate.html` work but are clunky — six stacked
sliders is a lot to scan and adjust when posing an arm. The more direct
alternative is letting the user interact with the 3D model itself: select a
joint, see its pivot point, drag a dial to set the angle.

## Proposed design

- The sidebar keeps a **joint list** (same interaction pattern as the
  existing keyframe list: click a row to select/highlight it), replacing
  the sliders. The **number input boxes stay** — direct manipulation gets
  the user close, the number box gets them exact.
- Selecting a joint in the list highlights it and shows a **rotation dial**
  in the 3D previewer, positioned at that joint's pivot point.
- Dragging the dial rotates the joint. The number input updates live from
  the dial, and editing the number input still works as it does today
  (same bidirectional sync the slider/number pair already has).
- Only one joint is selected — and one dial visible — at a time.

This is additive, not a replacement for precision entry: the dial is for
quick/intuitive posing, the number box remains the way to land on an exact
value.

## Why this avoids the two hardest problems

Two concerns came up when first considering "let the user click the robot
directly":

1. **Click-to-joint mapping is an unknown.** Raycasting the model itself and
   figuring out which joint a clicked mesh belongs to depends on how the
   `.glb` is actually built — a single skinned mesh (hard: needs
   vertex-weight introspection) vs. separate rigid meshes parented per bone
   (easy: `mesh.parent` gives you the joint). This hasn't been checked.
2. **Precision.** Dragging in a perspective 3D view is inherently worse than
   a number field for landing on an exact value.

Selecting via the **sidebar list** instead of clicking the model sidesteps
(1) entirely — there's never a need to raycast the robot's own geometry, so
the `.glb` mesh/bone structure stops being a blocker. And since at most one
dial exists at a time (for the currently selected joint), hit-testing during
a drag is trivial — "did this mousedown land on the one dial that exists,"
not "which of several ambiguous mesh regions did the user mean." Keeping the
number boxes directly addresses (2).

## Technical approach

- **Pivot placement**: the selected joint's bone world position is already
  tracked in `3Dmodels.js`'s `bonesByModelName` map — no new lookup needed.
- **Axis constraint**: each joint's rotation axis (x/y/z) is already defined
  statically in `models/so-101.json`'s joint config. The dial only ever
  needs to allow rotation around that one known axis.
- **Gizmo**: three.js's `TransformControls` (rotate mode) is a plausible
  starting point rather than hand-rolling ring geometry and drag math —
  it already handles gizmo rendering, hit-testing against itself, and
  drag-to-rotation math. Restricting it to one axis is just its
  `showX`/`showY`/`showZ` flags. Attach it to the selected joint's bone
  when the list selection changes; detach when nothing is selected.
- **OrbitControls handoff**: `cameraControls.js`'s `OrbitControls` currently
  owns left-drag for camera rotation. `TransformControls` fires a
  `dragging-changed` event specifically meant for toggling
  `orbitControls.enabled` off/on around a drag — the standard three.js
  pattern for exactly this conflict, not something to invent from scratch.
- **Angle sync**: read the rotation delta off the gizmo, clamp to the
  existing `JOINT_RANGES`, apply through the existing `setRotation`/
  `setJointAngles` pipeline, and push the value into the number input (and
  vice versa when the number input is edited directly).

## Known limitation (accepted, not solved)

A ring/dial viewed edge-on (its axis pointing near-parallel to the camera)
is inherently hard to grab precisely — this is a geometry problem, not a
library or implementation gap, and no gizmo implementation avoids it. This
design already hedges against it correctly by keeping the number box as the
fallback precision path, so it's an accepted tradeoff rather than something
that needs solving.

## Feasibility assessment

Originally flagged as the largest single feature considered for
`animate.html` — the risk was the unknown mesh-picking problem. With
selection moved to the sidebar list, that risk is gone. What's left
(attach/detach the gizmo on selection change, single-axis constraint, angle
extraction/clamping, number-box sync) is well-bounded and mostly reuses
logic that already exists in the current slider code. Genuinely buildable,
though still more work than a typical incremental change in this app —
recommend a spike before committing to full scope (see below).

## Suggested implementation plan

1. **Spike on one joint** (e.g. `gripper` or `wrist_roll` — simplest single-
   axis cases) to validate: `TransformControls` attached to a bone, the
   axis constraint, the `dragging-changed` → `OrbitControls.enabled` handoff,
   and how it actually feels to use before generalizing.
2. **Generalize to all 6 joints**: replace the slider rows with the joint
   list, wire list-selection → dial attach/detach, keep number-input sync
   working for all joints, apply `JOINT_RANGES` clamping.
3. **Polish**: selected-joint highlight styling, verify usability across a
   range of camera angles, confirm it doesn't regress keyframe/record/grab
   flows that currently rely on the sliders' `apply()` path.

## Open decisions for whenever this is picked up

- Default state: no joint selected (clean view, matches how the keyframe
  list currently defaults to no selection) vs. auto-selecting the first
  joint so a dial is always visible.
- Whether removing the sliders happens in the same change as adding the
  dial, or as a separate step (ship the dial alongside the sliders first,
  remove sliders once the dial is validated).
