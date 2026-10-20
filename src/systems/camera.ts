import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { easeInOutCubic } from '../core/interpolate'
import { SWEEP_ANGLE, SWEEP_SECS, TOUR_SPEED } from '../config'

/** 相机系统：OrbitControls 唯一视角真相源 + 换季运镜 + 自动巡游 */
export interface CameraSystem {
  controls: OrbitControls
  /** 每帧调用：处理运镜/巡游方位角注入与阻尼更新 */
  update(dt: number): void
  /** 换季触发：一次 2.2s easeInOut 的方位角滑移 */
  triggerSweep(): void
  setTour(on: boolean): void
}

export function createCameraSystem(camera: THREE.PerspectiveCamera, dom: HTMLElement): CameraSystem {
  const controls = new OrbitControls(camera, dom)
  controls.target.set(0, 1.7, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.enablePan = false
  controls.minDistance = 5
  controls.maxDistance = 26
  controls.maxPolarAngle = Math.PI * 0.49

  // 减少动态偏好：只在初始化时读一次，不进帧循环
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  // 巡游：用户拖拽时暂停，松手 5s 后恢复
  let tourOn = false
  let tourPausedUntil = 0
  controls.addEventListener('start', () => { tourPausedUntil = Number.POSITIVE_INFINITY })
  controls.addEventListener('end', () => { tourPausedUntil = performance.now() / 1000 + 5 })

  // 换季运镜状态
  let sweepPrev = 0
  let sweepT = 0
  let sweeping = false

  const scratch = new THREE.Vector3()
  const sph = new THREE.Spherical()

  /** 绕 target 旋转方位角（零分配：复用 scratch） */
  function rotateAzimuth(delta: number): void {
    scratch.copy(camera.position).sub(controls.target)
    sph.setFromVector3(scratch)
    sph.theta += delta
    scratch.setFromSpherical(sph)
    camera.position.copy(controls.target).add(scratch)
  }

  return {
    controls,
    update(dt) {
      const now = performance.now() / 1000
      if (sweeping) {
        if (reduceMotion) {
          // 直接落到终点：sweepPrev 是缓动进度 0..1，补足剩余角度即可
          rotateAzimuth(SWEEP_ANGLE * (1 - sweepPrev))
          sweepPrev = 1
          sweeping = false
        } else {
          sweepT += dt / SWEEP_SECS
          const p = Math.min(sweepT, 1)
          rotateAzimuth(SWEEP_ANGLE * (easeInOutCubic(p) - sweepPrev))
          sweepPrev = easeInOutCubic(p)
          if (p >= 1) sweeping = false
        }
      } else if (tourOn && now >= tourPausedUntil) {
        rotateAzimuth(TOUR_SPEED * dt)
      }
      controls.update()
    },
    triggerSweep() {
      sweeping = true
      sweepT = 0
      sweepPrev = 0
    },
    setTour(on: boolean) {
      // 减少动态时禁止自动巡游
      tourOn = on && !reduceMotion
    }
  }
}