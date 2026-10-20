import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { SurfaceTex, Textures } from './textures'
import { tileSurface } from './textures'

/**
 * 房屋共享材质集合。
 * 前 6 个是跨系统契约字段（main / garden / environment 直接引用）：
 * - glassMat：玻璃幕墙（薄透玻璃：transparent + 低 opacity + 低 transmission；
 *   interior 每帧写 emissiveIntensity 做夜景暖光外溢）
 * - roofSnowMat：屋面 / 女儿墙顶积雪（environment 每帧写 opacity = snow * 0.85）
 * - pathMat：铺装地面（environment 每帧写 roughness = wet，必须可写）
 * - lampMat：壁灯 / 灯槽自发光（interior 每帧写 emissiveIntensity）
 * - metalMat：金属构件（幕墙竖梃、栏杆、压顶）
 * - concreteMat：清水混凝土
 * 后 2 个是房屋构件与 interior 共用的木作材质，不属于对外契约。
 */
export interface HouseMats {
  glassMat: THREE.MeshPhysicalMaterial
  roofSnowMat: THREE.MeshStandardMaterial
  pathMat: THREE.MeshStandardMaterial
  lampMat: THREE.MeshStandardMaterial
  metalMat: THREE.MeshStandardMaterial
  concreteMat: THREE.MeshStandardMaterial
  /** 室内木地板（wood PBR）：house 建材质，interior 铺装 */
  floorMat: THREE.MeshStandardMaterial
  /** 木饰面：二层体量与室内木家具共用 */
  woodMat: THREE.MeshStandardMaterial
}

/** 房屋系统返回值：几何组 + 共享材质 */
export interface HouseSystem {
  group: THREE.Group
  mats: HouseMats
}

/** —— 建筑几何（米）：主体 9(x) × 7(z)，两层，正面朝 +z —— */
const GROUND_W = 9
const GROUND_D = 7
/** 层高与楼板厚 */
const FLOOR_H = 3.1
const SLAB_T = 0.35
/** 基座（清水混凝土勒脚）高度与外扩尺寸 */
const PLINTH_H = 0.3
const PLINTH_OVER = 0.15
/** 墙体厚 */
const WALL_T = 0.3
/** 二层木体量悬挑：侧向 0.2 / 前向 1.1 / 后向 0.1 */
const UPPER_OVER_X = 0.2
const UPPER_OVER_FRONT = 1.1
const UPPER_OVER_BACK = 0.1
/** 屋面挑檐、女儿墙高 / 厚、金属压顶厚 */
const ROOF_OVER = 0.35
const PARAPET_H = 0.62
const PARAPET_T = 0.18
const COPING_T = 0.06
/** 贴图平铺基准：一张贴图覆盖的米数（构件尺寸 / 米数 即 repeat） */
const TILE_CONCRETE = 2.4
const TILE_WOOD = 1.15
const TILE_DECK = 1.2
const TILE_METAL = 0.8
const TILE_PAVING = 1.6
/** 幕墙玻璃厚（米） */
const GLASS_T = 0.04

/** 一层外墙皮半宽 / 半深 */
const HX = GROUND_W / 2
const HZ = GROUND_D / 2
/** 关键标高：基座顶 = 一层地面结构面 */
const PLINTH_TOP = PLINTH_H
/** 一层墙顶 = 二层楼板底 */
const L1_TOP = PLINTH_TOP + FLOOR_H
/** 二层墙底 = 楼板顶 */
const L2_BASE = L1_TOP + SLAB_T
/** 二层墙顶 = 屋面板底 */
const L2_TOP = L2_BASE + FLOOR_H
const ROOF_TOP = L2_TOP + SLAB_T
const PARAPET_TOP = ROOF_TOP + PARAPET_H
/** 二层体量与屋面轮廓 */
const UX = HX + UPPER_OVER_X
const UZ0 = -HZ - UPPER_OVER_BACK
const UZ1 = HZ + UPPER_OVER_FRONT
const RX = UX + ROOF_OVER
const RZ0 = UZ0 - ROOF_OVER
const RZ1 = UZ1 + ROOF_OVER
/** 入口内凹：净空 x[-2.3,-0.3] × z[2.4,3.5]，门中心 x = -1.30（庭院小径轴线对齐此值） */
const ENTRY_X0 = -2.3
const ENTRY_X1 = -0.3
const ENTRY_Z0 = 2.4
const DOOR_W = 1.1
const DOOR_H = 2.15
const DOOR_CX = -1.3
/** 露台木平台（实体落地，不架空）与栏杆 */
const DECK_X0 = -0.05
const DECK_X1 = 4.75
const DECK_Z0 = HZ + PLINTH_OVER
const DECK_Z1 = 6.1
const DECK_TOP = 0.28
const RAIL_H = 1

