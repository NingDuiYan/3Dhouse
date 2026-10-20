import * as THREE from 'three'
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { DPR_MAX, FRAME_FAST_MS, FRAME_SLOW_MS } from '../config'

export interface LoopHooks {
  update(dt: number, t: number): void
}

/** 主循环：rAF 驱动 + 自适应 DPR（持续掉帧降采样、恢复后回升） */
export function createLoop(
  renderer: THREE.WebGLRenderer,
  composer: EffectComposer,
  camera: THREE.PerspectiveCamera,
  hooks: LoopHooks
): { start(): void } {
  const clock = new THREE.Clock()
  let raf = 0
  let dpr = Math.min(window.devicePixelRatio, DPR_MAX)
  let slowFrames = 0
  let fastFrames = 0

  function tick(): void {
    raf = requestAnimationFrame(tick)
    const rawDt = clock.getDelta()
    const dt = Math.min(rawDt, 0.05)
    hooks.update(dt, clock.elapsedTime)
    composer.render()

    // 自适应 DPR：滚动窗口计数，避免单帧尖峰误判
    const ms = rawDt * 1000
    if (ms > FRAME_SLOW_MS) {
      slowFrames++
      fastFrames = 0
    } else if (ms < FRAME_FAST_MS) {
      fastFrames++
      slowFrames = 0
    }
    if (slowFrames >= 90 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25)
      applySize()
      slowFrames = 0
    } else if (fastFrames >= 240 && dpr < DPR_MAX) {
      dpr = Math.min(DPR_MAX, dpr + 0.25)
      applySize()
      fastFrames = 0
    }
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
