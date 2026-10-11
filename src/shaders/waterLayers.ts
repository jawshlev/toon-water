// Layered toon-water graph, written as TSL Fns.
// Every layer takes world-space plane coords `p` (metres on the plane) and
// returns a colour or a 0..1 mask. `composite` at the bottom stacks them.
import { Color, Vector2 } from 'three/webgpu'
import {
  Fn,
  uniform,
  vec2,
  vec3,
  float,
  floor,
  mod,
  length,
  sqrt,
  mix,
  step,
  smoothstep,
  select,
  cos,
  sin,
  positionWorld,
  mx_worley_noise_vec2,
  mx_fractal_noise_vec3,
  mx_noise_float,
} from 'three/tsl'

type Node = any // TSL node typing is loose; keep the graph readable instead

// ---------------------------------------------------------------------------
// Uniforms: every tunable lives here so the Leva panel can drive it.
// ---------------------------------------------------------------------------
export function createWaterUniforms() {
  return {
    time: uniform(0),

    // colours (sampled from water.mp4, see water-analysis/ANALYSIS.md)
    baseColor: uniform(new Color('#5ECCF8')),
    baseDeepColor: uniform(new Color('#53A4F3')),
    glowColor: uniform(new Color('#9CE4F5')),
    glowPaleColor: uniform(new Color('#C2F7FA')),
    highlightColor: uniform(new Color('#FFFFFF')),
    ringColor: uniform(new Color('#4A86DC')),
    shadowColor: uniform(new Color('#3F6CCB')),
    dotColor: uniform(new Color('#FFFFFF')),

    // animation
    scroll: uniform(new Vector2(0.3, 0.6)), // world units / s, drift toward camera
    evolveSpeed: uniform(0.2), // voronoi W (z) speed

    // base variation
    baseNoiseScale: uniform(0.18),
    baseNoiseAmount: uniform(0.25),

    // pixelation (applies to the ribbon voronoi + its shadow ring)
    pixelGrid: uniform(32.0), // cells per world unit
    pixelAngle: uniform(0.0),

    // ribbon voronoi
    voronoiScale: uniform(0.5),
    distortStrength: uniform(2),
    distortFreq: uniform(0.22),
    edgeCore: uniform(0.045), // F2-F1 below this is solid white
    edgePale: uniform(0.075),
    edgeGlow: uniform(0.11),
    edgeFade: uniform(0.17),
    // dark ring = the ribbon's own shadow: its glow mask evaluated at an offset
    ringOffset: uniform(new Vector2(0.05, 0.22)),
    ringWidth: uniform(0.145), // edge distance treated as "ribbon" for the shadow
    ringOpacity: uniform(0.7),

    // halftone
    htFreq: uniform(6), // dots per world unit
    htAngle: uniform(0.35), // radians
    htRadiusMax: uniform(0), // dot radius at morph = 1, in units of dot spacing (0 = dots vanish; > 0.577 merges)

    // solid -> halftone morph field (per dot centre). Uses no extra noise: the noise is the
    // otherwise-unused z channel of the halftone warp.
    htInterpolate: uniform(0.14), // morph wave speed, cycles per second (0 = frozen)
    htEase: uniform(0.97), // cycle timing: 0 = constant speed (triangle), 1 = eased (cosine: lingers at solid / gone)
    htFillCurve: uniform(1), // 0 = radius changes evenly (fills snap at the end), 1 = covered area changes evenly
    htEvolve: uniform(0.17), // halftone-only cell evolution speed (x evolveSpeed); ribbons unaffected
    morphNoiseAmount: uniform(0.35), // noise phase offset in cycles (0 = whole plane in sync)
    morphNoiseGain: uniform(1.5), // stretches the narrow perlin range toward 0..1
    morphWaveFreq: uniform(0), // travelling-wave bands per world unit (0 = no bands)
    morphWaveAngle: uniform(0.6), // direction the bands travel (radians)
    morphContrast: uniform(1), // > 1 = areas hold solid / hold dots longer, then snap
    morphMin: uniform(0), // morph range: 0 = solid, 1 = dots (htRadiusMax)
    morphMax: uniform(1),

    // overall presence: thins the halftone into separate patches without changing it inside them
    htPresence: uniform(1), // 1 = everywhere (as before), 0 = nowhere
    htPresenceScale: uniform(0.25), // patch size: lower = bigger patches
    htPresenceSoftness: uniform(0.15), // patch edges: dots shrink out over this range instead of cutting
    // the halftone is a voronoi rendered as dots (like the ribbon layer is a voronoi rendered as pixels)
    htShareRibbon: uniform(0), // 1 = use the exact ribbon voronoi, 0 = its own scale/warp/seed
    htMaskScale: uniform(0.25),
    htMaskDistort: uniform(2.5),
    htEdgeIn: uniform(0.015), // F2-F1 below this -> full dot radius (dots merge into solid white)
    htEdgeOut: uniform(0.2), // F2-F1 above this -> no dot
    htClip: uniform(0.93), // hard clip threshold on the dot field (crescents)
    htClipNoise: uniform(0.03),

    // halftone shadow
    shadowOffset: uniform(new Vector2(0.06, 0.3)),
    shadowSoftness: uniform(0.12),
    shadowOpacity: uniform(0.8),
    shadowSpread: uniform(0.0), // shadow mask distance widening vs the dot mask

    // layer enables (mute) and solo background
    enBase: uniform(1),
    enVoronoi: uniform(1),
    enRing: uniform(1),
    enShadow: uniform(1),
    enHalftone: uniform(1),
    soloBg: uniform(0), // 1 = replace base with neutral grey for solo views

    // effect switches (1 = on); combine freely with the layer switches
    fxPixelate: uniform(1),
    fxWarp: uniform(1),
    fxRadiusMod: uniform(1), // off = every dot inside the field gets htRadiusMax
    fxClip: uniform(1),
    fxScroll: uniform(1),
    fxEvolve: uniform(1),
    fxMorphNoise: uniform(1), // off = whole plane morphs in sync
    fxShowMorph: uniform(0), // debug: show the morph field as greyscale (black = solid, white = dots)
  }
}
export type WaterUniforms = ReturnType<typeof createWaterUniforms>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const rotate2 = (p: Node, a: Node) => {
  const c = cos(a)
  const s = sin(a)
  return vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c)))
}

