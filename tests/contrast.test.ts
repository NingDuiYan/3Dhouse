import { describe, expect, it } from 'vitest'

/** sRGB 单通道线性化（WCAG 2.1 相对亮度定义） */
function linear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** 相对亮度 */
function luminance(rgb: [number, number, number]): number {
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])
}

/** 对比度（1..21） */
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** 十六进制转 rgb 三元组 */
function hex(value: string): [number, number, number] {
  return [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16)
  ]
}

/** 半透明前景叠到底色上的合成结果 */
function over(
  fg: [number, number, number],
  alpha: number,
  bg: [number, number, number]
): [number, number, number] {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha)
  ]
}

/** 多段线性渐变的取值（用于复算 #brand 衬底与横向 mask） */
function gradientAt(stops: [number, number][], t: number): number {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, v0] = stops[i]
    const [p1, v1] = stops[i + 1]
    if (t >= p0 && t <= p1) return v0 + ((v1 - v0) * (t - p0)) / (p1 - p0)
  }
  return stops[stops.length - 1][1]
}

// —— 与 src/ui/style.css 第 1 节 token 保持同步 ——
// 说明：CSS 变量无法被测试运行时读取，改 token 时必须同步这里，否则断言会失真。
const INK = hex('#0b0e14')
const PANEL_ALPHA = 0.86
const TEXT = { '1': hex('#f2f4f8'), '2': hex('#c3cad8'), '3': hex('#98a2b4') }
const FOCUS = hex('#8ecbff')
const BORDER_ALPHA = 0.46
const FILL_REST_ALPHA = 0.06
const FILL_SEL_ALPHA = 0.14
/** 四档时刻色带（day 档取纯白：与正文同色会使选中描边差跌到 1.00:1） */
const BANDS: Record<string, [number, number, number]> = {
  dawn: hex('#f0c9a8'),
  day: hex('#9ecbff'),
  dusk: hex('#ffc97e'),
  night: hex('#c8d6ea')
}

// 场景可能给出的最亮底色：纯白、冬·午雪面、春·午天空、深夜
const BASES: Record<string, [number, number, number]> = {
  纯白: [255, 255, 255],
  冬午雪面: hex('#f0f2f5'),
  春午天空: hex('#8fc1e9'),
  深夜: [20, 24, 34]
}

/** α=0.86 面板叠在指定底色上之后的实际面板色 */
function panelOn(base: [number, number, number]): [number, number, number] {
  return over(INK, PANEL_ALPHA, base)
}

describe('HUD 面板在半透明下仍应满足 WCAG AA', () => {
  for (const [name, base] of Object.entries(BASES)) {
    it(`${name}背景下三级文字对比度均应 >= 4.5`, () => {
      const panel = panelOn(base)
      expect(contrast(TEXT['1'], panel)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(TEXT['2'], panel)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(TEXT['3'], panel)).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('四档强调色文字在各自选中填充上都应 >= 4.5', () => {
    for (const base of Object.values(BASES)) {
      const panel = panelOn(base)
      for (const accent of Object.values(BANDS)) {
        const selected = over(accent, FILL_SEL_ALPHA, panel)
        expect(contrast(accent, selected)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('焦点环对面板应满足非文本 3:1', () => {
    for (const base of Object.values(BASES)) {
      expect(contrast(FOCUS, panelOn(base))).toBeGreaterThanOrEqual(3)
    }
  })

  it('控件描边对面板与对控件填充两侧都应 >= 3（1.4.11）', () => {
    for (const base of Object.values(BASES)) {
      const panel = panelOn(base)
      const stroke = over([255, 255, 255], BORDER_ALPHA, panel)
      const fill = over([255, 255, 255], FILL_REST_ALPHA, panel)
      expect(contrast(stroke, panel)).toBeGreaterThanOrEqual(3)
      expect(contrast(stroke, fill)).toBeGreaterThanOrEqual(3)
    }
  })

  it('四档选中指示条直接压在面板上，应 >= 3（1.4.11 状态可辨）', () => {
    for (const base of Object.values(BASES)) {
      const panel = panelOn(base)
      for (const [band, accent] of Object.entries(BANDS)) {
        expect(
          contrast(accent, panel),
          `${band} 档选中指示条与面板无法区分`
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('四档 accent 与其选中填充之间应可区分（指示条与填充不相邻则无强制要求，作退守检查）', () => {
    for (const base of Object.values(BASES)) {
      const panel = panelOn(base)
      for (const [band, accent] of Object.entries(BANDS)) {
        const selected = over(accent, FILL_SEL_ALPHA, panel)
        expect(contrast(accent, selected), `${band} 档 accent 与选中底混同`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('面板不透明度低于 0.86 时应能检测出退化（防回退哨兵）', () => {
    const weak = over(INK, 0.55, [255, 255, 255])
    expect(contrast(TEXT['3'], weak)).toBeLessThan(4.5)
  })
})

describe('#brand 渐变衬底在亮场景下仍能托住标题与副标题', () => {
  // 与 style.css 的 #brand::before 同参数
  const SCRIM_TOP = -32
  const SCRIM_HEIGHT = 168
  const PAD_TOP = 14
  const PAD_LEFT = 20
  const H1_H = 26 * 1.2
  const P_H = 12 * 1.15
  const TEXT_WIDTH = 280
  const SCRIM_WIDTH = TEXT_WIDTH + PAD_LEFT * 2 + 96
  const VERTICAL: [number, number][] = [
    [0, 0.92],
    [0.62, 0.86],
    [1, 0]
  ]
  const HORIZONTAL: [number, number][] = [
    [0, 1],
    [0.88, 1],
    [1, 0]
  ]

  const centerY = [
    PAD_TOP + H1_H / 2,
    PAD_TOP + H1_H + 8 + P_H / 2
  ]
  const sampleX = [PAD_LEFT / SCRIM_WIDTH, (PAD_LEFT + TEXT_WIDTH) / SCRIM_WIDTH]

  it('标题与副标题在四最亮底上对比度都应 >= 4.5', () => {
    for (const base of Object.values(BASES)) {
      for (const y of centerY) {
        for (const x of sampleX) {
          const alpha =
            gradientAt(VERTICAL, (y - SCRIM_TOP) / SCRIM_HEIGHT) *
            gradientAt(HORIZONTAL, x)
          const backdrop = over(INK, alpha, base)
          expect(contrast(hex('#f4f1e8'), backdrop)).toBeGreaterThanOrEqual(4.5)
          expect(contrast(TEXT['2'], backdrop)).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('衬底退化哨兵：横竖渐变同时缩短时副标题应跌破 4.5', () => {
    const backdrops: [number, number, number] = [255, 255, 255]
    const alpha =
      gradientAt([[0, 0.92], [0.42, 0.86], [1, 0]], (centerY[1] - SCRIM_TOP) / SCRIM_HEIGHT) *
      gradientAt([[0, 1], [0.55, 1], [1, 0]], sampleX[1])
    expect(contrast(TEXT['2'], over(INK, alpha, backdrops))).toBeLessThan(4.5)
  })
})