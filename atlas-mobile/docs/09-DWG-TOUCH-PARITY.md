# DWG FastView Touch Behavior — ATLAS Implementation

This note documents the clean-room interaction behavior implemented in
`src/cad/tools/ToolManager.ts`, based on static REA observations of the supplied
DWG FastView 5.19.2 APK. It does not copy its native engine or code.

## Observed in the APK

REA inspected `MyCADView.onTouchEvent`, `MyCADView.IsCanSingleMove`,
`GestureHandler.onTouchEvent`, `GestureHandler$McOnGestureListener`, and
`GestureHandler$GstarScaleGestureListener`.

- `IsCanSingleMove()` only allows one-finger map movement in view/fullscreen
  mode, when the single-move switch is set, or when the current native command
  is PAN/ZOOM. Other commands reserve one-finger input for the command.
- A second pointer changes the view state to pinch/zoom. A two-finger gesture
  must not be mistaken for a CAD point.
- The scale detector uses a minimum span and span slop; `onFling` returns
  `false`, so no fling/inertial pan is observed in the Java gesture listener.
- `MyCADView` applies a 2 px / 200 ms short-motion guard, a movement velocity
  threshold (~0.03684 px/ms), and explicit state for pointer-up and re-anchoring.
- Long press begins a distinct press gesture; pan, press, and scale have
  separate begin/change/end callbacks.

Static declarations do not reveal all native rendering/command behavior.
The camera response, internal touch thresholds, and actual UI feel require
runtime testing on representative Android devices.

## ATLAS behavior

- **VIEW chip on:** one finger pans; two fingers pan and zoom.
- **VIEW chip off (edit mode):** one finger is reserved for the selected CAD
  tool (in Select, a drag makes a selection window); two fingers remain a
  navigation gesture and suppress tool input until every pointer is released.
- Pinch starts only after a span threshold, uses focal-point zoom, and has no
  inertia. Pointer cancellation resets gesture state without committing a tap.
- A normal touch tap while a point-taking command is active commits the picked
  point. Object snaps resolve endpoints/corners, midpoints, nodes/points and the
  nearest point on a line; a short snap marker confirms the chosen location.
- This is controlled by the existing OSNAP master switch; nearest-on-line is
  enabled by default along with endpoint, midpoint and node snaps.
- Long-press precision mode with an offset cursor and loupe remains available
  for careful placement. Selection/grip window drag still requires deliberate
  movement or a long press, so a tap cannot move geometry accidentally.
- Mouse/pen retains direct drag behavior with a small movement slop.

The thresholds are tuned for CSS pixels and human finger stability; they are
not asserted as an exact reproduction of Android's device-specific density
values. Validate the feel on phones/tablets and adjust the constants in
`ToolManager.ts` if necessary.
