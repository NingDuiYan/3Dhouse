import * as THREE from 'three'
import type { ColParam, KeyframeCol, KeyframeNum, NumParam } from '../types'

/** 参数名清单：resolveParams / lerpParams 遍历用 */
export const NUM_PARAMS: NumParam[] = [
  'rayleigh', 'sunInt', 'hemiInt', 'fogD', 'exp', 'bloom', 'folScale', 'grassLevel', 'bloomLevel'
]
export const COL_PARAMS: ColParam[] = [
  'sun', 'hemiSky', 'hemiGround', 'fog', 'foliage', 'ground', 'grass', 'flower'
]

/**
 * 数值轨道线性插值（track 按锚点时刻升序，首尾为 0/24 夜间锚点）。
 * @returns hour 处的插值结果，超出范围钳制到端点
 */
export function sampleNum(track: KeyframeNum[], hour: number): number {
  if (hour <= track[0].h) return track[0].v
  const last = track[track.length - 1]
  if (hour >= last.h) return last.v
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]
    const b = track[i + 1]
    if (hour >= a.h && hour <= b.h) {
      const t = (hour - a.h) / (b.h - a.h)
      return a.v + (b.v - a.v) * t
    }
  }
  return last.v
}

/**
 * 颜色轨道线性插值，结果写入 out（零分配：不 new Color）。
 * @returns out 本身
 */
export function sampleCol(track: KeyframeCol[], hour: number, out: THREE.Color): THREE.Color {
  if (hour <= track[0].h) return out.copy(track[0].v)
  const last = track[track.length - 1]
  if (hour >= last.h) return out.copy(last.v)
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]
    const b = track[i + 1]
    if (hour >= a.h && hour <= b.h) {
      const t = (hour - a.h) / (b.h - a.h)
      return out.copy(a.v).lerp(b.v, t)
    }
  }
  return out.copy(last.v)
}

/** easeInOutCubic：运镜动画用 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
