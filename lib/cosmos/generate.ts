/**
 * 粒子宇宙数据烘焙 —— 每个粒子同时持有三套「形态坐标」，GPU 在顶点着色器里按滚动进度插值。
 *
 *   G 星系（Hero）：双旋臂对数螺旋 + 暖色核球 + 青色恒星形成区 + 尘埃盘 + 晕
 *   D 吸积盘（Motto）：黑洞事件视界 + 光子环 + 引力透镜光晕 + 多普勒增亮吸积盘 + 螺旋落入流
 *   P 星球（Links）：程序化大陆的点阵行星 + 夜侧城市灯光 + 大气辉边 + 行星环 + 卫星
 *
 * 每个 vec4 的 w 分量编码「类别 + 亮度」：floor(w) = 类别，fract(w) = 亮度，节省一个 attribute。
 * 星系与吸积盘按半径排序后一一对应：核球 → 光子环、外旋臂 → 外盘，坍缩过程是有方向的引力塌缩，
 * 而不是随机互换位置的「溶解」。星球序列独立打乱，凝聚过程呈现弥散的星云收拢感。
 */

export type CosmosData = {
  /** 交错数组：每粒子 16 floats = G(4) D(4) P(4) S(4) */
  data: Float32Array
  count: number
}

export const STRIDE = 16

/** 星系半径缩放：让星系溢出视口，开场有包围感 */
const GS = 1.55

function gauss(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const enc = (kind: number, b: number) => kind + Math.min(0.999, Math.max(0.001, b))

/* ---------------- 3D value noise（大陆轮廓） ---------------- */

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440670441)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const c000 = hash3(xi, yi, zi)
  const c100 = hash3(xi + 1, yi, zi)
  const c010 = hash3(xi, yi + 1, zi)
  const c110 = hash3(xi + 1, yi + 1, zi)
  const c001 = hash3(xi, yi, zi + 1)
  const c101 = hash3(xi + 1, yi, zi + 1)
  const c011 = hash3(xi, yi + 1, zi + 1)
  const c111 = hash3(xi + 1, yi + 1, zi + 1)
  return l(l(l(c000, c100, u), l(c010, c110, u), v), l(l(c001, c101, u), l(c011, c111, u), v), w)
}

function fbm(x: number, y: number, z: number): number {
  let s = 0
  let a = 0.5
  let f = 1
  for (let o = 0; o < 5; o++) {
    s += a * vnoise(x * f + 11.3, y * f + 4.7, z * f + 8.1)
    f *= 2.03
    a *= 0.5
  }
  return s
}

function randDir(): [number, number, number] {
  const u = Math.random() * 2 - 1
  const th = Math.random() * Math.PI * 2
  const r = Math.sqrt(1 - u * u)
  return [r * Math.cos(th), u, r * Math.sin(th)]
}

const CONT_FREQ = 1.7

/* ---------------- 形态 G：星系 ---------------- */

function galaxyPoint(out: Float32Array, o: number) {
  const roll = Math.random()
  let r: number
  let th: number
  let h: number
  let kind: number
  let b: number

  if (roll < 0.15) {
    // 核球
    r = Math.abs(gauss()) * 0.17
    th = Math.random() * Math.PI * 2
    h = gauss() * 0.075 * Math.max(0.15, 1 - r / 0.45)
    kind = 0
    b = 0.55 + Math.random() * 0.45
  } else if (roll < 0.65) {
    // 旋臂：对数螺旋，臂宽随半径展开
    // 两条主臂 + 两条较暗的次臂，主臂上点缀青色恒星形成区
    const minor = Math.random() < 0.28
    const arm = (Math.random() < 0.5 ? 0 : Math.PI) + (minor ? Math.PI * 0.5 : 0)
    const t = Math.pow(Math.random(), 0.75)
    r = 0.12 + t * 1.6
    const knot = !minor && Math.random() < 0.07
    const spread = knot ? 0.05 : (minor ? 0.22 : 0.15) + 0.14 * t
    th = arm + Math.log(r / 0.12) * 1.85 + gauss() * spread
    r *= 1 + gauss() * 0.035
    h = gauss() * 0.022
    kind = knot ? 3 : 1
    b = knot ? 0.8 + Math.random() * 0.2 : (minor ? 0.2 : 0.38) + Math.random() * 0.4
  } else if (roll < 0.92) {
    // 尘埃盘
    r = Math.min(1.95, -Math.log(1 - Math.random() * 0.98) * 0.5)
    th = Math.random() * Math.PI * 2
    h = gauss() * 0.03
    kind = 2
    b = 0.2 + Math.random() * 0.28
  } else {
    // 晕
    r = 0.3 + Math.random() * 1.6
    th = Math.random() * Math.PI * 2
    h = gauss() * 0.32
    kind = 2
    b = 0.06 + Math.random() * 0.1
  }

  out[o] = r * GS
  out[o + 1] = th
  out[o + 2] = h * GS
  out[o + 3] = enc(kind, b)
}

