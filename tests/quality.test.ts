import { describe, expect, it } from 'vitest'
import { clampDprForTier, pickInitialTier, watchdogStep } from '../src/core/quality'
import { QUALITY_CAPS, WATCHDOG_FAST_FRAMES, WATCHDOG_SLOW_FRAMES, WATCHDOG_TIER_FRAMES } from '../src/config'

describe('pickInitialTier 应按设备特征给出起始档位', () => {
  it('1080p + 多核桌面应起步高档', () => {
    expect(pickInitialTier({ devicePixelRatio: 1, width: 1920, height: 1080, cores: 16 })).toBe('high')
  })

  it('2K 像素量仍在预算内，应保持高档', () => {
    expect(pickInitialTier({ devicePixelRatio: 1, width: 2560, height: 1440, cores: 8 })).toBe('high')
  })

  it('Retina 1080p 物理像素过多，应降到中档', () => {
    expect(pickInitialTier({ devicePixelRatio: 2, width: 1920, height: 1080, cores: 8 })).toBe('mid')
  })

  it('4 核及以下按中档起步', () => {
    expect(pickInitialTier({ devicePixelRatio: 1, width: 1920, height: 1080, cores: 4 })).toBe('mid')
  })

  it('双核或超大画布应直接低档起步', () => {
    expect(pickInitialTier({ devicePixelRatio: 1, width: 1280, height: 720, cores: 2 })).toBe('low')
    expect(pickInitialTier({ devicePixelRatio: 3, width: 3840, height: 2160, cores: 16 })).toBe('low')
  })
})

describe('写实后处理开关应随档位递减', () => {
  it('高档开 SSAO + SMAA，中档只留 SMAA，低档全关', () => {
    expect(QUALITY_CAPS.high.ssao).toBe(true)
    expect(QUALITY_CAPS.high.smaa).toBe(true)
    expect(QUALITY_CAPS.mid.ssao).toBe(false)
    expect(QUALITY_CAPS.mid.smaa).toBe(true)
    expect(QUALITY_CAPS.low.ssao).toBe(false)
    expect(QUALITY_CAPS.low.smaa).toBe(false)
  })
})

describe('clampDprForTier 应把像素比钳进档位区间', () => {
  it('过低的值抬到该档下限', () => {
    expect(clampDprForTier(0.5, 'high')).toBe(QUALITY_CAPS.high.dprMin)
    expect(clampDprForTier(0.5, 'low')).toBe(QUALITY_CAPS.low.dprMin)
  })

  it('过高的值压到该档上限', () => {
    expect(clampDprForTier(3, 'mid')).toBe(QUALITY_CAPS.mid.dprMax)
    expect(clampDprForTier(2, 'low')).toBe(QUALITY_CAPS.low.dprMax)
  })
})

describe('watchdogStep 应先降档再降分辨率，回升反之', () => {
  const slow = WATCHDOG_SLOW_FRAMES
  const fast = WATCHDOG_FAST_FRAMES
  const tierFrames = WATCHDOG_TIER_FRAMES

  it('未达判定窗口时应保持不动', () => {
    const r = watchdogStep({ tier: 'high', dpr: 2, slowFrames: slow - 1, fastFrames: 0 })
    expect(r.changed).toBe(false)
    expect(r.tier).toBe('high')
    expect(r.dpr).toBe(2)
  })

  it('高档掉帧应先降档而不是先糊分辨率', () => {
    const r = watchdogStep({ tier: 'high', dpr: 2, slowFrames: slow, fastFrames: 0 })
    expect(r.changed).toBe(true)
    expect(r.tier).toBe('mid')
    expect(r.dpr).toBe(QUALITY_CAPS.mid.dprMax)
  })

  it('低档掉帧才降像素比，降到下限后不再变化', () => {
    const once = watchdogStep({ tier: 'low', dpr: 1, slowFrames: slow, fastFrames: 0 })
    expect(once.tier).toBe('low')
    expect(once.dpr).toBe(QUALITY_CAPS.low.dprMin)
    const again = watchdogStep({ tier: 'low', dpr: QUALITY_CAPS.low.dprMin, slowFrames: slow, fastFrames: 0 })
    expect(again.changed).toBe(false)
  })

  it('快帧应先升像素比', () => {
    const r = watchdogStep({ tier: 'mid', dpr: 1, slowFrames: 0, fastFrames: fast })
    expect(r.changed).toBe(true)
    expect(r.tier).toBe('mid')
    expect(r.dpr).toBe(1.25)
  })

  it('像素比到本档上限后，需更长的快帧窗口才升档', () => {
    const noTierYet = watchdogStep({ tier: 'mid', dpr: QUALITY_CAPS.mid.dprMax, slowFrames: 0, fastFrames: fast })
    expect(noTierYet.changed).toBe(false)
    const tier = watchdogStep({ tier: 'mid', dpr: QUALITY_CAPS.mid.dprMax, slowFrames: 0, fastFrames: tierFrames })
    expect(tier.changed).toBe(true)
    expect(tier.tier).toBe('high')
    expect(tier.dpr).toBe(QUALITY_CAPS.mid.dprMax)
  })

  it('已在最高档且像素比到顶时不应再升', () => {
    const r = watchdogStep({ tier: 'high', dpr: QUALITY_CAPS.high.dprMax, slowFrames: 0, fastFrames: tierFrames })
    expect(r.changed).toBe(false)
  })
})
