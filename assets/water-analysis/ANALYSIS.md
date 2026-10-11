# Toon water: reference analysis

Source: `water.mp4`, 1920×1080, 30 fps, 2.70 s (81 frames). Content is pillarboxed at x = 240–1680, so all analysis uses `crop=1440:1080:240:0`.
Frames: `frames/full_*.png` (4 fps overview), `frames/all/f_*.png` (every frame, cropped), `frames/zoom_*.png`, `frames/motion_sheet.png`.
Tools: ffmpeg 7.1 from `imageio-ffmpeg` (no system ffmpeg was installed), plus numpy/PIL scripts for k-means colour clustering and phase-correlation motion estimates.

Video timing note: every 4th–5th frame has zero motion, so the clip is a 24 fps render pulled up to 30 fps.

## 1. Layer list (bottom → top) with evidence

| # | Layer | Evidence |
|---|-------|----------|
| 1 | **Base**: flat sky blue | Most common non-white tone is `#5ECCF8`/`#62CEFA` (~27 % of pixels). Large cell interiors are this flat tone, with a soft darker `#53A4F3` variation in places. |
| 2 | **Ribbon shadow ("dark rings")** | Dark-blue bands (`#4A86DC`-ish) sit mostly on the **near (camera) side** of the white ribbons and follow their shape, e.g. `full_11` right side and `f_061` centre. They are offset copies of the ribbon, not a band set in symmetrically from every edge. Their edges are stair-stepped, the same as the ribbons. |
| 3 | **Pixelated Voronoi ribbons** | White cores with a cyan glow (`#C2F7FA` → `#9CE4F5` → `#74D4F7` → base). In `zoom_edge.png` each square block is one flat tone but neighbouring blocks step gradually. So the colour ramp is **linear**, and the steps come from the **snapped input coordinates** (`floor(uv·N)/N`), not from a constant-interpolation ramp. Cell borders meander smoothly, which points to a strongly domain-warped Voronoi with distance-to-edge (F2−F1). |
| 4 | **Halftone shadow** | Soft, dark-blue (`#3F6CCB`–`#4779D2`) dots on the same hex lattice as the white dots. A dark-dot patch is usually displaced several rows **toward the camera** from a white-dot patch, while each dark dot is only slightly offset from a lattice position. One large offset of the whole halftone (lattice plus mask) explains both: the lattice repeats, so the dots barely move while the patch moves a long way. |
| 5 | **Halftone dots** | Hard-edged white dots on a staggered (hex) lattice. They are biggest in the middle of a patch and shrink toward its rim (`full_11` bottom-left), which looks like a Voronoi **F1** blob field rather than an edge band. Where the radius passes about 0.577 × spacing the circles merge into solid white with small concave-diamond **holes**. Those are the inter-dot gaps, not pixelation squares (`f_061` zoom, `raw_f0` bottom right). Many dots are hard-clipped into crescents by a separate, noisy threshold. |
| 6 | **Foam flecks / shards** (not in the user's list) | Small, sharp white shards and Y-shaped "cracks" across the whole surface (`full_06`, `full_11`). They look like thin edges of a fine, warped Voronoi, broken into pieces and sparsely masked. Dark-blue Y-shaped copies appear offset beneath some of them (fleck shadows). |

## 2. Sampled colours (k-means, k = 8, over frames 1/20/40/60/80)

| Tone | Hex | Share | Role |
|---|---|---|---|
| darkest blue | `#4779D2` | 3.4 % | halftone/fleck shadow, darkest ring |
| deep blue | `#53A4F3` | 6.2 % | ribbon shadow / base variation |
| mid blue | `#5CB6F5` | 8.9 % | shadow edges blended with base |
| base | `#5ECCF8` | 26.5 % | base (mode is `#62CEFA`) |
| light base | `#74D4F7` | 18.9 % | outer glow / far-distance blend |
| cyan glow | `#9CE4F5` | 7.6 % | glow band |
| pale cyan | `#C2F7FA` | 7.2 % | inner glow band |
| white | `#F8FCFC` (mode `#FEFEFE`) | 21.4 % | ribbon core, dots, flecks |

Per-row median of non-white pixels gets lighter toward the horizon (`#5DCDFA` near → `#79D8F9` far). I attribute this to sub-pixel white features averaging in at distance rather than a real gradient, so I did not add fog. The bottom rows of frame 1 median to `#4477CB` because a big shadow patch sits there.

## 3. Surface vs screen space

Every pattern is **surface (UV) space**:
- Halftone dots are ellipses that shrink toward the horizon (about 80 px wide at the bottom, about 10 px at the top).
- Pixel-step blocks are also foreshortened (about 12 px at the bottom, a few px up top) and look like rotated diamonds, so the snap grid lives on the plane and is rotated relative to the camera.
- Motion speed scales with depth (below), which a screen-locked layer would not do.

## 4. Animation

Phase correlation between consecutive frames, in screen px per frame:

| Region | Reference (dx, dy) | Final render (dx, dy) |
|---|---|---|
| far (y 60–220) | (−2, +1) | (−1, 0) |
| mid (y 400–600) | (−4, +3) | (−3, +3) |
| near (y 800–1060) | (−5…0, +6) | (−6…−7, +7…10) |

- **Drift:** all layers scroll together, toward the camera and to the left, faster near the camera. That is a single UV scroll (or an equivalent camera dolly).
- **Evolution:** correlation peaks fall from about 0.28 (1 frame apart) to about 0.04 (6 frames apart), so cells also morph quickly. This matches a 3D Voronoi/noise with time as Z (Blender's W) on top of the scroll. In the `motion_sheet` the white-patch boundaries re-shape every frame while the dot lattice simply translates.

## 5. Where the evidence disagrees with the hypotheses

- **"Halftone masked by a distorted Voronoi":** confirmed. The size pattern (big in the middle, shrinking outward) fits **F1 blobs** better than F2−F1 edges. The implementation exposes `htMaskEdgeMix` so you can blend between the two.
- **"Middle Voronoi edges produce dark-blue rings":** partly confirmed. The rings are mostly one-sided (camera side), so I built them as the **ribbon casting an offset shadow** rather than a band set in from the edge.
- **"Shadow mask wider than the white-dot mask":** the isolated dark dots come from the **large shadow offset**, not from widening the mask. A widened mask made shadow dots larger than the white dots, which the reference doesn't show. `shadowSpread` is still exposed but defaults to 0.
- **"Square blue holes reveal the pixel grid":** **contradicted.** The holes are concave diamonds on the dot lattice, i.e. the gaps between merged halftone circles. The pixel grid shows up only in the ribbon glow and the mask boundaries.
- **"Stair-stepped edges from constant-interpolation ramp":** the ramp is smooth. The quantisation is in the input coordinates.
- **Flecks:** confirmed as an extra layer the user's read didn't include. They also cast small offset shadows.
- **Base:** effectively solid, with mild low-frequency darkening. No real horizon gradient.

## 6. Iteration log

All renders: headless Chromium at 1440×1080, `t = 1.0` unless noted. Comparisons are in `compare/`.

0. **iter0:** first light. The image was washed-out grey-white because R3F applies ACES tone mapping by default; the horizon was in frame; dots were about 4× too big. → Added `flat` to the Canvas, made the camera pitch steeper, and rescaled.
1. **iter1:** colours correct. Dots, pixel steps, and cells were still 3–4× too large, and merged halftone covered the frame. → `htFreq` 3.2→9, `pixelGrid` 20→40.
2. **iter2:** scale was close. The halftone mask read as regular polygon cells, glow tinted whole cell interiors, and the shadow was too faint. → Narrowed the glow, switched the shadow from multiply to a normal blend toward `shadowColor`.
3. **iter3–4:** solo views showed the ribbon Voronoi was barely warped (straight polygon edges). → `distortStrength` 0.45→1.2, then 2.5, and switched the warp to 2-octave fractal noise.
4. **iter5:** the patch shapes in the reference (big dots in the middle, shrinking outward) suggested F1 blobs. → Switched the halftone mask to F1 and added `htMaskEdgeMix`.
5. **iter6:** glow bands looked like hard posterised rings, unlike the zooms. → Replaced the constant ramp with a **linear ramp on pixelated input**, which matches `zoom_edge`.
6. **iter7–8:** halftone coverage swung between too much and too little. Additive `shadowSpread` covered the whole plane with tiny shadow dots. → Made spread widen the mask distance instead.
7. **iter9–10:** widened shadows came out bigger than the white dots. → Set spread to 0 and used one **large shadow offset** (0.06, 0.30). Patches now separate the way they do in the reference.
8. **iter11:** flecks came out as long worms. → Added a `fleckBreakup` noise to chop them into shards.
9. **iter12:** rebuilt the "ring" as the ribbon's offset shadow, drawn under the ribbons.
10. **motion:** the render drifted too slowly and evolved too fast compared with the reference. → `scroll` (0.14, 0.26)→(0.3, 0.6), `evolveSpeed` 0.35→0.2. Measured motion now matches mid/near within about 1 px/frame.
11. **final:** `ringWidth` 0.18→0.145, because the solo view showed the ring mask covering about half the plane.

## 7. Layer solo breakdown

`compare/solo_breakdown.png` (individual files in `compare/solo/`). Solo views render each layer over neutral grey.

## 8. Revision 2 (user feedback)

- **Halftone now quantises a Voronoi.** It works like the ribbon layer, but the quantisation step is dots instead of pixel blocks. The field is a warped F2−F1 edge distance, sampled at each dot centre, and that value sets the dot radius (`htEdgeIn` = full radius, `htEdgeOut` = no dot). It no longer goes through the pixelate step, and the F1 blob mode (`htMaskEdgeMix`) is removed. `halftone uses ribbon voronoi` (`htShareRibbon`) switches it to the exact ribbon Voronoi. Defaults: `htEdgeIn` 0.015, `htEdgeOut` 0.2, `htRadiusMax` 0.58.
- **Flecks:** you suspect these are a by-product of tiny, clipped halftone dots. The separate flecks layer stays for now; switch it off under *Layers (on/off)*.
- **New *Effects (on/off)* panel:** pixelate ribbons, noise warp, dot size from Voronoi, dot hard clip, scroll, cell evolution, and halftone uses ribbon Voronoi. They combine freely with the layer switches. The URL equivalent is `?off=flecks,clip,...`.
- Render: `compare/v2_t1.png`; halftone solo: `compare/solo/v2_solo_halftone.png`.

## 9. Revision 3 (user feedback)

- **Two separate Voronois.** The halftone has its own warped Voronoi (`htMaskScale`, `htMaskDistort`, its own seed, no pixelation), independent of the pixelated ribbon Voronoi. `htShareRibbon` stays off by default.
- **Solid line → halftone.** Where F2−F1 < `htEdgeIn` the halftone draws a solid line. Beyond that, dots shrink from the line-side radius down to `htRadiusTiny` at `htEdgeOut`, with nothing past it.
- **Radius wave.** A travelling sine wave over the whole plane (`waveAngle`, `waveFreq`, `waveSpeed`, `waveWarp`) sweeps the line-side radius between `htRadiusMin` 0.3 and `htRadiusMax` 0.6.
- **User settings applied as defaults:** htFreq 5.31, htAngle −2.73, htMaskScale 0.6, htMaskDistort 2.16, htEdgeIn 0.075, htEdgeOut 0.7, htClip 1, htClipNoise 0. With htClip = 1 the clip removes every dot outside the solid line, so the *dot hard clip* effect now starts **off**.
- **New effect switches:** *halftone solid line* and *radius wave*. *Dots shrink away from line* replaces *dot size from voronoi*.
- Renders: `compare/v3_t1.png`; `compare/v3_halftone_wave.png` shows the halftone solo at t = 1 vs t = 3, with the wave changing dot size.

**Revision 3 reverted at the user's request.** The code is back to revision 2. A test render at t = 1 is pixel-identical to `renders/v2_t1.png`.

## 10. Revision 4 (user feedback)

- **Flecks removed** completely: the layer, its shadow, its uniforms and its panel.
- **New halftone defaults** (user's values): htFreq 1.8, htAngle −1.17, htRadiusMax 0.63, htEdgeIn 0, htEdgeOut 0.14, htClip 0.68, htClipNoise 0.12.
- **Warp wave.** The halftone Voronoi's warp strength is now swept between `htMaskDistortMin` 0.3 and `htMaskDistortMax` 0.6 by a travelling wave (`waveAngle`, `waveFreq`, `waveSpeed`, `waveWarp`). This replaces the fixed `htMaskDistort` (the user's listed value of 2 is superseded by the 0.3–0.6 range). New effect switch: *halftone warp wave*; off = fixed at Max.
- **Effects defaults:** *dot size from voronoi* off, *halftone uses ribbon voronoi* off.
- Renders: `compare/v4_t1.png`, `compare/v4_halftone_wave.png` (halftone solo, t = 1 vs t = 3).

**Revision 4 reverted at the user's request, except that the flecks stay removed.** The halftone is back to the revision 2 defaults, and the warp wave and its switch are gone. A test render at t = 1 differs from `renders/v2_t1.png` in only 1.2 % of pixels, all where flecks or their shadows used to be.

## 11. Revision 5: solid → halftone morph

- **New `htMorph` slider (Halftone panel).** 0 = solid Voronoi shape, 1 = the same shape built from halftone dots (default 1). As it goes down, the dot radius moves toward 1/√3 of the spacing, the size at which hex-lattice dots cover the plane, so the dots grow and fuse into the solid shape.
- **Fixed outline.** The outline is a separate per-pixel mask (`halftoneShape`: the field region, plus the hard clip when that effect is on), so the solid and dotted versions share one silhouette.
- **Shadow.** It morphs the same way, and its softness scales with `htMorph`, so the solid shadow shows no lattice texture.
- **Default look nearly unchanged.** At `htMorph` = 1 the render differs from before in only 0.16 % of pixels (a few edge dots now trimmed by the outline mask).
- **New URL option `?set=uniform:value,...`** seeds any numeric uniform, e.g. `?set=htMorph:0.5`.
- Renders: `compare/v5_morph_strip.png` (halftone solo at 0, 0.25, 0.5, 0.75, 1, plus full composites at 0 and 0.5), `renders/v5_morph0.png`, `renders/v5_morph05.png`.

## 12. Revision 6: automatic morph (`htInterpolate`)

- **`htInterpolate` (Halftone panel)** cycles the morph 0 → 1 → 0 on its own: morph = 0.5 − 0.5·cos(2π·t·htInterpolate). The unit is cycles per second; the default 0.1 gives one full cycle every 10 s. Set it to 0 to return to manual `htMorph`.
- **`htRadiusMax` default is now 0** (the user's setting). The morph runs solid shape → dots → nothing.
- **Bug fixed during testing:** a TSL `select(uniform > 0, …)` always took the manual branch on the WebGL2 backend. It was replaced with `mix(htMorph, auto, step(0.0001, htInterpolate))`.
- Render: `compare/v6_interpolate_strip.png` (t = 0, 1.5, 2.5, 3.5, 5 s at the default speed).

## 13. Revision 7: per-area morph field (zero extra noise)

- **Morph per dot centre.** The morph is now a field `m(c, t)`, evaluated per dot centre, instead of one global value. Every area still runs solid → dots → gone; noise and a travelling wave shift *when* each area does it:
  - `n = clamp(0.5 + 0.5·z·morphNoiseGain)`
  - `φ = 2π(htInterpolate·t + morphNoiseAmount·n − morphWaveFreq·(c·d))`
  - `cyc = ½ − ½cos φ`
  - `m = mix(morphMin, morphMax, smoothstep(½ − ½/contrast, ½ + ½/contrast, cyc))`
- **Recycled noise.** `z` is the z channel of the halftone warp's `mx_fractal_noise_vec3`, which was already computed at every dot centre and previously discarded. Noise call sites before and after: fractal ×1, perlin ×2, worley ×1, warp calls ×2, halftoneField calls ×3. All unchanged.
- **Shadow consistency.** The shadow re-uses its own centre's z, so it morphs with the dot that casts it.
- **`htInterpolate`** is now the morph wave speed (cycles/s). The `htMorph` slider is removed.
- **New sliders (Morph folder):** `htInterpolate`, `morphNoiseAmount`, `morphNoiseGain`, `morphWaveFreq`, `morphWaveAngle`, `morphContrast`, `morphMin`, `morphMax`.
- **New effect switches:** *morph noise + wave*, and *show morph field* (debug greyscale; it re-uses the halftone's morph value, so it adds no cost).
- **Checks:**
  - With `morphNoiseAmount = 0` the render at t = 0 / 2.5 / 5 is pixel-identical to revision 6.
  - `morphMin = 0.6` gives a field minimum of grey 205 (≈ 0.6 in sRGB), so no fully solid regions.
- Render: `compare/v7_morph_field.png` (field and composite at t = 1/3/5 s, plus the `morphMin` 0.6 case).

## 14. Revision 8: halftone presence (sparsity)

- **Three new sliders (Morph folder):**
  - `htPresence`: 1 = everywhere (as before), 0 = nowhere.
  - `htPresenceScale`: patch size.
  - `htPresenceSoftness`: how gradually dots shrink out at patch edges.
- **How it works.** A low-frequency presence mask is evaluated per dot centre and multiplies the dot radius (halftone and shadow alike). Dots at a patch edge shrink away instead of being cut, and inside a patch nothing changes.
- **Regression.** At `htPresence` = 1 the render is pixel-identical to revision 7.
- **Cost.** One single-octave `mx_noise_float` per halftone instance (2 per pixel: dots + shadow). No noise channel could be recycled without tying presence to the morph timing (visible patches would all sit at the same point in the cycle).
- Render: `compare/v8_presence.png` (presence 1 / 0.6 / 0.35 / 0.15 at t = 1 s).

**Revision 9: new defaults (user's values).** `htMaskScale` 0.45 → 0.25, `htClip` 0.15 → 0.93, `htClipNoise` 0.2 → 0.03. Halftone covers 12.7 % of the frame at t = 0 and 3.4 % at t = 1 (solo). Render: `compare/v9_defaults.png`.

## 15. Revision 10: calmer halftone

- **Causes of the rapid fills:**
  - The dot radius was linear in the morph, but covered area grows with r², so the last gaps closed all at once.
  - The cosine cycle plus an extra smoothstep (added in rev 7) bunched each solid ↔ dots transition into about 2.5 s of every 5 s half-cycle.
- **`htFillCurve` (default 1):** interpolates dot *area* instead of radius. 0 = the old behaviour; with 0 the render is pixel-identical to rev 9 (with the old eased cycle).
- **`htEase` (default 0):** cycle timing, 0 = constant-speed triangle, 1 = the old cosine. `morphContrast` now only bends the curve above 1.
- **`htEvolve` (default 1):** halftone-only evolution speed. It scales the halftone Voronoi's warp time and Worley z, plus the clip and presence noise; ribbons are unaffected.
- **Measured fill over one half-cycle** (halftone solo, sync, no scroll/evolve). The coverage step per 0.5 s went from max **34 %** (old) → 27 % (area fill) → **12 %** (area fill + constant speed), a near-linear ramp. Sheet: `compare/v10_fill_curve.png`.
- **Measured evolution** (pixels changing per 1/6 s, no morph, no scroll):
  - halftone at htEvolve 1: 11.8 %
  - halftone at htEvolve 0.4: 3.4 %
  - ribbon layer: 0.6 %

  The halftone shape reacts more to the same evolution because its cells are larger (htMaskScale 0.25 vs 0.5) and its outline is a hard threshold (htClip 0.93).

**Revision 11: user's panel settings as defaults.**
- `htEvolve` 1 → 0.33. `htFreq` 12 → 6 and `distortStrength` 2.5 → 2 now match the values the slider ranges had silently clamped them to. Slider ranges widened (htFreq up to 20, distortStrength up to 4) so no default is out of range.
- New **Copy settings** button at the top of the Water panel copies every uniform's exact value as JSON.
- Verified: a fresh page's 66 panel values match the user's export exactly.

**Revision 12: new standard settings (user export).** Changed defaults: `htInterpolate` 0.1 → 0.14, `htEase` 0 → 0.97, `htEvolve` 0.33 → 0.17. Everything else was already identical. Verified with Copy settings on a fresh page: all values match the export.

## 16. Lean pass 1: dot-centre halftone outline (checkpoint `cp1-outline`)

- **Change.** The halftone and its shadow decide their outline from the field already sampled at each dot centre, instead of a second per-pixel `halftoneField` (warp + 3D Worley) each. Per pixel: Worley 3D 6 → **4**, fractal warps 6 → **4**.
- **Benchmark** (`scripts/bench.mjs`, GPU-synced, 2880×2160, WebGL2 fallback; relative only): **14.37 ms → 10.20 ms** per frame (−29 %), p95 15.0 → 10.5 ms. First frame after load: 4.1 s → 2.8 s.
- **Visual.**
  - Ribbons: unchanged (0 % pixels).
  - Dotted phase: nearly identical (0.5–1.8 % of halftone pixels).
  - **Solid phase: clearly different.** The solid shape is now built from whole hex cells, so its edge is a chunky hexagonal staircase instead of a smooth curve. At htFreq 6 the hexes are large (t = 5: 4.9 % halftone pixels changed). Crescent cuts are gone.
- Sheet: `compare/lean1_outline.png`.

## 17. Lean pass 2: 2D Voronoi with moving points (checkpoint `cp2-voronoi2d`)

- **Change.** `mx_worley_noise_vec2` (3D, time as z: 27 cells) is replaced by an in-graph 2D Voronoi. It does an unrolled 3×3 search (9 cells) with a branch-free two-smallest min/max. Each cell's point orbits inside its cell: `0.5 + 0.45·sin(2π·hash22(cell) + w·cellMotion)`. The hash is Dave Hoskins' arithmetic hash22, with no noise call. All four Voronoi users (ribbons, ring, halftone, shadow) switch over.
- **New slider `cellMotion` (Animation folder), default 1.8.** It was tuned so the ribbon layer changes at the same rate as before: 0.71 % → 0.72 % of ribbon pixels change per 1/6 s, scroll off.
- **Benchmark** (same session, GPU-synced, 2880×2160): **10.22 ms → 4.76 ms** (−53 %). Cumulative vs cp0: 14.4 → 4.8 ms (−67 %).
  - The 13.1 ms measured just before this pass was run-to-run noise; the checkpoint re-measured at 10.2 ms in the same session.
- **Visual.** The cell layout is a different random arrangement, so most pixels differ frame-for-frame; that's expected. The character matches: same cell size, the same wavy warped ribbons with pixel steps and glow, and the halftone patterns behave the same.
- Sheet: `compare/lean2_voronoi2d.png`.
- A TSL nested `Loop` produced wrong output (only one cell searched) on the WebGL2 backend, so the 3×3 search is unrolled in JavaScript at graph build time instead.

## 18. Lean pass 3: baked noise texture (checkpoint `cp3-noisetex`)

- **Change.** All procedural noise (`mx_fractal_noise_vec3` in the warp, `mx_noise_float` in base / clip / presence) is replaced by reads of a 256×256 tileable RGBA half-float texture, generated in JS at load (`src/shaders/noiseTexture.ts`):
  - RGB = 2-octave periodic gradient noise, A = 1 octave, each channel independent.
  - Time comes from two reads scrolled in different directions and summed (`sampleNoise`).
  - Per pixel: 0 procedural noise calls; texture reads 4 warps × 2 + base 2 + (clip + presence) × 2 layers × 2 = 18.
- **New sliders (Animation folder).**
  - `noiseGain` 1.4: amplitude calibration, chosen by eye against cp2 ribbon warpiness. 1.8 and above fold the ribbons.
  - `noiseSpeed` 0.13: ribbon change rate 0.71 % → 0.74 % per 1/6 s. Without it the texture version moved about 10× faster (6.9 %).
- **Benchmark** (same session): **4.75 ms → 1.9 ms** (−60 %). Cumulative vs cp0: 14.4 → 1.9 ms (about 7.5× faster). Remaining cost: 4 × 2D Voronoi (9 cells each) + texture reads.
- **Visual.** The character is close, but this is the most visible pass.
  - Ribbons run somewhat more horizontally stretched and streaky.
  - **Artifact:** occasional straight converging lines ("rays") where the warp folds over (t = 5 ribbon solo, bottom right).
  - The halftone behaves the same.
- Sheet: `compare/lean3_noisetex.png`.

## 19. Shared noise texture (checkpoint `cp4-sharedtex`) and notes for later

- **Change.** `getNoiseTexture()` creates the noise texture once and every water material reuses it. Before, each material build allocated a new 512 KB texture that was never freed (2 per page load in dev because of StrictMode; one more per remount or hot reload). Now it's 1. Renders are pixel-identical to cp3.
- **Revisit later: noise-texture mipmaps.** They'd remove shimmer of the warp near the horizon, but distant warping becomes slightly smoother. The user is keeping the current shape for now.
- **Skipped: 8-bit texture.** Speed gain is negligible (a 256² texture fits in cache either way); it saves only 256 KB and risks faint steps in the warp.
- **Skipped: KTX2 bake.** Not worth it at 256².
- **Mobile guidance for the river scene:**
  - Estimated cost on a phone GPU is about 10–20 ms for a full-screen plane. A river covering part of the screen is proportionally cheaper.
  - Cap DPR (e.g. `dpr={[1, 1.5]}`).
  - Wrap the time value for long sessions; scrolled coordinates grow without bound.
  - Verify on a real device.

**cp4-sharedtex reverted** (new commit, tag `cp5-revert-to-cp3`). The user saw the halftone break after it. Fresh-load renders were pixel-identical, so the likely cause is a remount: disposing the old material may also have freed the shared texture's GPU copy, leaving the new material reading empty noise. Unconfirmed. If the leak fix is revisited, test it across an unmount/remount, not just a fresh load.

## 20. Smooth outline restored on top of passes 2 + 3 (checkpoint `cp6-smooth-outline`)

- **Why.** Pass 1 (dot-centre outline) caused the "flashing octagons": merged dots formed hex blocks that switched on and off. The user never saw pass 1 on its own, because the benchmarks temporarily swapped the source files back to the previous checkpoint while their dev server was live. Reopening the tab during those windows showed older code. Confirmed by comparing `cp0` (5174) with `cp1` (5175) live.
- **Change.** `halftoneShape` is per-pixel again: `halftoneField(p)` plus per-pixel clip noise, now via the 2D Voronoi and noise texture.
- **Benchmark** (same session, separate servers, no file swapping):
  - cp0 original: 18.1 ms
  - cp3 octagons: 4.3 ms
  - **now: 4.9 ms**

  So the smooth outline costs about 15 % over cp3 and the result is still about 3.7× faster than the original. Absolute numbers this session are higher than earlier ones because extra servers and tabs were running.
- Sheet: `compare/outline_restored.png`.
