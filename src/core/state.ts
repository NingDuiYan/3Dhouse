import * as THREE from 'three'
import type { ParticleMode, SceneParams, TimeState } from '../types'
import { NUM_PARAMS, COL_PARAMS, sampleCol, sampleNum } from './interpolate'
import { daylight, lampLevel, sunAngle } from './solar'
import { TRACKS } from '../data/seasons'
import { SEASON_PARTICLE, WEATHERS } from '../data/weather'
import { EASE_RATE } from '../config'

/** 分配一个全零/全黑的 SceneParams（仅初始化时调用，主循环零分配） */
export function createParams(): SceneParams {
  return {
    elev: 0,
    azim: 0,
    rayleigh: 0,
    sun: new THREE.Color(0x000000),
    sunInt: 0,
    hemiSky: new THREE.Color(0x000000),
    hemiGround: new THREE.Color(0x000000),
    hemiInt: 0,
    fog: new THREE.Color(0x000000),
    fogD: 0,
    exp: 1,
    lamp: 0,
    bloom: 0,
    foliage: new THREE.Color(0x000000),
    folScale: 1,
    ground: new THREE.Color(0x000000),
    snow: 0,
    ffGlow: 0,
    cloud: 0,
    wet: 0.95
  }
}

/**
 * 把 TimeState 解析为完整 SceneParams（写入 out，零分配）：
 * 季节轨道插值 ⊕ 太阳几何（solar）⊕ 天气修饰 ⊕ 派生量（灯/萤火虫/积雪）
 */
export function resolveParams(state: TimeState, out: SceneParams): SceneParams {
  const t = TRACKS[state.season]
  for (const k of NUM_PARAMS) out[k] = sampleNum(t.num[k], state.hour)
  for (const k of COL_PARAMS) sampleCol(t.col[k], state.hour, out[k])

  const angle = sunAngle(state.hour, state.season)
  out.elev = angle.elev
  out.azim = angle.azim

  // 直射光随太阳高度衰减：太阳在地平线以下时不再有日照
  out.sunInt *= daylight(out.elev)

  const w = WEATHERS[state.weather]
  out.sunInt *= w.lightMul
  out.hemiInt *= w.lightMul
  out.fogD = Math.min(out.fogD * w.fogMul, 0.06)
  out.exp *= w.expMul
  out.cloud = w.cloud
  out.wet = w.wet

  out.lamp = lampLevel(out.elev)
  out.ffGlow = state.season === 'su' && out.elev < 2 && (state.weather === 'clear' || state.weather === 'cloudy') ? 1 : 0
  out.snow = state.weather === 'snow' || state.season === 'wi' ? 1 : 0
  return out
}

/** 全量拷贝参数（初始化用） */
export function copyParams(dst: SceneParams, src: SceneParams): void {
  for (const key of NUM_ALL) dst[key] = src[key]
  for (const key of COL_PARAMS) dst[key].copy(src[key])
}

/** SceneParams 中所有数值型键（颜色键走 Color.lerp 单独处理） */
type NumKey =
  | 'elev' | 'azim' | 'rayleigh' | 'sunInt' | 'hemiInt' | 'fogD' | 'exp'
  | 'lamp' | 'bloom' | 'folScale' | 'snow' | 'ffGlow' | 'cloud' | 'wet'

const NUM_ALL: NumKey[] = [
  'elev', 'azim', 'rayleigh', 'sunInt', 'hemiInt', 'fogD', 'exp',
  'lamp', 'bloom', 'folScale', 'snow', 'ffGlow', 'cloud', 'wet'
]

/** 当前参数向目标参数做指数缓动（数值 lerp + 颜色 lerp，零分配） */
export function lerpParams(cur: SceneParams, target: SceneParams, dt: number): void {
  const k = 1 - Math.exp(-EASE_RATE * dt)
  for (const key of NUM_ALL) {
    cur[key] += (target[key] - cur[key]) * k
  }
  for (const key of COL_PARAMS) {
    cur[key].lerp(target[key], k)
  }
}

/** 判断当前季节该用什么粒子（天气可覆盖） */
export function resolveParticleMode(state: TimeState): ParticleMode {
  const w = WEATHERS[state.weather]
  if (w.particle === 'season') return SEASON_PARTICLE[state.season]
  return w.particle
}
