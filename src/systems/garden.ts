import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { SceneParams } from '../types'
import { tileSurface } from './textures'
import type { Textures } from './textures'
import type { HouseMats } from './house'

/** 庭院系统：草叶 / 花境 / 石板小径 + 砾石带 + 矮灯柱 + 柴堆，全部随季节与天气联动 */
export interface GardenSystem {
  apply(params: SceneParams): void
}

/**
 * 确定性伪随机：与植被同一套 hash，保证每次刷新布局完全一致。
 * 参数：seed 任意整数（坐标/序号派生）。
 * 返回：[0,1) 内的数值。
 */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** 功能：把 0..1 之外的数值夹回区间（apply 里避免分支写法分配）。 */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * 功能：合并一组几何（统一转非索引，避免索引/非索引混用导致返回 null）。
 * 参数：parts 待合并几何。
 * 返回：合并后的单个几何。
 */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))
  if (!merged) throw new Error('庭院几何合并失败：属性集不一致')
  return merged
}

// —— 房屋占位（architecture-dev 冻结的新房体：9(x)×7(z) 居中，正面朝 +z） ——
/** 房体外轮廓半宽 / 半深（米）：主体 9×7，基座外扩到 ±4.65 / ±3.65 */
const HOUSE_HALF_X = 4.65
const HOUSE_HALF_Z = 3.65
/** 露台木平台：入口东侧 x[-0.05,4.75]、z[3.65,6.10]，台面 y=0.28，栏杆在 z=6.10 与 x=4.75 */
const TERRACE_X0 = -0.05
const TERRACE_X1 = 4.75
const TERRACE_Z1 = 6.1
/** 入口台阶区：x[-2.30,-0.30]、z[3.65,4.55]（两级混凝土，上方是 y≈3.3 的无柱雨棚） */
const STEP_X0 = -2.3
const STEP_X1 = -0.3
const STEP_Z1 = 4.55

// —— 入口小径（门中心由 architecture-dev 确认 x=-1.30，改门位只动这一个常量） ——
/** 石板小径轴线 x 与半宽（米）：自台阶脚起铺到草坪尽头 */
const GARDEN_PATH_X = -1.3
const PATH_HALF = 0.95
const PATH_Z0 = 4.6
const PATH_Z1 = 12.8

/** 草叶实例上限（6500 个实例，每个实例含 3 片叶，近景才够密） */
const BLADE_MAX = 14000
/** 草坪播撒半径范围（米）：内圈避开房体与露台，外圈仍落在相机可见的前景内 */
const LAWN_R_MIN = 4.8
const LAWN_R_MAX = 17.0
/** 花圃花量密度（株/㎡）：按花圃面积换算实例数 */
const FLOWER_DENSITY = 30
/** 砾石贴图单块覆盖的米数（按米数反算 UV，避免长条被拉伸） */
const GRAVEL_TILE = 0.5
/** 花圃内边距 / 石缘宽度与高度（米） */
const BED_INSET = 0.14
const KERB_W = 0.13
const KERB_H = 0.13

/**
 * 三块花圃 [x0, z0, x1, z1]：
 * A 前左窗下花境（architecture-dev 划的 x[-4.6,-2.7]、z[3.8,5.2] 空地，原窗前花圃已在新房体内）
 * B 小径西侧长花境（草坪里的岛状花境，兼作小径的左侧框景）
 * C 东山墙侧花境（贴着露台东侧草地，从相机机位看是右侧前景）
 */
const BEDS: [number, number, number, number][] = [
  [-4.5, 3.85, -2.75, 5.15],
  [-5.3, 6.4, -3.0, 9.4],
  [5.15, 1.0, 7.0, 3.2]
]

/** 砾石带 [x0, z0, x1, z1]：东西山墙脚的排水砾石带（室外铺装全部归庭院系统） */
const GRAVEL: [number, number, number, number][] = [
  [-5.05, -3.5, -4.68, 3.55],
  [4.68, -3.5, 5.05, 3.55]
]

/** 柴堆占位 [x0, z0, x1, z1]：靠西山墙码放（离墙 0.55m，避开新基座/檐口） */
const WOODPILE: [number, number, number, number] = [-5.9, -1.9, -5.15, -0.2]