// 3D voronoi (time as z) -> vec2(F1, F2 - F1). mx_worley_noise_vec2 returns
// squared euclidean distances, so take the sqrt first.
const voronoi = Fn(([p, w]: [Node, Node]) => {
  const f = sqrt(mx_worley_noise_vec2(vec3(p, w), 1.0))
  return vec2(f.x, f.y.sub(f.x))
})
const voronoiEdge = Fn(([p, w]: [Node, Node]) => voronoi(p, w).y)


// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------
export function createWaterGraph(u: WaterUniforms) {
  const t = u.time
  const w = t.mul(u.evolveSpeed).mul(u.fxEvolve)
  const wh = w.mul(u.htEvolve) // halftone's own evolution clock

  /**
   * Domain warp with 2-octave 3D perlin. Returns vec3(warped.xy, n.z): xy warps the
   * coordinate, z is a spare independent noise channel that callers can recycle.
   */
  const warp = Fn(([p, freq, strength, wz]: [Node, Node, Node, Node]) => {
    const n = mx_fractal_noise_vec3(vec3(p.mul(freq), wz), 2, 2.0, 0.5)
    return vec3(p.add(n.xy.mul(strength).mul(u.fxWarp)), n.z)
  })

  // Plane coords, scrolled. Surface-space (UV) like the reference.
  const surface = Fn(() => {
    const p = vec2(positionWorld.x, positionWorld.z.negate())
    return p.add(u.scroll.mul(t).mul(u.fxScroll))
  })

  /** Snap coords to a (optionally rotated) square grid: the stair-step look. */
  const pixelate = Fn(([p]: [Node]) => {
    const r = rotate2(p, u.pixelAngle)
    const snapped = floor(r.mul(u.pixelGrid)).add(0.5).div(u.pixelGrid)
    return mix(p, rotate2(snapped, u.pixelAngle.negate()), u.fxPixelate)
  })

  /** Bottom: solid blue with a slow, soft darker variation. */
  const baseColor = Fn(([p]: [Node]) => {
    const n = mx_noise_float(vec3(p.mul(u.baseNoiseScale), w.mul(0.3))).mul(0.5).add(0.5)
    const deep = smoothstep(0.45, 0.85, n).mul(u.baseNoiseAmount)
    const col = mix(u.baseColor, u.baseDeepColor, deep)
    return mix(col, vec3(0.5), u.soloBg)
  })

  /** Ribbon voronoi edge distance, on pixelated + warped coords. */
  const ribbonEdge = Fn(([pq]: [Node]) => {
    const pw = warp(pq, u.distortFreq, u.distortStrength, w.mul(0.5)).xy
    return voronoiEdge(pw.mul(u.voronoiScale), w)
  })

  /**
   * Middle: linear colour ramp on the *pixelated* ribbon edge distance. The ramp
   * itself is smooth; the stair-steps come from the snapped input (each pixel
   * block gets one flat tone), which is what the reference zooms show.
   * Coverage is step(e, edgeFade) - beyond that the base shows through.
   */
  const voronoiLayer = Fn(([e]: [Node]) => {
    const a = smoothstep(u.edgeCore, u.edgePale, e)
    const b = smoothstep(u.edgePale, u.edgeGlow, e)
    const c = smoothstep(u.edgeGlow, u.edgeFade, e)
    let col: Node = mix(u.highlightColor, u.glowPaleColor, a)
    col = mix(col, u.glowColor, b)
    col = mix(col, u.baseColor, c)
    return col
  })

  /**
   * Dark ring: the ribbon casting a shadow. Same pixelated edge field sampled at
   * ringOffset, so it shows as a dark band on the near side of each ribbon.
   */
  const ringMask = Fn(([p]: [Node]) => {
    const eS = ribbonEdge(pixelate(p.add(u.ringOffset)))
    return step(eS, u.ringWidth)
  })

  /**
   * Halftone field: a warped voronoi edge distance (F2 - F1), built exactly like
   * the ribbon layer. The ribbon layer quantises it with pixel blocks; the
   * halftone quantises it with dots. htShareRibbon = 1 reuses the ribbon's
   * voronoi as-is; 0 gives it its own scale, warp and seed.
   * Returns vec2(field, z): field is 1 at the edge -> 0 beyond htEdgeOut (+ widen);
   * z is the warp's spare noise channel, recycled as the morph noise.
   */
  const halftoneField = Fn(([p, widen]: [Node, Node]) => {
    const sh = u.htShareRibbon
    const seed = mix(vec2(17.3, -9.1), vec2(0.0), sh)
    const pw = warp(
      p.add(seed),
      mix(u.distortFreq.mul(1.3), u.distortFreq, sh),
      mix(u.htMaskDistort, u.distortStrength, sh),
      mix(wh.mul(0.6), w.mul(0.5), sh),
    )
    const e = voronoiEdge(pw.xy.mul(mix(u.htMaskScale, u.voronoiScale, sh)), mix(wh.add(4.0), w, sh))
    return vec2(smoothstep(u.htEdgeOut.add(widen), u.htEdgeIn.add(widen), e), pw.z)
  })

  /**
   * Hex dot lattice. Returns vec3(distToNearestCentre, centre.xy) where the
   * distance is in units of dot spacing and the centre is in world coords.
   */
  const hexLattice = Fn(([p]: [Node]) => {
    const q = rotate2(p.mul(u.htFreq), u.htAngle)
    const r = vec2(1.0, 1.7320508)
    const a = mod(q, r).sub(r.mul(0.5))
    const b = mod(q.sub(r.mul(0.5)), r).sub(r.mul(0.5))
    const useA = length(a).lessThan(length(b))
    const local = select(useA, a, b)
    const centreQ = q.sub(local)
    const centre = rotate2(centreQ, u.htAngle.negate()).div(u.htFreq)
    return vec3(length(local), centre)
  })

  /**
   * Morph field at a dot centre c (0 = solid, 1 = dots). Every point runs the same
   * solid -> dots -> gone cycle at speed htInterpolate; the recycled noise z and the
   * travelling wave only offset *when* each area is in that cycle.
   */
  const morphAt = Fn(([c, z]: [Node, Node]) => {
    const n = float(0.5).add(z.mul(0.5).mul(u.morphNoiseGain)).clamp(0, 1)
    const dir = vec2(cos(u.morphWaveAngle), sin(u.morphWaveAngle))
    const offset = n.mul(u.morphNoiseAmount).sub(c.dot(dir).mul(u.morphWaveFreq)).mul(u.fxMorphNoise)
    const cycles = t.mul(u.htInterpolate).add(offset)
    const tri = float(1).sub(cycles.fract().mul(2).sub(1).abs()) // 0 -> 1 -> 0 at constant speed
    const eased = float(0.5).sub(cos(cycles.mul(Math.PI * 2)).mul(0.5))
    const cyc = mix(tri, eased, u.htEase)
    // contrast only bends the curve above 1 (1 = untouched)
    const half = float(0.5).div(u.morphContrast.max(1))
    const shaped = mix(cyc, smoothstep(float(0.5).sub(half), float(0.5).add(half), cyc), step(1.001, u.morphContrast))
    return mix(u.morphMin, u.morphMax, shaped)
  })

  /**
   * Presence mask at a dot centre (0..1). Multiplies the dot radius, so dots at a
   * patch edge shrink away rather than being cut. With htPresence = 1 it is exactly 1.
   */
  const presenceAt = Fn(([c]: [Node]) => {
    const n = float(0.5).add(mx_noise_float(vec3(c.mul(u.htPresenceScale), wh.mul(0.3).add(11.0))).mul(0.75)).clamp(0, 1)
    const s = u.htPresenceSoftness.max(0.001)
    const th = float(1).sub(u.htPresence).mul(s.add(1)).sub(s)
    return smoothstep(th, th.add(s), n)
  })

  // Radius at which hex-lattice dots cover the plane completely (1 / sqrt(3) of the spacing).
  const SOLID_RADIUS = 0.5774

  /**
   * Dot radius from the field f sampled at the dot centre (the halftone "quantisation"),
   * morphed by m: 0 = SOLID_RADIUS (dots fuse into one solid sheet), 1 = the halftone radius.
   */
  const dotRadius = Fn(([f, m]: [Node, Node]) => {
    const modulated = f.mul(u.htRadiusMax)
    const flat = step(0.001, f).mul(u.htRadiusMax)
    const rDots = mix(flat, modulated, u.fxRadiusMod)
    const rSolid = float(SOLID_RADIUS + 0.002)
    const linearR = mix(rSolid, rDots, m)
    // dot area grows with r^2, so interpolate area (r^2) for an even fill instead of a late snap
    const areaR = sqrt(mix(rSolid.mul(rSolid), rDots.mul(rDots), m))
    return mix(linearR, areaR, u.htFillCurve)
  })

  /**
   * The voronoi shape the halftone fills, decided per dot from the field already
   * sampled at the dot centre (f), hard-clipped when the clip effect is on. Reusing
   * the centre sample (lean pass 1) saves a per-pixel warp + voronoi; the outline
   * follows the dot lattice instead of a smooth curve.
   */
  const halftoneShape = Fn(([centre, f]: [Node, Node]) => {
    const clipN = mx_noise_float(vec3(centre.mul(2.2), wh)).mul(u.htClipNoise)
    const clip = step(u.htClip, f.add(clipN))
    return step(0.001, f).mul(mix(float(1), clip, u.fxClip))
  })

  /**
   * Top: hard white dots inside the voronoi shape, each morphing solid -> halftone on
   * its own schedule. Returns vec2(coverage, morph) so the debug view reuses the morph.
   */
  const halftone = Fn(([p]: [Node]) => {
    const lat = hexLattice(p)
    const fc = halftoneField(lat.yz, 0)
    const m = morphAt(lat.yz, fc.y)
    const dots = step(lat.x, dotRadius(fc.x, m).mul(presenceAt(lat.yz)))
    return vec2(dots.mul(halftoneShape(lat.yz, fc.x)), m)
  })

  /** Shadow: same halftone at an offset (so it morphs with the dot casting it), soft-edged. */
  const halftoneShadow = Fn(([p]: [Node]) => {
    const ps = p.add(u.shadowOffset)
    const lat = hexLattice(ps)
    const fc = halftoneField(lat.yz, u.shadowSpread)
    const m = morphAt(lat.yz, fc.y)
    const radius = dotRadius(fc.x, m).mul(presenceAt(lat.yz))
    // softness fades out as the dot morphs to solid, so a solid shadow has no lattice texture
    const soft = u.shadowSoftness.mul(m)
    return smoothstep(radius, radius.sub(soft).sub(0.0001), lat.x).mul(halftoneShape(lat.yz, fc.x))
  })

  // -------------------------------------------------------------------------
  // Composite: bottom -> top. Reorder / swap blend modes here.
  // -------------------------------------------------------------------------
  const composite = Fn(() => {
    const p = surface()
    const pq = pixelate(p)

    // 1. base (normal)
    let col: Node = mix(vec3(0.5), baseColor(p), u.enBase)

    // 2. ribbon shadow / dark ring (normal blend at ringOpacity), under the ribbons
    col = mix(col, u.ringColor, ringMask(p).mul(u.ringOpacity).mul(u.enRing))

    // 3. pixelated voronoi ribbons (normal blend, linear ramp on snapped input)
    const e = ribbonEdge(pq)
    const ramp = voronoiLayer(e)
    const fade = step(e, u.edgeFade)
    col = mix(col, ramp, fade.mul(u.enVoronoi))

    // 4. shadow cast by the halftone (normal blend toward shadowColor)
    col = mix(col, u.shadowColor, halftoneShadow(p).mul(u.shadowOpacity).mul(u.enShadow))

    // 5. halftone dots (normal, hard)
    const ht = halftone(p)
    col = mix(col, u.dotColor, ht.x.mul(u.enHalftone))

    // debug: morph field per dot (reuses the halftone's own morph value, no extra cost)
    col = mix(col, vec3(ht.y), u.fxShowMorph)

    return col
  })

  return { composite, layers: { surface, pixelate, baseColor, voronoiLayer, ringMask, halftoneField, morphAt, presenceAt, dotRadius, halftoneShape, halftone, halftoneShadow } }
}
