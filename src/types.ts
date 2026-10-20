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

export type NumParam =
  | 'rayleigh' | 'sunInt' | 'hemiInt' | 'fogD' | 'exp' | 'bloom' | 'folScale'
  | 'grassLevel' | 'bloomLevel'
export type ColParam =
  | 'sun' | 'hemiSky' | 'hemiGround' | 'fog' | 'foliage' | 'ground'
  | 'grass' | 'flower'

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
  /** 庭院草量（0..1，实例数比例）与花色 */
  grassLevel: number
  grass: THREE.Color
  /** 庭院花量（0..1，雨天被打落）与花色 */
  bloomLevel: number
  flower: THREE.Color
}

/** 画质档位：由设备初判 + 帧率看门狗调整，决定阴影/Bloom/像素比上限 */
export type QualityTier = 'high' | 'mid' | 'low'

/** 单档画质上限（具体数值集中在 config.ts 的 QUALITY_CAPS） */
export interface QualityCaps {
  /** 像素比下限：低档允许降到 1 以下，为集显让出像素预算 */
  dprMin: number
  dprMax: number
  /** 平行光阴影贴图边长（px） */
  shadowSize: number
  /** Bloom 分辨率相对主画布的比例，0 表示关闭 Bloom */
  bloomScale: number
  /** 环境贴图最小重烘间隔（秒） */
  envInterval: number
  /** 是否开启 SSAO（接触阴影，写实感关键，代价 2~3 个全屏 Pass） */
  ssao: boolean
  /** 是否开启 SMAA（后处理链路下的边缘抗锯齿） */
  smaa: boolean
}
