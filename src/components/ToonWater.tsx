import { useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls, folder, button } from 'leva'
import * as THREE from 'three/webgpu'
import { createWaterUniforms, createWaterGraph, type WaterUniforms } from '../shaders/waterLayers'
import { PRESETS as SAVED_PRESETS, type Settings } from '../presets'

export const LAYERS = ['base', 'voronoi', 'ring', 'shadow', 'halftone'] as const
export type Layer = (typeof LAYERS)[number]
export const EFFECTS = ['pixelate', 'warp', 'radiusMod', 'clip', 'scroll', 'evolve', 'morphNoise', 'shareRibbon', 'bubbleInvert', 'showMorph'] as const
export type Effect = (typeof EFFECTS)[number]
const FX_KEY: Record<Effect, keyof WaterUniforms> = {
  pixelate: 'fxPixelate',
  warp: 'fxWarp',
  radiusMod: 'fxRadiusMod',
  clip: 'fxClip',
  scroll: 'fxScroll',
  evolve: 'fxEvolve',
  morphNoise: 'fxMorphNoise',
  shareRibbon: 'htShareRibbon',
  bubbleInvert: 'bubbleInvert',
  showMorph: 'fxShowMorph',
}
const FX_LABEL: Record<Effect, string> = {
  pixelate: 'pixelate ribbons',
  warp: 'noise warp',
  radiusMod: 'dot size from voronoi',
  clip: 'dot hard clip',
  scroll: 'scroll',
  evolve: 'cell evolution',
  morphNoise: 'morph noise + wave',
  shareRibbon: 'halftone uses ribbon voronoi',
  bubbleInvert: 'invert bubble gradient',
  showMorph: 'show morph field',
}
const EN_KEY: Record<Layer, keyof WaterUniforms> = {
  base: 'enBase',
  voronoi: 'enVoronoi',
  ring: 'enRing',
  shadow: 'enShadow',
  halftone: 'enHalftone',
}

type Props = {
  size?: number
  /** Freeze time at this value (seconds); used for reference-matched screenshots. */
  frozenTime?: number
  solo?: Layer | 'none'
  /** Layers / effects to start switched off, e.g. ['ring', 'clip']. */
  off?: string[]
  /** Starting values for numeric uniforms, e.g. { htInterpolate: 0.5 }. */
  overrides?: Record<string, number>
  /** Saved look to start from (see src/presets.ts), e.g. 'bubbles'. */
  preset?: string
}

// Exact current values of every tunable uniform (for "Copy settings" and the default preset).
function snapshot(u: WaterUniforms) {
  const out: Settings = {}
  for (const [k, un] of Object.entries(u)) {
    if (k === 'time') continue
    const v = (un as { value: unknown }).value
    if (v instanceof THREE.Color) out[k] = '#' + v.getHexString()
    else if (v instanceof THREE.Vector2) out[k] = { x: v.x, y: v.y }
    else out[k] = v as number
  }
  return out
}

const PRESETS: Record<string, Settings> = { default: snapshot(createWaterUniforms()), ...SAVED_PRESETS }

// Write a settings object (Copy settings format) straight into the uniforms.
function applySettings(u: WaterUniforms, s: Settings) {
  for (const [k, val] of Object.entries(s)) {
    const un = u[k as keyof WaterUniforms] as { value: unknown } | undefined
    if (!un) continue
    const v = un.value
    if (v instanceof THREE.Color) v.set(val as string)
    else if (v instanceof THREE.Vector2) v.set((val as { x: number }).x, (val as { y: number }).y)
    else if (typeof val === 'number') un.value = val
  }
}

// Uniform keys that have a slider in the Water panel (filled in by bind), so a preset only sets those.
const panelKeys = new Set<string>()

// Build leva entries that write straight into uniforms (transient: no React re-render).
function bind(u: WaterUniforms, keys: Partial<Record<keyof WaterUniforms, { min?: number; max?: number; step?: number }>>) {
  const out: Record<string, any> = {}
  for (const [k, range] of Object.entries(keys)) {
    panelKeys.add(k)
    const un = u[k as keyof WaterUniforms] as { value: unknown }
    const v = un.value
    if (v instanceof THREE.Color) {
      out[k] = { value: '#' + v.getHexString(), onChange: (c: string) => (v as THREE.Color).set(c) }
    } else if (v instanceof THREE.Vector2) {
      out[k] = { value: { x: v.x, y: v.y }, step: 0.01, onChange: (c: { x: number; y: number }) => v.set(c.x, c.y) }
    } else {
      out[k] = { value: v as number, ...range, onChange: (c: number) => (un.value = c) }
    }
  }
  return out
}