/** 一层室内地坪完成面标高（米）：基座 0.30 + 木地板面层 0.04 */
export const INTERIOR_FLOOR_Y = PLINTH_TOP + 0.04
/** 一层室内吊顶标高（米）= 二层楼板底面，interior 的吊灯 / 灯槽据此吊挂 */
export const INTERIOR_CEILING_Y = L1_TOP
/**
 * 一层地板分块（米）：入口内凹在 x[-2.6,0] × z[2.1,3.5] 让出，
 * 其余区域铺满到墙内表面（前侧到幕墙内表面 3.34）。
 */
export const INTERIOR_SLABS: readonly { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: -HX + WALL_T, x1: HX - WALL_T, z0: -HZ + WALL_T, z1: ENTRY_Z0 - WALL_T },
  { x0: -HX + WALL_T, x1: ENTRY_X0 - WALL_T, z0: ENTRY_Z0 - WALL_T, z1: HZ - WALL_T },
  { x0: ENTRY_X1 + WALL_T, x1: HX - WALL_T, z0: ENTRY_Z0 - WALL_T, z1: HZ - WALL_T + 0.14 }
]

/** 立面矩形洞口：u 沿墙长、v 沿墙高（局部坐标，原点在墙左下角，米） */
interface Opening {
  u0: number
  u1: number
  v0: number
  v1: number
}

/**
 * 功能：把一面矩形墙按矩形洞口切成互不重叠的板块，再逐块回调输出（洞口可左右 / 上下并排）。
 * 参数：len 墙长；h 墙高；holes 洞口（局部坐标）；emit 板块回调（中心 u/v + 宽/高）。
 * 返回：无。
 */
function splitFacade(
  len: number,
  h: number,
  holes: Opening[],
  emit: (u: number, v: number, w: number, hh: number) => void
): void {
  const sorted = holes.slice().sort((a, b) => a.u0 - b.u0 || a.v0 - b.v0)
  // 洞口按 u 合并成互不相交的竖条，整条都算空，避免板块互相穿插
  const runs: Opening[] = []
  let cur = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const o = sorted[i]
    if (o.u0 <= cur.u1 + 1e-6) {
      cur = { u0: cur.u0, u1: Math.max(cur.u1, o.u1), v0: Math.min(cur.v0, o.v0), v1: Math.max(cur.v1, o.v1) }
    } else {
      runs.push(cur)
      cur = o
    }
  }
  if (cur) runs.push(cur)

  const solid = (u0: number, u1: number, v0: number, v1: number): void => {
    if (u1 - u0 > 1e-6 && v1 - v0 > 1e-6) emit((u0 + u1) / 2, (v0 + v1) / 2, u1 - u0, v1 - v0)
  }

  let cursor = 0
  for (const o of runs) {
    solid(cursor, o.u0, 0, h)
    solid(o.u0, o.u1, 0, o.v0)
    solid(o.u0, o.u1, o.v1, h)
    cursor = o.u1
  }
  solid(cursor, len, 0, h)
}

/**
 * 功能：把盒体六面的 UV 换算成米。BoxGeometry 每面 UV 固定 0..1，直接贴图会被大墙面拉成一片；
 *       换算成米后由材质 repeat = 1 / 平铺米数 折算成真实平铺。
 *       面序与 BoxGeometry 顶点一致：+x / -x / +y / -y / +z / -z。
 * 参数：geo 盒体几何；w/h/d 三边（米）。
 * 返回：无（就地改 UV）。interior 的木地板 / 家具也用它。
 */
export function scaleBoxUV(geo: THREE.BoxGeometry, w: number, h: number, d: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute
  const spans: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h]
  ]
  for (let f = 0; f < 6; f++) {
    const su = spans[f][0]
    const sv = spans[f][1]
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
    }
  }
  uv.needsUpdate = true
}

/**
 * 功能：把一套程序化 PBR 表面（颜色 / 法线 / 粗糙度三图）包成标准材质，并按米换算平铺。
 * 参数：surface 表面三图；tileMeters 一张贴图覆盖的实际米数；params 额外材质参数。
 * 返回：带三张贴图的 MeshStandardMaterial。
 */
function surfaceMat(
  surface: SurfaceTex,
  tileMeters: number,
  params: THREE.MeshStandardMaterialParameters = {}
): THREE.MeshStandardMaterial {
  const repeat = 1 / tileMeters
  return new THREE.MeshStandardMaterial({ ...tileSurface(surface, repeat, repeat), ...params })
}