/** 矮灯柱位置 [x, z]：小径东侧两盏 */
const LAMPS: [number, number][] = [
  [GARDEN_PATH_X + PATH_HALF + 0.4, 7.4],
  [GARDEN_PATH_X + PATH_HALF + 0.4, 10.6]
]

/** 播撒禁植矩形 [x0, z0, x1, z1]：房体 / 露台 / 台阶 / 小径（均留 0.15~0.45m 余量） */
const BLOCKED: [number, number, number, number][] = [
  // 房体 + 基座（外扩 0.15m）
  [-(HOUSE_HALF_X + 0.15), -(HOUSE_HALF_Z + 0.15), HOUSE_HALF_X + 0.15, HOUSE_HALF_Z + 0.15],
  // 露台木平台 + 栏杆（z=6.10 与 x=4.75 两道 1.0m 高栏杆）
  [TERRACE_X0 - 0.3, HOUSE_HALF_Z - 0.1, TERRACE_X1 + 0.3, TERRACE_Z1 + 0.3],
  // 台阶 + 雨棚投影（雨棚 x[-2.70,0.10]、z[3.50,4.80]，下方不放草）
  [STEP_X0 - 0.4, 3.5, STEP_X1 + 0.4, STEP_Z1 + 0.4],
  // 石板小径
  [GARDEN_PATH_X - PATH_HALF - 0.25, PATH_Z0 - 0.45, GARDEN_PATH_X + PATH_HALF + 0.25, PATH_Z1 + 0.35],
  [LAMPS[0][0] - 0.3, LAMPS[0][1] - 0.3, LAMPS[0][0] + 0.3, LAMPS[0][1] + 0.3],
  [LAMPS[1][0] - 0.3, LAMPS[1][1] - 0.3, LAMPS[1][0] + 0.3, LAMPS[1][1] + 0.3]
]

/**
 * 功能：判断播撒点是否落在矩形集合内（可加外扩余量）。
 * 参数：rects 矩形集合；x/z 世界坐标；pad 外扩余量（米）。
 * 返回：落在任一矩形内为 true。
 */
function inRects(rects: [number, number, number, number][], x: number, z: number, pad = 0): boolean {
  for (const [x0, z0, x1, z1] of rects) {
    if (x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad) return true
  }
  return false
}

/** 功能：判断播撒点是否属于禁植区（房体/露台/小径/花圃/砾石带/柴堆）。 */
function blocked(x: number, z: number): boolean {
  if (inRects(BLOCKED, x, z)) return true
  if (inRects(BEDS, x, z, BED_INSET)) return true
  if (inRects(GRAVEL, x, z, 0.05)) return true
  return inRects([WOODPILE], x, z, 0.2)
}

/**
 * 功能：单根草叶——三段收尖的长条面片，带"根部暗、叶尖亮"的顶点色与轻微前弯。
 * 参数：w 叶宽；h 叶高；bend 叶尖前弯量；sx/sz 根部位移；yaw 绕 Y 的朝向。
 * 返回：底边在 y=0 的草叶几何。
 */
function bladeStrip(w: number, h: number, bend: number, sx: number, sz: number, yaw: number): THREE.BufferGeometry {
  const segs = 3
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const halfW = w * 0.5 * (1 - t * 0.92)
    const y = h * t
    const z = bend * t * t
    positions.push(-halfW, y, z, halfW, y, z)
    // 顶点色：根部压暗、叶尖提亮，单根叶片就有了明暗层次（法线渐变之外再多一层）
    const shade = 0.55 + t * 0.55
    colors.push(shade * 0.9, shade, shade * 0.82, shade * 0.9, shade, shade * 0.82)
    if (i < segs) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.rotateY(yaw)
  geo.translate(sx, 0, sz)
  return geo
}

/**
 * 功能：草叶"小丛"——3 片互成 60°、高低错开的收尖面片，一个实例就有体积感。
 * 说明：4200 个实例 × 3 片 = 1.26 万片叶，比单叶铺满同一面积省一半以上实例数，近看仍是细草。
 * 返回：底边在 y=0 的草丛几何（单叶宽约 3cm、最高约 26cm，实例化后用缩放调高矮）。
 */
function bladeGeo(): THREE.BufferGeometry {
  return mergeParts([
    bladeStrip(0.016, 0.15, 0.04, 0, 0, 0),
    bladeStrip(0.014, 0.125, 0.05, 0.02, 0.016, 2.1),
    bladeStrip(0.012, 0.105, 0.036, -0.018, -0.014, 4.2)
  ])
}

