import * as THREE from 'three'
import type { SceneParams } from '../types'
import {
  BULB_EMISSIVE,
  GLASS_EMISSIVE,
  INTERIOR_LIGHT_DECAY,
  INTERIOR_LIGHT_DISTANCE,
  INTERIOR_LIGHT_INTENSITY
} from '../config'

/** 室内灯光系统：暖黄点光 + 灯泡自发光 + 窗玻璃自发光三者联动 */
export interface InteriorSystem {
  apply(params: SceneParams): void
}

export function createInterior(root: THREE.Group, glassMat: THREE.MeshPhysicalMaterial): InteriorSystem {
  // 吊灯灯罩 + 灯泡
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, side: THREE.DoubleSide, roughness: 0.6 })
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 16, 1, true), shadeMat)
  shade.position.set(1.5, 2.36, 0.9)
  root.add(shade)

  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xc8c0b0, emissive: 0xffc97e, emissiveIntensity: 0 })
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), bulbMat)
  bulb.position.set(1.5, 2.31, 0.9)
  root.add(bulb)

  // 照射半径收到屋体尺寸内：原先 14 会照亮 8 米外的草地，破坏"室内灯"的语义
  const ptLight = new THREE.PointLight(0xffc97e, 0, INTERIOR_LIGHT_DISTANCE, INTERIOR_LIGHT_DECAY)
  ptLight.position.set(1.5, 2.25, 0.9)
  root.add(ptLight)

  return {
    apply(params) {
      ptLight.intensity = params.lamp * INTERIOR_LIGHT_INTENSITY
      bulbMat.emissiveIntensity = params.lamp * BULB_EMISSIVE
      glassMat.emissiveIntensity = params.lamp * GLASS_EMISSIVE
    }
  }
}
