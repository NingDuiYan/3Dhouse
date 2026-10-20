import * as THREE from 'three'

/**
 * 程序化 PBR 贴图集合：每套表面给出 颜色 / 法线 / 粗糙度 三张图。
 * 全部由 Canvas 在启动期生成（零外部资源、零运行期 IO）；
 * 法线由高度图经 Sobel 求梯度得到，粗糙度图直接按灰度绘制。
 */
export interface SurfaceTex {
  map: THREE.CanvasTexture
  normalMap: THREE.CanvasTexture
  roughnessMap: THREE.CanvasTexture
}

/** 贴图集合（现代写实：清水混凝土 / 木饰面 / 户外平台 / 金属 / 石板 / 砾石 / 草地 / 树皮 / 积雪） */
export interface Textures {
  concrete: SurfaceTex
  wood: SurfaceTex
  deck: SurfaceTex
  metal: SurfaceTex
  paving: SurfaceTex
  gravel: SurfaceTex
  grass: SurfaceTex
  bark: SurfaceTex
  snow: SurfaceTex
  /** 叶团卡片（含 alpha）：一整团叶子而非单片分散的叶子，树冠靠多张咬合成体积 */
  leaf: THREE.CanvasTexture
  /** 针叶枝簇卡片（含 alpha）：一根下垂枝条上密集的针叶，用于针叶树分层枝冠 */
  needle: THREE.CanvasTexture
  dot: THREE.CanvasTexture
  rain: THREE.CanvasTexture
  cloud: THREE.CanvasTexture
}

type Ctx = CanvasRenderingContext2D
type Draw = (g: Ctx, s: number) => void

/** 确定性伪随机：同一 seed 每次生成完全相同的贴图，便于比对与回归 */
function makeRand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function canvasOf(size: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return { c, g: c.getContext('2d') as Ctx }
}

