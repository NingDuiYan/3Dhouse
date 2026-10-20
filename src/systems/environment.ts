import * as THREE from 'three'
import type { SceneParams } from '../types'
import type { Textures } from './textures'
import { tileSurface } from './textures'
import {
  FOG_MIN_DENSITY,
  GROUND_ANISOTROPY_MAX,
  GROUND_TILE_METERS,
  SNOW_GROUND_OPACITY,
  SNOW_ROOF_OPACITY,
  TERRAIN_FLAT_RADIUS,
  TERRAIN_HILL_HEIGHT,
  TERRAIN_HILL_SCALE,
  TERRAIN_SEGMENTS,
  TERRAIN_SIZE,
  WET_RATE
} from '../config'

/** 地面环境系统：起伏地形 + 草地 PBR + 积雪层 + 雾 + 曝光 + Bloom + 屋顶积雪 + 湿滑 */
export interface EnvironmentSystem {
  groundMat: THREE.MeshStandardMaterial
  apply(params: SceneParams, dt: number): void
}

/** 确定性 2D 值噪声：用于地形起伏（同输入永远同结果） */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

/** 两层噪声叠加：低频大坡 + 高频小起伏 */
function hillHeight(x: number, z: number): number {
  const n1 = smoothNoise(x / TERRAIN_HILL_SCALE, z / TERRAIN_HILL_SCALE)
  const n2 = smoothNoise(x / (TERRAIN_HILL_SCALE * 0.37) + 11, z / (TERRAIN_HILL_SCALE * 0.37) + 7)
  return (n1 * 0.75 + n2 * 0.25) * 2 - 1
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * 功能：生成地形几何——房屋周围保持水平，向外平滑过渡到起伏丘陵。
 * 参数：无（尺寸与幅度来自 config 常量）。
 * 返回：已位移并重算法线的平面几何（已旋转到 XZ 平面）。
 */
function createTerrainGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    // 平面几何在 XY 上生成，rotation.x = -PI/2 后 y 轴变成 -z
    const r = Math.hypot(x, y)
    const blend = smoothstep(TERRAIN_FLAT_RADIUS, TERRAIN_FLAT_RADIUS + 60, r)
    pos.setZ(i, hillHeight(x, -y) * TERRAIN_HILL_HEIGHT * blend)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.rotateX(-Math.PI / 2)
  return geo
}

export function createEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  bloomPass: { strength: number },
  roofSnowMat: THREE.MeshStandardMaterial,
  pathMat: THREE.MeshStandardMaterial,
  tex: Textures
): EnvironmentSystem {
  const maxAniso = Math.min(GROUND_ANISOTROPY_MAX, renderer.capabilities.getMaxAnisotropy())
  // 草地按"单块贴图覆盖米数"反算平铺，地形变大后细节密度保持不变
  const grassRepeat = Math.max(1, Math.round(TERRAIN_SIZE / GROUND_TILE_METERS))
  const grassSurface = tileSurface(tex.grass, grassRepeat, grassRepeat)
  grassSurface.map.anisotropy = maxAniso
  grassSurface.normalMap.anisotropy = maxAniso

  const groundMat = new THREE.MeshStandardMaterial({
    ...grassSurface,
    color: 0x8a6830,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.55
  })
  const ground = new THREE.Mesh(createTerrainGeometry(), groundMat)
  ground.position.y = 0
  ground.receiveShadow = true
  scene.add(ground)

  // 积雪：与地形同几何、抬 3cm，按 snow 参数淡入（雨天/晴天完全透明）
  const snowSurface = tileSurface(tex.snow, Math.round(TERRAIN_SIZE / 6), Math.round(TERRAIN_SIZE / 6))
  snowSurface.map.anisotropy = maxAniso
  snowSurface.normalMap.anisotropy = maxAniso
  const snowMat = new THREE.MeshStandardMaterial({
    ...snowSurface,
    color: 0xf2f6fa,
    roughness: 0.72,
    metalness: 0,
    transparent: true,
    opacity: 0,
    envMapIntensity: 0.7
  })
  const snowCover = new THREE.Mesh(ground.geometry, snowMat)
  snowCover.scale.setScalar(1)
  snowCover.position.y = 0.03
  snowCover.receiveShadow = true
  scene.add(snowCover)

  scene.fog = new THREE.FogExp2(0xa8868e, 0.02)
  const fog = scene.fog as THREE.FogExp2

  return {
    groundMat,
    apply(params, dt) {
      groundMat.color.copy(params.ground)
      // 地面/铺装 roughness 向天气 wet 目标插值：雨天出现湿滑反光（按 dt 归一，与帧率无关）
      const k = Math.min(WET_RATE * dt, 1)
      groundMat.roughness += (params.wet - groundMat.roughness) * k
      pathMat.roughness += (params.wet - pathMat.roughness) * k
      snowMat.opacity = params.snow * SNOW_GROUND_OPACITY
      snowCover.visible = params.snow > 0.01
      roofSnowMat.opacity = params.snow * SNOW_ROOF_OPACITY
      fog.color.copy(params.fog)
      // 密度下限：否则晴天正午几乎不衰减，远处地形边缘会切出硬边
      fog.density = Math.max(params.fogD, FOG_MIN_DENSITY)
      renderer.toneMappingExposure = params.exp
      bloomPass.strength = params.bloom
    }
  }
}
