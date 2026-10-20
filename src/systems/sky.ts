import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import type { SceneParams } from '../types'
import { ENV_INTERVAL } from '../config'

/** 天空系统：Sky 大气散射 + PMREM 环境烘焙（脏标记 + 节流 + 落定补烘） */
export interface SkySystem {
  apply(params: SceneParams): void
  /** 每帧调用：参数真实变化期间按 envInterval 节流重烘，收敛后补烘一次 */
  refreshEnv(dt: number): void
  /** 首帧前立即烘焙一次，消除开场"无 scene.environment"的金属发黑帧 */
  bakeNow(): void
  /** 画质档位切换时的最小重烘间隔（秒） */
  setEnvInterval(seconds: number): void
}

export function createSkySystem(renderer: THREE.WebGLRenderer, scene: THREE.Scene): SkySystem {
  const sky = new Sky()
  sky.scale.setScalar(450)
  scene.add(sky)
  const u = sky.material.uniforms
  // 写实向：空气更通透（turbidity 低）+ 太阳周围光晕更锐（mieDirectionalG 高）
  u.turbidity.value = 3.4
  u.mieCoefficient.value = 0.0035
  u.mieDirectionalG.value = 0.83

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  let envRT: THREE.WebGLRenderTarget | null = null

  let dirty = true
  let timer = 0
  let envInterval = ENV_INTERVAL
  let lastRayleigh = -1
  const sunDir = new THREE.Vector3()
  const lastSun = new THREE.Vector3(1e9, 0, 0)
  // 已烘焙结果对应的参数指纹：缓动收敛后若仍有偏差，说明停在半路，需要补烘
  const bakedSun = new THREE.Vector3(1e9, 0, 0)
  let bakedRayleigh = -1

  function regen(): void {
    if (envRT) envRT.dispose()
    envScene.add(sky)
    envRT = pmrem.fromScene(envScene)
    scene.add(sky)
    scene.environment = envRT.texture
    bakedSun.copy(u.sunPosition.value)
    bakedRayleigh = u.rayleigh.value
    dirty = false
    timer = 0
  }

  return {
    apply(params) {
      const el = THREE.MathUtils.degToRad(params.elev)
      const az = THREE.MathUtils.degToRad(params.azim)
      sunDir.set(
        Math.sin(az) * Math.cos(el),
        Math.sin(el),
        Math.cos(az) * Math.cos(el)
      ).normalize()
      // 仅太阳几何或散射强度真实变化时标记脏，静止时零开销
      if (sunDir.distanceToSquared(lastSun) > 1e-8 || Math.abs(params.rayleigh - lastRayleigh) > 1e-4) {
        dirty = true
      }
      u.sunPosition.value.copy(sunDir)
      u.rayleigh.value = params.rayleigh
      lastSun.copy(sunDir)
      lastRayleigh = params.rayleigh
    },
    refreshEnv(dt) {
      if (!dirty) {
        // 落定补烘：指数缓动永远不会精确落到目标，收敛后补一次即可与最终参数对齐
        const moved = u.sunPosition.value.distanceToSquared(bakedSun) > 1e-8
        const scatter = Math.abs(u.rayleigh.value - bakedRayleigh) > 1e-4
        if (moved || scatter) regen()
        return
      }
      timer += dt
      if (timer >= envInterval) regen()
    },
    bakeNow() {
      regen()
    },
    setEnvInterval(seconds) {
      envInterval = seconds
    }
  }
}
