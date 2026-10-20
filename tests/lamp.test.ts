import { describe, expect, it } from 'vitest'
import { lampLevel } from '../src/core/solar'

describe('lampLevel 应随太阳仰角平滑渐变', () => {
  it('仰角高于 4° 应全灭', () => {
    expect(lampLevel(10)).toBe(0)
    expect(lampLevel(4)).toBe(0)
  })

  it('仰角低于 -3° 应全亮', () => {
    expect(lampLevel(-10)).toBe(1)
    expect(lampLevel(-3)).toBe(1)
  })

  it('阈值之间应为 0..1 渐变', () => {
    const mid = lampLevel(0.5)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('应随仰角降低单调递增', () => {
    expect(lampLevel(0)).toBeGreaterThanOrEqual(lampLevel(2))
    expect(lampLevel(-2)).toBeGreaterThanOrEqual(lampLevel(0))
  })
})
