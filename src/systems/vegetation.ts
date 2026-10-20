import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { SceneParams } from '../types'
import { tileSurface } from './textures'
import type { Textures } from './textures'

/** 植被系统：写实树木（针叶分层锥 / 阔叶主干＋分枝＋叶卡树冠）、庭院灌木、远景树线 */
export interface VegetationSystem {
  apply(params: SceneParams): void
}

/**
 * 确定性伪随机：由种子派生 0..1。
 * 功能：让每棵树、每根枝、每片叶卡的形态稳定，刷新画面完全可复现。
 * 参数：seed 任意整数（由坐标/序号派生）。
 * 返回：[0,1) 内的数值。
 */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * 功能：合并一组几何（统一转非索引，避免索引/非索引混用导致返回 null）。
 * 参数：parts 待合并几何。
 * 返回：合并后的单个几何。
 */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))
  if (!merged) throw new Error('植被几何合并失败：属性集不一致')
  return merged
}

/** 叶团卡片沿垂直方向的收缩比：树冠横向比纵向更宽 */
const CARD_SQUASH_Y = 0.72
/** 阔叶树冠：外圈叶团数 / 内层叶团数（内层压暗，模拟冠内不见天光） */
const BROADLEAF_BLOBS = 64
const BROADLEAF_INNER = 26
/** 灌木叶团数（小体量，够密就行） */
const BUSH_BLOBS = 20
/** 针叶：冠层数 / 每层枝条数（枝条卡片沿周向排布，替代整块锥面） */
const CONIFER_LAYERS = 9
const CONIFER_SPRAYS = 9
/** 针叶冠内芯锥的径向分段：只当"挡光的深色芯"，轮廓由枝条决定 */
const CONIFER_CORE_SEGS = 8
/** 阔叶树冠中心相对树高的比例：树冠落在上部，主干下部露出来 */
const BROADLEAF_CROWN_Y = 0.64
/** 针叶树冠起点相对树高的比例：下段露干，视觉上更接近冷杉/云杉 */
const CONIFER_CROWN_Y = 0.26
/** 分枝级数：阔叶 3 级、针叶 2 级（针叶枝大部分被锥冠遮住，不必过密） */
const BROADLEAF_BRANCH_LEVELS = 3
const CONIFER_BRANCH_LEVELS = 2
/** 远景树线基色与雾色混合比：越接近雾色越"吃雾"，只留天际线层次 */
const FAR_BASE = new THREE.Color(0x36402f)
const FAR_FOG_MIX = 0.3
/** 远景树干埋深（米）：只留一小段落地干身，冠底压到近地面，不露长裸干 */
const FAR_SINK = 8
/** 远景树线参数：26 株围一圈（60~110m），只留整株锥形剪影 */
const FAR_TREES = 34
const FAR_R_MIN = 60
const FAR_R_MAX = 110
const FAR_H_MIN = 8
const FAR_H_MAX = 13

/** 世界坐标 Y 轴与单位向量（构建期复用，避免在递归里反复 new） */
const UP = new THREE.Vector3(0, 1, 0)
const ONE = new THREE.Vector3(1, 1, 1)

/** 近景树配方：树种 + 位置 + 树高 + 冠幅 + 个体缩放（世界坐标，米） */
interface TreeSpec {
  /** conifer = 针叶（分层锥冠）、broadleaf = 阔叶（主干＋分枝＋叶簇） */
  kind: 'conifer' | 'broadleaf'
  x: number
  z: number
  /** 树高（未乘个体缩放） */
  h: number
  /** 冠幅半径 */
  crown: number
  /** 个体缩放 */
  scale: number
  /** 形态种子 */
  seed: number
}

/**
 * 六株近景树：全部距原点 ≥9.5m，且避让相机默认机位 (11.5, 3.1, 13.5) 看原点的前视走廊
 * （扫视 60° 后也不能让树盖住房子立面）。
 */
