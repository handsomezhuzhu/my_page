"use client"

import { useEffect, useRef } from "react"

/**
 * 粒子形态变换场 —— 滚动驱动数万粒子在三种「3D 构成形态」之间溶解—重组
 *
 *   corridor: 无限回廊 —— 一列测绘式矩形框沿 Z 轴向相机推进，主框带角标与刻度尺，
 *             流尘穿行，一束光脉冲由远及近扫过；鼠标令整条隧道侧倾
 *   ring:     三维圆环体（torus，缺口飞白）+ 外侧尘环 + 中心尘球 + 弥散气晕
 *   globe:    点阵地球 —— 经纬网增亮、大气层、双轨道与青色卫星、跨球面数据弧
 *
 * 渲染管线（不走 Canvas 2D 逐粒子绘制，改为自建像素光栅器）：
 *   1. 预烘焙径向渐变背景 → 每帧 memcpy 清屏
 *   2. 粒子/弧线以双线性「泼溅」方式累加到 Uint8ClampedArray（自带饱和加法 = 加色混合）
 *   3. 同步累加 1/BD 分辨率辉光缓冲 → 滑动窗口盒式模糊 ×2 → 以 lighter 叠加放大回屏幕
 *
 * 光影：透视深度决定冷暖与亮度；一道光带扫过形态；鼠标处形成手电筒式光晕。
 * 编排：冲击波 + 涡旋 → 按目标位置错峰（横向擦除式重组）→ 湍流 → 弹簧归位。
 *
 * 性能：粒子数由自适应逻辑按实测渲染耗时决定，上限见 baseCount()。
 * 实测本机 60fps 下可跑约 27000 个；瓶颈是逐粒子的 CPU 循环（约 0.4µs/个），
 * 以及 canvas 合成 —— 后者在软件渲染下会把帧时间从 ~12ms 拖到 33ms，
 * 但那部分开销落在 putImageData/drawImage 提交之后，页面内计时器量不到。
 */

export type ParticleShape = "corridor" | "ring" | "globe"

/* ============================ 数学工具 ============================ */

/** 正弦查找表：数万粒子逐帧取三角函数，LUT 比 Math.sin 快一个量级 */
const TRIG_N = 4096
const TRIG_MASK = TRIG_N - 1
const SIN_LUT = new Float32Array(TRIG_N)
for (let i = 0; i < TRIG_N; i++) SIN_LUT[i] = Math.sin((i / TRIG_N) * Math.PI * 2)
const TO_LUT = TRIG_N / (Math.PI * 2)
const QUARTER = TRIG_N >> 2

