import * as THREE from 'three'
import type { SceneParams } from '../types'
import type { Textures } from './textures'

/** 植被系统：树木（共享几何体）+ 树冠季节变色/落叶缩放 */
export interface VegetationSystem {
  apply(params: SceneParams): void
}

/** 共享几何体：模块级单例，避免每棵树重复创建 */
const TRUNK_GEO = new THREE.CylinderGeometry(0.12, 0.22, 2.4, 7)
const FOL_GEO = new THREE.SphereGeometry(1, 12, 10)
/** 相对树冠球参数：[x, y, z, 半径] */
const FOL_BALLS: [number, number, number, number][] = [
  [0, 3.3, 0, 1.5],
  [0.9, 2.9, 0.3, 1.05],
  [-0.8, 3.0, -0.3, 1.0]
]
const TREE_SPOTS: [number, number, number][] = [
  [-8, -4, 1.15], [7, -6, 1.0], [9, 4, 1.2],
  [-7, 6, 0.95], [-11, -1, 1.25], [11, -2, 0.9]
]

export function createVegetation(scene: THREE.Scene, tex: Textures): VegetationSystem {
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0xb86828, roughness: 1, envMapIntensity: 0.35 })
  const trunkMat = new THREE.MeshStandardMaterial({ map: tex.bark, roughness: 1, envMapIntensity: 0.3 })

  const foliageGroups: THREE.Group[] = []

  for (const [x, z, s] of TREE_SPOTS) {
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(TRUNK_GEO, trunkMat)
    trunk.position.y = 1.2
    trunk.castShadow = true
    g.add(trunk)

    const fol = new THREE.Group()
    for (const [bx, by, bz, r] of FOL_BALLS) {
      const m = new THREE.Mesh(FOL_GEO, foliageMat)
      m.position.set(bx, by, bz)
      m.scale.setScalar(r)
      m.castShadow = true
      fol.add(m)
    }
    g.add(fol)
    foliageGroups.push(fol)

    g.position.set(x, 0, z)
    g.scale.setScalar(s)
    // 用坐标派生确定性朝向：每次刷新画面一致（原先 Math.random 导致不可复现）
    g.rotation.y = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * Math.PI * 2
    scene.add(g)
  }

  return {
    apply(params) {
      foliageMat.color.copy(params.foliage)
      for (const g of foliageGroups) {
        g.scale.setScalar(Math.max(params.folScale, 0.001))
        g.visible = params.folScale > 0.02
      }
    }
  }
}