const TREES: TreeSpec[] = [
  { kind: 'conifer', x: -9.6, z: -4.2, h: 8.2, crown: 2.0, scale: 1.0, seed: 11 },
  { kind: 'broadleaf', x: -13.4, z: 7.2, h: 6.0, crown: 2.7, scale: 1.05, seed: 29 },
  { kind: 'broadleaf', x: 10.2, z: -4.2, h: 6.6, crown: 3.0, scale: 1.08, seed: 47 },
  { kind: 'conifer', x: 15.2, z: 2.4, h: 6.6, crown: 1.8, scale: 1.05, seed: 71 },
  { kind: 'conifer', x: -11.6, z: -0.6, h: 7.0, crown: 1.8, scale: 0.95, seed: 89 },
  { kind: 'broadleaf', x: 7.4, z: -11.2, h: 5.4, crown: 2.5, scale: 1.0, seed: 113 }
]

/** 庭院灌木：[x, z, 个体缩放]（避开石板小径 / 花圃 / 门廊与柴堆） */
const SHRUBS: [number, number, number][] = [
  [-5.9, -2.6, 0.95],
  [-5.6, 2.6, 0.8],
  [6.4, 4.7, 0.85],
  [6.0, -2.8, 1.0],
  [-5.8, 5.2, 0.75],
  [2.7, 7.0, 0.7]
]

/**
 * 功能：生成树干——上细下粗的锥度圆柱，沿高度做一点侧弯（避免"电线杆"感）。
 * 参数：h 树干高度；rBase 基部半径；seed 弯曲方向种子。
 * 返回：底面对齐 y=0 的树干几何。
 */
function trunkGeo(h: number, rBase: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rBase * 0.38, rBase, h, 9, 4)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const bendX = (rand(seed) - 0.5) * 0.16
  const bendZ = (rand(seed + 1) - 0.5) * 0.16
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const t = (y + h / 2) / h
    pos.setX(i, pos.getX(i) + bendX * h * t * t)
    pos.setZ(i, pos.getZ(i) + bendZ * h * t * t)
  }
  // 顶点被推移过，法线需要重算（否则树干受光是直的、轮廓是弯的）
  geo.computeVertexNormals()
  geo.translate(0, h / 2, 0)
  return geo
}

/**
 * 功能：递归生成一根分枝（越往深处越细越短，方向随机偏转）。
 * 参数：out 几何收集；start 起点；dir 单位方向；len 长度；r 基部半径；depth 剩余级数；seed 形态种子。
 */
function growBranch(
  out: THREE.BufferGeometry[],
  start: THREE.Vector3,
  dir: THREE.Vector3,
  len: number,
  r: number,
  depth: number,
  seed: number
): void {
  const geo = new THREE.CylinderGeometry(r * 0.6, r, len, 5, 1)
  // 圆柱默认沿 +y：旋转到 dir 方向，再平移到 [start, start+dir*len] 的中点
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir)
  const mid = start.clone().addScaledVector(dir, len / 2)
  geo.applyMatrix4(new THREE.Matrix4().compose(mid, quat, ONE))
  out.push(geo)
  if (depth <= 0) return

  const end = start.clone().addScaledVector(dir, len)
  const n = depth >= 2 ? 3 : 2
  for (let i = 0; i < n; i++) {
    const s = seed * 13 + i * 7 + depth * 31
    // 在父方向基础上叠加随机偏移（带一点向上趋势），得到自然的分叉走向
    const jitter = new THREE.Vector3(rand(s) - 0.5, 0.3 + rand(s + 1) * 0.75, rand(s + 2) - 0.5)
    const next = dir.clone().addScaledVector(jitter, 0.95).normalize()
    growBranch(out, end, next, len * (0.58 + rand(s + 3) * 0.16), r * 0.56, depth - 1, s + 5)
  }
}

/**
 * 功能：给一张卡片的所有顶点刷同一种明度（顶点色，材质 color 再乘季节色）。
 * 参数：geo 卡片几何；shade 明度 0..1。
 */
