import * as THREE from 'three'
import type { SceneParams } from '../types'

/** 半球环境光系统：天空色（上）+ 地面反弹色（下）+ 强度，均由数据轨道驱动 */
export interface HemisphereSystem {
  apply(params: SceneParams): void
}

/**
 * 半球光：补足太阳平行光之外的漫射照明。
 * 此前 hemiSky/hemiGround/hemiInt 三条轨道已存在但无任何光源消费，
 * 导致阴雨天压暗太阳后没有补偿光、四季地面反弹色完全丢失。
 */
export function createHemisphere(scene: THREE.Scene): HemisphereSystem {
  const light = new THREE.HemisphereLight(0xffffff, 0xffffff, 1)
  scene.add(light)

  return {
    apply(params) {
      light.color.copy(params.hemiSky)
      light.groundColor.copy(params.hemiGround)
      light.intensity = params.hemiInt
    }
  }
}
