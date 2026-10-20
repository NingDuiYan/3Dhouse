import * as THREE from 'three'

/** 程序化贴图集合（启动期一次生成，运行期零 IO） */
export interface Textures {
  plaster: THREE.CanvasTexture
  wood: THREE.CanvasTexture
  floor: THREE.CanvasTexture
  shingle: THREE.CanvasTexture
  ground: THREE.CanvasTexture
  bark: THREE.CanvasTexture
  dot: THREE.CanvasTexture
  rain: THREE.CanvasTexture
  cloud: THREE.CanvasTexture
}

type Draw = (g: CanvasRenderingContext2D, s: number) => void

function makeTexture(size: number, draw: Draw, repeatX = 1, repeatY = 1, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d') as CanvasRenderingContext2D
  draw(g, size)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 创建全部程序化贴图 */
export function createTextures(): Textures {
  return {
    // 建筑灰泥墙面
    plaster: makeTexture(256, (g, s) => {
      g.fillStyle = '#d6d0c2'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 1600; i++) {
        g.globalAlpha = 0.05 + Math.random() * 0.06
        g.fillStyle = Math.random() < 0.5 ? '#7a7468' : '#fffdf5'
        g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3)
      }
      g.globalAlpha = 1
    }),
    // 木板（门 / 窗框）
    wood: makeTexture(256, (g, s) => {
      g.fillStyle = '#8a6a4a'
      g.fillRect(0, 0, s, s)
      for (let x = 0; x < s; x += 42) {
        g.fillStyle = 'rgba(40,25,12,0.35)'
        g.fillRect(x, 0, 2, s)
      }
      for (let i = 0; i < 300; i++) {
        g.globalAlpha = 0.06 + Math.random() * 0.1
        g.fillStyle = Math.random() < 0.5 ? '#3c2c1c' : '#b08a5e'
        g.fillRect(Math.random() * s, Math.random() * s, 1, 12 + Math.random() * 40)
      }
      g.globalAlpha = 1
    }),
    // 室内地板（横向木板）
    floor: makeTexture(256, (g, s) => {
      g.fillStyle = '#9a7852'
      g.fillRect(0, 0, s, s)
      for (let y = 0; y < s; y += 30) {
        g.fillStyle = 'rgba(45,28,14,0.35)'
        g.fillRect(0, y, s, 2)
      }
      for (let i = 0; i < 260; i++) {
        g.globalAlpha = 0.05 + Math.random() * 0.1
        g.fillStyle = Math.random() < 0.5 ? '#4a3420' : '#c8a274'
        g.fillRect(Math.random() * s, Math.random() * s, 14 + Math.random() * 50, 1)
      }
      g.globalAlpha = 1
    }, 3, 2),
    // 屋顶瓦片
    shingle: makeTexture(256, (g, s) => {
      g.fillStyle = '#4a4f58'
      g.fillRect(0, 0, s, s)
      let row = 0
      for (let y = 0; y < s; y += 22) {
        const off = (row % 2) * 17
        for (let x = -34; x < s; x += 34) {
          const v = 58 + Math.floor(Math.random() * 26)
          g.fillStyle = 'rgb(' + v + ',' + (v + 4) + ',' + (v + 10) + ')'
          g.fillRect(x + off, y, 30, 18)
        }
        row++
      }
    }),
    // 地面草地（近中性灰绿，颜色由材质 tint 控制）
    ground: makeTexture(256, (g, s) => {
      g.fillStyle = '#9aa08c'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 2400; i++) {
        g.globalAlpha = 0.06 + Math.random() * 0.1
        const r = Math.random()
        g.fillStyle = r < 0.4 ? '#6d7466' : (r < 0.75 ? '#c4c9b2' : '#7f8a70')
        g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2)
      }
      g.globalAlpha = 1
    }, 14, 14),
    // 树皮
    bark: makeTexture(128, (g, s) => {
      g.fillStyle = '#6e5a44'
      g.fillRect(0, 0, s, s)
      for (let i = 0; i < 200; i++) {
        g.globalAlpha = 0.1 + Math.random() * 0.15
        g.fillStyle = Math.random() < 0.5 ? '#4a3a2a' : '#8a7458'
        g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random(), 16 + Math.random() * 60)
      }
      g.globalAlpha = 1
    }),
    // 柔和圆点精灵（樱瓣/落叶/雪/萤火虫共用）
    dot: makeTexture(64, (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      grad.addColorStop(0, 'rgba(255,255,255,1)')
      grad.addColorStop(0.4, 'rgba(255,255,255,0.6)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, s, s)
    }, 1, 1, false),
    // 雨丝（竖向渐变细条）
    rain: makeTexture(16, (g, s) => {
      const grad = g.createLinearGradient(0, 0, 0, s)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(0.5, 'rgba(210,228,248,0.9)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(s / 2 - 1, 0, 2, s)
    }, 1, 1, false),
    // 云层 fBm 噪声（用作 alphaMap：白=不透明）
    cloud: makeTexture(512, (g, s) => {
      g.fillStyle = '#000000'
      g.fillRect(0, 0, s, s)
      // 多层随机径向渐变斑块近似 fBm
      for (let layer = 0; layer < 4; layer++) {
        const count = 24 * (layer + 1)
        const rMax = s / (2.2 - layer * 0.35)
        for (let i = 0; i < count; i++) {
          const x = Math.random() * s
          const y = Math.random() * s
          const r = rMax * (0.25 + Math.random() * 0.75)
          const a = 0.10 / (layer + 1)
          const grad = g.createRadialGradient(x, y, 0, x, y, r)
          grad.addColorStop(0, 'rgba(255,255,255,' + a + ')')
          grad.addColorStop(1, 'rgba(255,255,255,0)')
          g.fillStyle = grad
          g.fillRect(x - r, y - r, r * 2, r * 2)
        }
      }
    }, 2, 2, false)
  }
}