function fsin(x: number): number {
  return SIN_LUT[(x * TO_LUT) & TRIG_MASK]
}
function fcos(x: number): number {
  return SIN_LUT[((x * TO_LUT) + QUARTER) & TRIG_MASK]
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/* ============================ 形态数据 ============================ */

/** 一个粒子的形态目标 */
type Target = {
  x: number
  y: number
  z: number
  /** 静态亮度加成 0..1（框线角标、经纬线、环口边沿） */
  e: number
  /** 透明度倍率 */
  am: number
  /** 轨道粒子：逐帧推算位置 */
  orbit?: { r: number; incl: number; speed: number; ph: number }
  /** 强调粒子（电光青）0..1 */
  acc: number
  /** 0 静态 / 1 轨道 / 2 沿 Z 轴推进（回廊） */
  m: 0 | 1 | 2
}

const t3 = (x: number, y: number, z: number, e = 0, am = 1, acc = 0): Target => ({
  x,
  y,
  z,
  e,
  am,
  acc,
  m: 0,
})

/* ---- 回廊：Z 轴景深范围与推进速度 ---- */
const Z_NEAR = -1.55
const Z_FAR = 3.6
const Z_SPAN = Z_FAR - Z_NEAR
const Z_SPEED = 0.42

/** 把值折回 [0, span) —— 回廊粒子越过近平面后从远端循环 */
function wrap(v: number, span: number): number {
  return v - Math.floor(v / span) * span
}

/** 透视相机距离（归一化空间） */
const PERSP = 2.45

/** 各形态整体透明度 */
const SHAPE_ALPHA: Record<ParticleShape, number> = {
  // 回廊铺满全屏且与 hero 文案重叠，压暗以保证前景可读性
  corridor: 1,
  ring: 0.85,
  globe: 1,
}

type Focus = { cx: number; cy: number; scaleX: number; scaleY: number }

const FOCUS_PRESETS: Record<ParticleShape, { desktop: Focus; mobile: Focus }> = {
  // corridor 占满全屏：scale 直接取半宽半高，在 computeFocus 中按视口计算
  // 灭点略偏右，把隧道核心让给右侧留白，避开左侧文案
  corridor: {
    desktop: { cx: 0.58, cy: 0.5, scaleX: 0.5, scaleY: 0.5 },
    mobile: { cx: 0.5, cy: 0.5, scaleX: 0.5, scaleY: 0.5 },
  },
  ring: {
    desktop: { cx: 0.5, cy: 0.52, scaleX: 0.43, scaleY: 0.43 },
    mobile: { cx: 0.5, cy: 0.46, scaleX: 0.45, scaleY: 0.45 },
  },
  globe: {
    desktop: { cx: 0.72, cy: 0.5, scaleX: 0.33, scaleY: 0.33 },
    mobile: { cx: 0.5, cy: 0.5, scaleX: 0.35, scaleY: 0.35 },
  },
}

/** 计算形态焦点：corridor 铺满视口，其余按最小边等比缩放 */
function computeFocus(shape: ParticleShape, W: number, H: number, isMobile: boolean): Focus {
  const p = FOCUS_PRESETS[shape][isMobile ? "mobile" : "desktop"]
  if (shape === "corridor") {
    return { cx: W * p.cx, cy: H * p.cy, scaleX: W * 0.5, scaleY: H * 0.5 }
  }
  const s = Math.min(W, H)
  return { cx: W * p.cx, cy: H * p.cy, scaleX: p.scaleX * s, scaleY: p.scaleY * s }
}

/** 矩形周长参数化：s ∈ [0,1) → 边框上的点 + 是否为水平边（决定法线方向） */
function rectPoint(s: number, hx: number, hy: number): [number, number, boolean] {
  const w = 2 * hx
  const h = 2 * hy
  let d = s * (2 * (w + h))
  if (d < w) return [-hx + d, -hy, true]
  d -= w
  if (d < h) return [hx, -hy + d, false]
  d -= h
  if (d < w) return [hx - d, hy, true]
  d -= w
  return [-hx, hy - d, false]
}

/**
 * 形态一：无限回廊
 * 一列与视口同比例的测绘式矩形框沿 Z 轴排布并持续向相机推进，
 * 每三层出现一道「主框」：四角角标 + 上下边刻度尺；其余为虚线细框。
 * 另有流尘穿行于框间。所有粒子 m=2，Z 由逐帧推算并在近平面循环回远端。
 * 中心不放任何构件 —— 灭点留空，画面才干净。
 */
function generateCorridor(count: number, aspect: number): Target[] {
  const out: Target[] = []
  // 粒子少时减少层数，把亮度集中到更少的框上，避免每条线都稀疏发灰
  const RINGS = count < 20000 ? 8 : 10
  const HX = 0.88
  const HY = 0.88
  // 线状构成在全屏尺度上天然稀疏，靠 am（>1）把线拉到饱和才有实体感
  const nDust = Math.round(count * 0.08)
  const per = Math.floor((count - nDust) / RINGS)

  // 线宽：归一化 x 与 y 到屏幕像素的换算系数不同（scaleX=W/2, scaleY=H/2），
  // 若两个方向抖同样的量，竖边会比横边粗 aspect 倍。按比例补偿后四条边等宽。
  const THX = 0.0026
  const THY = THX * aspect

  const push = (x: number, y: number, z: number, e: number, am: number, acc = 0) => {
    const t = t3(x, y, z, e, am, acc)
    t.m = 2
    out.push(t)
  }

  for (let i = 0; i < RINGS; i++) {
    const z0 = Z_NEAR + (i / RINGS) * Z_SPAN
    const major = i % 3 === 0

    const nBracket = major ? Math.round(per * 0.22) : 0
    const nTick = major ? Math.round(per * 0.18) : 0
    const nOutline = per - nBracket - nTick

    // 边框：主框实线，次框虚线（同样的粒子挤进一半长度 → 更密、更 HUD）
    const DASH = 34
    for (let k = 0; k < nOutline; k++) {
      let s = Math.random()
      if (!major) {
        const seg = Math.floor(s * DASH)
        s = (seg + (s * DASH - seg) * 0.55) / DASH
      }
      const [x, y, horiz] = rectPoint(s, HX, HY)
      const j = Math.random() - 0.5
      push(
        x + (horiz ? 0 : j * THX),
        y + (horiz ? j * THY : 0),
        z0,
        major ? 0.35 : 0.14,
        major ? 2.7 : 2,
      )
    }

    // 四角角标：两条互相垂直的粗臂
    for (let k = 0; k < nBracket; k++) {
      const cx = Math.random() < 0.5 ? -HX : HX
      const cy = Math.random() < 0.5 ? -HY : HY
      const arm = Math.random() * 0.22
      const thick = (Math.random() - 0.5) * 0.01
      if (Math.random() < 0.5) {
        push(cx - Math.sign(cx) * arm, cy + thick, z0, 0.8, 3.2)
      } else {
        push(cx + thick, cy - Math.sign(cy) * arm, z0, 0.8, 3.2)
      }
    }

    // 上下边刻度尺：每 4 格一根长刻度
    const TICKS = 28
    for (let k = 0; k < nTick; k++) {
      const idx = 1 + Math.floor(Math.random() * (TICKS - 1))
      const x = -HX + (2 * HX * idx) / TICKS
      const long = idx % 4 === 0
      const len = (long ? 0.075 : 0.036) * Math.random()
      const top = Math.random() < 0.5
      push(
        x + (Math.random() - 0.5) * 0.002,
        top ? -HY + len : HY - len,
        z0,
        long ? 0.6 : 0.35,
        2.3,
      )
    }

  }

  // 流尘：散布于整个景深，穿过框列飞向相机，少量高亮火花
  for (let i = 0; i < nDust; i++) {
    const spark = Math.random() < 0.014
    push(
      (Math.random() * 2 - 1) * 1.45,
      (Math.random() * 2 - 1) * 1.45,
      Z_NEAR + Math.random() * Z_SPAN,
      0,
      spark ? 2.2 : 0.5 + Math.random() * 0.6,
      spark ? 1 : 0,
    )
  }

  return shuffle(out)
}

/** 形态二：三维圆环体（缺口飞白）+ 外侧尘环 + 中心尘球 + 弥散气晕 */
function generateRing(count: number): Target[] {
  const out: Target[] = []
  const R = 0.6
  const r = 0.088
  const gapC = -Math.PI / 4
  const gapW = 0.42

  const nTorus = Math.round(count * 0.68)
  const nDisc = Math.round(count * 0.13)
  const nCore = Math.round(count * 0.11)
  const nHaze = Math.max(0, count - nTorus - nDisc - nCore)

  // 主环体
  for (let i = 0; i < nTorus; i++) {
    let a = Math.random() * Math.PI * 2
    const da = Math.atan2(Math.sin(a - gapC), Math.cos(a - gapC))
    let rim = 0
    if (Math.abs(da) < gapW) {
      const push = gapW + Math.random() * 0.55
      a = gapC + Math.sign(da || 1) * push
      // 紧贴缺口的两道断面加亮，像被切开的截口
      rim = Math.max(0, 1 - (push - gapW) / 0.16) * 0.75
    }
    const b = Math.random() * Math.PI * 2
    const tube = R + r * Math.cos(b)
    out.push(t3(tube * Math.cos(a), r * Math.sin(b), tube * Math.sin(a), rim))
  }

  // 外侧扁平尘环（土星环式，带疏密条纹）
  for (let i = 0; i < nDisc; i++) {
    const a = Math.random() * Math.PI * 2
    const rr = 0.78 + Math.random() * 0.24
    // 条纹：某些半径带留空
    const band = Math.abs(fsin(rr * 62))
    if (band < 0.22 && Math.random() < 0.75) continue
    out.push(
      t3(
        rr * Math.cos(a),
        (Math.random() - 0.5) * 0.02,
        rr * Math.sin(a),
        0,
        0.55 + Math.random() * 0.3,
      ),
    )
  }

  // 中心尘球
  for (let i = 0; i < nCore; i++) {
    const u = Math.random() * 2 - 1
    const th = Math.random() * Math.PI * 2
    const k = Math.cbrt(Math.random()) * 0.32
    const rad = Math.sqrt(1 - u * u) * k
    out.push(t3(rad * Math.cos(th), u * k, rad * Math.sin(th), 0, 0.8))
  }

  // 弥散气晕
  for (let i = 0; i < nHaze; i++) {
    const u = Math.random() * 2 - 1
    const th = Math.random() * Math.PI * 2
    const k = 0.66 + Math.random() * 0.62
    const rad = Math.sqrt(1 - u * u) * k
    out.push(t3(rad * Math.cos(th), u * k * 0.55, rad * Math.sin(th), 0, 0.3))
  }

  return shuffle(out)
}

/** 形态三：斐波那契球面（经纬网增亮）+ 大气层 + 双轨道粒子环 + 金色卫星 */
function generateGlobe(count: number): Target[] {
  const out: Target[] = []
  const R = 0.6

  const orbitSpecs = [
    { r: 0.94, incl: 0.5, speed: 0.42, dust: Math.round(count * 0.02), sats: 4 },
    { r: 1.09, incl: -0.95, speed: -0.28, dust: Math.round(count * 0.016), sats: 3 },
  ]
  const nOrbit = orbitSpecs.reduce((s, o) => s + o.dust + o.sats, 0)
  const nAtmo = Math.round(count * 0.06)
  const nCore = Math.round(count * 0.04)
  const nSphere = Math.max(1, count - nOrbit - nAtmo - nCore)

  // 球面：金色分割 → 均匀分布
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < nSphere; i++) {
    const y = 1 - (i / (nSphere - 1)) * 2
    const rad = Math.sqrt(Math.max(0, 1 - y * y))
    const th = golden * i
    const x = Math.cos(th) * rad
    const z = Math.sin(th) * rad

    // 经纬线增亮：赤道、南北回归线、每 30° 一条经线
    const lat = Math.asin(Math.max(-1, Math.min(1, y)))
    const lon = Math.atan2(z, x)
    const latLine = Math.max(
      1 - Math.abs(lat) / 0.05,
      1 - Math.abs(Math.abs(lat) - 0.41) / 0.035,
      1 - Math.abs(Math.abs(lat) - 0.82) / 0.03,
    )
    const lonPitch = Math.PI / 6
    const lonD = Math.abs(((lon % lonPitch) + lonPitch) % lonPitch)
    const lonLine = 1 - Math.min(lonD, lonPitch - lonD) / 0.028
    const e = Math.min(1, Math.max(0, Math.max(latLine, lonLine * 0.8)))

    // 网格线上的点保持满亮度，其余压暗 → 经纬网从密集球面里浮出来
    out.push(t3(x * R, y * R, z * R, e, 0.6 + e * 0.4))
  }

  // 大气层：球面外一薄壳，极暗，形成边缘辉光
  for (let i = 0; i < nAtmo; i++) {
    const u = Math.random() * 2 - 1
    const th = Math.random() * Math.PI * 2
    const rr = R * (1.03 + Math.random() * 0.09)
    const rad = Math.sqrt(1 - u * u) * rr
    out.push(t3(rad * Math.cos(th), u * rr, rad * Math.sin(th), 0, 0.28))
  }

  // 内核：球内稀疏填充，让球体不显空壳
  for (let i = 0; i < nCore; i++) {
    const u = Math.random() * 2 - 1
    const th = Math.random() * Math.PI * 2
    const k = Math.cbrt(Math.random()) * R * 0.92
    const rad = Math.sqrt(1 - u * u) * k
    out.push(t3(rad * Math.cos(th), u * k, rad * Math.sin(th), 0, 0.22))
  }

  // 轨道尘 + 卫星
  for (const spec of orbitSpecs) {
    const total = spec.dust + spec.sats
    for (let i = 0; i < total; i++) {
      const bright = i >= spec.dust
      const tgt = t3(0, 0, 0, 0, bright ? 1 : 0.8, bright ? 1 : 0)
      tgt.orbit = {
        r: spec.r,
        incl: spec.incl + (Math.random() - 0.5) * 0.035,
        speed: spec.speed,
        ph: (i / total) * Math.PI * 2 + Math.random() * 0.06,
      }
      out.push(tgt)
    }
  }

  return shuffle(out)
}