export function ToonWater({ size = 80, frozenTime, solo = 'none', off = [], overrides = {}, preset = 'default' }: Props) {
  const uniforms = useMemo(() => {
    const un = createWaterUniforms()
    if (PRESETS[preset]) applySettings(un, PRESETS[preset])
    for (const [k, v] of Object.entries(overrides)) {
      const target = un[k as keyof WaterUniforms] as { value: unknown } | undefined
      if (target && typeof target.value === 'number') target.value = v
    }
    return un
    // preset + overrides only seed the initial values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const material = useMemo(() => {
    const m = new THREE.MeshBasicNodeMaterial()
    m.colorNode = createWaterGraph(uniforms).composite()
    return m
  }, [uniforms])
  useEffect(() => () => material.dispose(), [material])

  const u = uniforms
  // Load a preset: write the uniforms, then move the panel's sliders / checkboxes to match.
  const loadPreset = (name: string) => {
    const s = PRESETS[name]
    applySettings(u, s)
    setWater(Object.fromEntries(Object.entries(s).filter(([k]) => panelKeys.has(k))) as any)
    setFx(Object.fromEntries(EFFECTS.filter((fx) => FX_KEY[fx] in s).map((fx) => [fx, Number(s[FX_KEY[fx]]) > 0.5])))
  }
  const [, setWater] = useControls('Water', () => ({
    'Copy settings': button(() => {
      const json = JSON.stringify(snapshot(u), null, 1)
      navigator.clipboard.writeText(json).catch(() => console.log(json))
    }),
    Presets: folder(Object.fromEntries(Object.keys(PRESETS).map((name) => [name, button(() => loadPreset(name))]))),
    Colours: folder(
      bind(u, {
        baseColor: {}, baseDeepColor: {}, glowColor: {}, glowPaleColor: {}, highlightColor: {},
        ringColor: {}, shadowColor: {}, dotColor: {},
      }),
      { collapsed: true },
    ),
    Animation: folder(bind(u, { scroll: {}, evolveSpeed: { min: 0, max: 2, step: 0.01 }, cellMotion: { min: 0, max: 10, step: 0.05 }, noiseGain: { min: 0, max: 3, step: 0.01 }, noiseSpeed: { min: 0, max: 2, step: 0.01 } })),
    Base: folder(bind(u, { baseNoiseScale: { min: 0, max: 1, step: 0.01 }, baseNoiseAmount: { min: 0, max: 1, step: 0.01 } }), { collapsed: true }),
    Pixelate: folder(bind(u, { pixelGrid: { min: 1, max: 40, step: 0.5 }, pixelAngle: { min: -3.14, max: 3.14, step: 0.01 } })),
    Voronoi: folder(
      bind(u, {
        voronoiScale: { min: 0.05, max: 2, step: 0.01 },
        distortStrength: { min: 0, max: 4, step: 0.01 },
        distortFreq: { min: 0, max: 2, step: 0.01 },
        edgeCore: { min: 0, max: 0.5, step: 0.005 },
        edgePale: { min: 0, max: 0.5, step: 0.005 },
        edgeGlow: { min: 0, max: 0.6, step: 0.005 },
        edgeFade: { min: 0, max: 0.8, step: 0.005 },
        bubbleMix: { min: 0, max: 1, step: 0.01 },
        bubbleRadius: { min: 0.05, max: 0.5, step: 0.005 },
        bubbleRadiusVar: { min: 0, max: 1, step: 0.01 },
        bubbleDensity: { min: 0, max: 1, step: 0.01 },
        bubbleMerge: { min: 0, max: 0.5, step: 0.005 },
        bubbleGradient: { min: 0, max: 1, step: 0.01 },
        ringOffset: {},
        ringWidth: { min: 0, max: 0.5, step: 0.005 },
        ringOpacity: { min: 0, max: 1, step: 0.01 },
      }),
    ),
    Halftone: folder(
      bind(u, {
        htFreq: { min: 0.2, max: 20, step: 0.01 },
        htAngle: { min: -3.14, max: 3.14, step: 0.01 },
        htRadiusMax: { min: 0, max: 1, step: 0.01 },
        htMaskScale: { min: 0.05, max: 2, step: 0.01 },
        htMaskDistort: { min: 0, max: 3, step: 0.01 },
        htEdgeIn: { min: 0, max: 0.6, step: 0.005 },
        htEdgeOut: { min: 0, max: 0.8, step: 0.005 },
        htClip: { min: 0, max: 1, step: 0.01 },
        htClipNoise: { min: 0, max: 0.5, step: 0.01 },
      }),
    ),
    Morph: folder(
      bind(u, {
        htInterpolate: { min: 0, max: 2, step: 0.01 },
        htEase: { min: 0, max: 1, step: 0.01 },
        htFillCurve: { min: 0, max: 1, step: 0.01 },
        htEvolve: { min: 0, max: 2, step: 0.01 },
        morphNoiseAmount: { min: 0, max: 2, step: 0.01 },
        morphNoiseGain: { min: 0, max: 4, step: 0.01 },
        morphWaveFreq: { min: 0, max: 1, step: 0.005 },
        morphWaveAngle: { min: -3.14, max: 3.14, step: 0.01 },
        morphContrast: { min: 1, max: 8, step: 0.05 },
        morphMin: { min: 0, max: 1, step: 0.01 },
        morphMax: { min: 0, max: 1, step: 0.01 },
        htPresence: { min: 0, max: 1, step: 0.01 },
        htPresenceScale: { min: 0.02, max: 2, step: 0.01 },
        htPresenceSoftness: { min: 0, max: 0.5, step: 0.01 },
      }),
    ),
    Shadow: folder(
      bind(u, {
        shadowOffset: {},
        shadowSoftness: { min: 0, max: 0.5, step: 0.005 },
        shadowOpacity: { min: 0, max: 1, step: 0.01 },
        shadowSpread: { min: 0, max: 1, step: 0.01 },
      }),
    ),
  }))

  // Layer switches: tick any combination on/off. "solo" overrides them while set.
  const { soloLayer, ...mutes } = useControls('Layers (on/off)', {
    soloLayer: { value: solo, options: ['none', ...LAYERS], label: 'solo' },
    ...Object.fromEntries(LAYERS.map((l) => [l, !off.includes(l)])),
  }) as { soloLayer: Layer | 'none' } & Record<Layer, boolean>

  // Effect switches: turn individual processing steps on/off, independent of layers.
  const [, setFx] = useControls('Effects (on/off)', () =>
    Object.fromEntries(
      EFFECTS.map((fx) => {
        const un = u[FX_KEY[fx]] as { value: number }
        // shareRibbon, bubbleInvert and showMorph start at their uniform default (off); the rest start on
        const defaultOff = fx === 'shareRibbon' || fx === 'bubbleInvert' || fx === 'showMorph'
        const on = defaultOff ? un.value > 0.5 && !off.includes(fx) : !off.includes(fx)
        un.value = on ? 1 : 0
        return [fx, { value: on, label: FX_LABEL[fx], onChange: (v: boolean) => (un.value = v ? 1 : 0) }]
      }),
    ),
  )

  useEffect(() => {
    for (const l of LAYERS) {
      const on = soloLayer === 'none' ? mutes[l] : l === soloLayer
      ;(u[EN_KEY[l]] as { value: number }).value = on ? 1 : 0
    }
    u.soloBg.value = soloLayer !== 'none' && soloLayer !== 'base' ? 1 : 0
  }, [soloLayer, mutes.base, mutes.voronoi, mutes.ring, mutes.shadow, mutes.halftone, u])

  useFrame((_, delta) => {
    u.time.value = frozenTime ?? u.time.value + delta
  })

  return (
    <mesh rotation-x={-Math.PI / 2} material={material}>
      <planeGeometry args={[size, size, 1, 1]} />
    </mesh>
  )
}
