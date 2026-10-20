import type { Season } from '../types'

/** 季节日出/日落（小时）与正午最大太阳仰角（度） */
export const SUNRISE: Record<Season, number> = { sp: 6.0, su: 5.5, au: 6.5, wi: 7.5 }
export const SUNSET: Record<Season, number> = { sp: 18.0, su: 19.0, au: 17.5, wi: 17.0 }
export const MAX_ELEV: Record<Season, number> = { sp: 60, su: 75, au: 45, wi: 30 }

/** 太阳午夜最低仰角（度） */
const NIGHT_FLOOR = -25

/**
 * 计算给定时刻与季节的太阳仰角/方位角。
 * 白天：正弦弧线，日出/日落处为 0°，正午达到季节峰值；
 * 夜间：三角波，太阳午夜降至 NIGHT_FLOOR；
 * 方位角：在 (日出-1.5h, 日落+1.5h) 区间从 +115° 匀速扫到 -115°，区间外钳制。
 */
export function sunAngle(hour: number, season: Season): { elev: number; azim: number } {
  const sr = SUNRISE[season]
  const ss = SUNSET[season]
  let elev: number
  if (hour >= sr && hour <= ss) {
    elev = MAX_ELEV[season] * Math.sin((Math.PI * (hour - sr)) / (ss - sr))
  } else {
    // 夜间时长对折，午夜最低：三角波保证日出/日落处连续为 0
    const nightLen = 24 - (ss - sr)
    const nh = hour > ss ? hour - ss : hour + 24 - ss
    const half = nightLen / 2
    elev = NIGHT_FLOOR * (1 - Math.abs(nh - half) / half)
  }
  // 方位角：日出 +115° → 正午 0°（正南）→ 日落 -115°，跨度按当日昼长归一，
  // 使四季日出/日落方位一致（此前用固定 ±1.5h 偏移，导致夏季日出反而更偏南）
  const t = clamp01((hour - sr) / (ss - sr))
  const azim = 115 + (-230) * t
  return { elev, azim }
}

/**
 * 直射日光开关：太阳落到地平线以下后不再产生直射光。
 * 用于消除"夜锚点→晨锚点"长直线插值造成的深夜过冲（太阳未升起却已有日照）。
 * @param elev 太阳仰角（度）
 * @returns 0..1，-6° 以下为 0、+4° 以上为 1，之间 smoothstep 过渡
 */
export function daylight(elev: number): number {
  const t = clamp01((elev + 6) / 10)
  return t * t * (3 - 2 * t)
}

/** 室内灯亮度：太阳仰角 >4° 全灭、<-3° 全亮，之间 smoothstep 渐变 */
export function lampLevel(elev: number): number {
  const t = clamp01((4 - elev) / 7)
  return t * t * (3 - 2 * t)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
