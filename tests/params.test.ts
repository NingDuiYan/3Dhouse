import { describe, expect, it } from 'vitest'
import type { Season } from '../src/types'
import { createParams, resolveParams } from '../src/core/state'

const SEASONS: Season[] = ['sp', 'su', 'au', 'wi']

describe('resolveParams 应给出物理自洽的逐时参数', () => {
  it('太阳在地平线以下时不应有直射光强度', () => {
    const p = createParams()
    for (const season of SEASONS) {
      for (const hour of [0, 1, 2, 3, 4]) {
        resolveParams({ hour, season, weather: 'clear' }, p)
        if (p.elev < 0) expect(p.sunInt).toBeCloseTo(0, 5)
      }
    }
  })

  it('冬季默认积雪，其余季节晴天不积雪', () => {
    const p = createParams()
    resolveParams({ hour: 12, season: 'wi', weather: 'clear' }, p)
    expect(p.snow).toBe(1)
    resolveParams({ hour: 12, season: 'au', weather: 'clear' }, p)
    expect(p.snow).toBe(0)
  })

  it('雪天任何季节都应积雪', () => {
    const p = createParams()
    resolveParams({ hour: 12, season: 'su', weather: 'snow' }, p)
    expect(p.snow).toBe(1)
  })

  it('室内灯在正午全灭、午夜全亮', () => {
    const p = createParams()
    resolveParams({ hour: 12, season: 'au', weather: 'clear' }, p)
    expect(p.lamp).toBe(0)
    resolveParams({ hour: 0, season: 'au', weather: 'clear' }, p)
    expect(p.lamp).toBe(1)
  })

  it('半球光强度应四季恒为正（环境光不能被关掉）', () => {
    const p = createParams()
    for (const season of SEASONS) {
      for (let hour = 0; hour <= 24; hour += 2) {
        resolveParams({ hour, season, weather: 'clear' }, p)
        expect(p.hemiInt).toBeGreaterThan(0)
      }
    }
  })

  it('雾密度应始终落在合理区间', () => {
    const p = createParams()
    for (const season of SEASONS) {
      for (const weather of ['clear', 'cloudy', 'rain', 'snow'] as const) {
        for (let hour = 0; hour <= 24; hour += 2) {
          resolveParams({ hour, season, weather }, p)
          expect(p.fogD).toBeGreaterThan(0)
          expect(p.fogD).toBeLessThanOrEqual(0.06)
        }
      }
    }
  })
})