/* ---------------- 形态 D：黑洞吸积盘 ---------------- */

function discPoint(out: Float32Array, o: number) {
  const roll = Math.random()
  let r: number
  let th = Math.random() * Math.PI * 2
  let h = 0
  let kind: number
  let b: number

  if (roll < 0.62) {
    // 吸积盘：内侧更密，径向条纹
    r = 0.46 + Math.pow(Math.random(), 1.7) * 2.1
    const band = 0.55 + 0.45 * Math.sin(r * 30 + Math.sin(r * 7) * 2)
    const fall = 1 - 0.6 * ((r - 0.46) / 2.1)
    b = band * fall * (0.65 + 0.35 * Math.random())
    h = gauss() * 0.009 * (0.4 + r)
    kind = 0
  } else if (roll < 0.77) {
    // 引力透镜光晕：盘背面被弯折到视界上下方的像
    r = 0.45 + Math.abs(gauss()) * 0.17
    b = 0.3 + 0.6 * Math.exp(-(r - 0.45) / 0.09) * Math.random()
    kind = 1
  } else if (roll < 0.81) {
    // 光子环
    r = 0.425 + gauss() * 0.004
    b = 0.8 + Math.random() * 0.2
    kind = 3
  } else if (roll < 0.93) {
    // 螺旋落入流（半径由着色器逐帧推算，此处仅作排序键）
    r = 0.5 + Math.random() * 2.1
    h = gauss() * 0.05
    b = 0.45 + Math.random() * 0.45
    kind = 2
  } else {
    // 弥散热晕
    r = 0.6 + Math.random() * 2.4
    h = gauss() * 0.25
    b = 0.05 + Math.random() * 0.08
    kind = 4
  }

  out[o] = r
  out[o + 1] = th
  out[o + 2] = h
  out[o + 3] = enc(kind, b)
}

/* ---------------- 形态 P：星球 ---------------- */

