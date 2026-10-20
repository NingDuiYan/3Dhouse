import * as THREE from 'three'
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { FRAME_FAST_MS, FRAME_SLOW_MS } from '../config'
import type { QualityTier } from '../types'
import { clampDprForTier, watchdogStep } from './quality'

export interface LoopHooks {
  /** dt 为物理步长（已封顶 0.05s）；rawDt 为真实帧时长，供缓动按真实时间推进用 */
  update(dt: number, t: number, rawDt: number): void
  /** 画质档位或像素比变化时回调：由装配层重建阴影贴图与后处理分辨率 */
  onQuality?(tier: QualityTier, dpr: number): void
}

/**
 * 功能：主循环（rAF 驱动 + 画质看门狗）。
 * 参数：renderer/composer/camera 渲染对象，hooks 每帧回调，initialTier 设备初判的起始档位。
 * 返回：start() 启动循环。
 * 说明：帧时长先喂给 watchdogStep —— 降级先降档（阴影/Bloom/烘焙间隔），档到底才降像素比。
 */
export function createLoop(
  renderer: THREE.WebGLRenderer,
  composer: EffectComposer,
  camera: THREE.PerspectiveCamera,
  hooks: LoopHooks,
  initialTier: QualityTier = 'high'
): { start(): void } {
  const clock = new THREE.Clock()
  let raf = 0
  let tier: QualityTier = initialTier
  let dpr = clampDprForTier(window.devicePixelRatio, tier)
  let slowFrames = 0
  let fastFrames = 0

  function tick(): void {
    raf = requestAnimationFrame(tick)
    const rawDt = clock.getDelta()
    const dt = Math.min(rawDt, 0.05)
    hooks.update(dt, clock.elapsedTime, rawDt)
    composer.render()

    // 画质看门狗：滚动窗口计数，避免单帧尖峰误判
    const ms = rawDt * 1000
    if (ms > FRAME_SLOW_MS) {
      slowFrames++
      fastFrames = 0
    } else if (ms < FRAME_FAST_MS) {
      fastFrames++
      slowFrames = 0
    }
    const step = watchdogStep({ tier, dpr, slowFrames, fastFrames })
    if (!step.changed) return
    tier = step.tier
    dpr = step.dpr
    slowFrames = 0
    fastFrames = 0
    applySize()
    hooks.onQuality?.(tier, dpr)
  }

  function applySize(): void {
    renderer.setPixelRatio(dpr)
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setSize(w, h)
    // composer 的 _pixelRatio 在构造时定格，必须显式同步，否则 DPR 降级只作用于主画布
    composer.setPixelRatio(dpr)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  window.addEventListener('resize', applySize)

  return {
    start() {
      if (!raf) raf = requestAnimationFrame(tick)
    }
  }
}
