// Tileable noise texture generated once at load (lean pass 3): replaces every
// per-pixel procedural noise call with texture reads. No image file is shipped.
//   R, G, B: 2-octave fractal gradient noise (warp xy + the recycled morph channel)
//   A:       1-octave gradient noise (base colour, clip and presence noise)
// Each channel is independent, roughly -1..1, and tiles every `cells` noise cells.
import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RepeatWrapping, RGBAFormat } from 'three/webgpu'

/** Noise cells across one texture tile; shaders divide their noise coords by this. */
export const NOISE_CELLS = 8

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Periodic 2D gradient (Perlin-style) noise with `period` lattice cells per tile. */
function makePeriodicNoise(period: number, seed: number) {
  const rand = mulberry32(seed)
  const gx = new Float32Array(period * period)
  const gy = new Float32Array(period * period)
  for (let i = 0; i < period * period; i++) {
    const a = rand() * Math.PI * 2
    gx[i] = Math.cos(a)
    gy[i] = Math.sin(a)
  }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const dot = (ix: number, iy: number, dx: number, dy: number) => {
    const k = (((iy % period) + period) % period) * period + (((ix % period) + period) % period)
    return gx[k] * dx + gy[k] * dy
  }
  // x, y in lattice units (0..period tiles seamlessly)
  return (x: number, y: number) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const u = fade(fx)
    const v = fade(fy)
    const n00 = dot(x0, y0, fx, fy)
    const n10 = dot(x0 + 1, y0, fx - 1, fy)
    const n01 = dot(x0, y0 + 1, fx, fy - 1)
    const n11 = dot(x0 + 1, y0 + 1, fx - 1, fy - 1)
    const nx0 = n00 + (n10 - n00) * u
    const nx1 = n01 + (n11 - n01) * u
    return (nx0 + (nx1 - nx0) * v) * 1.41421356 // ~ -1..1
  }
}

export function createNoiseTexture(size = 256) {
  const cells = NOISE_CELLS
  // two octaves for R/G/B (period doubles so the tile still repeats), one for A
  const oct1 = [11, 23, 37, 53].map((s) => makePeriodicNoise(cells, s))
  const oct2 = [71, 89, 97].map((s) => makePeriodicNoise(cells * 2, s))
  const data = new Uint16Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * cells
      const v = (y / size) * cells
      const o = (y * size + x) * 4
      for (let c = 0; c < 3; c++) {
        const n = oct1[c](u, v) + 0.5 * oct2[c](u * 2, v * 2)
        data[o + c] = DataUtils.toHalfFloat(n)
      }
      data[o + 3] = DataUtils.toHalfFloat(oct1[3](u, v))
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, HalfFloatType)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.magFilter = tex.minFilter = LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  console.debug('[toon-water] noise texture created')
  return tex
}

let shared: DataTexture | null = null

/**
 * The one noise texture every water material shares. Created on first use, so
 * remounts, hot reloads and multiple water meshes don't each allocate 512 KB.
 */
export function getNoiseTexture() {
  shared ??= createNoiseTexture()
  return shared
}
