import type { ParticleMode, Season, Weather } from '../types'

/** 天气修饰表：cloud 云量 / lightMul 光照倍率 / fogMul 雾密度倍率 / expMul 曝光倍率 / wet 地面 roughness 目标 */
export interface WeatherProfile {
  label: string
  cloud: number
  lightMul: number
  fogMul: number
  expMul: number
  wet: number
  /** 粒子模式：season 表示交给季节决定，否则强制覆盖 */
  particle: 'season' | ParticleMode
}

export const WEATHERS: Record<Weather, WeatherProfile> = {
  clear: { label: '晴', cloud: 0, lightMul: 1.0, fogMul: 1.0, expMul: 1.0, wet: 0.95, particle: 'season' },
  cloudy: { label: '多云', cloud: 0.85, lightMul: 0.55, fogMul: 1.2, expMul: 0.92, wet: 0.95, particle: 'season' },
  rain: { label: '雨', cloud: 1.0, lightMul: 0.35, fogMul: 1.8, expMul: 0.8, wet: 0.35, particle: 'rain' },
  snow: { label: '雪', cloud: 0.9, lightMul: 0.6, fogMul: 1.6, expMul: 0.85, wet: 0.95, particle: 'snow' }
}

/** 季节默认粒子 */
export const SEASON_PARTICLE: Record<Season, ParticleMode> = {
  sp: 'petal',
  su: 'firefly',
  au: 'leaf',
  wi: 'snow'
}
