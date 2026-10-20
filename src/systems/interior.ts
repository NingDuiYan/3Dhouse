import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { SceneParams } from '../types'
import {
  BULB_EMISSIVE,
  GLASS_EMISSIVE,
  INTERIOR_LIGHT_DECAY,
  INTERIOR_LIGHT_DISTANCE,
  INTERIOR_LIGHT_INTENSITY,
  INTERIOR_SPILL_DISTANCE,
  INTERIOR_SPILL_INTENSITY,
  PORCH_LAMP_EMISSIVE
} from '../config'
import { INTERIOR_CEILING_Y, INTERIOR_FLOOR_Y, INTERIOR_SLABS, scaleBoxUV, type HouseMats } from './house'

/** 室内三盏点光相对强度（乘 lamp × INTERIOR_LIGHT_INTENSITY）：主厅 / 起居 / 二层 */
const GAIN_MAIN = 0.55
const GAIN_LIVING = 0.35
const GAIN_UPPER = 0.35
/** 坐面高度（米，相对室内地坪） */
const SEAT_H = 0.45
/** 餐桌面高度（米，相对室内地坪） */
const TABLE_H = 0.74

/**
 * 功能：布置一层室内起居 / 餐厨空间与二层暖光（落地玻璃与木格栅后透出），
 *       并按 lamp 驱动室内点光、灯泡 / 窗玻璃 / 壁灯自发光，形成夜间"暖光外溢"。
 * 参数：root 房屋几何组（interior 直接挂进去）；mats house 返回的共享材质（只写 emissiveIntensity）。
 * 返回：{ apply(params) }，每帧由主循环调用（只读 SceneParams，零分配）。
 */
