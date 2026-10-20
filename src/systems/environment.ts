import * as THREE from 'three'
import type { SceneParams } from '../types'
import type { Textures } from './textures'
import { SNOW_GROUND_OPACITY, SNOW_ROOF_OPACITY, WET_RATE } from '../config'

/** 地面环境系统：草地/积雪层 + 雾 + 曝光 + Bloom + 屋顶积雪 + 小径湿滑 */
export interface EnvironmentSystem {
  groundMat: THREE.MeshStandardMaterial
  apply(params: SceneParams, dt: number): void
}

export function createEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  bloomPass: { strength: number },
  roofSnowMat: THREE.MeshStandardMaterial,
  pathMat: THREE.MeshStandardMaterial,
  tex: Textures
): EnvironmentSystem {
  const groundMat = new THREE.MeshStandardMaterial({ map: tex.ground, color: 0x8a6830, roughness: 0.95, envMapIntensity: 0.35 })
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, transparent: true, opacity: 0, envMapIntensity: 0.5 })
  const snowCover = new THREE.Mesh(new THREE.CircleGeometry(30, 48), snowMat)
  snowCover.rotation.x = -Math.PI / 2
  snowCover.position.y = 0.02
  snowCover.receiveShadow = true
  scene.add(snowCover)

  scene.fog = new THREE.FogExp2(0xa8868e, 0.02)
  const fog = scene.fog as THREE.FogExp2

  return {
    groundMat,
    apply(params, dt) {
      groundMat.color.copy(params.ground)
      // 地面/小径 roughness 向天气 wet 目标插值：雨天出现湿滑反光（按 dt 归一，与帧率无关）
      const k = Math.min(WET_RATE * dt, 1)
      groundMat.roughness += (params.wet - groundMat.roughness) * k
      pathMat.roughness += (params.wet - pathMat.roughness) * k
      snowMat.opacity = params.snow * SNOW_GROUND_OPACITY
      roofSnowMat.opacity = params.snow * SNOW_ROOF_OPACITY
      fog.color.copy(params.fog)
      fog.density = params.fogD
      renderer.toneMappingExposure = params.exp
      bloomPass.strength = params.bloom
    }
  }
}
