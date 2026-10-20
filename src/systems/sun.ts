import * as THREE from 'three'
import type { SceneParams } from '../types'
import { SHADOW_HALF, SHADOW_MIN_INTENSITY, SHADOW_SIZE, SUN_DIST } from '../config'

/** 太阳平行光系统：唯一投影光源 */
export interface SunSystem {
  apply(params: SceneParams): void
  /** 切换阴影贴图边长（画质档位变化时调用）：释放旧 RT 交给 three 重建 */
  setShadowSize(size: number): void
}

export function createSun(scene: THREE.Scene): SunSystem {
  const light = new THREE.DirectionalLight(0xffffff, 2)
  light.castShadow = true
  light.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE)
  light.shadow.camera.left = -SHADOW_HALF
  light.shadow.camera.right = SHADOW_HALF
  light.shadow.camera.top = SHADOW_HALF
  light.shadow.camera.bottom = -SHADOW_HALF
  light.shadow.camera.near = 1
  light.shadow.camera.far = 120
  light.shadow.bias = -0.0003
  light.shadow.normalBias = 0.03
  scene.add(light)
  scene.add(light.target)

  const dir = new THREE.Vector3()
  let shadowOn = true

  return {
    apply(params) {
      // 夜间太阳在地平线以下：把光源抬到地平线以上，避免"从地面下方往上打光"
      const el = THREE.MathUtils.degToRad(Math.max(params.elev, 0))
      const az = THREE.MathUtils.degToRad(params.azim)
      dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize()
      light.position.copy(dir).multiplyScalar(SUN_DIST)
      light.color.copy(params.sun)
      light.intensity = params.sunInt

      // 夜间强度归零且投影矩阵整夜不变：停更阴影贴图，省掉每帧一次全屏深度 Pass。
      // 只切 autoUpdate 不切 castShadow —— 后者会触发材质重编译，切换代价远大于收益。
      const want = params.sunInt > SHADOW_MIN_INTENSITY
      if (want !== shadowOn) {
        shadowOn = want
        light.shadow.autoUpdate = want
        if (want) light.shadow.needsUpdate = true
      }
    },
    setShadowSize(size) {
      if (light.shadow.mapSize.x === size) return
      light.shadow.mapSize.set(size, size)
      if (light.shadow.map) {
        light.shadow.map.dispose()
        light.shadow.map = null
      }
    }
  }
}
