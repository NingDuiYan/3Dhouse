import * as THREE from 'three'
import type { ParticleMode } from '../types'
import type { Textures } from './textures'
import { PARTICLE_MAX, PARTICLE_RADIUS } from '../config'

interface ModeCfg {
  color: number
  size: number
  count: number
  blending: THREE.Blending
  opacity: number
}

const MODES: Record<ParticleMode, ModeCfg> = {
  petal: { color: 0xf5b8c8, size: 0.16, count: 240, blending: THREE.NormalBlending, opacity: 0.9 },
  firefly: { color: 0xccff88, size: 0.15, count: 160, blending: THREE.AdditiveBlending, opacity: 0.95 },
  leaf: { color: 0xc87828, size: 0.2, count: 200, blending: THREE.NormalBlending, opacity: 0.92 },
  snow: { color: 0xffffff, size: 0.12, count: 420, blending: THREE.NormalBlending, opacity: 0.9 },
  rain: { color: 0xaac8e8, size: 0.5, count: 420, blending: THREE.NormalBlending, opacity: 0.5 }
}

/** 季节/天气粒子系统：单 Points + 单 BufferGeometry，五种模式仅换配置 */
export interface ParticleSystem {
  setMode(mode: ParticleMode): void
  update(dt: number, t: number, ffGlow: number): void
}

export function createParticles(scene: THREE.Scene, tex: Textures): ParticleSystem {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(PARTICLE_MAX * 3)
  const phase = new Float32Array(PARTICLE_MAX)
  const speed = new Float32Array(PARTICLE_MAX)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))

  const mat = new THREE.PointsMaterial({
    size: 0.2, map: tex.dot, transparent: true, depthWrite: false,
    opacity: 0.92, color: 0xffffff, sizeAttenuation: true
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  scene.add(points)

  let mode: ParticleMode = 'leaf'

  function reseed(): void {
    const isFirefly = mode === 'firefly'
    for (let i = 0; i < MODES[mode].count; i++) {
      const r = PARTICLE_RADIUS * Math.sqrt(Math.random())
      const a = Math.random() * Math.PI * 2
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = isFirefly ? 0.4 + Math.random() * 3 : Math.random() * 9
      pos[i * 3 + 2] = Math.sin(a) * r
      phase[i] = Math.random() * Math.PI * 2
      speed[i] = Math.random()
    }
    geo.attributes.position.needsUpdate = true
  }

  function respawnTop(i: number): void {
    const r = PARTICLE_RADIUS * Math.sqrt(Math.random())
    const a = Math.random() * Math.PI * 2
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = 9 + Math.random() * 4
    pos[i * 3 + 2] = Math.sin(a) * r
  }

  return {
    setMode(next) {
      mode = next
      const cfg = MODES[next]
      mat.color.setHex(cfg.color)
      mat.size = cfg.size
      mat.blending = cfg.blending
      mat.map = next === 'rain' ? tex.rain : tex.dot
      mat.opacity = cfg.opacity
      mat.needsUpdate = true
      geo.setDrawRange(0, cfg.count)
      reseed()
    },
    update(dt, t, ffGlow) {
      const cfg = MODES[mode]
      const n = cfg.count
      for (let i = 0; i < n; i++) {
        const ix = i * 3
        const ph = phase[i]
        if (mode === 'firefly') {
          pos[ix] += Math.sin(t * 0.4 + ph) * 0.35 * dt
          pos[ix + 1] += Math.sin(t * 0.6 + ph * 1.7) * 0.25 * dt
          pos[ix + 2] += Math.cos(t * 0.35 + ph) * 0.35 * dt
          if (pos[ix + 1] < 0.3) pos[ix + 1] = 0.3
          if (pos[ix + 1] > 3.5) pos[ix + 1] = 3.5
        } else if (mode === 'rain') {
          // 雨丝：快速直落，无横摆
          pos[ix + 1] -= (11 + speed[i] * 4) * dt
          if (pos[ix + 1] < 0.05) respawnTop(i)
        } else {
          const fall = mode === 'snow' ? 0.55 + speed[i] * 0.4 : (mode === 'petal' ? 0.32 : 0.75)
          const sway = mode === 'snow' ? 0.25 : 0.6
          const swayFreq = mode === 'leaf' ? 1.8 : 1.2
          pos[ix + 1] -= fall * dt
          pos[ix] += Math.sin(t * swayFreq + ph) * sway * dt
          pos[ix + 2] += Math.cos(t * 0.9 + ph) * 0.3 * dt
          if (pos[ix + 1] < 0.05) respawnTop(i)
        }
      }
      geo.attributes.position.needsUpdate = true
      // 萤火虫仅夜间/晴天可见，其余模式用配置透明度
      mat.opacity = mode === 'firefly' ? ffGlow * cfg.opacity : cfg.opacity
      points.visible = mode !== 'firefly' || ffGlow > 0.02
    }
  }
}
