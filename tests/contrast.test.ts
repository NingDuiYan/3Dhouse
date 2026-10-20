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

// —— 与 src/ui/style.css 第 1 节 token 保持同步 ——
// 说明：CSS 变量无法被测试运行时读取，改 token 时必须同步这里，否则断言会失真。
const INK = hex('#0b0e14')
const PANEL_ALPHA = 0.86
const TEXT = { '1': hex('#f2f4f8'), '2': hex('#c3cad8'), '3': hex('#98a2b4') }
const FOCUS = hex('#8ecbff')
/** 分组容器描边（四档季节色温 + 中性态）与内部填充 */
const EDGE_ALPHA = 0.4
const SEG_FILL_ALPHA = 0.05
const EDGES: Record<string, [number, number, number]> = {
  中性: [255, 255, 255],
  春: [238, 246, 234],
  夏: [234, 247, 240],
  秋: [247, 240, 230],
  冬: [234, 242, 250]
}
/** 四档时刻色带（选中药丸实心填充，墨色字压在上面） */
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

  it('选中药丸的墨色字压在四档色带上都应 >= 4.5', () => {
    for (const [band, accent] of Object.entries(BANDS)) {
      expect(contrast(INK, accent), `${band} 档药丸文字不足 4.5:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('焦色环对面板应满足非文本 3:1', () => {
    for (const base of Object.values(BASES)) {
      expect(contrast(FOCUS, panelOn(base))).toBeGreaterThanOrEqual(3)
    }
  })

  it('选中药丸的实心色带本身就是状态指示，对面板应 >= 3（1.4.11）', () => {
    for (const base of Object.values(BASES)) {
      const panel = panelOn(base)
      for (const [band, accent] of Object.entries(BANDS)) {
        expect(contrast(accent, panel), `${band} 档药丸与面板无法区分`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('分组容器描边在四季色温下对面板都应 >= 3（1.4.11 控件边界）', () => {
    for (const base of Object.values(BASES)) {
      const panel = panelOn(base)
      for (const [name, edge] of Object.entries(EDGES)) {
        expect(
          contrast(over(edge, EDGE_ALPHA, panel), panel),
          `${name}档容器描边与面板无法区分`
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('面板不透明度低于 0.86 时应能检测出退化（防回退哨兵）', () => {
    const weak = over(INK, 0.55, [255, 255, 255])
    expect(contrast(TEXT['3'], weak)).toBeLessThan(4.5)
  })

  it('容器填充与面板之间只需可感知（不承担 1.4.11，作回归哨兵）', () => {
    const panel = panelOn([255, 255, 255])
    const fill = over([255, 255, 255], SEG_FILL_ALPHA, panel)
    expect(contrast(fill, panel)).toBeGreaterThan(1.1)
  })
})
