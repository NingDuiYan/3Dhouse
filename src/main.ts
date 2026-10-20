import './ui/style.css'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import {
  CAMERA_FOV,
  CAMERA_POS,
  MAX_EASE_DT,
  QUALITY_CAPS,
  SSAO_KERNEL_RADIUS,
  SSAO_MAX_DISTANCE,
  SSAO_MIN_DISTANCE
} from './config'
import type { QualityTier, TimeState } from './types'
import { copyParams, createParams, lerpParams, resolveParams, resolveParticleMode } from './core/state'
import { createLoop } from './core/loop'
import { pickInitialTier } from './core/quality'
import { createTextures } from './systems/textures'
import { createSkySystem } from './systems/sky'
import { createSun } from './systems/sun'
import { createHemisphere } from './systems/hemisphere'
import { createHouse } from './systems/house'
import { createInterior } from './systems/interior'
import { createVegetation } from './systems/vegetation'
import { createGarden } from './systems/garden'
import { createEnvironment } from './systems/environment'
import { createParticles } from './systems/particles'
import { createWeatherSystem } from './systems/weather'
import { createCameraSystem } from './systems/camera'
import { createHud } from './ui/hud'

// —— 加载页：文案与样式内联在 index.html，首帧渲染完成后淡出 ——
const loaderEl = document.getElementById('loader')
const rootEl = document.documentElement

/** 功能：把加载页切换为失败态并写入原因，避免初始化异常时一直转圈。
 *  参数：message — 给用户看的一句话原因。
 *  返回：无。 */
function bootFail(message: string): void {
  if (!loaderEl) return
  loaderEl.classList.add('failed')
  loaderEl.setAttribute('aria-busy', 'false')
  loaderEl.querySelector('.boot-label')?.replaceChildren(message)
}

// WebGL 不可用、贴图生成异常等都在模块初始化期间抛错，兜底换成可读提示
window.addEventListener('error', () => bootFail('场景初始化失败，请刷新页面重试'), { once: true })

// —— 交互状态（默认：秋 · 16:30 · 晴，接近 v1 默认情绪"秋·晚"） ——
const state: TimeState = { hour: 16.5, season: 'au', weather: 'clear' }

// —— 画质档位：按设备初判起步，运行期由帧率看门狗升降 ——
let tier: QualityTier = pickInitialTier({
  devicePixelRatio: window.devicePixelRatio,
  width: window.innerWidth,
  height: window.innerHeight,
  cores: navigator.hardwareConcurrency || 8
})

// —— 渲染器 / 场景 / 相机 / 后处理 ——
/** 功能：创建 WebGL 渲染器；不支持 WebGL 2 时把加载页切成失败态。
 *  返回：渲染器实例。 */
function createRenderer(): THREE.WebGLRenderer {
  try {
    return new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  } catch {
    bootFail('当前设备不支持 WebGL 2，无法渲染场景')
    throw new Error('WebGL unavailable')
  }
}

const renderer = createRenderer()
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_CAPS[tier].dprMax))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.72
document.getElementById('app')?.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 2000)
camera.position.set(CAMERA_POS.x, CAMERA_POS.y, CAMERA_POS.z)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
// SSAO：接触阴影是写实感的关键（物体与地面的"接缝"暗部）；高档开启，中低档由看门狗关闭
const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight)
ssaoPass.kernelRadius = SSAO_KERNEL_RADIUS
ssaoPass.minDistance = SSAO_MIN_DISTANCE
ssaoPass.maxDistance = SSAO_MAX_DISTANCE
composer.addPass(ssaoPass)
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.6, 0.85)
// EffectComposer 给每个 pass 下发主画布尺寸，Bloom 需要按档位降分辨率：
// 包装 setSize，档位变化时由 applyQuality 重跑一次 composer.setSize 即可生效（0 档不缩放，避免 0 尺寸 RT）
const bloomSetSize = bloomPass.setSize.bind(bloomPass)
bloomPass.setSize = (width: number, height: number): void => {
  const scale = QUALITY_CAPS[tier].bloomScale
  if (scale <= 0) return
  bloomSetSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)))
}
composer.addPass(bloomPass)
composer.addPass(new OutputPass())
// SMAA 放在输出之后（在 sRGB 空间做边缘检测），后处理链下 renderer 的 MSAA 不生效
const smaaPass = new SMAAPass(window.innerWidth, window.innerHeight)
composer.addPass(smaaPass)

// —— 场景系统装配 ——
const tex = createTextures()
const sky = createSkySystem(renderer, scene)
const sun = createSun(scene)
const hemi = createHemisphere(scene)
const house = createHouse(tex)
scene.add(house.group)
const interior = createInterior(house.group, house.mats)
const vegetation = createVegetation(scene, tex)
const garden = createGarden(scene, tex, house.mats)
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

/**
 * 功能：应用画质档位——重建阴影贴图、重算 Bloom 分辨率与开关、调整环境烘焙间隔。
 * 参数：next 目标档位（只由帧率看门狗或设备初判给出）。
 */
function applyQuality(next: QualityTier): void {
  tier = next
  const caps = QUALITY_CAPS[next]
  sun.setShadowSize(caps.shadowSize)
  sky.setEnvInterval(caps.envInterval)
  bloomPass.enabled = caps.bloomScale > 0
  ssaoPass.enabled = caps.ssao
  smaaPass.enabled = caps.smaa
  // 幂等：让包装后的 bloomPass.setSize 用新档位重算一次分辨率
  composer.setSize(window.innerWidth, window.innerHeight)
}

// —— 每帧更新 ——
let loaderDone = false

function applyAll(p: typeof cur, dt: number): void {
  sky.apply(p)
  sun.apply(p)
  hemi.apply(p)
  interior.apply(p)
  vegetation.apply(p)
  garden.apply(p)
  environment.apply(p, dt)
  weatherSys.apply(p, dt)
}

const loop = createLoop(
  renderer,
  composer,
  camera,
  {
    update(dt, t, rawDt) {
      // 真实帧时长（封顶 MAX_EASE_DT）：缓动与运镜按真实时间推进，不受物理步长封顶拖慢
      const realDt = Math.min(rawDt, MAX_EASE_DT)
      resolveParams(state, target)
      lerpParams(cur, target, realDt)
      applyAll(cur, dt)

      const mode = resolveParticleMode(state)
      if (mode !== particleMode) {
        particleMode = mode
        particles.setMode(mode)
      }
      particles.update(dt, t, cur.ffGlow)

      sky.refreshEnv(dt)
      // 运镜同样按真实时间推进：低帧率设备上换季扫视不会再变成慢动作
      cameraSys.update(realDt)

      if (!loaderDone) {
        loaderDone = true
        // 淡出加载页 → 解除 root 的 boot 态（品牌区与 HUD 随之显形）→ 淡出结束移除节点
        loaderEl?.classList.add('done')
        loaderEl?.setAttribute('aria-busy', 'false')
        rootEl.classList.remove('boot')
        window.setTimeout(() => loaderEl?.remove(), 900)
      }
    },
    onQuality(next) {
      applyQuality(next)
    }
  },
  tier
)

// 开场即把档位与首帧环境贴图推到最终状态：避免前 0.38s 里金属/玻璃因无 environment 而发黑
applyQuality(tier)
sky.apply(cur)
sky.bakeNow()

hud.refresh()
// DEBUG-TEMP: 排查树冠卡片显形，暴露场景与相机（排查完删除）
;(window as unknown as Record<string, unknown>).__dbg = { scene, camera, renderer, THREE }

loop.start()
