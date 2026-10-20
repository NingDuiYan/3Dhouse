import './ui/style.css'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { DPR_MAX } from './config'
import type { TimeState } from './types'
import { copyParams, createParams, lerpParams, resolveParams, resolveParticleMode } from './core/state'
import { createLoop } from './core/loop'
import { createTextures } from './systems/textures'
import { createSkySystem } from './systems/sky'
import { createSun } from './systems/sun'
import { createHemisphere } from './systems/hemisphere'
import { createHouse } from './systems/house'
import { createInterior } from './systems/interior'
import { createVegetation } from './systems/vegetation'
import { createEnvironment } from './systems/environment'
import { createParticles } from './systems/particles'
import { createWeatherSystem } from './systems/weather'
import { createCameraSystem } from './systems/camera'
import { createHud } from './ui/hud'

// —— 交互状态（默认：秋 · 16:30 · 晴，接近 v1 默认情绪"秋·晚"） ——
const state: TimeState = { hour: 16.5, season: 'au', weather: 'clear' }

// —— 渲染器 / 场景 / 相机 / 后处理 ——
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_MAX))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.72
document.getElementById('app')?.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000)
camera.position.set(9.5, 4.2, 11.5)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.6, 0.85)
composer.addPass(bloomPass)
composer.addPass(new OutputPass())

// —— 场景系统装配 ——
const tex = createTextures()
const sky = createSkySystem(renderer, scene)
const sun = createSun(scene)
const hemi = createHemisphere(scene)
const house = createHouse(tex)
scene.add(house.group)
const interior = createInterior(house.group, house.mats.glassMat)
const vegetation = createVegetation(scene, tex)
const environment = createEnvironment(scene, renderer, bloomPass, house.mats.roofSnowMat, house.mats.pathMat, tex)
const particles = createParticles(scene, tex)
const weatherSys = createWeatherSystem(scene, tex)
const cameraSys = createCameraSystem(camera, renderer.domElement)
const hud = createHud(state, {
  onSeasonChange: () => cameraSys.triggerSweep(),
  onTourToggle: (on) => cameraSys.setTour(on)
})

// —— 参数状态：cur 指数缓动追踪 target（target 每帧由 TimeState 全量重解析） ——
const cur = createParams()
const target = createParams()
resolveParams(state, target)
copyParams(cur, target)

let particleMode = resolveParticleMode(state)
particles.setMode(particleMode)

// —— 每帧更新 ——
let loaderDone = false

function applyAll(p: typeof cur, dt: number): void {
  sky.apply(p)
  sun.apply(p)
  hemi.apply(p)
  interior.apply(p)
  vegetation.apply(p)
  environment.apply(p, dt)
  weatherSys.apply(p, dt)
}

const loop = createLoop(renderer, composer, camera, {
  update(dt, t) {
    resolveParams(state, target)
    lerpParams(cur, target, dt)
    applyAll(cur, dt)

    const mode = resolveParticleMode(state)
    if (mode !== particleMode) {
      particleMode = mode
      particles.setMode(mode)
    }
    particles.update(dt, t, cur.ffGlow)

    sky.refreshEnv(dt)
    cameraSys.update(dt)

    if (!loaderDone) {
      loaderDone = true
      document.getElementById('loader')?.classList.add('done')
    }
  }
})

hud.refresh()
loop.start()