function paintCard(geo: THREE.BufferGeometry, shade: number): void {
  const n = geo.attributes.position.count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    colors[i * 3] = shade
    colors[i * 3 + 1] = shade
    colors[i * 3 + 2] = shade
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

/**
 * 功能：往 out 里塞一组"十字卡片"（两片正交平面，绕自身法向随机翻滚），
 *       单张平面在别的角度看会薄成一条线，正交双片才有体积。
 * 参数：out 收集；w/h 卡片宽高；seed 形态种子；shade 顶点色明度。
 */
function pushCrossCard(
  out: THREE.BufferGeometry[],
  w: number,
  h: number,
  seed: number,
  shade: number
): void {
  for (let k = 0; k < 2; k++) {
    const geo = new THREE.PlaneGeometry(w, h, 1, 1)
    geo.rotateY((k * Math.PI) / 2)
    geo.rotateZ((rand(seed + k * 3) - 0.5) * 0.7)
    geo.rotateX((rand(seed + 1 + k * 3) - 0.5) * 0.45)
    geo.rotateY(rand(seed + 2 + k * 3) * Math.PI)
    paintCard(geo, shade)
    out.push(geo)
  }
}

/**
 * 功能：生成阔叶树冠——外圈叶团铺满扁球壳、内层叶团压暗堵住透光，
 *       每个叶团是一对正交卡片，靠数量与明度差咬合出"蓬松的团"而不是漂浮碎叶。
 * 参数：radius 冠幅半径；count 外圈叶团数；inner 内层叶团数；seed 形态种子；squashY 垂直收缩比。
 * 返回：以树冠中心为原点的合并几何。
 */
function broadleafCrownGeo(
  radius: number,
  count: number,
  inner: number,
  seed: number,
  squashY: number
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  // 外圈：落在 0.55~1.0 半径的壳上，朝外略微错开，形成参差的冠缘
  for (let i = 0; i < count; i++) {
    const s = seed + i * 19
    const theta = rand(s + 6) * Math.PI * 2
    const phi = Math.acos(2 * rand(s + 7) - 1)
    const r = radius * (0.55 + rand(s + 5) * 0.45)
    const sinPhi = Math.sin(phi)
    const size = radius * (0.46 + rand(s + 8) * 0.34)
    const geo: THREE.BufferGeometry[] = []
    pushCrossCard(geo, size, size * (0.86 + rand(s + 9) * 0.24), s, 0.74 + rand(s + 10) * 0.26)
    for (const g of geo) {
      g.translate(Math.cos(theta) * sinPhi * r, Math.cos(phi) * r * squashY, Math.sin(theta) * sinPhi * r)
      parts.push(g)
    }
  }

  // 内层：更小的叶团落在冠心附近并整体压暗，从任何角度看都是"实心"的树冠
  for (let i = 0; i < inner; i++) {
    const s = seed + 701 + i * 23
    const theta = rand(s + 6) * Math.PI * 2
    const phi = Math.acos(2 * rand(s + 7) - 1)
    const r = radius * (0.08 + rand(s + 5) * 0.4)
    const sinPhi = Math.sin(phi)
    const size = radius * (0.5 + rand(s + 8) * 0.3)
    const geo: THREE.BufferGeometry[] = []
    pushCrossCard(geo, size, size * 0.9, s, 0.42 + rand(s + 9) * 0.18)
    for (const g of geo) {
      g.translate(Math.cos(theta) * sinPhi * r, Math.cos(phi) * r * squashY, Math.sin(theta) * sinPhi * r)
      parts.push(g)
    }
  }
  return mergeParts(parts)
}

/**
 * 功能：生成针叶树冠的枝条层——每层沿周向排一圈"下垂枝簇"卡片（十字双片），
 *       层自下而上收小，轮廓由枝条端部决定，不再是一整块连续锥面。
 * 参数：span 冠高；r 冠底半径；seed 形态种子。
 * 返回：相对冠底原点（y=0）的合并几何。
 */
function coniferSpraysGeo(span: number, r: number, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < CONIFER_LAYERS; i++) {
    const t = i / (CONIFER_LAYERS - 1)
    const s = seed + i * 17
    const y = span * (0.03 + t * 0.9) * (0.95 + rand(s + 8) * 0.1)
    const rr = r * (1 - t * 0.84) * (0.9 + rand(s + 9) * 0.2)
    // 底层更暗（被上层遮光），顶层最亮
    const shade = 0.6 + t * 0.28 + rand(s + 10) * 0.1
    const sprays = CONIFER_SPRAYS - (t > 0.75 ? 2 : 0)
    for (let k = 0; k < sprays; k++) {
      const ss = s + k * 13
      const az = rand(ss) * Math.PI * 2 + (k / sprays) * Math.PI * 2
      // 枝条：外端下垂，宽度略大于层半径的半径，让相邻枝交叠
      const len = rr * (1.15 + rand(ss + 1) * 0.35)
      const wid = len * 0.62
      const card: THREE.BufferGeometry[] = []
      pushCrossCard(card, len, wid, ss + 3, shade)
      for (const g of card) {
        // 先压成近水平并下垂（绕 x 转 -90°+下垂角），再绕树轴转到方位角
        g.rotateX(-Math.PI / 2 + 0.5 + rand(ss + 2) * 0.25)
        g.rotateY(az)
        g.translate(Math.cos(az) * rr * 0.42, y - len * 0.12, Math.sin(az) * rr * 0.42)
        parts.push(g)
      }
    }
  }
  return mergeParts(parts)
}

