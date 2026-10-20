import type { TimeState } from '../types'
import { SEASON_LABEL } from '../data/seasons'
import { WEATHERS } from '../data/weather'

export interface HudCallbacks {
  /** 季节切换后触发（用于相机运镜） */
  onSeasonChange(): void
  /** 巡游开关切换 */
  onTourToggle(on: boolean): void
}

export interface Hud {
  refresh(): void
}

/** 把小时数格式化为 hh:mm */
export function formatHour(hour: number): string {
  // 先按整分钟四舍五入再拆分：滑杆步进 0.05h 时 Math.floor 会把 1.15 截成 01:08（应为 01:09）
  const total = Math.round(hour * 60) % (24 * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
}

/** 吸附按钮与滑杆值得视为"同一时刻"的容差（小时） */
const SNAP_EPS = 0.001

/** 时刻色带：HUD 强调色随一天四段切换，与场景光照同源 */
type TimeBand = 'dawn' | 'day' | 'dusk' | 'night'

/**
 * 由小时数推导时刻色带。
 * 功能：把 0-24 连续时间压成 4 档，供 CSS 变量 [data-band] 切强调色。
 * 参数：hour 当前小时（0-24）。
 * 返回：dawn 5-8 / day 8-17 / dusk 17-20 / night 其余。
 */
export function timeBand(hour: number): TimeBand {
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 17) return 'day'
  if (hour >= 17 && hour < 20) return 'dusk'
  return 'night'
}

/** 绑定 HUD：时刻滑杆/吸附按钮/季节/天气选项卡/巡游开关/读出行 */
export function createHud(state: TimeState, cb: HudCallbacks): Hud {
  const slider = document.getElementById('hourSlider') as HTMLInputElement
  const moodTime = document.getElementById('moodTime') as HTMLElement
  const moodCtx = document.getElementById('moodCtx') as HTMLElement
  const tourBtn = document.getElementById('tourBtn') as HTMLButtonElement

  const seasonBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab[data-season]'))
  const weatherBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab[data-weather]'))
  const snapBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.chip[data-snap]'))

  slider.addEventListener('input', () => {
    state.hour = Number(slider.value)
    // 拖动期间只同步时间读数与吸附高亮，避免整句被读屏器重复播报
    refreshReadout()
    refreshSnaps()
    syncSlider()
  })

  for (const btn of snapBtns) {
    btn.addEventListener('click', () => {
      state.hour = Number(btn.dataset.snap)
      refresh()
    })
  }

  for (const btn of seasonBtns) {
    btn.addEventListener('click', () => {
      state.season = btn.dataset.season as TimeState['season']
      refresh()
      cb.onSeasonChange()
    })
  }

  for (const btn of weatherBtns) {
    btn.addEventListener('click', () => {
      state.weather = btn.dataset.weather as TimeState['weather']
      refresh()
    })
  }

  tourBtn.addEventListener('click', () => {
    const on = tourBtn.getAttribute('aria-pressed') !== 'true'
    tourBtn.setAttribute('aria-pressed', String(on))
    cb.onTourToggle(on)
  })

  /** 同步滑杆值、无障碍朗读值、轨道进度变量、时刻色带（仅交互期调用） */
  function syncSlider(): void {
    slider.value = String(state.hour)
    slider.setAttribute('aria-valuetext', formatHour(state.hour))
    slider.style.setProperty('--hs-fill', (state.hour / 24) * 100 + '%')
    // 只在跨档时写一次 class，不随帧刷新
    const band = timeBand(state.hour)
    if (document.documentElement.dataset.band !== band) {
      document.documentElement.dataset.band = band
    }
  }

  /**
   * 季节/天气联动：只在交互回调里写一次 html 属性，不进帧循环。
   * 视觉层据此调整面板描边色温与不透明度（style.css 第 1 节末尾）。
   */
  function syncSceneAttrs(): void {
    const root = document.documentElement
    if (root.dataset.season !== state.season) root.dataset.season = state.season
    if (root.dataset.weather !== state.weather) root.dataset.weather = state.weather
  }

  /**
   * 时刻读数：大字号时间 + 语境短句分开写，只有语境句挂 aria-live。
   * 值未变化时不写 DOM——否则拖动滑杆会反复替换文本节点，被读屏器重复播报。
   */
  function refreshReadout(): void {
    const time = formatHour(state.hour)
    if (moodTime.textContent !== time) moodTime.textContent = time

    const ctx = SEASON_LABEL[state.season] + ' · ' + WEATHERS[state.weather].label
    if (moodCtx.textContent !== ctx) moodCtx.textContent = ctx
  }

  /** 吸附按钮高亮：滑杆拖到吸附值也同步 */
  function refreshSnaps(): void {
    for (const b of snapBtns) {
      const on = Math.abs(state.hour - Number(b.dataset.snap)) < SNAP_EPS
      b.setAttribute('aria-pressed', String(on))
    }
  }

  function refresh(): void {
    syncSlider()
    syncSceneAttrs()
    refreshSnaps()
    for (const b of seasonBtns) {
      const on = b.dataset.season === state.season
      b.setAttribute('aria-pressed', String(on))
    }
    for (const b of weatherBtns) {
      const on = b.dataset.weather === state.weather
      b.setAttribute('aria-pressed', String(on))
    }
    refreshReadout()
  }

  refresh()
  return { refresh }
}