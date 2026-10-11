# Task: Recreate a layered toon water material in R3F + TSL

You are recreating a stylized, toon-like water surface that was originally built in Blender's shader nodes. The node graph is not available, so you must reverse-engineer it from a reference video. The target is a **flat plane** with a layered, procedural, animated material. Do not add vertex displacement, subdivision, or physically based water. All of the look comes from the fragment/color graph.

## Inputs

All inputs are in the **current working directory** (the project's assets folder). List it first to confirm the exact filenames.

- `./water.mp4`: the reference clip (1920×1080, 30fps, ~2.7s). The real image is pillarboxed: the content sits roughly between x=240 and x=1680, with black bars on the sides. Crop those bars off before analysing.
- `./llms-full-r3f*`: R3F best practices. **Read this before writing code** and follow its conventions for the canvas, `useFrame`, and memoisation.
- `./llms-full-drei*`: drei reference. Skim it. It probably matters only for camera controls or helpers.

**Where files go:** put all analysis output (frames, comparisons, notes) in `./water-analysis/` inside this folder. For source code, find the project root by walking up to the nearest `package.json`, and put components under that project's `src/`. If no `package.json` exists, stop and ask before scaffolding a new project.

## Step 1: Analyse the video before writing any shader code

Extract frames with ffmpeg and actually look at them. Produce at least the following:

```bash
mkdir -p water-analysis/frames
# Overview frames (pillarbox cropped)
ffmpeg -i water.mp4 -vf "crop=1440:1080:240:0,fps=4" water-analysis/frames/full_%02d.png
# 4x nearest-neighbour zooms on (a) halftone dots and (b) a highlight edge
ffmpeg -i water.mp4 -vf "crop=320:180:800:450,scale=1280:720:flags=neighbor" -frames:v 1 water-analysis/frames/zoom_dots.png
ffmpeg -i water.mp4 -vf "crop=320:180:400:620,scale=1280:720:flags=neighbor" -frames:v 1 water-analysis/frames/zoom_edge.png
# Consecutive-frame contact sheet, to judge motion and what is screen-locked vs surface-locked
ffmpeg -i water.mp4 -vf "select='lt(n\,9)',crop=300:300:820:420,tile=3x3" -frames:v 1 water-analysis/frames/motion_sheet.png
```

Adjust crop coordinates to whatever regions are most informative. Then write `water-analysis/ANALYSIS.md` containing:
1. A **layer list from bottom to top**, with your evidence for each layer.
2. Sampled hex colours for each distinct tone. Use ffmpeg or a Python/PIL script to read pixel values; do not eyeball them.
3. For each pattern, whether it is **surface (UV) space or screen space**. A pattern is surface space if it is perspective-foreshortened and shrinks with distance.
4. How each layer animates (drift direction and speed, cell evolution).
5. Anything you saw that contradicts the hypothesis below.

## Hypothesis to test, not to obey

### The user's read
- **Top layer:** a halftone pattern masked by a Voronoi field that is distorted by noise to get wavy ripples. It casts shadows onto the layers below.
- **Middle layer:** a regular Voronoi with pixelated or stair-stepped edges. Those edges also produce dark-blue rings.
- **Bottom layer:** solid blue.

### Preliminary observations from a first pass over the frames (verify them)
- **Halftone dots are in surface space.** They are ellipses squashed by perspective and shrink toward the horizon, so build them from the plane's UVs (rotated or staggered grid → `fract` → distance to cell centre), not from screen coordinates.
- **Dots have two roles.** White dots sit on top. Dark-blue, *soft or blurred* copies of the same dot pattern sit slightly offset beneath them. That is the "shadow." It is most likely the same halftone evaluated at an offset UV, softened with `smoothstep`, and multiplied into the colour as a darkening. There are also dark dots with no white dot above them, so the shadow mask may be wider than the white-dot mask, or the two masks may differ.
- **Dots are hard-clipped by a mask.** Many white dots are cut into crescents or partial shapes. So the halftone is thresholded against a separate mask edge rather than only having its radius modulated. Dot radius also looks larger near the bright highlight ribbons. Test radius modulation and hard clipping together.
- **Highlight ribbons** are white, Voronoi-edge-like caustic lines (think `F2 − F1` or distance-to-edge) with a soft cyan/white glow falloff. Their edges are **stair-stepped**, which suggests quantised UVs (`floor(uv * N) / N`) feeding the Voronoi or the threshold. Check whether the steps are foreshortened (surface space) or uniform on screen (screen space).
- **Dark-blue rings and blobs** sit inside cells, set in from the bright edges. This could be a second distance band from a colour ramp with constant interpolation, or the shadow layer.
- **Small white sharp flecks or shards** are scattered across the surface. They might be a high-threshold noise or a second fine Voronoi. This may be an extra layer the user did not list.
- **Large solid-white regions** in the foreground contain small square blue holes. The square shape points to the pixelation step and may reveal the quantisation grid size.
- **Base** is a light cyan/sky blue (roughly `#5EC8F0`; confirm by sampling), with softer darker-blue variation. Check whether it is truly solid or has a low-frequency gradient or noise.

Treat both reads as hypotheses. Where the evidence disagrees with the user's read, say so in ANALYSIS.md and follow the evidence, but keep the user's layering intent: halftone on top casting shadow, a pixelated Voronoi below it, and a blue base.

## Step 2: Implementation requirements

- **Stack:** React Three Fiber with the **WebGPU renderer** and TSL (`three/webgpu`, `three/tsl`). Use a `MeshBasicNodeMaterial` (unlit) unless the analysis shows real scene lighting, and drive `colorNode` with the graph. Follow `llms-full-r3f.txt` for setting up a WebGPU `Canvas` (an async `gl` factory and `await renderer.init()`) and for memoising materials and uniforms.
- **Geometry:** a single `planeGeometry` rotated flat. Use only enough segments for correct UVs. Place the camera low and at a grazing angle to roughly match the video's framing.
- **Structure:** build each layer as its own TSL `Fn` returning a mask or colour, for example `baseColor`, `voronoiLayer`, `pixelate`, `halftone`, `halftoneShadow`, `foamFlecks`. Then write one explicit `composite` function. Leave the blending order and blend modes readable, because the user wants to rebalance them.
- **Controls:** expose every tunable as a `uniform()` and wire them to a Leva panel (or a simple GUI). This includes colours, Voronoi scale, distortion strength and frequency, pixelation grid, halftone frequency, angle and radius, shadow offset, softness and opacity, thresholds, and animation speeds. Add a **layer solo/mute toggle** for each layer.
- **Animation:** drive time from a `time` uniform. Use 3D Voronoi or noise with time as `z`, or scroll the UVs, whichever matches the motion sheet. Keep the motion slow, like the reference.
- **Procedural only:** no baked textures. Write Voronoi and noise as TSL `Fn`s, or use the built-in `mx_worley_noise_*` and `mx_noise_*` helpers where they fit.
- **Antialiasing:** keep edges hard where the reference is hard. Do not blur the halftone or the pixel steps with `fwidth` AA unless the reference shows soft edges. The shadow dots *are* soft.

## Step 3: Visual verification loop (required)

Do not declare it done from code alone.
1. Run the dev server and capture screenshots of the render with whatever browser tooling you have (Playwright or similar). Match the camera angle to the reference as closely as you can.
2. Put each screenshot next to the matching reference frame in a single comparison image, and include zoom crops of the dots and the edges.
3. Iterate on the parameters and blending at least two or three times. After each iteration, write a line in ANALYSIS.md saying what changed and why.
4. Solo each layer once and screenshot it, so the user can see the breakdown.

## Deliverables

- The water component (for example `src/components/ToonWater.tsx`), plus a small `shaders/` module containing the layer `Fn`s.
- `water-analysis/ANALYSIS.md`: the layer breakdown, evidence, colours, deviations from the user's read, and the iteration log.
- `water-analysis/compare/`: side-by-side comparison images.
- A short final summary covering what matches, what does not yet match, and which parameters the user should tune first.