export function createInterior(root: THREE.Group, mats: HouseMats): { apply(params: SceneParams): void } {
  // —— 室内补充材质：织物 / 白色柜体 / 灯泡 ——
  const fabricMat = new THREE.MeshStandardMaterial({
    color: 0xbab3a6,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.3
  })
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xe9e5dd,
    roughness: 0.6,
    metalness: 0,
    envMapIntensity: 0.4
  })
  // 灯泡：暖白自发光，夜里 lamp 驱动；白天靠阳光反射仍然可见
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff1dc,
    emissive: 0xffc880,
    emissiveIntensity: 0,
    roughness: 0.4
  })

  /** 按材质分组的几何收集器（合并后每种材质 1 个 Mesh） */
  const parts = {
    floor: [] as THREE.BufferGeometry[],
    wood: [] as THREE.BufferGeometry[],
    fabric: [] as THREE.BufferGeometry[],
    white: [] as THREE.BufferGeometry[],
    stone: [] as THREE.BufferGeometry[],
    metal: [] as THREE.BufferGeometry[],
    lamp: [] as THREE.BufferGeometry[],
    bulb: [] as THREE.BufferGeometry[]
  }

  const euler = new THREE.Euler()
  const quat = new THREE.Quaternion()
  const vec = new THREE.Vector3()
  const mat4 = new THREE.Matrix4()
  const unitScale = new THREE.Vector3(1, 1, 1)

  /** 功能：把几何摆到世界位置并入组（旋转用弧度）。 */
  function put(
    list: THREE.BufferGeometry[],
    g: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0
  ): void {
    euler.set(rx, ry, rz)
    quat.setFromEuler(euler)
    mat4.compose(vec.set(x, y, z), quat, unitScale)
    g.applyMatrix4(mat4)
    list.push(g)
  }

  /** 功能：建一个 UV 按米换算的盒体（中心坐标，米）。 */
  function box(
    list: THREE.BufferGeometry[],
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0
  ): void {
    const g = new THREE.BoxGeometry(w, h, d)
    scaleBoxUV(g, w, h, d)
    put(list, g, x, y, z, rx, ry, rz)
  }

  /** 功能：竖直金属圆杆 / 圆台底座。 */
  function cyl(r: number, h: number, x: number, y: number, z: number, seg = 16): void {
    put(parts.metal, new THREE.CylinderGeometry(r, r, h, seg), x, y, z)
  }

  /** 功能：开口灯罩（上窄下宽，单面），用作吊灯 / 落地灯罩。 */
  function shade(rTop: number, rBot: number, h: number, x: number, y: number, z: number): void {
    put(parts.metal, new THREE.CylinderGeometry(rTop, rBot, h, 20, 1, true), x, y, z)
  }

  /** 功能：发光灯泡（球体，emissive 由 bulbMat 统一驱动）。 */
  function bulb(r: number, x: number, y: number, z: number): void {
    put(parts.bulb, new THREE.SphereGeometry(r, 12, 8), x, y, z)
  }

  const F = INTERIOR_FLOOR_Y
  const C = INTERIOR_CEILING_Y

  // —— 木地板：按 house.ts 给出的分块铺（入口内凹处让出），面层 0.04m ——
  for (const s of INTERIOR_SLABS) {
    box(parts.floor, s.x1 - s.x0, 0.04, s.z1 - s.z0, (s.x0 + s.x1) / 2, F - 0.02, (s.z0 + s.z1) / 2)
  }

  // —— 起居区（透过正立面玻璃可见）：地毯 + 沙发 + 茶几 ——
  box(parts.fabric, 2.5, 0.012, 3.0, 2.95, F + 0.006, -0.4)
  // 沙发 x[1.9,4.1] × z[-1.5,-0.5]，座箱 + 两个坐垫 + 靠背 + 两侧扶手
  box(parts.fabric, 2.2, 0.36, 1.0, 3.0, F + 0.18, -1.0)
  for (const cx of [2.48, 3.52]) {
    box(parts.fabric, 1.02, 0.14, 0.86, cx, F + 0.43, -0.97)
  }
  box(parts.fabric, 2.2, 0.5, 0.22, 3.0, F + 0.61, -1.39)
  for (const ax of [1.98, 4.02]) {
    box(parts.fabric, 0.16, 0.28, 1.0, ax, F + 0.5, -1.0)
  }
  // 茶几：木面 + 两片金属板腿
  box(parts.wood, 1.2, 0.06, 0.6, 3.0, F + 0.4, 0.4)
  for (const lx of [2.45, 3.55]) {
    box(parts.metal, 0.04, 0.37, 0.5, lx, F + 0.185, 0.4)
  }

  // —— 餐区（正对玻璃，夜景主视觉）：餐桌 + 4 椅 + 2 只吊灯 ——
  box(parts.wood, 1.6, 0.06, 0.9, 1.05, F + TABLE_H, 1.5)
  for (const lx of [0.4, 1.7]) {
    for (const lz of [1.15, 1.85]) {
      box(parts.metal, 0.05, TABLE_H - 0.06, 0.05, lx, F + (TABLE_H - 0.06) / 2, lz)
    }
  }
  for (const cx of [0.6, 1.5]) {
    for (const cz of [0.65, 2.35]) {
      // 椅子：坐面 + 靠背（靠背朝桌子外侧）+ 4 条细腿
      box(parts.fabric, 0.44, 0.05, 0.44, cx, F + SEAT_H - 0.025, cz)
      box(parts.fabric, 0.44, 0.36, 0.05, cx, F + SEAT_H + 0.18, cz < 1.5 ? cz - 0.22 : cz + 0.22)
      for (const dx of [-0.19, 0.19]) {
        for (const dz of [-0.19, 0.19]) {
          box(parts.metal, 0.025, SEAT_H - 0.05, 0.025, cx + dx, F + (SEAT_H - 0.05) / 2, cz + dz)
        }
      }
    }
  }
  // 吊灯：金属吊杆 + 开口灯罩 + 灯泡，吊在餐桌上空
  for (const px of [0.6, 1.5]) {
    cyl(0.012, C - 2.0, px, (C + 2.0) / 2, 1.5)
    shade(0.1, 0.13, 0.16, px, 1.92, 1.5)
    bulb(0.045, px, 1.83, 1.5)
  }

  // —— 厨房（沿后墙）：矮柜 + 台面 + 高柜 + 吊柜 + 柜下灯槽 + 岛台 ——
  box(parts.white, 3.1, 0.86, 0.6, -2.05, F + 0.43, -2.89)
  box(parts.stone, 3.2, 0.05, 0.66, -2.05, F + 0.885, -2.88)
  box(parts.wood, 0.6, 2.4, 0.6, -3.9, F + 1.2, -2.89)
  box(parts.white, 1.4, 0.7, 0.36, -1.15, F + 1.96, -3.01)
  box(parts.lamp, 1.4, 0.02, 0.05, -1.15, F + 1.59, -2.97)
  box(parts.white, 1.6, 0.86, 0.8, -0.6, F + 0.43, -1.5)
  box(parts.stone, 1.7, 0.05, 0.9, -0.6, F + 0.885, -1.5)

  // —— 落地灯（起居角） ——
  cyl(0.16, 0.03, 3.95, F + 0.015, 2.75, 24)
  cyl(0.015, 1.35, 3.95, F + 0.66, 2.75)
  shade(0.17, 0.21, 0.22, 3.95, 1.72, 2.75)
  bulb(0.05, 3.95, 1.63, 2.75)

  // —— 顶棚灯槽：贴玻璃一侧，夜里形成连续暖光带 ——
  box(parts.lamp, 4.6, 0.02, 0.05, 2.1, C - 0.02, 3.28)

  // —— 点光：主厅 / 起居 / 二层（透过格栅与玻璃外溢）+ 露台外溢 ——
  const mainLight = new THREE.PointLight(0xffc27a, 0, INTERIOR_LIGHT_DISTANCE, INTERIOR_LIGHT_DECAY)
  mainLight.position.set(0.9, 2.55, 1.2)
  const livingLight = new THREE.PointLight(0xffc27a, 0, INTERIOR_LIGHT_DISTANCE, INTERIOR_LIGHT_DECAY)
  livingLight.position.set(2.9, 1.5, -1.0)
  const upperLight = new THREE.PointLight(0xffc27a, 0, INTERIOR_LIGHT_DISTANCE, INTERIOR_LIGHT_DECAY)
  upperLight.position.set(1.6, 5.15, 0.6)
  // 室外暖光外溢：挂在露台上方，只影响露台 / 台阶 / 幕墙前的空气感
  const spillLight = new THREE.PointLight(0xffb266, 0, INTERIOR_SPILL_DISTANCE, INTERIOR_LIGHT_DECAY)
  spillLight.position.set(1.3, 1.05, 4.3)

  // —— 合并（室内几何远小于外墙，按材质各 1 个 Mesh） ——
  const merged: [THREE.BufferGeometry[], THREE.Material, boolean, boolean][] = [
    [parts.floor, mats.floorMat, false, true],
    [parts.wood, mats.woodMat, true, true],
    [parts.fabric, fabricMat, true, true],
    [parts.white, whiteMat, true, true],
    [parts.stone, mats.concreteMat, true, true],
    [parts.metal, mats.metalMat, true, true],
    [parts.lamp, mats.lampMat, false, false],
    [parts.bulb, bulbMat, false, false]
  ]
  for (const [list, mat, cast, receive] of merged) {
    if (list.length === 0) continue
    const geo = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))
    if (geo === null) continue
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = cast
    mesh.receiveShadow = receive
    root.add(mesh)
  }
  root.add(mainLight)
  root.add(livingLight)
  root.add(upperLight)
  root.add(spillLight)

  /**
   * 功能：按 SceneParams 逐帧驱动室内灯光与自发光（lamp 为 0~1 的夜间灯光强度）。
   * 参数：params 单帧场景参数（只读，禁止写回）。
   * 返回：无。
   */
  function apply(params: SceneParams): void {
    const lamp = params.lamp
    mainLight.intensity = lamp * INTERIOR_LIGHT_INTENSITY * GAIN_MAIN
    livingLight.intensity = lamp * INTERIOR_LIGHT_INTENSITY * GAIN_LIVING
    upperLight.intensity = lamp * INTERIOR_LIGHT_INTENSITY * GAIN_UPPER
    // 室外外溢强度单独一个 config 常量，便于和 garden 的灯柱一起调平衡
    spillLight.intensity = lamp * INTERIOR_SPILL_INTENSITY
    bulbMat.emissiveIntensity = lamp * BULB_EMISSIVE
    mats.lampMat.emissiveIntensity = lamp * PORCH_LAMP_EMISSIVE
    mats.glassMat.emissiveIntensity = lamp * GLASS_EMISSIVE
  }

  return { apply }
}