/* ============================ 泼溅核 ============================ */

type Kernel = { dx: Int8Array; dy: Int8Array; w: Float32Array; n: number }

function buildKernel(r: number): Kernel {
  const dx: number[] = []
  const dy: number[] = []
  const w: number[] = []
  const s2 = 2 * (r * 0.56) * (r * 0.56)
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const v = Math.exp(-(x * x + y * y) / s2)
      if (v < 0.05) continue
      dx.push(x)
      dy.push(y)
      w.push(v)
    }
  }
  return { dx: Int8Array.from(dx), dy: Int8Array.from(dy), w: Float32Array.from(w), n: w.length }
}

/** 光晕核（柔焦大颗粒）/ 强调核（卫星等） */
const K_HALO = buildKernel(3)
const K_ACCENT = buildKernel(2)

/* ============================ 调色 ============================ */

/**
 * 科技感冷色域：远处沉入深蓝，近处收到冷白，强调粒子用电光青。
 * 饱和度刻意压住 —— 荧光蓝紫会显廉价，克制的冷色才「高级」。
 */
const C_FAR = [46, 104, 186]
const C_NEAR = [232, 246, 255]
const C_ACCENT = [104, 227, 255]

/** 辉光染色（冷白偏青） */
const BLOOM_TINT = [188, 226, 255]
/** 辉光强度 */
const BLOOM_GAIN = 16
/** 辉光缓冲降采样倍率（越大越省，放大时的双线性插值会补回柔和度） */
const BD = 8

/* ============================ 组件 ============================ */

