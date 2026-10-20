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

  it('滑杆 0.05 步进下每分钟读数都应精确（回归：曾有 37.8% 档位少 1 分钟）', () => {
    for (let i = 0; i <= 480; i++) {
      const hour = i * 0.05
      const total = Math.round(hour * 60) % 1440
      const want = String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0')
      expect(formatHour(hour)).toBe(want)
    }
    // 典型浮点截断点：1.15 旧实现为 01:08，2.55 旧实现为 02:32
    expect(formatHour(1.15)).toBe('01:09')
    expect(formatHour(2.55)).toBe('02:33')
    expect(formatHour(23.99)).toBe('23:59')
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
