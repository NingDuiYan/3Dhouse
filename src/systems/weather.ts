import * as THREE from 'three'
import type { SceneParams } from '../types'
import type { Textures } from './textures'
import { CLOUD_NEUTRAL, CLOUD_SUN_MIX } from '../config'

/** 天气视觉系统：程序化云层平面（opacity 随云量 + 颜色吃太阳光色）+ 缓慢漂移 */
export interface WeatherSystem {
  apply(params: SceneParams, dt: number): void
}

export function createWeatherSystem(scene: THREE.Scene, tex: Textures): WeatherSystem {
  // 云层用 MeshBasicMaterial + alphaMap：不受光照，颜色手动合成（中性基色 × 太阳色 × 曝光）
  const cloudMat = new THREE.MeshBasicMaterial({
    color: CLOUD_NEUTRAL, alphaMap: tex.cloud, transparent: true, opacity: 0,
    depthWrite: false, side: THREE.DoubleSide, fog: false
  })
  const cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), cloudMat)
  cloudMesh.rotation.x = -Math.PI / 2
  cloudMesh.position.y = 28
  scene.add(cloudMesh)

  const neutral = new THREE.Color(CLOUD_NEUTRAL)
  const tint = new THREE.Color()

  return {
    apply(params, dt) {
      // 云量目标透明度：晴天 0 隐身
      const target = params.cloud * 0.85
      cloudMat.opacity += (target - cloudMat.opacity) * Math.min(dt * 1.5, 1)
      cloudMesh.visible = cloudMat.opacity > 0.01
      // 亮度随曝光压暗（夜间云更暗）
      const dark = THREE.MathUtils.clamp(params.exp - 0.5, 0, 0.55) / 0.55
      const light = 0.45 + 0.38 * dark
      // 云色吃日落光：中性基色向太阳色偏移，日落时云被暖光染色（预分配 Color，零分配）
      tint.copy(neutral).lerp(params.sun, CLOUD_SUN_MIX)
      cloudMat.color.copy(tint).multiplyScalar(light)
      if (cloudMesh.visible) {
        tex.cloud.offset.x += dt * 0.0035
        tex.cloud.offset.y += dt * 0.0012
      }
    }
  }
}
