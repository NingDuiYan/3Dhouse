import * as THREE from 'three'
import type { KeyframeCol, KeyframeNum, Season, SeasonTracks } from '../types'
import { SUNRISE, SUNSET } from '../core/solar'

export const SEASON_LABEL: Record<Season, string> = { sp: '春', su: '夏', au: '秋', wi: '冬' }

/** 深夜锚点时刻（小时）：四季日出最晚 7.5，取 3 点作为"最深的夜" */
const DEEP_NIGHT = 3

/**
 * 轨道锚点时刻：夜(0) / 深夜(3) / 晨(日出+1h) / 午(12) / 暮(日落-1h) / 夜(24)，随季节联动。
 * 深夜锚点用于把"夜→晨"的长直线拆成两段，消除深夜参数过冲。
 */
function anchors(season: Season): [number, number, number, number, number] {
  return [0, DEEP_NIGHT, SUNRISE[season] + 1, 12, SUNSET[season] - 1]
}

type Five<T> = [T, T, T, T, T]

function numTrack(season: Season, vs: Five<number>): KeyframeNum[] {
  const [h0, h1, h2, h3, h4] = anchors(season)
  return [
    { h: h0, v: vs[0] },
    { h: h1, v: vs[1] },
    { h: h2, v: vs[2] },
    { h: h3, v: vs[3] },
    { h: h4, v: vs[4] },
    { h: 24, v: vs[0] }
  ]
}

function colTrack(season: Season, hexes: Five<string>): KeyframeCol[] {
  const [h0, h1, h2, h3, h4] = anchors(season)
  return [
    { h: h0, v: new THREE.Color(hexes[0]) },
    { h: h1, v: new THREE.Color(hexes[1]) },
    { h: h2, v: new THREE.Color(hexes[2]) },
    { h: h3, v: new THREE.Color(hexes[3]) },
    { h: h4, v: new THREE.Color(hexes[4]) },
    { h: 24, v: new THREE.Color(hexes[0]) }
  ]
}

// —— 各季关键帧基准来自 v1 的 12 组 MOODS（晨/午/暮三档平移进轨道），夜间档为新设计 ——
function buildTracks(
  season: Season,
  n: {
    rayleigh: Five<number>
    sunInt: Five<number>
    hemiInt: Five<number>
    fogD: Five<number>
    exp: Five<number>
    bloom: Five<number>
    folScale: Five<number>
  },
  c: {
    sun: Five<string>
    hemiSky: Five<string>
    hemiGround: Five<string>
    fog: Five<string>
    foliage: Five<string>
    ground: Five<string>
  }
): SeasonTracks {
  return {
    num: {
      rayleigh: numTrack(season, n.rayleigh),
      sunInt: numTrack(season, n.sunInt),
      hemiInt: numTrack(season, n.hemiInt),
      fogD: numTrack(season, n.fogD),
      exp: numTrack(season, n.exp),
      bloom: numTrack(season, n.bloom),
      folScale: numTrack(season, n.folScale)
    },
    col: {
      sun: colTrack(season, c.sun),
      hemiSky: colTrack(season, c.hemiSky),
      hemiGround: colTrack(season, c.hemiGround),
      fog: colTrack(season, c.fog),
      foliage: colTrack(season, c.foliage),
      ground: colTrack(season, c.ground)
    }
  }
}

