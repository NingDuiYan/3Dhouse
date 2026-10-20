import { describe, expect, it } from 'vitest'
import { MAX_ELEV, SUNRISE, SUNSET, sunAngle } from '../src/core/solar'

describe('sunAngle 应按季节与时刻给出太阳几何', () => {
  it('太阳弧中点仰角应等于季节峰值', () => {
    for (const s of ['sp', 'su', 'au', 'wi'] as const) {
      const mid = (SUNRISE[s] + SUNSET[s]) / 2
      expect(sunAngle(mid, s).elev).toBeCloseTo(MAX_ELEV[s], 5)
    }
  })

  it('日出/日落时刻仰角应为 0', () => {
    expect(sunAngle(SUNRISE.au, 'au').elev).toBeCloseTo(0, 5)
    expect(sunAngle(SUNSET.au, 'au').elev).toBeCloseTo(0, 5)
  })

  it('夜间仰角应为负值', () => {
    expect(sunAngle(0, 'au').elev).toBeLessThan(0)
    expect(sunAngle(23.9, 'sp').elev).toBeLessThan(0)
    expect(sunAngle(3, 'wi').elev).toBeLessThan(0)
  })

  it('白天方位角应从东向西单调递减', () => {
    let prev = sunAngle(SUNRISE.sp, 'sp').azim
    for (let h = SUNRISE.sp + 0.5; h <= SUNSET.sp; h += 0.5) {
      const a = sunAngle(h, 'sp').azim
      expect(a).toBeLessThanOrEqual(prev + 1e-9)
      prev = a
    }
  })

  it('正午方位角应接近 0（正南）', () => {
    for (const s of ['sp', 'su', 'au', 'wi'] as const) {
      const mid = (SUNRISE[s] + SUNSET[s]) / 2
      expect(Math.abs(sunAngle(mid, s).azim)).toBeLessThan(1)
    }
  })

  it('日出方位角应四季一致（不随昼长漂移）', () => {
    for (const s of ['sp', 'su', 'au', 'wi'] as const) {
      expect(sunAngle(SUNRISE[s], s).azim).toBeCloseTo(115, 5)
    }
  })
})
