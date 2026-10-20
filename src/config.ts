/** 全局常量：集中管理调参入口，禁止在系统内散落魔法数字 */
export const DPR_MAX = 2
export const SHADOW_SIZE = 2048
/** 阴影相机半宽（场景半径约 12，收紧到 14） */
export const SHADOW_HALF = 14
export const PARTICLE_MAX = 540
/** 太阳光源距离（方向 × 该距离） */
export const SUN_DIST = 45
/** 指数缓动速率：k = 1 - e^(-EASE_RATE·dt) */
export const EASE_RATE = 2.4
/** 环境贴图重烘最小间隔（秒） */
export const ENV_INTERVAL = 0.38
/** 自动巡游角速度（rad/s） */
export const TOUR_SPEED = 0.05
/** 换季运镜时长（秒）与总角度（弧度） */
export const SWEEP_SECS = 2.2
export const SWEEP_ANGLE = Math.PI / 3
/** 自适应 DPR：降级/恢复的帧时长阈值（ms） */
export const FRAME_SLOW_MS = 22
export const FRAME_FAST_MS = 15
/** 地面/小径 roughness 跟随 wet 目标的速率（1/s）：按 dt 归一，与帧率无关 */
export const WET_RATE = 5
/** 粒子播撒圆盘半径（米）：大于相机可达范围、小于地面半径 30 */
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