/** 四季完整轨道表：唯一的"一天之内视觉如何变化"数据源 */
export const TRACKS: Record<Season, SeasonTracks> = {
  sp: buildTracks('sp', {
    rayleigh: [0.6, 0.5, 2.6, 1.6, 3.2],
    sunInt: [0, 0, 2.4, 3.4, 1.7],
    hemiInt: [0.15, 0.13, 0.5, 0.75, 0.35],
    fogD: [0.016, 0.014, 0.014, 0.004, 0.016],
    exp: [0.58, 0.54, 0.85, 1.0, 0.75],
    bloom: [0.35, 0.4, 0.15, 0.08, 0.45],
    folScale: [1, 1, 1, 1, 1]
  }, {
    sun: ['#1a2438', '#161f30', '#FFD9B0', '#FFF4D6', '#FF9E6B'],
    hemiSky: ['#2a3450', '#242e46', '#A8C8E8', '#8FC1E9', '#7A8BC0'],
    hemiGround: ['#1c2a20', '#182418', '#9CC978', '#8FC568', '#6E9B54'],
    fog: ['#39445a', '#333d52', '#C8D4E0', '#BFD8E8', '#C9A8A0'],
    foliage: ['#446e3c', '#3d6436', '#7FBF6A', '#8FC568', '#5E9450'],
    ground: ['#386234', '#31582e', '#6FA85A', '#5F9E4C', '#4E8844']
  }),
  su: buildTracks('su', {
    rayleigh: [0.5, 0.45, 2.2, 1.3, 3.4],
    sunInt: [0, 0, 2.9, 3.9, 1.9],
    hemiInt: [0.17, 0.15, 0.6, 0.85, 0.3],
    fogD: [0.014, 0.012, 0.006, 0.002, 0.012],
    exp: [0.6, 0.56, 0.95, 1.05, 0.7],
    bloom: [0.3, 0.34, 0.1, 0.05, 0.5],
    folScale: [1, 1, 1, 1, 1]
  }, {
    sun: ['#182032', '#141b2b', '#FFE0A8', '#FFFDF0', '#FF7A4D'],
    hemiSky: ['#26304a', '#202a42', '#6FA8DC', '#4A90D9', '#4A5A9E'],
    hemiGround: ['#182418', '#141f14', '#5FA848', '#4E9E3E', '#3E7A34'],
    fog: ['#323c56', '#2c354d', '#BFD4E4', '#9CC4E0', '#B08878'],
    foliage: ['#264e22', '#20441d', '#3E8E34', '#3E8E34', '#346E2C'],
    ground: ['#284a24', '#22421f', '#4E9E3E', '#448C36', '#3A7A30']
  }),
  au: buildTracks('au', {
    rayleigh: [0.6, 0.55, 2.8, 1.8, 3.5],
    sunInt: [0, 0, 2.1, 2.9, 1.6],
    hemiInt: [0.15, 0.13, 0.45, 0.6, 0.3],
    fogD: [0.014, 0.012, 0.018, 0.008, 0.02],
    exp: [0.58, 0.54, 0.8, 0.95, 0.72],
    bloom: [0.38, 0.42, 0.15, 0.1, 0.5],
    folScale: [1, 1, 1, 1, 1]
  }, {
    sun: ['#1a2030', '#161b2a', '#FFC890', '#FFE8B8', '#FF8848'],
    hemiSky: ['#282c40', '#22263a', '#B0BCCF', '#8FA8C8', '#5A5A88'],
    hemiGround: ['#221c16', '#1d1813', '#C9A05A', '#D08848', '#A86838'],
    fog: ['#3e3a48', '#383442', '#C4B8A8', '#BCC4CE', '#A8868E'],
    foliage: ['#6a401c', '#5e3818', '#D08830', '#D07828', '#B86828'],
    ground: ['#503c20', '#47351c', '#A8843E', '#9E7838', '#8A6830']
  }),
  wi: buildTracks('wi', {
    rayleigh: [0.5, 0.45, 2.4, 1.9, 3.0],
    sunInt: [0, 0, 1.3, 1.6, 0.5],
    hemiInt: [0.14, 0.12, 0.42, 0.58, 0.24],
    fogD: [0.02, 0.018, 0.022, 0.016, 0.024],
    exp: [0.52, 0.5, 0.8, 0.9, 0.65],
    bloom: [0.5, 0.52, 0.4, 0.25, 0.6],
    folScale: [0, 0, 0, 0, 0]
  }, {
    sun: ['#141c2c', '#111826', '#FFE8D8', '#FFF0E0', '#B08898'],
    hemiSky: ['#263044', '#202a3c', '#A8B8CC', '#90A8C8', '#384868'],
    hemiGround: ['#7e8896', '#767f8c', '#E8ECF0', '#F0F2F5', '#C8D0DC'],
    fog: ['#38404e', '#333a47', '#C8CCD4', '#C0CAD6', '#5A6478'],
    foliage: ['#604222', '#573b1e', '#B86828', '#B86828', '#B86828'],
    ground: ['#aeb8c4', '#a2acb8', '#E8ECF0', '#F0F2F5', '#C8D0DC']
  })
}
