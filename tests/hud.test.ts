import { describe, expect, it } from 'vitest'
import { formatHour, timeBand } from '../src/ui/hud'

describe('formatHour 应把 0-24 小时数格式化为 hh:mm', () => {
  it('整点应补零到两位', () => {
    expect(formatHour(0)).toBe('00:00')
    expect(formatHour(7)).toBe('07:00')
    expect(formatHour(12)).toBe('12:00')
  })

  it('小数小时应换算成分钟', () => {
    expect(formatHour(16.5)).toBe('16:30')
    expect(formatHour(18.5)).toBe('18:30')
    expect(formatHour(7.5)).toBe('07:30')
  })

  it('24 应回绕到 00:00，避免出现 24:00', () => {
    expect(formatHour(24)).toBe('00:00')
  })
})

describe('timeBand 应把连续时间压成四档色带', () => {
  it('日出前后归入 dawn', () => {
    expect(timeBand(5)).toBe('dawn')
    expect(timeBand(7.9)).toBe('dawn')
  })

  it('白天归入 day', () => {
    expect(timeBand(8)).toBe('day')
    expect(timeBand(16.9)).toBe('day')
  })

  it('黄昏归入 dusk', () => {
    expect(timeBand(17)).toBe('dusk')
    expect(timeBand(19.9)).toBe('dusk')
  })

  it('夜间与午夜归入 night', () => {
    expect(timeBand(20)).toBe('night')
    expect(timeBand(0)).toBe('night')
    expect(timeBand(4.9)).toBe('night')
  })

  it('四档应覆盖 0-24 全区间且无空档', () => {
    const seen = new Set<string>()
    for (let h = 0; h <= 24; h += 1) seen.add(timeBand(h))
    expect(seen).toEqual(new Set(['dawn', 'day', 'dusk', 'night']))
  })
})
