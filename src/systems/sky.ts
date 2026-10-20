import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import type { SceneParams } from '../types'
import { ENV_INTERVAL } from '../config'

/** 天空系统：Sky 大气散射 + PMREM 环境烘焙（脏标记 + 节流） */
export interface SkySystem {
  apply(params: SceneParams): void
  /** 每帧调用：参数真实变化期间按 ENV_INTERVAL 节流重烘环境贴图 */
  refreshEnv(dt: number): void
}

export function createSkySystem(renderer: THREE.WebGLRenderer, scene: THREE.Scene): SkySystem {
  const sky = new Sky()
  sky.scale.setScalar(450)
  scene.add(sky)
  const u = sky.material.uniforms
  u.turbidity.value = 6
  u.mieCoefficient.value = 0.005
  u.mieDirectionalG.value = 0.8

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  let envRT: THREE.WebGLRenderTarget | null = null

  let dirty = true
  let timer = 0
  let lastRayleigh = -1
  const sunDir = new THREE.Vector3()
  const lastSun = new THREE.Vector3(1e9, 0, 0)

  function regen(): void {
    if (envRT) envRT.dispose()
    envScene.add(sky)
    envRT = pmrem.fromScene(envScene)
    scene.add(sky)
    scene.environment = envRT.texture
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
      if (!dirty) return
      timer += dt
      if (timer >= ENV_INTERVAL) regen()
    }
  }
}
