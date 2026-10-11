import * as THREE from 'three/webgpu'
import { Canvas, extend, type ThreeToJSXElements } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Leva } from 'leva'
import { ToonWater, LAYERS, type Layer } from './components/ToonWater'

declare module '@react-three/fiber' {
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}
extend(THREE as any)

// URL params for reproducible screenshots: ?t=1.5&solo=halftone&off=ring,clip&set=htInterpolate:0.5&ui=0
const params = new URLSearchParams(location.search)
const frozenTime = params.has('t') ? Number(params.get('t')) : undefined
const soloParam = params.get('solo') as Layer | null
const solo = soloParam && (LAYERS as readonly string[]).includes(soloParam) ? soloParam : 'none'
const showUi = params.get('ui') !== '0'
// ?off=ring,clip starts those layers / effects switched off
const off = (params.get('off') ?? '').split(',').filter(Boolean)
// ?set=htInterpolate:0.5,htFreq:3 seeds numeric uniforms
const overrides = Object.fromEntries(
  (params.get('set') ?? '').split(',').filter(Boolean).map((kv) => {
    const [k, v] = kv.split(':')
    return [k, Number(v)]
  }),
)

// Low, grazing camera roughly matching water.mp4 (horizon just above frame).
const CAMERA_POS: [number, number, number] = [0, 1.5, 4]
const TARGET: [number, number, number] = [0, 0, 0.7]

export default function App() {
  return (
    <>
      <Leva hidden={!showUi} collapsed={false} />
      <Canvas
        flat
        camera={{ position: CAMERA_POS, fov: 42, near: 0.05, far: 200 }}
        gl={async (props) => {
          const renderer = new THREE.WebGPURenderer(props as any)
          await renderer.init()
          return renderer
        }}
      >
        <ToonWater frozenTime={frozenTime} solo={solo} off={off} overrides={overrides} />
        <OrbitControls target={TARGET} enableDamping={false} />
      </Canvas>
    </>
  )
}
