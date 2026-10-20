import type { QualityCaps, QualityTier } from '../types'
import {
  DPR_STEP,
  QUALITY_CAPS,
  TIER_MIN_CORES,
  TIER_MIN_CORES_LOW,
  TIER_PIXEL_LOW,
  TIER_PIXEL_MID,
  WATCHDOG_FAST_FRAMES,
  WATCHDOG_SLOW_FRAMES,
  WATCHDOG_TIER_FRAMES
} from '../config'

/** 档位由优到劣，供看门狗按索引上下移动 */
const ORDER: readonly QualityTier[] = ['high', 'mid', 'low']

/** 设备初判输入：物理像素总数决定像素预算，逻辑核数兜底弱机 */
export interface DeviceHints {
  devicePixelRatio: number
  width: number
  height: number
  cores: number
}

/**
 * 功能：按设备特征给出起始画质档位。
 * 参数：hints 物理分辨率、像素比与逻辑核数。
 * 返回：high 强机 / mid 一般 / low 弱机。
 * 说明：宁高不宁低——初判只拦"明显撑不住"的设备，其余交给帧率看门狗回调降级。
 */
export function pickInitialTier(hints: DeviceHints): QualityTier {
  const px = hints.width * hints.height * hints.devicePixelRatio * hints.devicePixelRatio
  if (hints.cores <= TIER_MIN_CORES_LOW || px > TIER_PIXEL_LOW) return 'low'
  if (hints.cores <= TIER_MIN_CORES || px > TIER_PIXEL_MID) return 'mid'
  return 'high'
}

/**
 * 功能：把像素比钳进某个档位允许的区间。
 * 参数：dpr 待钳制的像素比，tier 目标档位。
 * 返回：落在 [dprMin, dprMax] 内的像素比。
 */
export function clampDprForTier(dpr: number, tier: QualityTier): number {
  const caps: QualityCaps = QUALITY_CAPS[tier]
  return Math.min(caps.dprMax, Math.max(caps.dprMin, dpr))
}

/** 看门狗的输入：当前档位/像素比 + 连续慢帧与快帧计数 */
export interface WatchdogInput {
  tier: QualityTier
  dpr: number
  slowFrames: number
  fastFrames: number
}

/** 看门狗的决策结果：变化时 changed 为真，调用方据此重设画布与后处理 */
export interface WatchdogResult {
  tier: QualityTier
  dpr: number
  changed: boolean
}

/**
 * 功能：根据帧时长统计给出下一步画质决策（纯函数，便于单测）。
 * 参数：input 当前档位/像素比与连续慢帧、快帧计数。
 * 返回：下一档位与实际像素比；无需调整时 changed 为 false。
 * 策略：降级先粗后细（先降档，档到底才降像素比），回升先细后粗
 *      （先把像素比升到本档上限，再等更长的快帧窗口升档），避免阈值附近振荡。
 */
export function watchdogStep(input: WatchdogInput): WatchdogResult {
  const { tier, dpr, slowFrames, fastFrames } = input
  const idx = ORDER.indexOf(tier)

  if (slowFrames >= WATCHDOG_SLOW_FRAMES) {
    if (idx < ORDER.length - 1) {
      const next = ORDER[idx + 1]
      return { tier: next, dpr: clampDprForTier(dpr, next), changed: true }
    }
    const next = Math.max(QUALITY_CAPS[tier].dprMin, dpr - DPR_STEP)
    return next === dpr ? { tier, dpr, changed: false } : { tier, dpr: next, changed: true }
  }

  if (fastFrames >= WATCHDOG_FAST_FRAMES) {
    const caps: QualityCaps = QUALITY_CAPS[tier]
    if (dpr < caps.dprMax) {
      return { tier, dpr: Math.min(caps.dprMax, dpr + DPR_STEP), changed: true }
    }
  }

  if (fastFrames >= WATCHDOG_TIER_FRAMES && idx > 0) {
    const prev = ORDER[idx - 1]
    return { tier: prev, dpr: clampDprForTier(dpr, prev), changed: true }
  }

  return { tier, dpr, changed: false }
}