function planetPoints(n: number): Float32Array {
  const out = new Float32Array(n * 4)

  // 按分位数取海陆阈值：保证约 40% 的球面是陆地，不受噪声分布影响
  const samples: number[] = []
  for (let i = 0; i < 3000; i++) {
    const [x, y, z] = randDir()
    samples.push(fbm(x * CONT_FREQ, y * CONT_FREQ, z * CONT_FREQ))
  }
  samples.sort((a, b) => a - b)
  const thr = samples[Math.floor(samples.length * 0.6)]

  const nSat = 12
  const nRing = Math.round(n * 0.21)
  const nAtmo = Math.round(n * 0.09)
  const nSurf = n - nSat - nRing - nAtmo

  let o = 0
  const put = (x: number, y: number, z: number, w: number) => {
    out[o++] = x
    out[o++] = y
    out[o++] = z
    out[o++] = w
  }

  // 地表：海洋粒子按 30% 接受率稀疏化，陆地自然凸显
  let made = 0
  while (made < nSurf) {
    const [x, y, z] = randDir()
    const v = fbm(x * CONT_FREQ, y * CONT_FREQ, z * CONT_FREQ)
    const ice = Math.abs(y) > 0.9
    const land = v > thr || ice
    if (!land && Math.random() > 0.3) continue
    made++
    if (land) {
      const city = !ice && Math.random() < 0.07
      const b = ice ? 0.85 : 0.5 + 0.5 * Math.min(1, (v - thr) * 7)
      const lift = 1.006
      put(x * lift, y * lift, z * lift, enc(city ? 2 : 1, city ? 0.6 + Math.random() * 0.4 : b))
    } else {
      put(x, y, z, enc(0, 0.35 + Math.random() * 0.4))
    }
  }

  // 大气壳
  for (let i = 0; i < nAtmo; i++) {
    const [x, y, z] = randDir()
    const rr = 1.012 + Math.pow(Math.random(), 2) * 0.09
    put(x * rr, y * rr, z * rr, enc(3, 0.4 + Math.random() * 0.6))
  }

  // 行星环：疏密条带 + 卡西尼缝
  for (let i = 0; i < nRing; i++) {
    let r = 1.38 + Math.random() * 0.74
    while (r > 1.7 && r < 1.77) r = 1.38 + Math.random() * 0.74
    const band = 0.4 + 0.6 * Math.abs(Math.sin(r * 23 + Math.sin(r * 61) * 0.6))
    put(r, Math.random() * Math.PI * 2, gauss() * 0.005, enc(4, band * (0.6 + 0.4 * Math.random())))
  }

  // 卫星：轨道半径 / 倾角 / 相位
  for (let i = 0; i < nSat; i++) {
    put(2.35 + Math.random() * 0.4, (Math.random() - 0.5) * 1.4, Math.random() * Math.PI * 2, enc(5, 0.95))
  }

  return out
}

/* ---------------- 组装 ---------------- */

export function generateCosmos(N: number): CosmosData {
  const nStars = Math.round(N * 0.045)
  const nBody = N - nStars

  const g = new Float32Array(nBody * 4)
  const d = new Float32Array(nBody * 4)
  for (let i = 0; i < nBody; i++) {
    galaxyPoint(g, i * 4)
    discPoint(d, i * 4)
  }
  const p = planetPoints(nBody)

  // 星系、吸积盘各自按半径排序后配对 → 坍缩是由内向外、有方向感的
  const gi = new Uint32Array(nBody)
  const di = new Uint32Array(nBody)
  for (let i = 0; i < nBody; i++) gi[i] = di[i] = i
  gi.sort((a, b) => g[a * 4] - g[b * 4])
  di.sort((a, b) => d[a * 4] - d[b * 4])

  // 联合乱序（含背景星），保证自适应降级时截断任意前缀都是均匀抽样
  const order = new Uint32Array(N)
  for (let i = 0; i < N; i++) order[i] = i
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }
  // 星球序列独立打乱
  const pi = new Uint32Array(nBody)
  for (let i = 0; i < nBody; i++) pi[i] = i
  for (let i = nBody - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = pi[i]
    pi[i] = pi[j]
    pi[j] = t
  }

  const data = new Float32Array(N * STRIDE)
  for (let slot = 0; slot < N; slot++) {
    const src = order[slot]
    const o = slot * STRIDE
    const glow = Math.random() < 0.012

    if (src < nBody) {
      const a = gi[src] * 4
      const b = di[src] * 4
      const c = pi[src] * 4
      for (let k = 0; k < 4; k++) {
        data[o + k] = g[a + k]
        data[o + 4 + k] = d[b + k]
        data[o + 8 + k] = p[c + k]
      }
      data[o + 12] = Math.random()
      data[o + 13] = Math.random()
      data[o + 14] = (0.0055 + Math.random() * 0.006) * (glow ? 5 : 1)
      data[o + 15] = 0
    } else {
      // 背景星：只存一个固定位置，铺在相机前方的深空
      const z = 2.5 + Math.random() * 12
      const spread = z + 3.4
      data[o] = (Math.random() * 2 - 1) * spread * 1.25
      data[o + 1] = (Math.random() * 2 - 1) * spread * 0.75
      data[o + 2] = z
      data[o + 3] = 0.15 + Math.pow(Math.random(), 5) * 0.85
      data[o + 12] = Math.random()
      data[o + 13] = Math.random()
      data[o + 14] = 0.012 + Math.pow(Math.random(), 3) * 0.03
      data[o + 15] = 1
    }
  }

  return { data, count: N }
}
