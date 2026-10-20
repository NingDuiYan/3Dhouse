import * as THREE from 'three'
import type { Textures } from './textures'

/** 房屋相关的全部共享材质（环境/天气系统需要引用其中部分） */
export interface HouseMats {
  glassMat: THREE.MeshPhysicalMaterial
  roofSnowMat: THREE.MeshStandardMaterial
  pathMat: THREE.MeshStandardMaterial
}

export interface HouseSystem {
  group: THREE.Group
  mats: HouseMats
}

function box(
  w: number, h: number, d: number,
  mat: THREE.Material, x: number, y: number, z: number,
  cast = true, recv = true
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = cast
  m.receiveShadow = recv
  return m
}

/** 搭建房屋（v1 L345 区块平移）：墙体洞口分段 + 窗框透射玻璃 + 屋顶烟囱 + 积雪层 */
export function createHouse(tex: Textures): HouseSystem {
  const group = new THREE.Group()

  const wallMat = new THREE.MeshStandardMaterial({ map: tex.plaster, side: THREE.DoubleSide, roughness: 0.95, envMapIntensity: 0.4 })
  const woodMat = new THREE.MeshStandardMaterial({ map: tex.wood, color: 0x6a4e34, roughness: 0.8, envMapIntensity: 0.4 })
  const frameMat = new THREE.MeshStandardMaterial({ map: tex.wood, color: 0x4e4238, roughness: 0.75, envMapIntensity: 0.4 })
  const roofMat = new THREE.MeshStandardMaterial({ map: tex.shingle, roughness: 0.85, envMapIntensity: 0.4 })
  const chimneyMat = new THREE.MeshStandardMaterial({ map: tex.plaster, color: 0x9a6a55, roughness: 0.9, envMapIntensity: 0.4 })
  const floorMat = new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.7, envMapIntensity: 0.4 })
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 0.92, roughness: 0.12, thickness: 0.06, ior: 1.45,
    emissive: 0xffb268, emissiveIntensity: 0, side: THREE.DoubleSide, envMapIntensity: 1
  })
  const roofSnowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0, envMapIntensity: 0.5 })
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x7a6a55, roughness: 1 })

  // 后墙 / 左墙 / 右墙（整面）
  group.add(box(6, 3, 0.15, wallMat, 0, 1.5, -2))
  group.add(box(0.15, 3, 4, wallMat, -3, 1.5, 0))
  group.add(box(0.15, 3, 4, wallMat, 3, 1.5, 0))

  // 前墙：门洞（x -2.2..-1.0，y 0..2.1）+ 窗洞（x 0.8..2.4，y 0.9..2.1），由分段拼出
  group.add(box(0.8, 3, 0.15, wallMat, -2.6, 1.5, 1.925))
  group.add(box(1.8, 3, 0.15, wallMat, -0.1, 1.5, 1.925))
  group.add(box(0.6, 3, 0.15, wallMat, 2.7, 1.5, 1.925))
  group.add(box(1.2, 0.9, 0.15, wallMat, -1.6, 2.55, 1.925))
  group.add(box(1.6, 0.9, 0.15, wallMat, 1.6, 0.45, 1.925))
  group.add(box(1.6, 0.9, 0.15, wallMat, 1.6, 2.55, 1.925))

  // 左墙窗洞（z -0.8..0.8，y 0.9..2.1）分段
  group.add(box(0.15, 3, 1.2, wallMat, -3, 1.5, 1.4))
  group.add(box(0.15, 3, 1.2, wallMat, -3, 1.5, -1.4))
  group.add(box(0.15, 0.9, 1.6, wallMat, -3, 0.45, 0))
  group.add(box(0.15, 0.9, 1.6, wallMat, -3, 2.55, 0))

  // 窗框 + 玻璃
  function makeWindow(w: number, h: number): THREE.Group {
    const g = new THREE.Group()
    const t = 0.09, d = 0.18
    g.add(box(w + t * 2, t, d, frameMat, 0, h / 2 + t / 2, 0))
    g.add(box(w + t * 2, t, d, frameMat, 0, -h / 2 - t / 2, 0))
    g.add(box(t, h, d, frameMat, -w / 2 - t / 2, 0, 0))
    g.add(box(t, h, d, frameMat, w / 2 + t / 2, 0, 0))
    g.add(box(0.05, h, 0.1, frameMat, 0, 0, 0))
    g.add(box(w, 0.05, 0.1, frameMat, 0, 0, 0))
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat)
    g.add(glass)
    return g
  }

  const winFront = makeWindow(1.44, 1.12)
  winFront.position.set(1.6, 1.5, 1.93)
  group.add(winFront)

  const winLeft = makeWindow(1.44, 1.12)
  winLeft.rotation.y = Math.PI / 2
  winLeft.position.set(-2.93, 1.5, 0)
  group.add(winLeft)

  // 门 + 门框 + 把手 + 台阶
  group.add(box(1.16, 2.06, 0.1, woodMat, -1.6, 1.03, 1.925))
  group.add(box(0.1, 2.14, 0.2, frameMat, -2.24, 1.07, 1.925))
  group.add(box(0.1, 2.14, 0.2, frameMat, -0.96, 1.07, 1.925))
  group.add(box(1.38, 0.1, 0.2, frameMat, -1.6, 2.16, 1.925))
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), frameMat)
  handle.position.set(-1.14, 1.05, 2.0)
  group.add(handle)
  group.add(box(1.4, 0.08, 0.6, woodMat, -1.6, 0.04, 2.45))

  // 室内地板 + 木桌
  group.add(box(5.7, 0.08, 3.8, floorMat, 0, 0.04, 0))
  group.add(box(1.1, 0.05, 0.65, woodMat, 1.5, 0.72, 0.9))
  const legs: [number, number][] = [[-0.48, -0.26], [0.48, -0.26], [-0.48, 0.26], [0.48, 0.26]]
  for (const p of legs) {
    group.add(box(0.05, 0.7, 0.05, woodMat, 1.5 + p[0], 0.35, 0.9 + p[1]))
  }

  // 屋顶（双坡）+ 山墙 + 烟囱
  const roofFront = box(7.0, 0.12, 2.8, roofMat, 0, 3.62, 1.2)
  roofFront.rotation.x = 0.42
  group.add(roofFront)
  const roofBack = box(7.0, 0.12, 2.8, roofMat, 0, 3.62, -1.2)
  roofBack.rotation.x = -0.42
  group.add(roofBack)

  const gableShape = new THREE.Shape()
  gableShape.moveTo(-2.4, 0)
  gableShape.lineTo(2.4, 0)
  gableShape.lineTo(0, 1.15)
  gableShape.closePath()
  const gableGeo = new THREE.ShapeGeometry(gableShape)
  const gableL = new THREE.Mesh(gableGeo, wallMat)
  gableL.rotation.y = -Math.PI / 2
  gableL.position.set(-2.92, 3.0, 0)
  group.add(gableL)
  const gableR = new THREE.Mesh(gableGeo, wallMat)
  gableR.rotation.y = Math.PI / 2
  gableR.position.set(2.92, 3.0, 0)
  group.add(gableR)

  group.add(box(0.5, 1.3, 0.5, chimneyMat, 1.6, 4.1, -0.5))

  // 屋顶积雪层（opacity 由环境系统随积雪量驱动）
  const roofSnowA = box(7.0, 0.02, 2.8, roofSnowMat, 0, 3.71, 1.2, false, false)
  roofSnowA.rotation.x = 0.42
  group.add(roofSnowA)
  const roofSnowB = box(7.0, 0.02, 2.8, roofSnowMat, 0, 3.71, -1.2, false, false)
  roofSnowB.rotation.x = -0.42
  group.add(roofSnowB)

  // 门前小径
  group.add(box(1.3, 0.02, 4.4, pathMat, -1.6, 0.011, 4.6))

  return { group, mats: { glassMat, roofSnowMat, pathMat } }
}
