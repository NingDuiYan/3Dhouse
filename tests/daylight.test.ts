import { describe, expect, it } from 'vitest'
import { daylight } from '../src/core/solar'

describe('daylight 应把太阳仰角映射为直射光开关', () => {
  it('地平线以下应完全关闭直射光', () => {
    expect(daylight(-25)).toBeCloseTo(0, 5)
    expect(daylight(-6)).toBeCloseTo(0, 5)
  })

  it('地平线以上足够高度应完全打开', () => {
    expect(daylight(4)).toBeCloseTo(1, 5)
    expect(daylight(60)).toBeCloseTo(1, 5)
  })

  it('地平线附近应平滑过渡且单调不减', () => {
    expect(daylight(0)).toBeGreaterThan(0)
    expect(daylight(0)).toBeLessThan(1)
    let prev = 0
    for (let e = -10; e <= 10; e += 0.5) {
      const v = daylight(e)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = v
    }
  })
})