/**
 * 功能：建出现代主义写实别墅的整栋几何（基座、两层体量、玻璃幕墙、平屋顶、露台、壁灯），
 *       按材质合并成 8 个 Mesh，并返回跨系统共享的材质集合。
 * 参数：tex 程序化 PBR 贴图集合（concrete / wood / deck / metal / paving / snow）。
 * 返回：{ group 房屋几何组（局部坐标即世界坐标，正面朝 +z）, mats 共享材质 }。
 */
export function createHouse(tex: Textures): HouseSystem {
  const group = new THREE.Group()

  // —— 材质：清水混凝土 / 木饰面 / 木地板 / 木平台 / 金属 / 铺装 / 玻璃 / 积雪 / 灯体 ——
  const concreteMat = surfaceMat(tex.concrete, TILE_CONCRETE, { roughness: 1, metalness: 0, envMapIntensity: 0.4 })
  // 灰调哑光木饰面：贴图本身已降饱和（#97724a），这里再用冷灰 tint 压掉偏橙的重色
  const woodMat = surfaceMat(tex.wood, TILE_WOOD, {
    color: 0xe6e6e1,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.45
  })
  const floorMat = surfaceMat(tex.wood, TILE_WOOD, {
    color: 0xf2e6d4,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.5
  })
  const deckMat = surfaceMat(tex.deck, TILE_DECK, { roughness: 1, metalness: 0, envMapIntensity: 0.4 })
  const metalMat = surfaceMat(tex.metal, TILE_METAL, {
    color: 0xd9dee1,
    metalness: 0.9,
    roughness: 0.55,
    envMapIntensity: 1.1
  })
  const pathMat = surfaceMat(tex.paving, TILE_PAVING, { roughness: 1, metalness: 0, envMapIntensity: 0.4 })
  // 玻璃：薄透玻璃（transmission 只做轻微折射，透明度靠 opacity 混合）——
  // 高 transmission + 大 thickness 会让采样偏移过大、发成"乳白磨砂"，这里按 lead 的验收改成
  // transmission 0.18 / opacity 0.22 / thickness 0.02，环境反射仍保留 1.6；夜里由 interior 写 emissiveIntensity 做暖光外溢
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8f2f6,
    transmission: 0.18,
    roughness: 0.05,
    thickness: 0.02,
    ior: 1.5,
    metalness: 0,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    // 1.6 的环境反射会把整个幕墙刷成"奶白板"（白天反射亮天空），压到 0.5 后能看清室内
    envMapIntensity: 0.5,
    emissive: 0xffb268,
    emissiveIntensity: 0,
    specularIntensity: 1
  })
  // 积雪：白色、透明、初始不可见，opacity 每帧由 environment 写 snow * SNOW_ROOF_OPACITY
  const roofSnowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0,
    transparent: true,
    opacity: 0,
    envMapIntensity: 0.6
  })
  // 灯体：暖白自发光，emissiveIntensity 由 interior.apply 驱动
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x2b2822,
    emissive: 0xffc078,
    emissiveIntensity: 0,
    roughness: 0.45,
    metalness: 0.1
  })

  /** 按材质分组的几何收集器：合并后每种材质只留 1 个 Mesh，draw call 压到 8 */
  const parts = {
    concrete: [] as THREE.BufferGeometry[],
    wood: [] as THREE.BufferGeometry[],
    deck: [] as THREE.BufferGeometry[],
    metal: [] as THREE.BufferGeometry[],
    paving: [] as THREE.BufferGeometry[],
    glass: [] as THREE.BufferGeometry[],
    snow: [] as THREE.BufferGeometry[],
    lamp: [] as THREE.BufferGeometry[]
  }

  // 几何构造用临时对象（只在建场时用，不参与帧循环）
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

  /** 功能：建一个 UV 按米换算的盒体（中心坐标）。 */
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

  /** 功能：在 z 法线立面上按洞口切板块（u 沿 +x），写入指定几何组。 */
  function wallX(
    list: THREE.BufferGeometry[],
    z: number,
    x0: number,
    y0: number,
    len: number,
    h: number,
    holes: Opening[]
  ): void {
    splitFacade(len, h, holes, (u, v, w, hh) => {
      box(list, w, hh, WALL_T, x0 + u, y0 + v, z)
    })
  }

  /** 功能：在 x 法线立面上按洞口切板块（u 沿 +z），写入指定几何组。 */
  function wallZ(
    list: THREE.BufferGeometry[],
    x: number,
    z0: number,
    y0: number,
    len: number,
    h: number,
    holes: Opening[]
  ): void {
    splitFacade(len, h, holes, (u, v, w, hh) => {
      box(list, WALL_T, hh, w, x, y0 + v, z0 + u)
    })
  }

  /** 功能：给 z 法线洞口加一圈金属窗框（净洞 w × h，框宽 t，框深 0.10）。 */
  function frameX(cx: number, cy: number, cz: number, w: number, h: number, t = 0.05): void {
    const d = 0.1
    box(parts.metal, w + t * 2, t, d, cx, cy + h / 2 + t / 2, cz)
    box(parts.metal, w + t * 2, t, d, cx, cy - h / 2 - t / 2, cz)
    box(parts.metal, t, h, d, cx - w / 2 - t / 2, cy, cz)
    box(parts.metal, t, h, d, cx + w / 2 + t / 2, cy, cz)
  }

  /** 功能：给 x 法线洞口加一圈金属窗框（净洞宽 w 沿 z、高 h，框宽 t）。 */
  function frameZ(cx: number, cy: number, cz: number, w: number, h: number, t = 0.05): void {
    const d = 0.1
    box(parts.metal, d, t, w + t * 2, cx, cy + h / 2 + t / 2, cz)
    box(parts.metal, d, t, w + t * 2, cx, cy - h / 2 - t / 2, cz)
    box(parts.metal, d, h, t, cx, cy, cz - w / 2 - t / 2)
    box(parts.metal, d, h, t, cx, cy, cz + w / 2 + t / 2)
  }

  // —— 基座：清水混凝土勒脚外扩 0.15m，形成 0.30m 室内外高差 ——
  box(parts.concrete, GROUND_W + PLINTH_OVER * 2, PLINTH_H, GROUND_D + PLINTH_OVER * 2, 0, PLINTH_H / 2, 0)

  // —— 一层清水混凝土墙体（厚 0.30m，外墙皮落在 9×7 轮廓上） ——
  // 后墙：横向高窗带 x[-1.5,1.9]，给餐厅补侧光
  wallX(parts.concrete, -HZ + WALL_T / 2, -HX, PLINTH_TOP, GROUND_W, FLOOR_H, [
    { u0: 3.0, u1: 6.4, v0: 1.25, v1: 2.15 }
  ])
  // 左山墙：横向长窗 z[-1.6,1.2]
  wallZ(parts.concrete, -HX + WALL_T / 2, -HZ, PLINTH_TOP, GROUND_D, FLOOR_H, [
    { u0: 1.9, u1: 4.7, v0: 1.3, v1: 2.1 }
  ])
  // 右山墙：只保留后段 z[-3.5,-0.6]（前段让给转角玻璃），带一条高窗 z[-3.1,-1.3]
  wallZ(parts.concrete, HX - WALL_T / 2, -HZ, PLINTH_TOP, 2.9, FLOOR_H, [{ u0: 0.4, u1: 2.2, v0: 1.4, v1: 2.1 }])
  // 正立面左端实墙 x[-4.5,-2.6]：一条竖长窗缝，夜里把室内暖光透到左前场
  wallX(parts.concrete, HZ - WALL_T / 2, -HX, PLINTH_TOP, ENTRY_X0 - WALL_T + HX, FLOOR_H, [
    { u0: 0.35, u1: 0.85, v0: 0.5, v1: 2.75 }
  ])

  // —— 入口内凹：两侧 0.30m 厚混凝土夹壁（z 2.4~3.5），后墙带门洞 + 竖窗缝 ——
  const RECESS_D = HZ - ENTRY_Z0
  box(
    parts.concrete,
    WALL_T,
    FLOOR_H,
    RECESS_D,
    ENTRY_X0 - WALL_T / 2,
    PLINTH_TOP + FLOOR_H / 2,
    ENTRY_Z0 + RECESS_D / 2
  )
  box(
    parts.concrete,
    WALL_T,
    FLOOR_H,
    RECESS_D,
    ENTRY_X1 + WALL_T / 2,
    PLINTH_TOP + FLOOR_H / 2,
    ENTRY_Z0 + RECESS_D / 2
  )
  // 内凹后墙：门洞 x[-1.85,-0.75]（宽 1.1、高 2.15）+ 右侧竖窗缝 x[-0.65,-0.3]
  wallX(parts.concrete, ENTRY_Z0 - WALL_T / 2, ENTRY_X0 - WALL_T, PLINTH_TOP, ENTRY_X1 - ENTRY_X0 + WALL_T * 2, FLOOR_H, [
    { u0: 0.75, u1: 1.85, v0: 0, v1: DOOR_H },
    { u0: 1.95, u1: 2.3, v0: 0, v1: DOOR_H }
  ])
  // 门：木饰面门板挂在墙外皮，留 0.03m 阴影缝；竖向金属拉手
  box(parts.wood, DOOR_W - 0.04, DOOR_H - 0.04, 0.06, DOOR_CX, PLINTH_TOP + (DOOR_H - 0.04) / 2, ENTRY_Z0 + 0.03)
  box(parts.metal, 0.03, 0.36, 0.03, DOOR_CX + DOOR_W / 2 - 0.14, PLINTH_TOP + 1.22, ENTRY_Z0 + 0.08)
  // 门侧竖窗玻璃 + 窗框
  box(parts.glass, 0.3, DOOR_H, GLASS_T, -0.475, PLINTH_TOP + DOOR_H / 2, 2.36)
  frameX(-0.475, PLINTH_TOP + DOOR_H / 2, 2.35, 0.3, DOOR_H)
  // 入口内凹地坪（paving）：从门底铺到基座前缘，成为 1.25m 深的门前平台
  box(parts.paving, ENTRY_X1 - ENTRY_X0, 0.03, HZ + PLINTH_OVER - ENTRY_Z0, -1.3, PLINTH_TOP + 0.015, 3.025)

  // —— 入口混凝土台阶：两级（3.65~4.10 顶 0.20 / 4.10~4.55 顶 0.10） ——
  box(parts.concrete, ENTRY_X1 - ENTRY_X0, 0.2, 0.45, -1.3, 0.1, HZ + PLINTH_OVER + 0.225)
  box(parts.concrete, ENTRY_X1 - ENTRY_X0, 0.1, 0.45, -1.3, 0.05, HZ + PLINTH_OVER + 0.675)

  // —— 入口雨棚：y 3.24~3.40 的混凝土挑板，与二层楼板底平接（两端锚进内凹侧壁） ——
  const CANOPY_BOTTOM = 3.24
  box(parts.concrete, 2.8, L1_TOP - CANOPY_BOTTOM, 1.3, -1.3, (CANOPY_BOTTOM + L1_TOP) / 2, 4.15)
  // 檐口金属滴水边
  box(parts.metal, 2.82, 0.03, 0.08, -1.3, CANOPY_BOTTOM - 0.015, 4.76)
  // 雨棚下照灯 2 盏
  for (const x of [-2.2, -0.4]) {
    box(parts.metal, 0.12, 0.02, 0.12, x, CANOPY_BOTTOM - 0.01, 4.45)
    box(parts.lamp, 0.09, 0.012, 0.09, x, CANOPY_BOTTOM - 0.024, 4.45)
  }
  // 内凹顶面筒灯 2 盏
  for (const x of [-2.15, -0.45]) {
    box(parts.metal, 0.14, 0.03, 0.14, x, L1_TOP - 0.015, 2.95)
    box(parts.lamp, 0.1, 0.01, 0.1, x, L1_TOP - 0.035, 2.95)
  }

  // —— 落地玻璃幕墙（一层）：正立面 x[0,4.44] + 右侧转角 z[-0.6,3.38] ——
  const FRONT_GLASS_X0 = 0
  const FRONT_GLASS_X1 = 4.44
  const FRONT_GLASS_Z = 3.36
  box(
    parts.glass,
    FRONT_GLASS_X1 - FRONT_GLASS_X0,
    FLOOR_H,
    GLASS_T,
    (FRONT_GLASS_X0 + FRONT_GLASS_X1) / 2,
    PLINTH_TOP + FLOOR_H / 2,
    FRONT_GLASS_Z
  )
  // 竖梃 5 根（含两端，分 4 个开间）
  for (let i = 0; i <= 4; i++) {
    const x = FRONT_GLASS_X0 + (FRONT_GLASS_X1 - FRONT_GLASS_X0) * (i / 4)
    box(parts.metal, 0.06, FLOOR_H, 0.14, x, PLINTH_TOP + FLOOR_H / 2, FRONT_GLASS_Z)
  }
  // 横梃 4 根
  for (const y of [PLINTH_TOP + 0.06, 1.35, 2.34, L1_TOP - 0.06]) {
    box(parts.metal, FRONT_GLASS_X1 - FRONT_GLASS_X0, 0.06, 0.14, (FRONT_GLASS_X0 + FRONT_GLASS_X1) / 2, y, FRONT_GLASS_Z)
  }
  const SIDE_GLASS_X = 4.42
  const SIDE_GLASS_Z0 = -0.6
  const SIDE_GLASS_Z1 = 3.38
  box(
    parts.glass,
    GLASS_T,
    FLOOR_H,
    SIDE_GLASS_Z1 - SIDE_GLASS_Z0,
    SIDE_GLASS_X,
    PLINTH_TOP + FLOOR_H / 2,
    (SIDE_GLASS_Z0 + SIDE_GLASS_Z1) / 2
  )
  for (let i = 0; i <= 4; i++) {
    const z = SIDE_GLASS_Z0 + (SIDE_GLASS_Z1 - SIDE_GLASS_Z0) * (i / 4)
    box(parts.metal, 0.14, FLOOR_H, 0.06, SIDE_GLASS_X, PLINTH_TOP + FLOOR_H / 2, z)
  }
  for (const y of [PLINTH_TOP + 0.06, 1.35, 2.34, L1_TOP - 0.06]) {
    box(parts.metal, 0.14, 0.06, SIDE_GLASS_Z1 - SIDE_GLASS_Z0, SIDE_GLASS_X, y, (SIDE_GLASS_Z0 + SIDE_GLASS_Z1) / 2)
  }

  // —— 其余洞口玻璃 + 金属窗框（后墙高窗 / 左右山墙横窗 / 正立面竖缝） ——
  box(parts.glass, 3.4, 0.9, GLASS_T, 0.2, 2.0, -3.34)
  frameX(0.2, 2.0, -3.35, 3.4, 0.9)
  box(parts.glass, GLASS_T, 0.8, 2.8, -4.34, 2.0, -0.2)
  frameZ(-4.35, 2.0, -0.2, 2.8, 0.8)
  box(parts.glass, GLASS_T, 0.7, 1.8, 4.34, 2.05, -2.2)
  frameZ(4.35, 2.05, -2.2, 1.8, 0.7)
  box(parts.glass, 0.5, 2.25, GLASS_T, -3.9, 1.925, 3.34)
  frameX(-3.9, 1.925, 3.35, 0.5, 2.25)

  // —— 二层：悬挑木饰面体量（侧挑 0.2 / 前挑 1.1 / 后挑 0.1）+ 二层楼板 3.40~3.75 ——
  box(parts.concrete, UX * 2, SLAB_T, UZ1 - UZ0, 0, L1_TOP + SLAB_T / 2, (UZ0 + UZ1) / 2)
  // 正立面木墙：中部横向长窗 x[-0.5,4.2] × y[4.2,6.5]
  wallX(parts.wood, UZ1 - WALL_T / 2, -UX, L2_BASE, UX * 2, FLOOR_H, [{ u0: 4.2, u1: 8.9, v0: 0.45, v1: 2.75 }])
  // 背立面：整片木饰面
  wallX(parts.wood, UZ0 + WALL_T / 2, -UX, L2_BASE, UX * 2, FLOOR_H, [])
  // 左山墙：横向长窗 z[-1.8,1.4] × y[4.45,5.95]
  wallZ(parts.wood, -UX + WALL_T / 2, UZ0, L2_BASE, UZ1 - UZ0, FLOOR_H, [{ u0: 1.8, u1: 5.0, v0: 0.7, v1: 2.2 }])
  // 右山墙：竖向长窗 z[-0.8,2.2]
  wallZ(parts.wood, UX - WALL_T / 2, UZ0, L2_BASE, UZ1 - UZ0, FLOOR_H, [{ u0: 2.8, u1: 5.8, v0: 0.7, v1: 2.2 }])
  // 长窗玻璃 + 金属竖梃 4 根 / 横梃 3 根
  box(parts.glass, 4.7, 2.3, GLASS_T, 1.85, 5.35, 4.5)
  for (let i = 0; i <= 4; i++) {
    const x = -0.5 + 4.7 * (i / 4)
    box(parts.metal, 0.05, 2.3, 0.12, x, 5.35, 4.5)
  }
  for (const y of [4.2, 5.35, 6.5]) {
    box(parts.metal, 4.7, 0.05, 0.12, 1.85, y, 4.5)
  }
  // 侧墙长窗玻璃 + 窗框
  box(parts.glass, GLASS_T, 1.5, 3.2, -4.62, 5.2, -0.2)
  frameZ(-4.6, 5.2, -0.2, 3.2, 1.5)
  box(parts.glass, GLASS_T, 1.5, 3, 4.62, 5.2, 0.7)
  frameZ(4.6, 5.2, 0.7, 3, 1.5)
  // 木格栅竖向遮阳：17 根 0.07×2.88×0.20，间距约 0.309m，离墙 0.18m
  const FIN_X0 = -0.62
  const FIN_X1 = 4.32
  const FIN_N = 17
  for (let i = 0; i < FIN_N; i++) {
    const x = FIN_X0 + (FIN_X1 - FIN_X0) * (i / (FIN_N - 1))
    box(parts.wood, 0.07, 2.88, 0.2, x, 5.34, UZ1 + 0.18)
  }
  // 格栅上下金属槽
  box(parts.metal, FIN_X1 - FIN_X0 + 0.2, 0.05, 0.24, (FIN_X0 + FIN_X1) / 2, 6.805, UZ1 + 0.18)
  box(parts.metal, FIN_X1 - FIN_X0 + 0.2, 0.05, 0.24, (FIN_X0 + FIN_X1) / 2, 3.875, UZ1 + 0.18)

  // —— 平屋顶：屋面板 6.85~7.20（挑檐 0.35）+ 女儿墙 7.20~7.82 + 金属压顶 7.82~7.88 ——
  box(parts.concrete, RX * 2, SLAB_T, RZ1 - RZ0, 0, L2_TOP + SLAB_T / 2, (RZ0 + RZ1) / 2)
  const PARAPET_CY = ROOF_TOP + PARAPET_H / 2
  box(parts.concrete, RX * 2, PARAPET_H, PARAPET_T, 0, PARAPET_CY, RZ1 - PARAPET_T / 2)
  box(parts.concrete, RX * 2, PARAPET_H, PARAPET_T, 0, PARAPET_CY, RZ0 + PARAPET_T / 2)
  box(parts.concrete, PARAPET_T, PARAPET_H, RZ1 - RZ0, -RX + PARAPET_T / 2, PARAPET_CY, (RZ0 + RZ1) / 2)
  box(parts.concrete, PARAPET_T, PARAPET_H, RZ1 - RZ0, RX - PARAPET_T / 2, PARAPET_CY, (RZ0 + RZ1) / 2)
  const COPING_CY = PARAPET_TOP + COPING_T / 2
  box(parts.metal, RX * 2 + 0.18, COPING_T, 0.28, 0, COPING_CY, RZ1 - 0.09)
  box(parts.metal, RX * 2 + 0.18, COPING_T, 0.28, 0, COPING_CY, RZ0 + 0.09)
  box(parts.metal, 0.28, COPING_T, RZ1 - RZ0 + 0.18, -RX + 0.09, COPING_CY, (RZ0 + RZ1) / 2)
  box(parts.metal, 0.28, COPING_T, RZ1 - RZ0 + 0.18, RX - 0.09, COPING_CY, (RZ0 + RZ1) / 2)

  // —— 积雪：屋面 + 女儿墙压顶顶面（opacity 由 environment 每帧写） ——
  box(parts.snow, RX * 2 - PARAPET_T * 2, 0.03, RZ1 - RZ0 - PARAPET_T * 2, 0, ROOF_TOP + 0.015, (RZ0 + RZ1) / 2)
  for (const z of [RZ1 - PARAPET_T / 2, RZ0 + PARAPET_T / 2]) {
    box(parts.snow, RX * 2, 0.03, PARAPET_T, 0, PARAPET_TOP + COPING_T + 0.015, z)
  }
  for (const x of [-RX + PARAPET_T / 2, RX - PARAPET_T / 2]) {
    box(
      parts.snow,
      PARAPET_T,
      0.03,
      RZ1 - RZ0 - PARAPET_T * 2,
      x,
      PARAPET_TOP + COPING_T + 0.015,
      (RZ0 + RZ1) / 2
    )
  }

  // —— 屋顶线性灯槽：一条洗亮二层木格栅，一条洗亮露台 ——
  box(parts.lamp, 8.6, 0.03, 0.06, 0, L2_TOP - 0.015, UZ1 + 0.1)
  box(parts.lamp, 4.4, 0.03, 0.06, 2.2, L1_TOP - 0.015, UZ1 - 0.12)

  // —— 露台木平台：实体基座落地（顶面 0.28m），不架空 ——
  box(
    parts.deck,
    DECK_X1 - DECK_X0,
    DECK_TOP,
    DECK_Z1 - DECK_Z0,
    (DECK_X0 + DECK_X1) / 2,
    DECK_TOP / 2,
    (DECK_Z0 + DECK_Z1) / 2
  )
  // 细钢栏杆：0.025 方钢竖杆间距约 0.115m，扶手高 1.0m
  const RAIL_Y = DECK_TOP + RAIL_H
  box(parts.metal, DECK_X1 - DECK_X0 + 0.05, 0.05, 0.05, (DECK_X0 + DECK_X1) / 2, RAIL_Y, DECK_Z1)
  box(parts.metal, 0.05, 0.05, DECK_Z1 - DECK_Z0, DECK_X1, RAIL_Y, (DECK_Z0 + DECK_Z1) / 2)
  const FRONT_N = 42
  for (let i = 0; i < FRONT_N; i++) {
    const x = DECK_X0 + (DECK_X1 - DECK_X0) * (i / (FRONT_N - 1))
    box(parts.metal, 0.025, RAIL_H, 0.025, x, DECK_TOP + RAIL_H / 2, DECK_Z1)
  }
  const SIDE_N = 22
  for (let i = 0; i < SIDE_N; i++) {
    const z = DECK_Z0 + (DECK_Z1 - DECK_Z0) * (i / (SIDE_N - 1))
    box(parts.metal, 0.025, RAIL_H, 0.025, DECK_X1, DECK_TOP + RAIL_H / 2, z)
  }
  for (const [px, pz] of [
    [DECK_X0, DECK_Z1],
    [DECK_X1, DECK_Z1],
    [DECK_X1, DECK_Z0]
  ]) {
    box(parts.metal, 0.06, RAIL_H + 0.03, 0.06, px, DECK_TOP + (RAIL_H + 0.03) / 2, pz)
  }
  box(parts.metal, DECK_X1 - DECK_X0, 0.04, 0.04, (DECK_X0 + DECK_X1) / 2, DECK_TOP + 0.06, DECK_Z1)
  box(parts.metal, 0.04, 0.04, DECK_Z1 - DECK_Z0, DECK_X1, DECK_TOP + 0.06, (DECK_Z0 + DECK_Z1) / 2)

  // —— 壁灯：正立面左墙一对、左右山墙各一对（灯体与墙面留 0.07m 缝，避开窗洞） ——
  for (const x of [-3.45, -2.8]) {
    box(parts.metal, 0.06, 0.06, 0.16, x, 2.3, HZ + 0.05)
    box(parts.lamp, 0.08, 0.26, 0.06, x, 2.16, HZ + 0.12)
  }
  for (const z of [-2.6, 1.8]) {
    box(parts.metal, 0.16, 0.06, 0.06, -HX - 0.05, 2.3, z)
    box(parts.lamp, 0.06, 0.26, 0.08, -HX - 0.12, 2.16, z)
  }
  for (const z of [-3.35, -0.95]) {
    box(parts.metal, 0.16, 0.06, 0.06, HX + 0.05, 2.3, z)
    box(parts.lamp, 0.06, 0.26, 0.08, HX + 0.12, 2.16, z)
  }

  // —— 室内背衬壳：墙是单面盒体，没有内表面，透过玻璃会直接看到天空（窗户一片死白） ——
  // 用 side: BackSide 的盒体衬在墙内侧：从外面透过玻璃看到的是壳的内表面，给出室内景深与暗部
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x2b2622,
    roughness: 0.95,
    metalness: 0,
    side: THREE.BackSide
  })
  const SHELL_IN_X = HX - WALL_T
  const shellLower = new THREE.Mesh(
    new THREE.BoxGeometry(
      SHELL_IN_X * 2 - 0.02,
      FLOOR_H - 0.04,
      ENTRY_Z0 - 0.1 + (HZ - WALL_T) - 0.02
    ),
    shellMat
  )
  shellLower.position.set(0, PLINTH_TOP + FLOOR_H / 2, (-(HZ - WALL_T) + ENTRY_Z0 - 0.1) / 2)
  shellLower.receiveShadow = true
  group.add(shellLower)
  const SHELL_UP_X = UX - WALL_T
  const shellUpper = new THREE.Mesh(
    new THREE.BoxGeometry(SHELL_UP_X * 2 - 0.02, FLOOR_H - 0.04, UZ1 - UZ0 - WALL_T * 2 - 0.02),
    shellMat
  )
  shellUpper.position.set(0, L2_BASE + FLOOR_H / 2, (UZ0 + UZ1) / 2)
  shellUpper.receiveShadow = true
  group.add(shellUpper)

  // —— 按材质合并：8 个 Mesh（castShadow / receiveShadow 按构件性质给） ——
  const merged: [THREE.BufferGeometry[], THREE.Material, boolean, boolean][] = [
    [parts.concrete, concreteMat, true, true],
    [parts.wood, woodMat, true, true],
    [parts.deck, deckMat, true, true],
    [parts.metal, metalMat, true, true],
    [parts.paving, pathMat, false, true],
    [parts.glass, glassMat, false, false],
    [parts.snow, roofSnowMat, false, true],
    [parts.lamp, lampMat, false, false]
  ]
  for (const [list, mat, cast, receive] of merged) {
    if (list.length === 0) continue
    // 合并前统一转非索引（BoxGeometry 带 index，属性集合不一致时 merge 会返回 null）
    const geo = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))
    if (geo === null) continue
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = cast
    mesh.receiveShadow = receive
    group.add(mesh)
  }

  return {
    group,
    mats: { glassMat, roofSnowMat, pathMat, lampMat, metalMat, concreteMat, floorMat, woodMat }
  }
}