/**
 * 功能：生成针叶冠的深色内芯——一个细长开口锥，站在枝条后面挡光，
 *       让树冠"不透"，但轮廓完全交给枝条卡片。
 * 参数：span 冠高；r 冠底半径。
 * 返回：相对冠底原点（y=0）的锥几何。
 */
function coniferCoreGeo(span: number, r: number): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(r * 0.42, span * 0.94, CONIFER_CORE_SEGS, 1, true)
  geo.translate(0, span * 0.47, 0)
  return geo
}

/**
 * 功能：搭建植被系统（近景树 / 庭院灌木 / 远景树线），并把季节与落叶联动装进 apply。
 * 参数：scene 场景；tex 程序化贴图集合（取 bark 的 PBR 三图与 leaf 叶片卡片）。
 * 返回：带 apply(params) 的植被系统。
 */
export function createVegetation(scene: THREE.Scene, tex: Textures): VegetationSystem {
  // —— 共享材质：叶片卡片 / 灌木 / 针叶 / 树干 / 远景 ——
  const leafMat = new THREE.MeshStandardMaterial({
    map: tex.leaf,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.3
  })
  // 叶卡投影用的深度材质：不显式给 alphaTest，镂空叶片在阴影里会变成实心方块
  const cardDepthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: tex.leaf,
    alphaTest: 0.35,
    side: THREE.DoubleSide
  })
  const bushMat = new THREE.MeshStandardMaterial({
    map: tex.leaf,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.25
  })
  // 针叶枝条卡片：贴图是"一根下垂枝上密排针叶"，明暗由顶点色给出层次
  const needleMat = new THREE.MeshStandardMaterial({
    map: tex.needle,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.26
  })
  const needleDepthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: tex.needle,
    alphaTest: 0.35,
    side: THREE.DoubleSide
  })
  // 内芯：只负责挡光，颜色压得很暗，避免从枝条缝隙看穿树冠
  const coniferCoreMat = new THREE.MeshStandardMaterial({
    color: 0x24301f,
    roughness: 0.98,
    metalness: 0,
    envMapIntensity: 0.1
  })
  // 树皮：树干沿高 3 次平铺（沟槽约 0.7m 一段），分枝按 1 次平铺
  const trunkMat = new THREE.MeshStandardMaterial({
    ...tileSurface(tex.bark, 1.2, 3.2),
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.22
  })
  const branchMat = new THREE.MeshStandardMaterial({
    ...tileSurface(tex.bark, 1, 1),
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.18
  })
  const farMat = new THREE.MeshStandardMaterial({
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.15,
    flatShading: true
  })

  /** 参与 folScale 缩放/季节换色的树冠组（树 + 灌木），每帧只遍历这一份 */
  const crownGroups: THREE.Group[] = []
  /** 树干 / 分枝几何：跨树合并成 2 个 Mesh，drawcall 与树数无关 */
  const trunkGeos: THREE.BufferGeometry[] = []
  const branchGeos: THREE.BufferGeometry[] = []

  for (const spec of TREES) {
    const isConifer = spec.kind === 'conifer'
    const yaw = rand(spec.x * 7.3 + spec.z * 3.1) * Math.PI * 2
    const tree = new THREE.Group()
    tree.position.set(spec.x, 0, spec.z)
    tree.scale.setScalar(spec.scale)
    tree.rotation.y = yaw
    scene.add(tree)

    const rBase = 0.055 + spec.h * 0.022
    // 树干：阔叶留到树冠内部即可，针叶贯穿全高（下半段是主要可见部分）
    // 阔叶树干只升到树冠中下部：再往上由分枝接管，避免一根"旗杆"穿过冠心
    const trunkH = spec.h * (isConifer ? 0.95 : 0.72)
    const trunk = trunkGeo(trunkH, rBase, spec.seed)
    const treeMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(spec.x, 0, spec.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(spec.scale, spec.scale, spec.scale)
    )
    trunk.applyMatrix4(treeMatrix)
    trunkGeos.push(trunk)

    // 分枝：从树干上段向四周伸出，2~3 级（阔叶 3 级更繁密）
    const levels = isConifer ? CONIFER_BRANCH_LEVELS : BROADLEAF_BRANCH_LEVELS
    const branchFrom = trunkH * (isConifer ? 0.55 : 0.5)
    const limbCount = isConifer ? 5 : 6
    const local: THREE.BufferGeometry[] = []
    for (let i = 0; i < limbCount; i++) {
      const s = spec.seed + i * 11
      const az = rand(s) * Math.PI * 2
      const tilt = 0.5 + rand(s + 1) * 0.42
      const dir = new THREE.Vector3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt))
      // 起点与长度都收紧：叶卡缩小后，露在冠外的裸枝会比以前更扎眼（枝梢不出冠顶）
      const start = new THREE.Vector3(0, branchFrom + rand(s + 2) * trunkH * (isConifer ? 0.14 : 0.16), 0)
      // 分枝长度收到冠幅之内：三级分叉累加后仍不戳出冠顶
      const len = spec.crown * (isConifer ? 0.3 + rand(s + 3) * 0.16 : 0.26 + rand(s + 3) * 0.14)
      growBranch(local, start, dir, len, rBase * 0.34, levels - 1, s + 7)
    }
    for (const g of local) {
      g.applyMatrix4(treeMatrix)
      branchGeos.push(g)
    }

    // 树冠：独立成组，folScale 只缩放它（不破坏整棵树的个体比例与树干）
    if (isConifer) {
      const baseY = spec.h * CONIFER_CROWN_Y
      const span = spec.h - baseY
      const crown = new THREE.Group()
      crown.position.y = baseY
      const core = new THREE.Mesh(coniferCoreGeo(span, spec.crown), coniferCoreMat)
      core.receiveShadow = true
      crown.add(core)
      const sprays = new THREE.Mesh(coniferSpraysGeo(span, spec.crown, spec.seed), needleMat)
      sprays.castShadow = true
      sprays.customDepthMaterial = needleDepthMat
      crown.add(sprays)
      tree.add(crown)
      crownGroups.push(crown)
    } else {
      const crownY = spec.h * BROADLEAF_CROWN_Y
      const crown = new THREE.Group()
      crown.position.y = crownY
      const blobs = new THREE.Mesh(
        broadleafCrownGeo(spec.crown, BROADLEAF_BLOBS, BROADLEAF_INNER, spec.seed, CARD_SQUASH_Y),
        leafMat
      )
      blobs.castShadow = true
      blobs.customDepthMaterial = cardDepthMat
      crown.add(blobs)
      tree.add(crown)
      crownGroups.push(crown)
    }
  }

  // —— 静态树干 / 分枝：跨树合并，两个 drawcall 收掉全部树皮 ——
  const trunkMesh = new THREE.Mesh(mergeParts(trunkGeos), trunkMat)
  trunkMesh.castShadow = true
  trunkMesh.receiveShadow = true
  scene.add(trunkMesh)
  const branchMesh = new THREE.Mesh(mergeParts(branchGeos), branchMat)
  branchMesh.castShadow = true
  branchMesh.receiveShadow = true
  scene.add(branchMesh)

  // —— 庭院灌木：低矮叶团，和树冠同一套 folScale/季节色，冬季一起消失 ——
  for (let i = 0; i < SHRUBS.length; i++) {
    const [bx, bz, bs] = SHRUBS[i]
    const holder = new THREE.Group()
    holder.position.set(bx, 0, bz)
    holder.scale.setScalar(bs)
    const crown = new THREE.Group()
    // 组原点抬到灌木中心：folScale 收缩时向团心收，不会"陷进地里"
    crown.position.y = 0.42
    holder.add(crown)
    const blobs = new THREE.Mesh(
      broadleafCrownGeo(0.62, BUSH_BLOBS, 6, 401 + i * 17, 0.72),
      bushMat
    )
    blobs.castShadow = true
    blobs.customDepthMaterial = cardDepthMat
    crown.add(blobs)
    scene.add(holder)
    crownGroups.push(crown)
  }

  // —— 远景树线：整株锥形剪影（冠底近地），60~110m，颜色向雾色靠，只当背景层次 ——
  const farParts: THREE.BufferGeometry[] = []
  for (let i = 0; i < FAR_TREES; i++) {
    const angle = (i / FAR_TREES) * Math.PI * 2 + rand(i + 401) * 0.22
    const radius = FAR_R_MIN + rand(i + 411) * (FAR_R_MAX - FAR_R_MIN)
    const h = FAR_H_MIN + rand(i + 421) * (FAR_H_MAX - FAR_H_MIN)
    // 记录本株的几何起点：平移只作用于本株，别把上一株的冠挪走
    const treeStart = farParts.length
    // 树干只露出落地的一小段（冠底压到 0.08h），地下埋 FAR_SINK 兜住地形起伏
    const trunkTop = h * 0.12
    const trunkH = trunkTop + FAR_SINK
    const farTrunk = new THREE.CylinderGeometry(h * 0.02, h * 0.03, trunkH, 5, 1)
    farTrunk.translate(0, trunkTop - trunkH / 2, 0)
    farParts.push(farTrunk)
    // 三层锥自下而上收小、逐层交叠：远看是一整株针叶轮廓，不出现"球冠+细长裸干"
    for (let k = 0; k < 3; k++) {
      const rr = h * (0.17 - k * 0.046) * (0.92 + rand(i * 7 + k + 451) * 0.16)
      const hh = h * (0.62 - k * 0.09)
      const layer = new THREE.ConeGeometry(rr, hh, 9, 1, true)
      layer.rotateY(rand(i * 3 + k + 441) * Math.PI)
      layer.translate(0, h * (0.08 + k * 0.24) + hh * 0.5, 0)
      farParts.push(layer)
    }
    for (let j = treeStart; j < farParts.length; j++) {
      farParts[j].translate(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
    }
  }
  const far = new THREE.Mesh(mergeParts(farParts), farMat)
  // 远景不参与投影：树线在阴影相机范围之外，投了也只是白算
  far.castShadow = false
  far.receiveShadow = false
  scene.add(far)

  return {
    apply(params) {
      // 树冠：叶片卡片跟随季节色，针叶压暗一档、灌木压暗更多，拉开层次
      leafMat.color.copy(params.foliage)
      needleMat.color.copy(params.foliage).multiplyScalar(0.72)
      bushMat.color.copy(params.foliage).multiplyScalar(0.82)
      // 远景只吃雾：颜色随雾色偏移，不做季节换色（否则远山会"变色"，很假）
      farMat.color.copy(FAR_BASE).lerp(params.fog, FAR_FOG_MIX)

      const k = params.folScale
      const visible = k > 0.02
      for (let i = 0; i < crownGroups.length; i++) {
        const g = crownGroups[i]
        g.visible = visible
        if (visible) g.scale.setScalar(k)
      }
    }
  }
}
