import type * as THREE from 'three'

export type Season = 'sp' | 'su' | 'au' | 'wi'
export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow'
export type ParticleMode = 'petal' | 'firefly' | 'leaf' | 'snow' | 'rain'

/** 交互状态：滑杆时刻 + 季节 + 天气，三者正交组合 */
export interface TimeState {
  hour: number
  season: Season
  weather: Weather
}

export interface KeyframeNum { h: number; v: number }
export interface KeyframeCol { h: number; v: THREE.Color }

export type NumParam = 'rayleigh' | 'sunInt' | 'hemiInt' | 'fogD' | 'exp' | 'bloom' | 'folScale'
export type ColParam = 'sun' | 'hemiSky' | 'hemiGround' | 'fog' | 'foliage' | 'ground'

/** 每季一条轨道集：数值轨道 + 颜色轨道，锚点时刻与 solar.ts 的日出日落对齐 */
export interface SeasonTracks {
  num: Record<NumParam, KeyframeNum[]>
  col: Record<ColParam, KeyframeCol[]>
}

/** 场景的完整视觉状态（单帧渲染所需的一切参数） */
export interface SceneParams {
  elev: number
  azim: number
  rayleigh: number
  sun: THREE.Color
  sunInt: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  hemiInt: number
  fog: THREE.Color
  fogD: number
  exp: number
  lamp: number
  bloom: number
  foliage: THREE.Color
  folScale: number
  ground: THREE.Color
  snow: number
  ffGlow: number
  cloud: number
  wet: number
}
