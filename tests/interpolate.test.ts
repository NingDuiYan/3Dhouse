import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { easeInOutCubic, sampleCol, sampleNum } from '../src/core/interpolate'

const NUM_TRACK = [
  { h: 0, v: 1 },
  { h: 12, v: 5 },
  { h: 24, v: 1 }
]

const COL_TRACK = [
  { h: 0, v: new THREE.Color('#000000') },
  { h: 12, v: new THREE.Color('#ffffff') },
  { h: 24, v: new THREE.Color('#000000') }
]

describe('sampleNum 应做线性插值', () => {
  it('应返回端点值', () => {
    expect(sampleNum(NUM_TRACK, 0)).toBe(1)
    expect(sampleNum(NUM_TRACK, 12)).toBe(5)
    expect(sampleNum(NUM_TRACK, 24)).toBe(1)
  })

  it('中点应取均值', () => {
    expect(sampleNum(NUM_TRACK, 6)).toBe(3)
    expect(sampleNum(NUM_TRACK, 18)).toBe(3)
  })

  it('超范围应钳制', () => {
    expect(sampleNum(NUM_TRACK, -5)).toBe(1)
    expect(sampleNum(NUM_TRACK, 30)).toBe(1)
  })
})

describe('sampleCol 应写入 out 且不突变入参', () => {
  it('中点应为两端颜色的中间值', () => {
    const out = new THREE.Color()
    sampleCol(COL_TRACK, 6, out)
    expect(out.r).toBeCloseTo(0.5, 5)
    expect(out.g).toBeCloseTo(0.5, 5)
    expect(out.b).toBeCloseTo(0.5, 5)
  })

  it('不应修改轨道内的关键帧颜色', () => {
    const out = new THREE.Color()
    sampleCol(COL_TRACK, 6, out)
    expect(COL_TRACK[0].v.getHex()).toBe(0x000000)
    expect(COL_TRACK[1].v.getHex()).toBe(0xffffff)
  })

  it('端点应直接 copy 关键帧', () => {
    const out = new THREE.Color()
    sampleCol(COL_TRACK, 12, out)
    expect(out.getHex()).toBe(0xffffff)
  })
})

describe('easeInOutCubic', () => {
  it('端点为 0/1，中点为 0.5', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(0.5)).toBe(0.5)
    expect(easeInOutCubic(1)).toBe(1)
  })
})