export function ParticleField({ shape }: { shape: ParticleShape }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shapeRef = useRef<ParticleShape>(shape)
  const morphRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    shapeRef.current = shape
    morphRef.current?.()
  }, [shape])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    /* ---------------- 尺寸 / 缓冲 ---------------- */

    let raf = 0
    let W = 0 // CSS 像素
    let H = 0
    let rw = 0 // 渲染缓冲像素
    let rh = 0
    let scale = 1 // rw / W
    let isMobile = false

    let img: ImageData | null = null
    let u8: Uint8ClampedArray = new Uint8ClampedArray(0)
    let u32: Uint32Array = new Uint32Array(0)
    let bg32: Uint32Array = new Uint32Array(0)

    let bw = 0
    let bh = 0
    let bloom = new Float32Array(0)
    let bloomTmp = new Float32Array(0)
    let bimg: ImageData | null = null
    const bcanvas = document.createElement("canvas")
    const bctx = bcanvas.getContext("2d")

    /* ---------------- 粒子（SoA） ---------------- */

    let n = 0
    let activeN = 0
    let quality = 1

    let px = new Float32Array(0)
    let py = new Float32Array(0)
    let pvx = new Float32Array(0)
    let pvy = new Float32Array(0)
    // 当前 3D 基准
    let bx = new Float32Array(0)
    let by = new Float32Array(0)
    let bz = new Float32Array(0)
    // 待切换的新基准
    let nx = new Float32Array(0)
    let ny = new Float32Array(0)
    let nz = new Float32Array(0)
    // 投影结果
    let tx = new Float32Array(0)
    let ty = new Float32Array(0)
    let pdepth = new Float32Array(0)
    let ppersp = new Float32Array(0)
    // 形态属性（live / staged）
    let boost = new Float32Array(0)
    let nboost = new Float32Array(0)
    let amul = new Float32Array(0)
    let namul = new Float32Array(0)
    let accent = new Float32Array(0)
    let naccent = new Float32Array(0)
    let mode = new Uint8Array(0) // 0 静态 / 1 轨道
    let nmode = new Uint8Array(0)
    let orbR = new Float32Array(0)
    let orbI = new Float32Array(0)
    let orbS = new Float32Array(0)
    let orbP = new Float32Array(0)
    // 内在属性
    let pk = new Float32Array(0)
    let pdamp = new Float32Array(0)
    let palpha = new Float32Array(0)
    let pphase = new Float32Array(0)
    let pphase2 = new Float32Array(0)
    let pdrift = new Float32Array(0)
    let flags = new Uint8Array(0) // bit0 stray, bit1 halo, bit2 twinkle
    let pend = new Uint8Array(0)
    let morphAt = new Float32Array(0)

    const F_STRAY = 1
    const F_HALO = 2
    const F_TWINKLE = 4

    let angle = 0
    let mouseRX = 0
    let mouseRY = 0
    let morphEnergy = 0

    const focus: Focus = { cx: 0, cy: 0, scaleX: 0.4, scaleY: 0.4 }
    const focusTarget: Focus = { cx: 0, cy: 0, scaleX: 0.4, scaleY: 0.4 }
    const mouse = { x: -99999, y: -99999 }

    /** 点击涟漪 */
    const ripples: { x: number; y: number; t0: number }[] = []

    /** 地球数据弧 */
    type Arc = {
      ax: number
      ay: number
      az: number
      bx: number
      by: number
      bz: number
      t0: number
      dur: number
      om: number
      so: number
    }
    let arcs: Arc[] = []

    /* ---------------- 粒子规模 ---------------- */

    const baseCount = () => {
      const cores = navigator.hardwareConcurrency || 4
      if (reduced) return isMobile ? 6000 : 16000
      if (isMobile) return cores >= 6 ? 16000 : 10000
      return cores >= 8 ? 42000 : 26000
    }

    /* ---------------- 缓冲分配 ---------------- */

    const allocBuffers = () => {
      // 渲染分辨率：兼顾高 DPI 与像素填充率上限
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const MAXPX = 2_200_000
      let rs = Math.min(dpr, 1.5)
      if (W * H * rs * rs > MAXPX) rs = Math.sqrt(MAXPX / (W * H))
      rs = Math.max(0.7, Math.min(rs, dpr))

      rw = Math.max(2, Math.round(W * rs))
      rh = Math.max(2, Math.round(H * rs))
      scale = rw / W

      canvas.width = rw
      canvas.height = rh
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`

      img = ctx.createImageData(rw, rh)
      u8 = img.data
      u32 = new Uint32Array(u8.buffer)

      // 预烘焙背景：中心极微弱抬升的径向渐变（比纯黑更有空气感）
      bg32 = new Uint32Array(rw * rh)
      const cx = rw * 0.5
      const cy = rh * 0.45
      const rmax2 = (rw * rw + rh * rh) * 0.28
      for (let y = 0, i = 0; y < rh; y++) {
        const dy = y - cy
        for (let x = 0; x < rw; x++, i++) {
          const dx = x - cx
          const k = Math.max(0, 1 - (dx * dx + dy * dy) / rmax2)
          const g = k * k
          const r = (1 + 9 * g) | 0
          const gg = (2 + 10 * g) | 0
          const b = (4 + 15 * g) | 0
          bg32[i] = (255 << 24) | (b << 16) | (gg << 8) | r
        }
      }

      bw = Math.max(1, Math.ceil(rw / BD))
      bh = Math.max(1, Math.ceil(rh / BD))
      bloom = new Float32Array(bw * bh)
      bloomTmp = new Float32Array(bw * bh)
      bcanvas.width = bw
      bcanvas.height = bh
      bimg = bctx ? bctx.createImageData(bw, bh) : null
      if (bimg) {
        // 辉光以 lighter 叠加，alpha 恒为 255
        const bd = bimg.data
        for (let i = 3; i < bd.length; i += 4) bd[i] = 255
      }
    }

    const allocParticles = (next: number) => {
      n = next
      // 保守起步，再由自适应逻辑向上加满 —— 避免开局几秒先卡一下
      activeN = Math.min(n, 20000)
      const f32 = () => new Float32Array(n)
      px = f32()
      py = f32()
      pvx = f32()
      pvy = f32()
      bx = f32()
      by = f32()
      bz = f32()
      nx = f32()
      ny = f32()
      nz = f32()
      tx = f32()
      ty = f32()
      pdepth = f32()
      ppersp = f32()
      boost = f32()
      nboost = f32()
      amul = f32()
      namul = f32()
      accent = f32()
      naccent = f32()
      mode = new Uint8Array(n)
      nmode = new Uint8Array(n)
      orbR = f32()
      orbI = f32()
      orbS = f32()
      orbP = f32()
      pk = f32()
      pdamp = f32()
      palpha = f32()
      pphase = f32()
      pphase2 = f32()
      pdrift = f32()
      flags = new Uint8Array(n)
      pend = new Uint8Array(n)
      morphAt = f32()

      for (let i = 0; i < n; i++) {
        const stray = i % 44 === 0
        const halo = !stray && Math.random() < 0.055
        const twinkle = !stray && !halo && Math.random() < 0.09
        flags[i] =
          (stray ? F_STRAY : 0) | (halo ? F_HALO : 0) | (twinkle ? F_TWINKLE : 0)

        px[i] = rw / 2 + (Math.random() - 0.5) * rw * 0.7
        py[i] = rh / 2 + (Math.random() - 0.5) * rh * 0.7
        pk[i] = 0.017 + Math.random() * 0.03
        pdamp[i] = 0.862 + Math.random() * 0.05
        // 光晕粒子铺开成柔焦大颗粒，因此单点亮度压低
        palpha[i] = stray
          ? 0.08 + Math.random() * 0.14
          : halo
            ? 0.05 + Math.random() * 0.055
            : 0.2 + Math.random() * 0.42
        pphase[i] = Math.random() * Math.PI * 2
        pphase2[i] = Math.random() * Math.PI * 2
        // 构成形态的粒子只做极小幅浮动，保证字形/环形边缘锐利；游离尘才大幅漂移
        pdrift[i] = (stray ? 2.4 + Math.random() * 4 : 0.32 + Math.random() * 0.9) * scale
        pdepth[i] = 1
        ppersp[i] = 1
        amul[i] = namul[i] = 1
      }

      const f = computeFocus(shapeRef.current, rw, rh, isMobile)
      focus.cx = focusTarget.cx = f.cx
      focus.cy = focusTarget.cy = f.cy
      focus.scaleX = focusTarget.scaleX = f.scaleX
      focus.scaleY = focusTarget.scaleY = f.scaleY
    }

    /* ---------------- 形态重组 ---------------- */

    const spawnArcs = (now: number) => {
      arcs = []
      const count = reduced ? 0 : 11
      for (let i = 0; i < count; i++) arcs.push(makeArc(now - Math.random() * 4000))
    }

    const makeArc = (t0: number): Arc => {
      const rnd = () => {
        const u = Math.random() * 2 - 1
        const th = Math.random() * Math.PI * 2
        const r = Math.sqrt(1 - u * u)
        return [r * Math.cos(th), u, r * Math.sin(th)] as const
      }
      let a = rnd()
      let b = rnd()
      let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
      // 避免过近或对跖点
      for (let guard = 0; guard < 8 && (dot > 0.72 || dot < -0.82); guard++) {
        b = rnd()
        dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
      }
      if (a[1] < b[1]) [a, b] = [b, a]
      const om = Math.acos(Math.max(-1, Math.min(1, dot)))
      return {
        ax: a[0],
        ay: a[1],
        az: a[2],
        bx: b[0],
        by: b[1],
        bz: b[2],
        t0,
        dur: 2600 + Math.random() * 2600,
        om,
        so: Math.sin(om) || 1,
      }
    }

    /** 重组：冲击波 + 涡旋 + 横向擦除式错峰（animate=false 时静默重定向） */
    const morph = (animate = true) => {
      if (n === 0) return
      const sh = shapeRef.current
      const f = computeFocus(sh, rw, rh, isMobile)
      focusTarget.cx = f.cx
      focusTarget.cy = f.cy
      focusTarget.scaleX = f.scaleX
      focusTarget.scaleY = f.scaleY

      const now = performance.now()
      const targets =
        sh === "corridor"
          ? generateCorridor(n, W / H)
          : sh === "ring"
            ? generateRing(n)
            : generateGlobe(n)
      if (targets.length === 0) return

      if (sh === "globe") spawnArcs(now)

      let j = 0
      for (let i = 0; i < n; i++) {
        if (flags[i] & F_STRAY) continue
        const t = targets[j % targets.length]
        j++
        nx[i] = t.x
        ny[i] = t.y
        nz[i] = t.z
        nboost[i] = t.e
        namul[i] = t.am
        naccent[i] = t.acc
        if (t.orbit) {
          nmode[i] = 1
          orbR[i] = t.orbit.r
          orbI[i] = t.orbit.incl
          orbS[i] = t.orbit.speed
          orbP[i] = t.orbit.ph
        } else {
          nmode[i] = t.m
        }
        pend[i] = 1
        // 按目标横坐标错峰 → 重组像一道自左向右的擦除
        morphAt[i] = animate ? now + ((t.x + 1) * 0.5 * 560 + Math.random() * 300) : now
      }

      if (animate) {
        morphEnergy = 1
        for (let i = 0; i < n; i++) {
          const dx = px[i] - focus.cx
          const dy = py[i] - focus.cy
          const d = Math.hypot(dx, dy) || 1
          const out = (2.2 + Math.random() * 4.2) * scale
          const swirl = (1.4 + Math.random() * 2.2) * scale
          pvx[i] += (dx / d) * out - (dy / d) * swirl
          pvy[i] += (dy / d) * out + (dx / d) * swirl
        }
      }
    }
    morphRef.current = () => morph(true)

    /* ---------------- resize ---------------- */

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      isMobile = W < 768
      const firstInit = n === 0
      allocBuffers()
      const next = baseCount()
      if (next !== n) {
        allocParticles(next)
        morph(firstInit)
      } else {
        morph(false)
      }
    }

    /* ---------------- 光栅器 ---------------- */

    /** 双线性泼溅（饱和加法 = 加色混合） */
    const splat = (x: number, y: number, r: number, g: number, b: number, a: number) => {
      // 取反比较顺带挡掉 NaN
      if (!(a > 0.003) || !(x >= 0) || !(y >= 0) || x >= rw - 1 || y >= rh - 1) return
      const xi = x | 0
      const yi = y | 0
      const fx = x - xi
      const fy = y - yi
      const gx = 1 - fx
      const gy = 1 - fy

      let w = gx * gy * a
      let o = (yi * rw + xi) << 2
      u8[o] += r * w
      u8[o + 1] += g * w
      u8[o + 2] += b * w

      w = fx * gy * a
      o += 4
      u8[o] += r * w
      u8[o + 1] += g * w
      u8[o + 2] += b * w

      const row = (yi + 1) * rw + xi
      w = gx * fy * a
      o = row << 2
      u8[o] += r * w
      u8[o + 1] += g * w
      u8[o + 2] += b * w

      w = fx * fy * a
      o += 4
      u8[o] += r * w
      u8[o + 1] += g * w
      u8[o + 2] += b * w
    }

    /**
     * 单像素泼溅：暗粒子走这条快路，省掉双线性的 3/4 写入。
     * 代价是亚像素抖动，但对本就接近噪点的暗尘看不出来。
     */
    const splat1 = (x: number, y: number, r: number, g: number, b: number, a: number) => {
      if (!(a > 0.003) || !(x >= 0) || !(y >= 0) || x >= rw || y >= rh) return
      const o = (((y | 0) * rw + (x | 0)) << 2)
      u8[o] += r * a
      u8[o + 1] += g * a
      u8[o + 2] += b * a
    }

    /** 核泼溅：柔焦光晕 / 强调粒子 */
    const splatK = (
      k: Kernel,
      x: number,
      y: number,
      r: number,
      g: number,
      b: number,
      a: number,
    ) => {
      if (!(a > 0.003) || !(x > -8) || !(y > -8) || x > rw + 8 || y > rh + 8) return
      const xi = Math.floor(x)
      const yi = Math.floor(y)
      for (let i = 0; i < k.n; i++) {
        const sx = xi + k.dx[i]
        const sy = yi + k.dy[i]
        if (sx < 0 || sy < 0 || sx >= rw || sy >= rh) continue
        const w = k.w[i] * a
        const o = (sy * rw + sx) << 2
        u8[o] += r * w
        u8[o + 1] += g * w
        u8[o + 2] += b * w
      }
    }

    /**
     * 可分离盒式模糊（辉光缓冲），滑动窗口实现。
     * 每个像素只做一加一减，而不是 2R+1 次取样 —— 朴素写法在这里要花掉近 4ms，
     * 是整个管线最大的固定开销。
     */
    const R = 2
    const NORM = 1 / (2 * R + 1)

    const blurH = (src: Float32Array, dst: Float32Array) => {
      for (let y = 0; y < bh; y++) {
        const row = y * bw
        let sum = 0
        const lim = Math.min(R, bw - 1)
        for (let i = 0; i <= lim; i++) sum += src[row + i]
        dst[row] = sum * NORM
        for (let x = 1; x < bw; x++) {
          const add = x + R
          const sub = x - R - 1
          if (add < bw) sum += src[row + add]
          if (sub >= 0) sum -= src[row + sub]
          dst[row + x] = sum * NORM
        }
      }
    }

    const blurV = (src: Float32Array, dst: Float32Array) => {
      for (let x = 0; x < bw; x++) {
        let sum = 0
        const lim = Math.min(R, bh - 1)
        for (let i = 0; i <= lim; i++) sum += src[i * bw + x]
        dst[x] = sum * NORM
        for (let y = 1; y < bh; y++) {
          const add = y + R
          const sub = y - R - 1
          if (add < bh) sum += src[add * bw + x]
          if (sub >= 0) sum -= src[sub * bw + x]
          dst[y * bw + x] = sum * NORM
        }
      }
    }

    const blurBloom = () => {
      blurH(bloom, bloomTmp)
      blurV(bloomTmp, bloom)
      blurH(bloom, bloomTmp)
      blurV(bloomTmp, bloom)
    }

    /* ---------------- 事件 ---------------- */

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX * scale
      mouse.y = e.clientY * scale
    }
    const onLeave = () => {
      mouse.x = -99999
      mouse.y = -99999
    }
    const onDown = (e: PointerEvent) => {
      if (reduced) return
      ripples.push({ x: e.clientX * scale, y: e.clientY * scale, t0: performance.now() })
      if (ripples.length > 4) ripples.shift()
    }

    /* ---------------- 主循环 ---------------- */

    let last = performance.now()
    let workEma = 8
    let qFrames = 0
    /** 单帧渲染耗时预算（ms），留余量给合成与主线程其它工作 */
    const FRAME_BUDGET = 12
    const MIN_ACTIVE = 5000

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dtMs = now - last
      last = now
      if (document.hidden || !img || n === 0) return

      const im = img
      const t0 = performance.now()
      const dt = Math.min(dtMs / 16.7, 3)
      const t = now * 0.001

      morphEnergy = Math.max(0, morphEnergy - dt * 0.012)

      focus.cx += (focusTarget.cx - focus.cx) * 0.06 * dt
      focus.cy += (focusTarget.cy - focus.cy) * 0.06 * dt
      focus.scaleX += (focusTarget.scaleX - focus.scaleX) * 0.06 * dt
      focus.scaleY += (focusTarget.scaleY - focus.scaleY) * 0.06 * dt

      const sh = shapeRef.current
      const isGlobe = sh === "globe"
      const isCorridor = sh === "corridor"

      // 各形态的 3D 旋转角
      let rotY: number
      let rotX: number
      if (isCorridor) {
        // 隧道纵深大，转角需远小于其它形态，否则远端会被甩出画面
        const active = mouse.x > -100
        mouseRY += ((active ? (mouse.x / rw - 0.5) * 0.16 : 0) - mouseRY) * 0.04 * dt
        mouseRX += ((active ? (mouse.y / rh - 0.5) * 0.1 : 0) - mouseRX) * 0.04 * dt
        rotY = (reduced ? 0 : fsin(t * 0.17) * 0.05) + mouseRY
        rotX = (reduced ? 0 : fcos(t * 0.13) * 0.03) + mouseRX
      } else if (sh === "ring") {
        rotY = reduced ? 0 : t * 0.22
        rotX = 1.05 + (reduced ? 0 : fsin(t * 0.12) * 0.055)
      } else {
        if (!reduced) angle += 0.0032 * dt
        rotY = angle
        rotX = 0.42
      }
      const cosY = Math.cos(rotY)
      const sinY = Math.sin(rotY)
      const cosX = Math.cos(rotX)
      const sinX = Math.sin(rotX)

      // 光带：回廊是一束沿 Z 轴由远及近推进的光脉冲；ring/globe 是随光向旋转掠过的高光带
      const lx = fcos(t * 0.42)
      const lz = fsin(t * 0.42)
      const beamC = isCorridor ? Z_FAR - wrap(t * 1.15, Z_SPAN + 2.2) : 0.34
      const beamK = isCorridor ? 2.4 : 9

      // 回廊整体沿 Z 轴推进的位移量
      const zShift = reduced ? 0 : t * Z_SPEED

      // 清屏 + 辉光缓冲归零
      u32.set(bg32)
      bloom.fill(0)

      const repelR = Math.min(rw, rh) * 0.16
      const repelR2 = repelR * repelR
      const shapeAlpha = SHAPE_ALPHA[sh]
      const sizeScale = scale

      for (let i = 0; i < activeN; i++) {
        const fl = flags[i]
        const stray = fl & F_STRAY

        // 错峰提交新目标
        if (pend[i] && now >= morphAt[i]) {
          pend[i] = 0
          bx[i] = nx[i]
          by[i] = ny[i]
          bz[i] = nz[i]
          boost[i] = nboost[i]
          amul[i] = namul[i]
          accent[i] = naccent[i]
          mode[i] = nmode[i]
        }

        let targetX: number
        let targetY: number
        let lightD = 0
        let fade = 1

        if (stray) {
          // 游离尘：全场缓慢漫游。x / y 必须用两个独立相位，
          // 否则所有游离粒子会落在同一条利萨如曲线上，连成一道斜线
          targetX = rw * (0.5 + 0.46 * fsin(t * 0.11 + pphase[i]))
          targetY = rh * (0.5 + 0.46 * fcos(t * 0.073 + pphase2[i]))
        } else {
          if (!pend[i]) {
            let gx = bx[i]
            let gy = by[i]
            let gz = bz[i]
            if (mode[i] === 1) {
              const u = t * orbS[i] + orbP[i]
              const si = Math.sin(orbI[i])
              const ci = Math.cos(orbI[i])
              gx = fcos(u) * orbR[i]
              gy = fsin(u) * orbR[i] * si
              gz = fsin(u) * orbR[i] * ci
            } else if (mode[i] === 2) {
              // 回廊：Z 持续推进，越过近平面后折回远端
              gz = Z_NEAR + wrap(bz[i] - zShift - Z_NEAR, Z_SPAN)
              // 远端淡入、近端淡出，避免循环时突兀地出现/消失
              fade = Math.max(
                0,
                Math.min(1, (Z_FAR - gz) * 0.9, (gz - Z_NEAR) * 1.9),
              )
            }

            lightD = isCorridor ? gz : gx * lx + gz * lz

            // 统一 3D 管线：旋转 → 透视投影
            const x1 = gx * cosY - gz * sinY
            const z1 = gx * sinY + gz * cosY
            const y1 = gy * cosX - z1 * sinX
            const z2 = gy * sinX + z1 * cosX
            const persp = PERSP / (PERSP + z2)

            tx[i] = x1 * persp
            ty[i] = y1 * persp
            ppersp[i] += (persp - ppersp[i]) * 0.2 * dt

            // z2 < 0 为靠近相机一侧（persp = P/(P+z2) 随 z2 减小而增大）
            // 球体正面亮、背面压暗，平方加大对比 → 点阵地球才有体积感
            let dTarget: number
            if (isGlobe) {
              const fz = Math.min(1, Math.max(0, 0.5 - z2 / 1.5))
              dTarget = Math.min(1, 0.08 + 0.92 * fz * fz)
            } else if (isCorridor) {
              // 纵深雾：远端框压到很暗，近端全亮，撑出隧道的进深
              dTarget = Math.min(1, Math.max(0.2, persp * 0.95))
            } else {
              dTarget = Math.min(1, Math.max(0.5, 0.42 + persp * 0.48))
            }
            pdepth[i] += (dTarget - pdepth[i]) * 0.1 * dt
          }

          targetX = focus.cx + tx[i] * focus.scaleX
          targetY = focus.cy + ty[i] * focus.scaleY
        }

        // 弹簧
        let vx = (pvx[i] + (targetX - px[i]) * pk[i] * dt) * pdamp[i]
        let vy = (pvy[i] + (targetY - py[i]) * pk[i] * dt) * pdamp[i]

        // 重组湍流：伪旋度噪声，随能量衰减
        if (morphEnergy > 0.002) {
          const e = morphEnergy * morphEnergy * 0.9 * scale
          vx += fsin(py[i] * 0.006 + t * 0.9 + pphase[i]) * e * dt
          vy += fcos(px[i] * 0.006 - t * 0.7 + pphase[i]) * e * dt
        }

        // 鼠标：斥力 + 切向涡旋 + 手电筒式增亮
        let cursorGlow = 0
        if (!reduced) {
          const dx = px[i] - mouse.x
          const dy = py[i] - mouse.y
          const d2 = dx * dx + dy * dy
          if (d2 < repelR2 && d2 > 0.01) {
            const d = Math.sqrt(d2)
            const f = 1 - d / repelR
            const inv = (f * dt) / d
            vx += (dx * 2.4 - dy * 1.35) * inv
            vy += (dy * 2.4 + dx * 1.35) * inv
            cursorGlow = f * f
          }
        }

        pvx[i] = vx
        pvy[i] = vy
        px[i] += vx * dt
        py[i] += vy * dt

        const ox = reduced ? 0 : fsin(t * 0.7 + pphase[i]) * pdrift[i]
        const oy = reduced ? 0 : fcos(t * 0.55 + pphase[i] * 1.3) * pdrift[i]
        const sx = px[i] + ox
        const sy = py[i] + oy

        /* ---- 着色 ---- */
        const depth = pdepth[i]
        let lum = depth * fade
        if (!stray) {
          // 静态加成（字标轮廓 / 经纬线 / 环口断面）
          lum *= 1 + boost[i] * 1.15
          // 旋转光带
          if (!reduced) {
            const q = lightD - beamC
            lum *= 1 + 1.5 / (1 + beamK * q * q)
          }
          // 闪烁
          if (fl & F_TWINKLE) lum *= 0.72 + 0.6 * Math.abs(fsin(t * 1.7 + pphase[i] * 5))
        }
        lum += cursorGlow * 1.1

        const a = palpha[i] * amul[i] * lum * shapeAlpha
        if (a <= 0.004) continue

        const acc = accent[i]
        let cr: number
        let cg: number
        let cb: number
        if (acc > 0) {
          cr = C_ACCENT[0]
          cg = C_ACCENT[1]
          cb = C_ACCENT[2]
        } else {
          // 深度冷暖分级
          const d = depth
          cr = C_FAR[0] + (C_NEAR[0] - C_FAR[0]) * d
          cg = C_FAR[1] + (C_NEAR[1] - C_FAR[1]) * d
          cb = C_FAR[2] + (C_NEAR[2] - C_FAR[2]) * d
        }

        if (fl & F_HALO) {
          splatK(K_HALO, sx, sy, cr, cg, cb, a * ppersp[i])
        } else if (acc > 0) {
          splatK(K_ACCENT, sx, sy, cr, cg, cb, a)
        } else {
          const pa = a * (0.72 + 0.5 * ppersp[i])
          if (pa < 0.3) splat1(sx, sy, cr, cg, cb, pa)
          else splat(sx, sy, cr, cg, cb, pa)

          // 高速拖尾：重组瞬间拉出光丝
          const sp2 = vx * vx + vy * vy
          if (sp2 > 2.2 * sizeScale * sizeScale) {
            const inv = 1 / Math.sqrt(sp2)
            const ux = -vx * inv
            const uy = -vy * inv
            const len = Math.min(7, Math.sqrt(sp2) * 0.9)
            for (let s = 1; s <= 3; s++) {
              const f = s / 3
              const w = (1 - f) * 0.5 * pa
              splat(sx + ux * len * f, sy + uy * len * f, cr, cg, cb, w)
            }
          }
        }

        // 辉光累加（每粒子一次，低分辨率）
        const bxi = (sx / BD) | 0
        const byi = (sy / BD) | 0
        if (bxi >= 0 && byi >= 0 && bxi < bw && byi < bh) {
          bloom[byi * bw + bxi] += a * (fl & F_HALO ? 2.6 : 1) * (acc > 0 ? 2.2 : 1)
        }
      }

      /* ---- 地球数据弧 ---- */
      if (isGlobe && !reduced && arcs.length) {
        const R = 0.6
        const SEG = 46
        for (let ai = 0; ai < arcs.length; ai++) {
          const arc = arcs[ai]
          const age = (now - arc.t0) / arc.dur
          if (age >= 1) {
            arcs[ai] = makeArc(now)
            continue
          }
          if (age < 0) continue
          const env = fsin(age * Math.PI) // 淡入淡出
          const head = age
          for (let s = 0; s <= SEG; s++) {
            const u = s / SEG
            if (u > head) break
            const w0 = fsin((1 - u) * arc.om) / arc.so
            const w1 = fsin(u * arc.om) / arc.so
            const lift = R * (1 + 0.36 * fsin(u * Math.PI))
            const gx = (arc.ax * w0 + arc.bx * w1) * lift
            const gy = (arc.ay * w0 + arc.by * w1) * lift
            const gz = (arc.az * w0 + arc.bz * w1) * lift

            const x1 = gx * cosY - gz * sinY
            const z1 = gx * sinY + gz * cosY
            const y1 = gy * cosX - z1 * sinX
            const z2 = gy * sinX + z1 * cosX
            const persp = PERSP / (PERSP + z2)
            const sxp = focus.cx + x1 * persp * focus.scaleX
            const syp = focus.cy + y1 * persp * focus.scaleY

            // 头部最亮，向尾部衰减；与球体同向的深度分级（z2<0 靠近相机）
            const tail = 1 / (1 + (head - u) * 9)
            const depth = Math.min(1, Math.max(0.18, 0.5 - z2 / 1.5))
            const a = env * tail * 0.85 * depth
            const isHead = u > head - 0.03
            if (isHead) {
              splatK(K_ACCENT, sxp, syp, C_ACCENT[0], C_ACCENT[1], C_ACCENT[2], a * 1.5)
            } else {
              splat(sxp, syp, 255, 236, 205, a)
            }
            const bxi = (sxp / BD) | 0
            const byi = (syp / BD) | 0
            if (bxi >= 0 && byi >= 0 && bxi < bw && byi < bh) {
              bloom[byi * bw + bxi] += a * 2.4
            }
          }
        }
      }

      /* ---- 点击涟漪：推开并点亮 ---- */
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]
        const age = now - r.t0
        if (age > 1300) {
          ripples.splice(i, 1)
          continue
        }
        const rad = age * 0.55 * scale
        const width = 34 * scale
        const strength = (1 - age / 1300) * 2.6 * scale
        const lo = (rad - width) * (rad - width)
        const hi = (rad + width) * (rad + width)
        for (let j = 0; j < activeN; j += 1) {
          const dx = px[j] - r.x
          const dy = py[j] - r.y
          const d2 = dx * dx + dy * dy
          if (d2 < lo || d2 > hi) continue
          const d = Math.sqrt(d2) || 1
          const f = (1 - Math.abs(d - rad) / width) * strength
          pvx[j] += (dx / d) * f
          pvy[j] += (dy / d) * f
        }
      }

      /* ---- 辉光合成 ---- */
      if (bimg && bctx) {
        blurBloom()
        const bd = bimg.data
        for (let i = 0, o = 0; i < bloom.length; i++, o += 4) {
          const v = bloom[i] * BLOOM_GAIN
          if (v <= 0.5) {
            bd[o] = 0
            bd[o + 1] = 0
            bd[o + 2] = 0
            continue
          }
          bd[o] = (BLOOM_TINT[0] * v) / 255
          bd[o + 1] = (BLOOM_TINT[1] * v) / 255
          bd[o + 2] = (BLOOM_TINT[2] * v) / 255
        }
        bctx.putImageData(bimg, 0, 0)
      }

      ctx.putImageData(im, 0, 0)
      if (bimg && bctx) {
        ctx.globalCompositeOperation = "lighter"
        ctx.imageSmoothingEnabled = true
        // 辉光已做过两次盒式模糊，双线性放大足够，无需 high（软件渲染下明显更快）
        ctx.imageSmoothingQuality = "medium"
        ctx.drawImage(bcanvas, 0, 0, rw, rh)
        ctx.globalCompositeOperation = "source-over"
      }

      /* ---- 自适应画质：按实测渲染耗时调整活跃粒子数 ----
       * 逐帧代价基本与粒子数成正比，所以直接按比例解算目标值，一次就能逼近预算；
       * 固定开销（清屏 / putImageData / 辉光）会让缩减略微过头，用阻尼吸收。
       * 旧实现每 45 帧只挪 0.08，卡顿时要十几秒才收敛，等于开局一直掉帧。
       */
      workEma += (performance.now() - t0 - workEma) * 0.12
      if (++qFrames >= 20) {
        qFrames = 0
        const over = workEma > FRAME_BUDGET
        // 迟滞带留窄一点，否则会停在远低于预算的地方，白白浪费余量
        const idle = workEma < FRAME_BUDGET * 0.85 && activeN < n
        if (over || idle) {
          const target = activeN * (FRAME_BUDGET / Math.max(0.5, workEma))
          activeN = Math.max(
            MIN_ACTIVE,
            Math.min(n, Math.round(activeN + (target - activeN) * 0.5)),
          )
          quality = activeN / n
        }
      }
    }

    /* ---------------- 启动 ---------------- */

    resize()

    window.addEventListener("resize", resize)
    window.addEventListener("mousemove", onMove, { passive: true })
    window.addEventListener("pointerdown", onDown, { passive: true })
    document.documentElement.addEventListener("mouseleave", onLeave)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("pointerdown", onDown)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      morphRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />
}
