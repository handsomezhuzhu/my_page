"use client"

import { useEffect, useRef } from "react"
import { generateCosmos, STRIDE } from "@/lib/cosmos/generate"
import { PARTICLE_FRAG, PARTICLE_VERT, QUAD_FRAG, QUAD_VERT } from "@/lib/cosmos/shaders"

/**
 * 粒子宇宙（WebGL）—— 一条连续的叙事，而不是三张互相切换的图：
 *
 *   开场  奇点 → 大爆炸：全部粒子压缩在一点颤动，0.9s 时闪白 + 冲击波环 + 镜头光条，
 *         粒子过冲式炸开、旋臂由拧紧状态旋开，镜头同时后拉并带一次震动，落定为旋涡星系。
 *   衔接  星系由内向外引力坍缩，卷入涡旋，重组为黑洞吸积盘（事件视界 / 光子环 / 透镜光晕）。
 *   终章  吸积盘物质凝聚成一颗带环行星：程序化大陆、晨昏线、夜侧城市灯光、大气辉边、环影。
 *
 * 形态进度直接绑定滚动位置并做阻尼，滚到一半就停在半途 —— 过渡本身就是内容。
 */

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

const BANG = 0.9

export function CosmosField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    })
    if (!gl) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const isMobile = window.matchMedia("(max-width: 768px), (pointer: coarse)").matches
    const cores = navigator.hardwareConcurrency || 4

    /* ---------------- 程序 ---------------- */

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[cosmos] shader:", gl.getShaderInfoLog(sh))
      }
      return sh
    }
    const link = (vs: string, fs: string) => {
      const prog = gl.createProgram()!
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs))
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("[cosmos] link:", gl.getProgramInfoLog(prog))
      }
      return prog
    }

    const pProg = link(PARTICLE_VERT, PARTICLE_FRAG)
    const qProg = link(QUAD_VERT, QUAD_FRAG)

    const uniforms = (prog: WebGLProgram, names: string[]) => {
      const out: Record<string, WebGLUniformLocation | null> = {}
      for (const n of names) out[n] = gl.getUniformLocation(prog, n)
      return out
    }
    const pu = uniforms(pProg, [
      "uTime", "uProg", "uIntro", "uAspect", "uViewH", "uCam", "uScale", "uTilt",
      "uMouse", "uRipple", "uOffG", "uOffD", "uOffP", "uGain",
    ])
    const qu = uniforms(qProg, [
      "uPass", "uAspect", "uCenter", "uFlash", "uShock", "uShockA", "uCore", "uStreak", "uTint",
    ])

    /* ---------------- 数据 ---------------- */

    let total = isMobile ? (cores >= 6 ? 90_000 : 60_000) : cores >= 8 ? 220_000 : 140_000
    if (reduced) total = Math.round(total * 0.5)
    const { data, count } = generateCosmos(total)
    let drawCount = count

    const pBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, pBuf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    const attrs = ["aG", "aD", "aP", "aS"].map((n) => gl.getAttribLocation(pProg, n))

    const qBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, qBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const qAttr = gl.getAttribLocation(qProg, "aQ")

    /* ---------------- 视口 / 布局 ---------------- */

    let W = 1
    let H = 1
    let aspect = 1
    let scale = 1
    const offG = [0, 0]
    const offD = [0, 0]
    const offP = [0, 0]
    let anchors = [0, 1, 2]

    const measure = () => {
      const els = Array.from(document.querySelectorAll<HTMLElement>("[data-stage]"))
      if (els.length >= 3) {
        const y = window.scrollY
        // 每段的「到位点」：Hero 顶部 / 座右铭居中 / 链接区居中
        anchors = els.slice(0, 3).map((el, i) => {
          const r = el.getBoundingClientRect()
          if (i === 0) return 0
          return Math.max(1, r.top + y + Math.min(r.height, H * 1.2) / 2 - H / 2)
        })
      }
    }

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      aspect = W / H
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      gl.viewport(0, 0, canvas.width, canvas.height)

      const portrait = aspect < 0.9
      scale = portrait ? Math.max(0.5, aspect * 1.1) : 1
      offG[0] = portrait ? 0 : 0.16
      offD[0] = 0
      offP[0] = portrait ? 0 : 0.4
      offP[1] = portrait ? 0.32 : 0
      measure()
    }

    /* ---------------- 交互 ---------------- */

    const mouse = { x: 0, y: 0, s: 0, ts: 0 }
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 }
    const ripple = { x: 0, y: 0, age: 9 }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      const nx = (e.clientX / W) * 2 - 1
      const ny = -((e.clientY / H) * 2 - 1)
      mouse.x = nx * aspect
      mouse.y = ny
      mouse.ts = 1
      tilt.tx = nx
      tilt.ty = ny
    }
    const onLeave = () => {
      mouse.ts = 0
      tilt.tx = 0
      tilt.ty = 0
    }
    const onDown = (e: PointerEvent) => {
      if (reduced) return
      ripple.x = ((e.clientX / W) * 2 - 1) * aspect
      ripple.y = -((e.clientY / H) * 2 - 1)
      ripple.age = 0
    }

    /* ---------------- 主循环 ---------------- */

    const start = performance.now()
    let last = start
    let time = 0
    let prog = -1
    let raf = 0
    let frameEma = 16
    let frames = 0
    let lost = false

    const scrollProgress = () => {
      const y = window.scrollY
      const [a0, a1, a2] = anchors
      if (y <= a1) return (y - a0) / Math.max(1, a1 - a0)
      return 1 + Math.min(1, (y - a1) / Math.max(1, a2 - a1))
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (lost) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      time += dt * (reduced ? 0.35 : 1)

      const intro = reduced ? 99 : (now - start) / 1000
      const target = Math.max(0, Math.min(2, scrollProgress()))
      prog = prog < 0 ? target : prog + (target - prog) * Math.min(1, dt * (reduced ? 10 : 3.2))

      mouse.s += (mouse.ts - mouse.s) * Math.min(1, dt * 3)
      tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 1.8)
      tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 1.8)
      ripple.age += dt

      // 开场时间线
      const tb = intro - BANG
      let cam = 3.4
      let core = 0
      let flash = 0
      let shock = 0
      let shockA = 0
      let streak = 0
      let shake = 0
      if (intro < 6) {
        if (tb < 0) {
          core = Math.min(1, intro / BANG) * (0.55 + 0.45 * Math.sin(intro * 34))
          cam = 1.7
        } else {
          core = 2.2 * Math.exp(-tb * 3.2)
          flash = 0.95 * Math.exp(-tb * 4.5)
          shock = 2.6 * (1 - Math.exp(-tb * 1.5))
          shockA = 0.9 * Math.exp(-tb * 1.2)
          streak = 1.3 * Math.exp(-tb * 2.2)
          shake = 0.09 * Math.exp(-tb * 4) * Math.sin(tb * 70)
          cam = 1.7 + (3.4 - 1.7) * ease(tb / 3.6)
        }
      }

      // 叠加层中心随形态迁移
      const k1 = Math.min(1, Math.max(0, prog))
      const k2 = Math.min(1, Math.max(0, prog - 1))
      const cx = (offG[0] * (1 - k1) + offD[0] * k1) * (1 - k2) + offP[0] * k2
      const cy = (offG[1] * (1 - k1) + offD[1] * k1) * (1 - k2) + offP[1] * k2
      // 背景气辉：星系冷蓝 → 吸积盘暖 → 星球冷青
      const tint = [
        0.018 + 0.03 * k1 * (1 - k2),
        0.03 + 0.008 * k1 * (1 - k2),
        0.07 - 0.045 * k1 * (1 - k2),
      ]

      gl.disable(gl.DEPTH_TEST)

      /* 背景 */
      gl.disable(gl.BLEND)
      gl.useProgram(qProg)
      gl.bindBuffer(gl.ARRAY_BUFFER, qBuf)
      for (const a of attrs) if (a >= 0) gl.disableVertexAttribArray(a)
      gl.enableVertexAttribArray(qAttr)
      gl.vertexAttribPointer(qAttr, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1f(qu.uAspect, aspect)
      gl.uniform2f(qu.uCenter, cx, cy)
      gl.uniform3f(qu.uTint, tint[0], tint[1], tint[2])
      gl.uniform1f(qu.uPass, 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      /* 粒子（加色混合） */
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      gl.disableVertexAttribArray(qAttr)
      gl.useProgram(pProg)
      gl.bindBuffer(gl.ARRAY_BUFFER, pBuf)
      attrs.forEach((a, i) => {
        if (a < 0) return
        gl.enableVertexAttribArray(a)
        gl.vertexAttribPointer(a, 4, gl.FLOAT, false, STRIDE * 4, i * 16)
      })
      gl.uniform1f(pu.uTime, time)
      gl.uniform1f(pu.uProg, prog)
      gl.uniform1f(pu.uIntro, intro)
      gl.uniform1f(pu.uAspect, aspect)
      gl.uniform1f(pu.uViewH, canvas.height)
      gl.uniform1f(pu.uCam, cam)
      gl.uniform1f(pu.uScale, scale)
      gl.uniform2f(pu.uTilt, tilt.x + shake, tilt.y + shake * 0.6)
      gl.uniform3f(pu.uMouse, mouse.x, mouse.y, mouse.s)
      gl.uniform3f(pu.uRipple, ripple.x, ripple.y, ripple.age)
      gl.uniform2f(pu.uOffG, offG[0], offG[1])
      gl.uniform2f(pu.uOffD, offD[0], offD[1])
      gl.uniform2f(pu.uOffP, offP[0], offP[1])
      // 粒子总数变化时保持整体亮度一致
      gl.uniform1f(pu.uGain, 0.78 * Math.sqrt(220_000 / drawCount) * (isMobile ? 1.15 : 1))
      gl.drawArrays(gl.POINTS, 0, drawCount)

      /* 开场叠加层 */
      if (core + flash + shockA + streak > 0.002) {
        for (const a of attrs) if (a >= 0) gl.disableVertexAttribArray(a)
        gl.useProgram(qProg)
        gl.bindBuffer(gl.ARRAY_BUFFER, qBuf)
        gl.enableVertexAttribArray(qAttr)
        gl.vertexAttribPointer(qAttr, 2, gl.FLOAT, false, 0, 0)
        gl.uniform1f(qu.uPass, 1)
        gl.uniform1f(qu.uFlash, flash)
        gl.uniform1f(qu.uShock, shock)
        gl.uniform1f(qu.uShockA, shockA)
        gl.uniform1f(qu.uCore, core)
        gl.uniform1f(qu.uStreak, streak)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }

      // 自适应降级：持续掉帧时按比例削减绘制数量（数据已均匀乱序，截断即抽样）
      if (intro > 5) {
        frameEma += (dt * 1000 - frameEma) * 0.05
        if (++frames >= 90) {
          frames = 0
          if (frameEma > 26 && drawCount > 40_000) drawCount = Math.round(drawCount * 0.78)
        }
      }
    }

    const onLost = (e: Event) => {
      e.preventDefault()
      lost = true
    }

    resize()
    // 字体与 Reveal 布局稳定后再测一次锚点
    const remeasure = window.setTimeout(measure, 600)
    window.addEventListener("resize", resize)
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerdown", onDown, { passive: true })
    document.documentElement.addEventListener("mouseleave", onLeave)
    canvas.addEventListener("webglcontextlost", onLost)
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(remeasure)
      window.removeEventListener("resize", resize)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onDown)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      canvas.removeEventListener("webglcontextlost", onLost)
      gl.deleteBuffer(pBuf)
      gl.deleteBuffer(qBuf)
      gl.deleteProgram(pProg)
      gl.deleteProgram(qProg)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-background" />
}