/**
 * 功能：花冠——6 片扁椭球花瓣围一圈，抬头 0.31m（与花茎顶对齐）。
 * 返回：花冠几何（花瓣，材质色由 params.flower 驱动）。
 */
function petalGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const n = 6
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const petal = new THREE.SphereGeometry(0.05, 5, 3)
    petal.scale(1, 0.26, 0.52)
    petal.rotateZ(0.16)
    petal.rotateY(a)
    petal.translate(Math.cos(a) * 0.045, 0.31, Math.sin(a) * 0.045)
    parts.push(petal)
  }
  return mergeParts(parts)
}

/** 功能：花心——小扁球，单独一个暖色材质，让花头不至于糊成一团同色。 */
function coreGeo(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.02, 6, 4)
  geo.scale(1, 0.6, 1)
  geo.translate(0, 0.315, 0)
  return geo
}

/** 功能：花茎——细圆柱 + 两片小叶，避免侧看是一根光杆。 */
function stemGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const main = new THREE.CylinderGeometry(0.007, 0.011, 0.31, 4, 1)
  main.translate(0, 0.155, 0)
  parts.push(main)
  for (const s of [-1, 1]) {
    const leaf = new THREE.PlaneGeometry(0.12, 0.036, 1, 1)
    leaf.rotateZ(s * 0.55)
    leaf.rotateY(s * 0.8)
    leaf.translate(s * 0.04, 0.16 + (s > 0 ? 0.05 : 0), 0)
    parts.push(leaf)
  }
  return mergeParts(parts)
}

/**
 * 功能：按实际米数缩放盒体 UV（盒体 6 面顺序 +x/-x/+y/-y/+z/-z，每面 4 顶点）。
 * 参数：geo 盒体几何；w/h/d 三边（米）；tile 贴图覆盖边长（米）。
 */
function scaleBoxUV(geo: THREE.BufferGeometry, w: number, h: number, d: number, tile: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute
  const spans: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f++) {
    const su = spans[f][0] / tile
    const sv = spans[f][1] / tile
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
    }
  }
  uv.needsUpdate = true
}

/**
 * 功能：把盒体 UV 收进 paving 贴图的一格石板内部——既用上石板 PBR，又不会"一块石头里再切四块"。
 * 参数：geo 盒体几何（会被就地修改）。
 */
function stonePatchUV(geo: THREE.BufferGeometry): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, 0.54 + uv.getX(i) * 0.42, 0.54 + uv.getY(i) * 0.42)
  }
  uv.needsUpdate = true
}

/**
 * 功能：搭建庭院（草坪 / 花境 / 石板小径 / 砾石带 / 矮灯柱 / 柴堆），并把季节与天气联动装进 apply。
 * 参数：scene 场景；tex 程序化贴图集合；mats 房屋共享材质（只用 lampMat 灯芯与 pathMat 铺装湿滑）。
 * 返回：带 apply(params) 的庭院系统。
 */
