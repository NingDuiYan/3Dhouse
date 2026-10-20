import type { QualityCaps, QualityTier } from './types'

/** 全局常量：集中管理调参入口，禁止在系统内散落魔法数字 */
export const DPR_MAX = 2
export const SHADOW_SIZE = 2048
/** 阴影相机半宽：低太阳角下房屋阴影会拉长到几十米，14 会在阴影贴图边界切出直边，
 *  取 26 覆盖可见近景（2048 贴图下每像素约 2.5cm，仍足够锐利） */
export const SHADOW_HALF = 26
export const PARTICLE_MAX = 540
/** 太阳光源距离（方向 × 该距离） */
export const SUN_DIST = 45
/** 指数缓动速率：k = 1 - e^(-EASE_RATE·dt) */
export const EASE_RATE = 2.4
/** 缓动用的帧时长上限（秒）：低帧率设备上缓动也按真实时间走，但避免切后台回来瞬变 */
export const MAX_EASE_DT = 0.25
/** 环境贴图重烘最小间隔（秒） */
export const ENV_INTERVAL = 0.38
/** 自动巡游角速度（rad/s） */
export const TOUR_SPEED = 0.05
/** 换季运镜时长（秒）与总角度（弧度）：角度小一些，转完仍保持建筑主构图 */
export const SWEEP_SECS = 2.2
export const SWEEP_ANGLE = Math.PI / 10
/** 自适应 DPR：降级/恢复的帧时长阈值（ms） */
export const FRAME_SLOW_MS = 22
export const FRAME_FAST_MS = 15
/** 地面/小径 roughness 跟随 wet 目标的速率（1/s）：按 dt 归一，与帧率无关 */
export const WET_RATE = 5
/** 粒子播撒圆盘半径（米）：大于相机可达范围、远小于地面半径 */
export const PARTICLE_RADIUS = 18
/** 积雪层透明度：地面 / 屋顶（snow=1 时） */
export const SNOW_GROUND_OPACITY = 0.92
export const SNOW_ROOF_OPACITY = 0.85
/** 室内灯：点光强度/照射半径/衰减，灯泡与窗玻璃自发光系数（均乘以 lamp） */
export const INTERIOR_LIGHT_INTENSITY = 50
export const INTERIOR_LIGHT_DISTANCE = 7
export const INTERIOR_LIGHT_DECAY = 2
export const BULB_EMISSIVE = 5
export const GLASS_EMISSIVE = 0.35

/** 帧率看门狗：连续慢帧/快帧的判定窗口（帧），像素比步长 */
export const WATCHDOG_SLOW_FRAMES = 90
export const WATCHDOG_FAST_FRAMES = 240
/** 升档需要更长的快帧窗口：比升像素比更保守，避免在阈值附近振荡 */
export const WATCHDOG_TIER_FRAMES = 420
export const DPR_STEP = 0.25

/** 设备初判阈值：物理像素总数（超过即降一档 / 直接落到低档）与逻辑核数下限 */
export const TIER_PIXEL_MID = 6000000
export const TIER_PIXEL_LOW = 20000000
export const TIER_MIN_CORES = 4
export const TIER_MIN_CORES_LOW = 2

/** 三档画质上限：high 即改动前的默认观感，弱机由此降级 */
export const QUALITY_CAPS: Record<QualityTier, QualityCaps> = {
  high: { dprMin: 1, dprMax: DPR_MAX, shadowSize: SHADOW_SIZE, bloomScale: 1, envInterval: ENV_INTERVAL, ssao: true, smaa: true },
  mid: { dprMin: 1, dprMax: 1.5, shadowSize: 1024, bloomScale: 0.5, envInterval: 0.55, ssao: false, smaa: true },
  low: { dprMin: 0.75, dprMax: 1, shadowSize: 1024, bloomScale: 0, envInterval: 0.9, ssao: false, smaa: false }
}

/** 平行光强度低于该值时停更阴影贴图：夜间投影矩阵不变，省下一次全屏深度 Pass */
export const SHADOW_MIN_INTENSITY = 0.02

/** 地面圆盘半径（米）与径向分段：半径需让边缘落进雾里，分段保证边缘平滑 */
export const GROUND_RADIUS = 160
export const GROUND_SEGMENTS = 96
/** 草地贴图单块覆盖的实际米数：半径变化时据此反算 repeat，保持细节密度不变 */
export const GROUND_TILE_METERS = 4.3
/** 地面贴图各向异性上限（掠射角下抑制远处摩尔纹） */
export const GROUND_ANISOTROPY_MAX = 8
/** 雾密度下限：保证远处地面圆盘边缘被雾吃掉，不露出硬边 */
export const FOG_MIN_DENSITY = 0.012

/** 云色混入太阳色的比例（日落时云被暖光染色）与中性基色 */
export const CLOUD_SUN_MIX = 0.55
export const CLOUD_NEUTRAL = 0xcfd6e0

/** 门廊灯自发光系数（乘以 lamp） */
export const PORCH_LAMP_EMISSIVE = 3.2

/** —— 写实风格重构：地形 / 相机 / 后处理 —— */
/** 地面平面尺寸与细分：近处平整、远处起伏，靠细分把山坡做出来 */
export const TERRAIN_SIZE = 340
export const TERRAIN_SEGMENTS = 160
/** 平坦区半径（米）：房屋与庭院范围内保持水平
 *  取 78：丘陵从远景树线（60~110m）附近才开始抬升，避免近处出现又陡又大的低模坡面 */
export const TERRAIN_FLAT_RADIUS = 78
/** 平坦区到丘陵的过渡宽度（米）：过渡越长坡越缓，天际线越平滑 */
export const TERRAIN_BLEND = 120
/** 地形起伏最大高度（米）与噪声尺度（米） */
export const TERRAIN_HILL_HEIGHT = 3.0
export const TERRAIN_HILL_SCALE = 80
/** 坡面自阴影强度（0~1）：按法线朝上程度压暗陡坡，消除"平板薄片"观感 */
export const TERRAIN_SLOPE_DARK = 0.42
/** 远景山体半径与高度（米）：只做天际线，位于雾中 */
export const RIDGE_RADIUS = 150
export const RIDGE_HEIGHT = 16

/** 相机：写实建筑摄影常用的长焦观感（视场角更小、机位更接近人眼高度） */
export const CAMERA_FOV = 38
export const CAMERA_POS = { x: 13.5, y: 4.4, z: 15.5 } as const
export const CAMERA_TARGET = { x: 0, y: 2.4, z: 0 } as const
/** 视距范围（米）：下限保证不穿墙，上限覆盖庭院 */
export const CAMERA_MIN_DISTANCE = 6
export const CAMERA_MAX_DISTANCE = 30

/** SSAO 采样参数：半径越大越"软"，min/max 距离限定在近处接触阴影 */
export const SSAO_KERNEL_RADIUS = 0.42
export const SSAO_MIN_DISTANCE = 0.0018
export const SSAO_MAX_DISTANCE = 0.06

/** 室内暖光外溢（露台 / 入口夜景）：点光强度（乘 lamp）与作用半径（米），与 garden 灯柱亮度一起配平 */
export const INTERIOR_SPILL_INTENSITY = 16
export const INTERIOR_SPILL_DISTANCE = 5.5
