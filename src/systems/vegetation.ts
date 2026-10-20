import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { SceneParams } from '../types'
import type { Textures } from './textures'

/** 植被系统：多品种树（合并几何体）+ 树冠季节变色/落叶缩放 */
export interface VegetationSystem {
  apply(params: SceneParams): void
}

/**
 * 确定性伪随机：由种子派生 0..1。
 * 功能：让每棵树、每根枝的形态稳定，刷新画面可复现。
 * 参数：seed 任意整数（坐标派生）。
 * 返回：[0,1) 内的数值。
 */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** 生成针叶树冠：多层圆锥，自下而上逐层收小，层间留缝避免糊成一坨 */
function coniferCrown(levels: number, r0: number, rStep: number, baseY: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  let y = baseY
  for (let i = 0; i < levels; i++) {
    const r = r0 - i * rStep
    const h = 0.86 - i * 0.11
    const geo = new THREE.ConeGeometry(r, Math.max(h, 0.22), 9)
    geo.translate(0, y + h / 2, 0)
    parts.push(geo)
    y += h * 0.62
  }
  return mergeGeometries(parts)
}

/**
 * 生成阔叶树冠：球体压扁 + 横向随机偏移，形成不对称的有机轮廓。
 * 功能：树冠底面按 baseY 对齐到树干顶附近，高树不会露出"光头"。
 * 参数：seed 形态种子；baseY 树冠底面高度（相对树干顶，略负让树冠包住树干顶端）。
 * 返回：已合并的单个 BufferGeometry。
 */
function broadleafCrown(seed: number, baseY: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const blobs = 4 + Math.floor(rand(seed) * 2)
  for (let i = 0; i < blobs; i++) {
    const s = seed + i * 3
    const r = 0.72 - i * 0.06 + rand(s) * 0.22
    const squash = 0.68 + rand(s + 1) * 0.24
    const geo = new THREE.IcosahedronGeometry(r, 1)
    geo.scale(1, squash, 1)
    geo.rotateY(rand(s + 2) * Math.PI)
    geo.translate((rand(s + 3) - 0.5) * 0.9, 0.62 + rand(s + 4) * 0.72, (rand(s + 5) - 0.5) * 0.9)
    parts.push(geo)
  }
  const merged = mergeGeometries(parts)
  // 按实际包围盒把树冠底面推到 baseY：树高变化时不用手调偏移量
  merged.computeBoundingBox()
  const box = merged.boundingBox
  if (box) merged.translate(0, baseY - box.min.y, 0)
  return merged
}

/** 生成树干：底部粗、向上收细，带一点倾斜与不规则 */
function trunkGeo(seed: number, h: number): THREE.BufferGeometry {
  const tilt = (rand(seed) - 0.5) * 0.12
  const geo = new THREE.CylinderGeometry(0.1, 0.2, h, 7, 1)
  geo.rotateZ(tilt)
  geo.translate(0, h / 2, 0)
  return geo
}

/** 树冠种类 */
type CrownKind = 'conifer' | 'broadleaf'
/** 树形配方：树高 + 树冠种类 + 形态种子 */
interface Recipe { h: number; crown: CrownKind; seed: number }

const RECIPES: Recipe[] = [
  { h: 2.9, crown: 'conifer', seed: 11 },
  { h: 2.5, crown: 'broadleaf', seed: 29 },
  { h: 3.4, crown: 'conifer', seed: 47 },
  { h: 2.2, crown: 'broadleaf', seed: 71 },
  { h: 3.0, crown: 'conifer', seed: 89 },
  { h: 2.7, crown: 'broadleaf', seed: 113 }
]

/** 树种位置与整体缩放 */
const TREE_SPOTS: [number, number, number][] = [
  [-8, -4, 1.15], [7, -6, 1.0], [9, 4, 1.2],
  [-7, 6, 0.95], [-11, -1, 1.25], [11, -2, 0.9]
]

/** 每根细枝：[起点比例, 方位角, 仰角, 长度] */
function branches(seed: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = []
  for (let i = 0; i < 3; i++) {
    const s = seed * 7 + i
    out.push([0.45 + rand(s) * 0.4, rand(s + 1) * Math.PI * 2, 0.5 + rand(s + 2) * 0.5, 0.34 + rand(s + 3) * 0.3])
  }
  return out
}

export function createVegetation(scene: THREE.Scene, tex: Textures): VegetationSystem {
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0xb86828, roughness: 1, envMapIntensity: 0.35, flatShading: true })
  const trunkMat = new THREE.MeshStandardMaterial({ map: tex.bark, roughness: 1, envMapIntensity: 0.3 })

  /** 每棵树一个树冠组：folScale 只缩放它，不动整棵树的个体比例 s */
  const foliageGroups: THREE.Group[] = []

  for (let i = 0; i < TREE_SPOTS.length; i++) {
    const [x, z, s] = TREE_SPOTS[i]
    const r = RECIPES[i]
    const g = new THREE.Group()

    // 树干
    const trunk = new THREE.Mesh(trunkGeo(r.seed, r.h), trunkMat)
    trunk.castShadow = true
    g.add(trunk)

    // 细枝（挂在树干上端，随树整体缩放）
    for (const [p, az, el, len] of branches(r.seed)) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, len, 5), trunkMat)
      const y = r.h * p
      b.position.set(0, y, 0)
      b.rotation.set(Math.PI / 2 - el, az, 0)
      b.translateY(len / 2)
      b.castShadow = true
      g.add(b)
    }

    // 树冠：合并成一个 Mesh，drawcall 从 3 降到 1；独立成组，避免 folScale 覆盖整树缩放
    const crownGrp = new THREE.Group()
    const crown = new THREE.Mesh(r.crown === 'conifer'
      ? coniferCrown(4, 0.95, 0.17, r.h + 0.1)
      : broadleafCrown(r.seed, r.h - 0.15), foliageMat)
    crown.castShadow = true
    crownGrp.add(crown)
    g.add(crownGrp)
    foliageGroups.push(crownGrp)

    g.position.set(x, 0, z)
    g.scale.setScalar(s)
    // 用坐标派生确定性朝向：每次刷新画面一致
    g.rotation.y = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * Math.PI * 2
    scene.add(g)
  }

  // 树冠统一走 foliageGroups 的整体缩放：folScale=1 原样、0 隐藏（冬季）
  return {
    apply(params) {
      foliageMat.color.copy(params.foliage)
      for (const grp of foliageGroups) {
        grp.scale.setScalar(Math.max(params.folScale, 0.001))
        grp.visible = params.folScale > 0.02
      }
    }
  }
}