export function createGarden(scene: THREE.Scene, tex: Textures, mats: HouseMats): GardenSystem {
  // —— 材质：草叶 / 花瓣 / 花心 / 花茎 / 石板 / 砾石 / 树皮 / 金属 ——
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.25
  })
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0, envMapIntensity: 0.3 })
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xe8b95a, roughness: 0.7, metalness: 0, envMapIntensity: 0.25 })
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.2
  })
  // 石板/石缘共用一套材质：paving 的 PBR 三图 + 逐实例颜色微差（避免一块块一模一样）
  const stoneMat = new THREE.MeshStandardMaterial({
    ...tileSurface(tex.paving, 1, 1),
    color: 0x9b978d,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.3
  })
  const gravelMat = new THREE.MeshStandardMaterial({
    ...tileSurface(tex.gravel, 1, 1),
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.25
  })
  const logMat = new THREE.MeshStandardMaterial({
    ...tileSurface(tex.bark, 2, 1),
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.2
  })
  const metalMat = new THREE.MeshStandardMaterial({
    ...tileSurface(tex.metal, 1, 1),
    roughness: 0.55,
    metalness: 0.75,
    envMapIntensity: 0.8
  })

  // —— 实例化播撒：草叶 / 花冠+花心+花茎 / 石材（小径石板 + 花圃石缘 + 灯柱基座） ——
  const bladeMesh = new THREE.InstancedMesh(bladeGeo(), bladeMat, BLADE_MAX)
  bladeMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  // 实例分布跨十几米，逐帧视锥剔除收益小于误差风险，直接关闭
  bladeMesh.frustumCulled = false
  bladeMesh.receiveShadow = true
  bladeMesh.castShadow = false
  scene.add(bladeMesh)

  const euler = new THREE.Euler()
  const quat = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const m4 = new THREE.Matrix4()

  /** 功能：给实例网格的第 i 个实例写入位置/朝向/非均匀缩放（构建期一次性调用）。 */
  function setInstance(
    mesh: THREE.InstancedMesh, i: number,
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    rx: number, ry: number, rz: number
  ): void {
    euler.set(rx, ry, rz)
    quat.setFromEuler(euler)
    pos.set(x, y, z)
    scl.set(sx, sy, sz)
    m4.compose(pos, quat, scl)
    mesh.setMatrixAt(i, m4)
  }

  // —— 草坪：径向均匀播撒（离房子越近越密），落在禁植区的点直接丢弃 ——
  let bladeN = 0
  let seed = 1
  while (bladeN < BLADE_MAX && seed < BLADE_MAX * 12) {
    const a = rand(seed) * Math.PI * 2
    // pow>1：把点往内圈压，近处（相机看得到的地方）更密
    const t = Math.pow(rand(seed + 1), 1.15)
    const r = LAWN_R_MIN + t * (LAWN_R_MAX - LAWN_R_MIN)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    seed += 3
    if (blocked(x, z)) continue
    const h = 0.8 + rand(seed) * 0.75
    const tilt = (rand(seed + 1) - 0.5) * 0.5
    setInstance(bladeMesh, bladeN, x, -0.01, z, h * (0.85 + rand(seed + 2) * 0.3), h, h, tilt, rand(seed + 4) * Math.PI * 2, tilt * 0.6)
    bladeN++
  }
  bladeMesh.count = bladeN
  bladeMesh.instanceMatrix.needsUpdate = true

  // —— 花境：先按花圃面积算出每株落点，再一次性建 3 个实例网格（共用同一份矩阵） ——
  const flowerSpots: number[][] = []
  for (const [x0, z0, x1, z1] of BEDS) {
    const w = x1 - x0 - BED_INSET * 2
    const d = z1 - z0 - BED_INSET * 2
    const n = Math.round(w * d * FLOWER_DENSITY)
    const base = 3000 + Math.round(x0 * 37 + z0 * 91)
    for (let k = 0; k < n; k++) {
      const s = base + k * 5
      const x = x0 + BED_INSET + rand(s) * w
      const z = z0 + BED_INSET + rand(s + 1) * d
      flowerSpots.push([x, z, 0.8 + rand(s + 2) * 0.5, rand(s + 3) * Math.PI * 2])
    }
  }
  const flowerN = flowerSpots.length
  const petalMesh = new THREE.InstancedMesh(petalGeo(), petalMat, flowerN)
  const coreMesh = new THREE.InstancedMesh(coreGeo(), coreMat, flowerN)
  const stemMesh = new THREE.InstancedMesh(stemGeo(), stemMat, flowerN)
  for (const mesh of [petalMesh, coreMesh, stemMesh]) {
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    mesh.castShadow = false
    scene.add(mesh)
  }
  for (let i = 0; i < flowerN; i++) {
    const [x, z, s, ry] = flowerSpots[i]
    // 花茎/花冠/花心共用同一份矩阵：三张贴图三个 drawcall，但实例姿态完全对齐
    for (const mesh of [petalMesh, coreMesh, stemMesh]) {
      setInstance(mesh, i, x, 0, z, s, s, s, 0, ry, 0)
    }
  }
  for (const mesh of [petalMesh, coreMesh, stemMesh]) mesh.instanceMatrix.needsUpdate = true

  // —— 石材：石板小径（不规则板块）+ 花圃石缘 + 灯柱基座，一个 InstancedMesh 全包 ——
  const stonePieces: number[][] = []
  // 小径：两列错缝石板，逐块抖动尺寸/朝向，构成"不规则石板"
  const SLAB_STEP = 0.56
  for (let z = PATH_Z0 + 0.1; z < PATH_Z1 - 0.2; z += SLAB_STEP) {
    for (let c = 0; c < 2; c++) {
      const s = 7000 + Math.round(z * 53) + c * 17
      const x = GARDEN_PATH_X + (c === 0 ? -0.47 : 0.47) + (rand(s) - 0.5) * 0.08
      stonePieces.push([
        x, 0.035, z + (rand(s + 1) - 0.5) * 0.1,
        0.62 + rand(s + 2) * 0.16, 0.07, 0.36 + rand(s + 3) * 0.12,
        (rand(s + 4) - 0.5) * 0.1, rand(s + 5) * 0.06, (rand(s + 6) - 0.5) * 0.1
      ])
    }
  }
  // 花圃石缘：四边各一条石缘，把花圃框出来
  for (const [x0, z0, x1, z1] of BEDS) {
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    stonePieces.push([cx, KERB_H / 2, z0, x1 - x0 + KERB_W, KERB_H, KERB_W, 0, 0, 0])
    stonePieces.push([cx, KERB_H / 2, z1, x1 - x0 + KERB_W, KERB_H, KERB_W, 0, 0, 0])
    stonePieces.push([x0, KERB_H / 2, cz, KERB_W, KERB_H, z1 - z0 - KERB_W, 0, 0, 0])
    stonePieces.push([x1, KERB_H / 2, cz, KERB_W, KERB_H, z1 - z0 - KERB_W, 0, 0, 0])
  }
  // 灯柱基座：石座只比柱身略大一点，别做成"石墩"
  for (const [lx, lz] of LAMPS) {
    stonePieces.push([lx, 0.05, lz, 0.24, 0.1, 0.24, 0, 0, 0])
  }
  const stoneMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneMat, stonePieces.length)
  stoneMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  stoneMesh.frustumCulled = false
  stoneMesh.castShadow = true
  stoneMesh.receiveShadow = true
  scene.add(stoneMesh)
  const stoneGeo0 = stoneMesh.geometry as THREE.BufferGeometry
  stonePatchUV(stoneGeo0)
  const stoneTint = new THREE.Color()
  for (let i = 0; i < stonePieces.length; i++) {
    const p = stonePieces[i]
    setInstance(stoneMesh, i, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8])
    // 逐块颜色微差：花岗岩般的冷暖深浅不匀，避免整条路像贴了同一张图
    stoneTint.setRGB(0.9 + rand(i * 13) * 0.18, 0.9 + rand(i * 17) * 0.16, 0.9 + rand(i * 19) * 0.14)
    stoneMesh.setColorAt(i, stoneTint)
  }
  stoneMesh.instanceMatrix.needsUpdate = true
  if (stoneMesh.instanceColor) stoneMesh.instanceColor.needsUpdate = true

  // —— 小径垫层：用房屋共享的 pathMat（铺装湿滑），露出缝隙的石板间不是裸草地 ——
  const pathBase = new THREE.BoxGeometry(PATH_HALF * 2, 0.02, PATH_Z1 - PATH_Z0)
  pathBase.translate(GARDEN_PATH_X, 0.01, (PATH_Z0 + PATH_Z1) / 2)
  const pathBed = new THREE.Mesh(pathBase, mats.pathMat)
  pathBed.receiveShadow = true
  scene.add(pathBed)

  // —— 砾石带：按米数反算 UV，长条上的卵石不会被拉成一片片 ——
  const gravelParts: THREE.BufferGeometry[] = []
  for (const [x0, z0, x1, z1] of GRAVEL) {
    const w = x1 - x0
    const d = z1 - z0
    const g = new THREE.BoxGeometry(w, 0.05, d)
    scaleBoxUV(g, w, 0.05, d, GRAVEL_TILE)
    g.translate((x0 + x1) / 2, 0.025, (z0 + z1) / 2)
    gravelParts.push(g)
  }
  const gravelMesh = new THREE.Mesh(mergeParts(gravelParts), gravelMat)
  gravelMesh.receiveShadow = true
  gravelMesh.castShadow = false
  scene.add(gravelMesh)

  // —— 矮灯柱：金属柱身 + 压顶（合并）+ 灯芯（房屋共享 lampMat，亮度随 lamp 走） ——
  const metalParts: THREE.BufferGeometry[] = []
  const lampParts: THREE.BufferGeometry[] = []
  for (const [lx, lz] of LAMPS) {
    // 现代矮灯柱：方柱身 0.09m + 一圈发光带 + 小压顶，总高约 0.69m（不超过 0.9m）
    const post = new THREE.BoxGeometry(0.09, 0.56, 0.09)
    post.translate(lx, 0.38, lz)
    metalParts.push(post)
    const cap = new THREE.BoxGeometry(0.12, 0.03, 0.12)
    cap.translate(lx, 0.675, lz)
    metalParts.push(cap)
    // 灯芯：略凸出柱身的一圈发光带，夜里由 lampMat 自发光透出来（最大边宽 0.1m）
    const core = new THREE.BoxGeometry(0.1, 0.16, 0.1)
    core.translate(lx, 0.575, lz)
    lampParts.push(core)
  }
  const metalMesh = new THREE.Mesh(mergeParts(metalParts), metalMat)
  metalMesh.castShadow = true
  metalMesh.receiveShadow = true
  scene.add(metalMesh)
  const lampMesh = new THREE.Mesh(mergeParts(lampParts), mats.lampMat)
  lampMesh.castShadow = false
  scene.add(lampMesh)

  // —— 小品：靠东山墙（留 0.7m 间隙）码放的柴堆，两排圆木 ——
  const logParts: THREE.BufferGeometry[] = []
  for (let row = 0; row < 2; row++) {
    const n = row === 0 ? 4 : 3
    for (let i = 0; i < n; i++) {
      const g = new THREE.CylinderGeometry(0.085, 0.085, 0.66, 8)
      g.rotateZ(Math.PI / 2)
      g.translate(
        (WOODPILE[0] + WOODPILE[2]) / 2 + (rand(i * 7 + row) - 0.5) * 0.06,
        0.11 + row * 0.16,
        WOODPILE[1] + 0.2 + i * 0.18 + row * 0.09
      )
      logParts.push(g)
    }
  }
  const logMesh = new THREE.Mesh(mergeParts(logParts), logMat)
  logMesh.castShadow = true
  logMesh.receiveShadow = true
  scene.add(logMesh)

  // —— apply：全部原地改已有材质/实例数，零分配 ——
  /** 冬季/雪天草叶的竖向压扁比：单株约 0.3m × 0.15 ≈ 0.045m（雪面之上只剩一点残茬） */
  const WINTER_BLADE_SQUASH = 0.15
  /** 冬季/雪天草叶数量再乘的系数：雪地里不该是满铺挺立的草 */
  const WINTER_BLADE_COUNT = 0.55
  const SNOW_TINT = new THREE.Color(0xf2f5f8)
  const STONE_BASE = new THREE.Color(0x9b978d)
  const grassTint = new THREE.Color()

  return {
    apply(params) {
      // 草：数量随 grassLevel，颜色随季节 + 积雪向白偏移
      const level = clamp01(params.grassLevel)
      // snow 是 0/1 派生量（冬季或雪天为 1）：雪压草 —— 高度压到约 4.5cm、数量再乘 0.55
      const buried = params.snow > 0.5
      const blades = Math.round(bladeN * level * (buried ? WINTER_BLADE_COUNT : 1))
      bladeMesh.count = blades
      bladeMesh.visible = blades > 0
      bladeMesh.scale.y = buried ? WINTER_BLADE_SQUASH : 1
      grassTint.copy(params.grass).lerp(SNOW_TINT, clamp01(params.snow * 0.85))
      bladeMat.color.copy(grassTint)

      // 花：数量随 bloomLevel（雨天被打落、冬季归零）
      const bloom = clamp01(params.bloomLevel)
      const flowers = Math.round(flowerN * bloom)
      const flowerVisible = flowers > 0
      for (const mesh of [petalMesh, coreMesh, stemMesh]) {
        mesh.count = flowers
        mesh.visible = flowerVisible
      }
      petalMat.color.copy(params.flower)
      stemMat.color.copy(params.grass).multiplyScalar(0.78).lerp(SNOW_TINT, clamp01(params.snow * 0.5))

      // 铺装湿滑：wet 越小（雨）越光滑；石头同时压暗一点，湿石材更深
      const wet = clamp01(params.wet)
      stoneMat.roughness = 0.35 + wet * 0.6
      gravelMat.roughness = 0.55 + wet * 0.45
      stoneMat.color.copy(STONE_BASE).multiplyScalar(1 - (1 - wet) * 0.3)
      logMat.roughness = 0.6 + wet * 0.35
    }
  }
}