function toTexture(c: HTMLCanvasElement, repeat: number, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * 功能：把高度图转成切线空间法线图（Sobel 梯度，环绕采样保证可无缝平铺）。
 * 参数：height 高度画布；strength 起伏强度（越大凹凸越明显）。
 * 返回：法线贴图（线性色彩空间）。
 */
function normalFromHeight(height: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const size = height.width
  const src = (height.getContext('2d') as Ctx).getImageData(0, 0, size, size).data
  const { c, g } = canvasOf(size)
  const img = g.createImageData(size, size)
  const at = (x: number, y: number): number => src[((y & (size - 1)) * size + (x & (size - 1))) * 4]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 高度沿 u/v 的梯度：u 向右、v 向上（CanvasTexture 默认 flipY，行号向下等于 v 减小）
      const du = (at(x + 1, y) - at(x - 1, y)) / 255 * strength
      const dv = (at(x, y - 1) - at(x, y + 1)) / 255 * strength
      const nx = -du
      const ny = -dv
      const nz = 1
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const i = (y * size + x) * 4
      img.data[i] = Math.round((nx * inv * 0.5 + 0.5) * 255)
      img.data[i + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255)
      img.data[i + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255)
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  return toTexture(c, 1, false)
}

interface SurfaceRecipe {
  /** 边长（px）：普通材质 256、需要细粒度的 512 */
  size: number
  /** 贴图默认平铺次数（材质可再按尺寸克隆覆盖） */
  repeat: number
  /** 起伏强度（法线） */
  relief: number
  albedo: Draw
  height: Draw
  rough: Draw
}

function makeSurface(r: SurfaceRecipe): SurfaceTex {
  const alb = canvasOf(r.size)
  r.albedo(alb.g, r.size)
  const h = canvasOf(r.size)
  r.height(h.g, r.size)
  const rough = canvasOf(r.size)
  r.rough(rough.g, r.size)
  return {
    map: toTexture(alb.c, r.repeat, true),
    normalMap: normalFromHeight(h.c, r.relief),
    roughnessMap: toTexture(rough.c, r.repeat, false)
  }
}

/**
 * 功能：克隆一套表面的三张贴图并改平铺次数（共享画布，只多几个 Texture 对象）。
 * 参数：src 源表面；rx/ry 平铺次数。
 * 返回：新的表面集合，供不同尺寸的构件按米数换算 UV。
 */
export function tileSurface(src: SurfaceTex, rx: number, ry: number): SurfaceTex {
  const out: SurfaceTex = {
    map: src.map.clone(),
    normalMap: src.normalMap.clone(),
    roughnessMap: src.roughnessMap.clone()
  }
  out.map.repeat.set(rx, ry)
  out.normalMap.repeat.set(rx, ry)
  out.roughnessMap.repeat.set(rx, ry)
  out.map.needsUpdate = true
  out.normalMap.needsUpdate = true
  out.roughnessMap.needsUpdate = true
  return out
}

/** 细碎噪点：在给定区域铺 n 个半透明小点（通用底噪） */
function speckle(g: Ctx, s: number, rand: () => number, n: number, dark: string, light: string, maxR: number): void {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.03 + rand() * 0.08
    g.fillStyle = rand() < 0.5 ? dark : light
    const r = 0.5 + rand() * maxR
    g.beginPath()
    g.arc(rand() * s, rand() * s, r, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
}

/** 创建全部程序化贴图 */
export function createTextures(): Textures {
  // —— 清水混凝土：横向模板缝 + 云状斑驳 + 细孔 ——
  const concrete = makeSurface({
    size: 512,
    repeat: 1,
    relief: 2.2,
    albedo(g, s) {
      const rand = makeRand(11)
      g.fillStyle = '#b8b4ac'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 260; i++) {
        const r = 20 + rand() * 90
        const x = rand() * s
        const y = rand() * s
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, 'rgba(255,255,255,' + (0.013 + rand() * 0.017) + ')')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = grad
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
      for (let i = 0; i < 120; i++) {
        const r = 30 + rand() * 80
        const x = rand() * s
        const y = rand() * s
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, 'rgba(96,92,86,' + (0.017 + rand() * 0.02) + ')')
        grad.addColorStop(1, 'rgba(96,92,86,0)')
        g.fillStyle = grad
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
      speckle(g, s, rand, 5000, '#6e6a63', '#dcd8d0', 1.2)
      // 模板拼缝：每 1/4 高度一条，缝下方略亮（水泥浆溢出）
      for (let y = 0; y < s; y += s / 4) {
        g.globalAlpha = 0.5
        g.fillStyle = '#7d7972'
        g.fillRect(0, y, s, 2)
        g.globalAlpha = 0.35
        g.fillStyle = '#e6e2da'
        g.fillRect(0, y + 2, s, 1)
      }
      // 对拉螺栓孔
      for (let y = s / 8; y < s; y += s / 4) {
        for (let x = s / 8; x < s; x += s / 4) {
          g.globalAlpha = 0.55
          g.fillStyle = '#84807a'
          g.beginPath()
          g.arc(x, y, 2.4, 0, Math.PI * 2)
          g.fill()
        }
      }
      g.globalAlpha = 1
    },
    height(g, s) {
      const rand = makeRand(12)
      g.fillStyle = '#808080'
      g.fillRect(0, 0, s, s)
      for (let y = 0; y < s; y += s / 4) {
        g.fillStyle = '#4a4a4a'
        g.fillRect(0, y, s, 3)
      }
      for (let y = s / 8; y < s; y += s / 4) {
        for (let x = s / 8; x < s; x += s / 4) {
          g.fillStyle = '#3c3c3c'
          g.beginPath()
          g.arc(x, y, 3, 0, Math.PI * 2)
          g.fill()
        }
      }
      speckle(g, s, rand, 3000, '#6a6a6a', '#969696', 1.4)
    },
    rough(g, s) {
      const rand = makeRand(13)
      g.fillStyle = '#d2d2d2'
      g.fillRect(0, 0, s, s)
      speckle(g, s, rand, 4000, '#c4c4c4', '#dedede', 2)
      // 低频斑驳只留极浅一层（原来的大块深斑像"发霉"，这里 alpha 压到 0.12 以内）
      for (let i = 0; i < 40; i++) {
        const r = 30 + rand() * 70
        const x = rand() * s
        const y = rand() * s
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, 'rgba(150,150,150,0.12)')
        grad.addColorStop(1, 'rgba(150,150,150,0)')
        g.fillStyle = grad
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
      // 收窄动态范围：整体映射到 0.80~0.92（相对基准 0.862 波动 ±0.06 以内），
      // 保留细密气孔与极浅色差，但不再出现大片亮暗（roughnessMap 会乘到材质 roughness 上）
      const img = g.getImageData(0, 0, s, s)
      const d = img.data
      const base = 0.862
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] / 255
        const band = Math.min(0.92, Math.max(0.8, base + (v - base) * 0.5))
        const c = Math.round(band * 255)
        d[i] = c
        d[i + 1] = c
        d[i + 2] = c
        d[i + 3] = 255
      }
      g.putImageData(img, 0, 0)
    }
  })

  // —— 木饰面：竖向窄板 + 深缝 + 顺纹拉丝 ——
  const wood = makeSurface({
    size: 256,
    repeat: 1,
    relief: 3.2,
    albedo(g, s) {
      const rand = makeRand(21)
      // 灰调哑光木：原 #a97844 降饱和约 20%、明度略降 → #97724a
      g.fillStyle = '#97724a'
      g.fillRect(0, 0, s, s)
      const board = s / 8
      for (let b = 0; b < 8; b++) {
        const x = b * board
        const tone = 0.93 + rand() * 0.12
        g.globalAlpha = 0.5
        g.fillStyle = 'rgb(' + Math.round(151 * tone) + ',' + Math.round(114 * tone) + ',' + Math.round(74 * tone) + ')'
        g.fillRect(x + 0.8, 0, board - 1.6, s)
        g.globalAlpha = 1
        // 木纹：更细更短的顺纹线（近景不糊成粗条带）
        for (let i = 0; i < 60; i++) {
          g.globalAlpha = 0.04 + rand() * 0.08
          g.fillStyle = rand() < 0.6 ? '#4a382a' : '#b7a189'
          const lw = 0.4 + rand() * 0.6
          g.fillRect(x + 1.5 + rand() * (board - 3), rand() * s, lw, 6 + rand() * 34)
        }
        // 板缝
        g.globalAlpha = 0.7
        g.fillStyle = '#2e2419'
        g.fillRect(x, 0, 1.2, s)
        g.globalAlpha = 1
      }
      speckle(g, s, rand, 600, '#40342a', '#b5a28c', 0.9)
    },
    height(g, s) {
      g.fillStyle = '#9a9a9a'
      g.fillRect(0, 0, s, s)
      const board = s / 8
      for (let b = 0; b < 8; b++) {
        g.fillStyle = '#2e2e2e'
        g.fillRect(b * board, 0, 1.6, s)
      }
      const rand = makeRand(22)
      for (let i = 0; i < 1200; i++) {
        g.globalAlpha = 0.12
        g.fillStyle = rand() < 0.5 ? '#7a7a7a' : '#b4b4b4'
        g.fillRect(rand() * s, rand() * s, 1, 4 + rand() * 30)
      }
      g.globalAlpha = 1
    },
    rough(g, s) {
      const rand = makeRand(23)
      g.fillStyle = '#8e8e8e'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 500; i++) {
        g.globalAlpha = 0.1
        g.fillStyle = rand() < 0.5 ? '#6e6e6e' : '#b0b0b0'
        g.fillRect(rand() * s, rand() * s, 1, 8 + rand() * 40)
      }
      g.globalAlpha = 1
    }
  })

  // —— 户外木平台：横向宽板 + 板间缝 ——
  const deck = makeSurface({
    size: 256,
    repeat: 1,
    relief: 3.6,
    albedo(g, s) {
      const rand = makeRand(31)
      g.fillStyle = '#9d7549'
      g.fillRect(0, 0, s, s)
      const plank = s / 5
      for (let p = 0; p < 5; p++) {
        const y = p * plank
        const tone = 0.92 + rand() * 0.16
        g.globalAlpha = 0.55
        g.fillStyle = 'rgb(' + Math.round(157 * tone) + ',' + Math.round(117 * tone) + ',' + Math.round(73 * tone) + ')'
        g.fillRect(0, y + 1.5, s, plank - 3)
        g.globalAlpha = 1
        for (let i = 0; i < 30; i++) {
          g.globalAlpha = 0.05 + rand() * 0.1
          g.fillStyle = rand() < 0.6 ? '#6b4a28' : '#c49b6c'
          g.fillRect(rand() * s, y + 2 + rand() * (plank - 4), 20 + rand() * 90, 0.8 + rand())
        }
        g.globalAlpha = 0.8
        g.fillStyle = '#2f2113'
        g.fillRect(0, y, s, 2)
        g.globalAlpha = 1
      }
    },
    height(g, s) {
      g.fillStyle = '#a0a0a0'
      g.fillRect(0, 0, s, s)
      const plank = s / 5
      for (let p = 0; p < 5; p++) {
        g.fillStyle = '#262626'
        g.fillRect(0, p * plank, s, 2)
      }
    },
    rough(g, s) {
      const rand = makeRand(33)
      g.fillStyle = '#9c9c9c'
      g.fillRect(0, 0, s, s)
      speckle(g, s, rand, 800, '#8a8a8a', '#b4b4b4', 2)
    }
  })

  // —— 深色阳极氧化金属：横向拉丝 ——
  const metal = makeSurface({
    size: 128,
    repeat: 1,
    relief: 1.2,
    albedo(g, s) {
      const rand = makeRand(41)
      g.fillStyle = '#2b2f33'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 900; i++) {
        g.globalAlpha = 0.04 + rand() * 0.06
        g.fillStyle = rand() < 0.5 ? '#15181b' : '#4b5257'
        g.fillRect(0, rand() * s, s, 0.7)
      }
      g.globalAlpha = 1
    },
    height(g, s) {
      const rand = makeRand(42)
      g.fillStyle = '#808080'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 500; i++) {
        g.globalAlpha = 0.15
        g.fillStyle = rand() < 0.5 ? '#6a6a6a' : '#969696'
        g.fillRect(0, rand() * s, s, 0.8)
      }
      g.globalAlpha = 1
    },
    rough(g, s) {
      const rand = makeRand(43)
      g.fillStyle = '#7a7a7a'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 400; i++) {
        g.globalAlpha = 0.1
        g.fillStyle = rand() < 0.5 ? '#606060' : '#9a9a9a'
        g.fillRect(0, rand() * s, s, 0.8)
      }
      g.globalAlpha = 1
    }
  })

  // —— 石板铺装：大块石板 + 细缝 + 磨边 ——
  const paving = makeSurface({
    size: 256,
    repeat: 1,
    relief: 2.4,
    albedo(g, s) {
      const rand = makeRand(51)
      g.fillStyle = '#8f8b82'
      g.fillRect(0, 0, s, s)
      const cols = 2
      const rows = 2
      const cw = s / cols
      const ch = s / rows
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tone = 0.88 + rand() * 0.2
          const base = 176 * tone
          g.fillStyle = 'rgb(' + Math.round(base) + ',' + Math.round(base * 0.985) + ',' + Math.round(base * 0.95) + ')'
          g.beginPath()
          g.roundRect(c * cw + 3, r * ch + 3, cw - 6, ch - 6, 2)
          g.fill()
          for (let i = 0; i < 70; i++) {
            g.globalAlpha = 0.05 + rand() * 0.07
            g.fillStyle = rand() < 0.5 ? '#6c685f' : '#d8d4c9'
            g.fillRect(c * cw + 4 + rand() * (cw - 8), r * ch + 4 + rand() * (ch - 8), 1 + rand() * 12, 1 + rand() * 3)
          }
          g.globalAlpha = 1
        }
      }
      speckle(g, s, rand, 2200, '#6f6b62', '#dedacd', 1.1)
    },
    height(g, s) {
      const rand = makeRand(52)
      g.fillStyle = '#b4b4b4'
      g.fillRect(0, 0, s, s)
      const cw = s / 2
      const ch = s / 2
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          g.fillStyle = '#2f2f2f'
          g.fillRect(c * cw, r * ch, 4, ch)
          g.fillRect(c * cw, r * ch, cw, 4)
        }
      }
      speckle(g, s, rand, 1500, '#9c9c9c', '#cccccc', 2)
    },
    rough(g, s) {
      const rand = makeRand(53)
      g.fillStyle = '#c4c4c4'
      g.fillRect(0, 0, s, s)
      speckle(g, s, rand, 2500, '#a8a8a8', '#dcdcdc', 2)
    }
  })

  // —— 砾石：密排卵石 ——
  const gravel = makeSurface({
    size: 256,
    repeat: 2,
    relief: 4.5,
    albedo(g, s) {
      const rand = makeRand(61)
      g.fillStyle = '#837c70'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 2600; i++) {
        const v = 120 + Math.floor(rand() * 70)
        g.fillStyle = 'rgb(' + v + ',' + Math.round(v * 0.97) + ',' + Math.round(v * 0.9) + ')'
        g.beginPath()
        g.ellipse(rand() * s, rand() * s, 1.6 + rand() * 3.2, 1.3 + rand() * 2.4, rand() * 3, 0, Math.PI * 2)
        g.fill()
      }
    },
    height(g, s) {
      const rand = makeRand(62)
      g.fillStyle = '#4a4a4a'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 2600; i++) {
        const v = 130 + Math.floor(rand() * 110)
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'
        g.beginPath()
        g.ellipse(rand() * s, rand() * s, 1.8 + rand() * 3.4, 1.4 + rand() * 2.6, rand() * 3, 0, Math.PI * 2)
        g.fill()
      }
    },
    rough(g, s) {
      const rand = makeRand(63)
      g.fillStyle = '#d8d8d8'
      g.fillRect(0, 0, s, s)
      speckle(g, s, rand, 1500, '#bcbcbc', '#ececec', 2.4)
    }
  })

  // —— 草地地面（近中性灰绿，颜色交给材质 tint 随季节变化） ——
  const grass = makeSurface({
    size: 512,
    repeat: 1,
    relief: 2.6,
    albedo(g, s) {
      const rand = makeRand(71)
      g.fillStyle = '#8b9077'
      g.fillRect(0, 0, s, s)
      // 大块深浅斑（地衣/枯草）
      for (let i = 0; i < 140; i++) {
        const r = 20 + rand() * 80
        const x = rand() * s
        const y = rand() * s
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, rand() < 0.5 ? 'rgba(96,104,74,0.22)' : 'rgba(150,152,116,0.2)')
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = grad
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
      // 密集草叶细纹
      for (let i = 0; i < 9000; i++) {
        g.globalAlpha = 0.08 + rand() * 0.16
        g.strokeStyle = rand() < 0.5 ? '#6f7a58' : '#a8ad86'
        g.lineWidth = 0.7 + rand() * 0.8
        const x = rand() * s
        const y = rand() * s
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + (rand() - 0.5) * 6, y - 3 - rand() * 7)
        g.stroke()
      }
      g.globalAlpha = 1
    },
    height(g, s) {
      const rand = makeRand(72)
      g.fillStyle = '#808080'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 7000; i++) {
        g.globalAlpha = 0.14 + rand() * 0.18
        g.strokeStyle = rand() < 0.5 ? '#5a5a5a' : '#a6a6a6'
        g.lineWidth = 1
        const x = rand() * s
        const y = rand() * s
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + (rand() - 0.5) * 8, y - 4 - rand() * 9)
        g.stroke()
      }
      g.globalAlpha = 1
    },
    rough(g, s) {
      const rand = makeRand(73)
      g.fillStyle = '#c8c8c8'
      g.fillRect(0, 0, s, s)
      speckle(g, s, rand, 3500, '#b0b0b0', '#e0e0e0', 2.2)
    }
  })

  // —— 树皮：竖向深沟 ——
  const bark = makeSurface({
    size: 128,
    repeat: 1,
    relief: 5,
    albedo(g, s) {
      const rand = makeRand(81)
      g.fillStyle = '#5f4d3b'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 260; i++) {
        g.globalAlpha = 0.12 + rand() * 0.2
        g.fillStyle = rand() < 0.5 ? '#38291c' : '#8a7257'
        g.fillRect(rand() * s, rand() * s, 1 + rand() * 2.5, 20 + rand() * 70)
      }
      speckle(g, s, rand, 900, '#2f2318', '#a08a6c', 1.4)
    },
    height(g, s) {
      const rand = makeRand(82)
      g.fillStyle = '#707070'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 220; i++) {
        g.globalAlpha = 0.5
        g.fillStyle = rand() < 0.5 ? '#3a3a3a' : '#a8a8a8'
        g.fillRect(rand() * s, 0, 1.5 + rand() * 3, s)
      }
    },
    rough(g, s) {
      const rand = makeRand(83)
      g.fillStyle = '#d0d0d0'
      g.fillRect(0, 0, s, s)
      speckle(g, s, rand, 1200, '#b8b8b8', '#e8e8e8', 1.6)
    }
  })

  // —— 积雪：柔和起伏 + 细碎闪点 ——
  const snow = makeSurface({
    size: 128,
    repeat: 1,
    relief: 1.6,
    albedo(g, s) {
      const rand = makeRand(91)
      g.fillStyle = '#eef2f6'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 90; i++) {
        const r = 8 + rand() * 34
        const x = rand() * s
        const y = rand() * s
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, rand() < 0.5 ? 'rgba(206,216,226,0.5)' : 'rgba(255,255,255,0.6)')
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = grad
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
    },
    height(g, s) {
      const rand = makeRand(92)
      g.fillStyle = '#808080'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 90; i++) {
        const r = 10 + rand() * 36
        const x = rand() * s
        const y = rand() * s
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, rand() < 0.5 ? 'rgba(60,60,60,0.5)' : 'rgba(180,180,180,0.5)')
        grad.addColorStop(1, 'rgba(128,128,128,0)')
        g.fillStyle = grad
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
    },
    rough(g, s) {
      const rand = makeRand(93)
      g.fillStyle = '#6e6e6e'
      g.fillRect(0, 0, s, s)
      speckle(g, s, rand, 700, '#4a4a4a', '#9a9a9a', 1.6)
    }
  })

  return {
    concrete,
    wood,
    deck,
    metal,
    paving,
    gravel,
    grass,
    bark,
    snow,
    leaf: makeLeafCluster(),
    needle: makeNeedleSpray(),
    dot: makeTexture(64, (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      grad.addColorStop(0, 'rgba(255,255,255,1)')
      grad.addColorStop(0.4, 'rgba(255,255,255,0.6)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, s, s)
    }, 1, 1, false),
    rain: makeTexture(16, (g, s) => {
      const grad = g.createLinearGradient(0, 0, 0, s)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(0.5, 'rgba(210,228,248,0.9)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(s / 2 - 1, 0, 2, s)
    }, 1, 1, false),
    cloud: makeCloud()
  }
}

/**
 * 功能：画一片带尖头的叶子（叶身 + 中脉阴影），坐标为贴图像素。
 * 参数：g 2D 上下文；x/y 叶心；len 叶长；wid 叶宽；angle 朝向；grey 明度（0.45~1）。
 */
function drawLeaf(g: Ctx, x: number, y: number, len: number, wid: number, angle: number, grey: number): void {
  const v = Math.round(grey * 255)
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  g.beginPath()
  g.moveTo(0, -len * 0.5)
  g.quadraticCurveTo(wid, -len * 0.08, 0, len * 0.5)
  g.quadraticCurveTo(-wid, -len * 0.08, 0, -len * 0.5)
  g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'
  g.fill()
  g.restore()
}

/**
 * 叶团卡片：一整团密集咬合的叶子（内部留少量透光缝，边缘参差），
 * 材质 color 决定季节色，贴图只提供形状与明暗层次。
 * 关键点：不能画成均匀散布的孤立叶片 —— 那样每张卡片都像绿色碎纸，越看越假。
 */
function makeLeafCluster(): THREE.CanvasTexture {
  const size = 256
  const { c, g } = canvasOf(size)
  g.clearRect(0, 0, size, size)
  const rand = makeRand(101)
  // 3 个互相错开的团心：轮廓天然不规则，不会读成一个圆盘
  const blobs = [
    { x: size * 0.42, y: size * 0.46, r: size * 0.3 },
    { x: size * 0.64, y: size * 0.36, r: size * 0.22 },
    { x: size * 0.58, y: size * 0.64, r: size * 0.24 }
  ]
  for (const b of blobs) {
    const leaves = 320
    for (let i = 0; i < leaves; i++) {
      // 高斯落位：中心密、外缘疏，边缘自然稀疏到只剩几片叶
      const u = (rand() + rand() + rand() - 1.5) / 1.5
      const v = (rand() + rand() + rand() - 1.5) / 1.5
      const x = b.x + u * b.r * 1.25
      const y = b.y + v * b.r * 1.25
      if (x < 2 || x > size - 2 || y < 2 || y > size - 2) continue
      const dist = Math.hypot(x - b.x, y - b.y) / b.r
      // 外缘叶子更小：轮廓收尖，避免"齐边贴片"
      const shrink = dist > 1 ? 0.55 : 1
      const len = (9 + rand() * 8) * shrink
      const wid = len * (0.3 + rand() * 0.14)
      // 明度随离团心距离加亮（模拟内部阴影），叶间再随机抖动
      const grey = 0.52 + Math.min(dist, 1.4) * 0.3 + rand() * 0.18
      drawLeaf(g, x, y, len, wid, rand() * Math.PI * 2, Math.min(grey, 1))
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.anisotropy = 4
  disableMips(t)
  return t
}

/**
 * 功能：关掉贴图的 mipmap，改用线性缩小采样。
 * 原因：叶团是 alphaTest 镂空卡片，缩到后面几级 mip 时半透明像素被平均，
 * 整张卡的 alpha 均值会越过 alphaTest 阈值 —— 于是要么整块四边形显形成"大方块"，
 * 要么整张卡被丢弃（树冠忽然变稀）。这类贴图不能走 mip 链。
 * 参数：t 目标贴图。
 * 返回：无（原地修改）。
 */
function disableMips(t: THREE.CanvasTexture): void {
  t.generateMipmaps = false
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
}

/**
 * 针叶枝簇卡片：一根自下而上渐细的枝条，两侧密排下垂的针叶，
 * 末端收尖。卡片按层径向排布时，读起来是"一圈枝条"而不是"塑料锥面"。
 */
function makeNeedleSpray(): THREE.CanvasTexture {
  const size = 256
  const { c, g } = canvasOf(size)
  g.clearRect(0, 0, size, size)
  const rand = makeRand(131)
  const cx = size * 0.5
  const top = size * 0.06
  const bottom = size * 0.94
  // 主枝：下粗上细，略带弯曲
  g.strokeStyle = 'rgb(120,120,120)'
  g.lineCap = 'round'
  for (let i = 0; i < 26; i++) {
    const t0 = i / 26
    const t1 = (i + 1) / 26
    const y0 = bottom + (top - bottom) * t0
    const y1 = bottom + (top - bottom) * t1
    const x0 = cx + Math.sin(t0 * 2.2) * size * 0.02
    const x1 = cx + Math.sin(t1 * 2.2) * size * 0.02
    g.lineWidth = 4.2 * (1 - t0 * 0.72)
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
  }
  // 针叶：沿枝条两侧成对斜生，越靠上越短（枝梢收尖）
  const pairs = 34
  for (let i = 0; i < pairs; i++) {
    const t = i / pairs
    const y = bottom + (top - bottom) * t
    const x = cx + Math.sin(t * 2.2) * size * 0.02
    const len = size * (0.34 - t * 0.24) * (0.82 + rand() * 0.4)
    const grey = 0.6 + rand() * 0.4
    for (const side of [-1, 1]) {
      // 针叶下垂：起点在枝上，末端向下外侧伸，夹角约 35°
      drawLeaf(g, x + side * len * 0.36, y + len * 0.30, len, len * 0.1, side * (0.95 + rand() * 0.3), grey)
      if (rand() < 0.55) {
        drawLeaf(g, x + side * len * 0.2, y + len * 0.5, len * 0.8, len * 0.085, side * (1.15 + rand() * 0.3), grey * 0.92)
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.anisotropy = 4
  disableMips(t)
  return t
}

/** 云层 fBm 噪声（alphaMap：白=不透明） */
function makeCloud(): THREE.CanvasTexture {
  const size = 512
  const { c, g } = canvasOf(size)
  g.fillStyle = '#000000'
  g.fillRect(0, 0, size, size)
  const rand = makeRand(111)
  for (let layer = 0; layer < 4; layer++) {
    const count = 24 * (layer + 1)
    const rMax = size / (2.2 - layer * 0.35)
    for (let i = 0; i < count; i++) {
      const x = rand() * size
      const y = rand() * size
      const r = rMax * (0.25 + rand() * 0.75)
      const a = 0.1 / (layer + 1)
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, 'rgba(255,255,255,' + a + ')')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 2)
  return t
}

/** 单图贴图（兼容旧的 makeTexture 语义） */
function makeTexture(size: number, draw: Draw, rx = 1, ry = 1, srgb = true): THREE.CanvasTexture {
  const { c, g } = canvasOf(size)
  draw(g, size)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}
