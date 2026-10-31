/**
 * 全部形态运算都在顶点着色器里完成：CPU 每帧只上传十几个 uniform，
 * 粒子数从旧方案的 ~2.7 万（CPU 光栅）提升到 20 万级，且帧时间几乎与滚动/形变无关。
 */

export const PARTICLE_VERT = /* glsl */ `
precision highp float;

attribute vec4 aG;
attribute vec4 aD;
attribute vec4 aP;
attribute vec4 aS;

uniform float uTime;
uniform float uProg;
uniform float uIntro;
uniform float uAspect;
uniform float uViewH;
uniform float uCam;
uniform float uScale;
uniform vec2 uTilt;
uniform vec3 uMouse;
uniform vec3 uRipple[4];
uniform vec2 uOffG;
uniform vec2 uOffD;
uniform vec2 uOffP;

varying vec3 vColor;
varying float vAlpha;

const float PI = 3.14159265;
const float FOCAL = 1.6;
const float PLANET = 1.15;

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

/* ---------- G：星系 ---------- */
void galaxy(float burst, out vec3 p, out vec3 col, out float br) {
  float kind = floor(aG.w);
  float r = aG.x;
  // 开场：旋臂从轻轻拧紧的状态缓慢舒展开
  float unwind = 1.0 - burst;
  unwind = unwind * unwind * 3.2 / (r + 0.4);
  float a = aG.y - uTime * (0.085 + 0.06 / (r + 0.35)) + unwind;
  p = vec3(r * cos(a), aG.z, r * sin(a));
  p = rotZ(-0.42) * rotX(0.86) * p * 1.32;

  vec3 core = vec3(1.0, 0.84, 0.62);
  vec3 arm = vec3(0.5, 0.66, 1.0);
  col = mix(core, arm, smoothstep(0.0, 1.3, r));
  if (kind > 2.5) col = vec3(0.42, 0.9, 1.0);
  else if (kind > 1.5) col = mix(col, vec3(0.32, 0.42, 0.78), 0.55);
  br = fract(aG.w);
}

/* ---------- D：黑洞吸积盘 ---------- */
void disc(out vec3 p, out vec3 col, out float br, out float vis) {
  float kind = floor(aD.w);
  float b = fract(aD.w);
  float r = aD.x;
  mat3 T = rotZ(0.07) * rotX(0.17);
  vec3 hot = vec3(1.0, 0.95, 0.86);
  vec3 warm = vec3(1.0, 0.6, 0.26);
  vis = 1.0;

  if (kind < 0.5 || kind > 3.5) {
    // 开普勒转速：内圈快、外圈慢
    float w = kind > 3.5 ? 0.08 : 0.55 * pow(r, -1.5);
    float a = aD.y - uTime * w;
    p = T * vec3(r * cos(a), aD.z, r * sin(a));
    vec3 v = T * vec3(sin(a), 0.0, -cos(a));
    // 相对论性多普勒增亮：朝向相机运动的一侧更亮
    br = b * (1.0 - 0.55 * v.z);
    col = mix(hot, warm, smoothstep(0.5, 1.6, r));
  } else if (kind < 1.5) {
    float a = aD.y + uTime * 0.12;
    p = vec3(r * cos(a), r * sin(a) * 0.94, 0.0);
    br = b * (1.0 + 0.75 * cos(a));
    col = mix(hot, warm, smoothstep(0.45, 0.8, r));
  } else if (kind < 2.5) {
    float f = fract(uTime * 0.08 + aS.x);
    float rr = mix(2.6, 0.46, f * f);
    float a = aD.y - f * 7.0 - uTime * 0.15;
    p = T * vec3(rr * cos(a), aD.z * (1.0 - f), rr * sin(a));
    br = b * smoothstep(0.0, 0.15, f) * (1.0 - smoothstep(0.85, 1.0, f)) * (0.35 + f);
    col = mix(hot, warm, 1.0 - f);
  } else {
    p = vec3(r * cos(aD.y), r * sin(aD.y), 0.0);
    br = b * (1.0 + 0.5 * cos(aD.y));
    col = hot;
  }

  // 压暗高亮区，避免盖住叠在上面的文字：越靠近中心压得越多
  br *= 0.55 * mix(0.6, 1.0, smoothstep(0.45, 1.4, length(p.xy)));

  // 事件视界：位于黑洞后方、落在阴影圆内的粒子被吞没
  if (p.z > 0.0) vis = smoothstep(0.36, 0.41, length(p.xy));
}

/* ---------- P：星球 ---------- */
float occluded(vec3 p) {
  return step(0.0, p.z) * (1.0 - smoothstep(0.97, 1.03, length(p.xy)));
}

void planet(out vec3 p, out vec3 col, out float br, out float vis) {
  float kind = floor(aP.w);
  float b = fract(aP.w);
  mat3 axis = rotX(0.34) * rotZ(0.42);
  vec3 L = normalize(vec3(-0.8, 0.38, -0.48));
  vis = 1.0;

  if (kind < 3.5) {
    float rad = length(aP.xyz);
    vec3 n = axis * (rotY(uTime * 0.22) * (aP.xyz / rad));
    p = n * rad;
    float facing = -n.z;
    float lit = dot(n, L);
    float day = smoothstep(-0.12, 0.4, lit);
    vis = smoothstep(-0.02, 0.2, facing);
    if (kind < 0.5) {
      col = vec3(0.2, 0.42, 0.95);
      br = b * (0.05 + 0.45 * day);
    } else if (kind < 1.5) {
      col = mix(vec3(0.5, 0.78, 1.0), vec3(0.93, 0.97, 1.0), b);
      br = b * (0.04 + 0.96 * day);
    } else if (kind < 2.5) {
      // 夜侧城市灯光
      col = vec3(1.0, 0.68, 0.34);
      br = b * (1.0 - smoothstep(-0.2, 0.1, lit)) + 0.02;
    } else {
      float rim = 1.0 - abs(facing);
      col = vec3(0.45, 0.85, 1.0);
      br = b * pow(rim, 2.4) * (0.2 + 0.8 * smoothstep(-0.35, 0.5, lit));
      vis = smoothstep(-0.4, -0.12, facing);
    }
  } else if (kind < 4.5) {
    float r = aP.x;
    float a = aP.y - uTime * 0.2 * pow(r, -1.5);
    p = axis * vec3(r * cos(a), aP.z, r * sin(a));
    vis = 1.0 - occluded(p);
    // 行星投在环上的影子
    float s = dot(p, L);
    float shadow = step(s, 0.0) * (1.0 - smoothstep(0.94, 1.06, length(p - s * L)));
    col = vec3(0.76, 0.83, 0.96);
    br = b * (1.0 - 0.88 * shadow) * 0.8;
  } else {
    float a = aP.z + uTime * 0.6;
    p = axis * rotX(aP.y) * vec3(aP.x * cos(a), 0.0, aP.x * sin(a));
    vis = 1.0 - occluded(p);
    col = vec3(0.45, 0.92, 1.0);
    br = 1.6;
  }
  p *= PLANET;
}

void main() {
  vec3 pos;
  vec3 col;
  float br;
  vec2 off = vec2(0.0);
  float star = aS.w;

  if (star > 0.5) {
    pos = aG.xyz;
    col = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.9, 0.8), aS.x);
    br = aG.w * (0.6 + 0.4 * sin(uTime * 1.7 + aS.x * 60.0));
    br *= smoothstep(0.4, 3.4, uIntro);
  } else {
    float burst = 1.0;

    vec3 pG; vec3 cG; float bG;
    galaxy(burst, pG, cG, bG);
    vec3 pD; vec3 cD; float bD; float vD;
    disc(pD, cD, bD, vD);
    vec3 pP; vec3 cP; float bP; float vP;
    planet(pP, cP, bP, vP);

    // 错峰：G→D 由内向外被卷走；D→P 随机凝聚
    float d1 = clamp(aG.x / 3.0, 0.0, 1.0) * 0.35 + aS.x * 0.15;
    float k1 = smoothstep(0.0, 1.0, clamp((uProg - d1) / 0.5, 0.0, 1.0));
    float d2 = aS.y * 0.28;
    float k2 = smoothstep(0.0, 1.0, clamp((uProg - 1.0 - d2) / 0.66, 0.0, 1.0));

    pos = mix(mix(pG, pD, k1), pP, k2);
    col = mix(mix(cG, cD, k1), cP, k2);
    br = mix(mix(bG, bD * vD, k1), bP * vP, k2);
    // 屏幕偏移用统一进度插值，避免不同粒子各自错位导致整团被横向抹开
    float g1 = smoothstep(0.0, 1.0, clamp(uProg, 0.0, 1.0));
    float g2 = smoothstep(0.0, 1.0, clamp(uProg - 1.0, 0.0, 1.0));
    off = mix(mix(uOffG, uOffD, g1), uOffP, g2);

    // 宇宙风暴式过渡：粒子被甩出成一个巨大的旋转星云壳，绕大半圈后再收拢到新形态
    float a1 = sin(PI * k1);
    float a2 = sin(PI * k2);
    float tw = a1 + a2;
    if (tw > 0.001) {
      // 差速旋转：内圈转得更多 → 整体被拧成一个清晰的巨大旋涡，而不是随机散开的雾
      float rl = length(pos.xz);
      float diff = 1.8 + 2.4 / (rl + 0.35) + aS.y * 0.6;
      float spin = (a1 - a2 * 0.9) * diff;
      pos = rotX(tw * 0.55) * rotY(spin) * pos;
      vec3 dir = normalize(pos + vec3(0.0001, 0.0002, 0.0));
      float swell = a1 * (0.45 + aS.x * 0.75) + a2 * (0.12 + aS.x * 0.3);
      pos += dir * swell;
      pos.y += a1 * (aS.y - 0.5) * 0.7;
      vec3 nz = vec3(
        sin(aS.x * 91.0 + uTime * 1.1),
        sin(aS.y * 77.0 + uTime * 0.9),
        sin((aS.x + aS.y) * 53.0 + uTime * 0.8)
      );
      pos += nz * (a1 * 0.26 + a2 * 0.12);
      br *= 1.0 + tw * 1.1;
      vec3 storm = mix(vec3(0.45, 0.78, 1.0), vec3(1.0, 0.72, 0.42), aS.x * a1 + (1.0 - aS.x) * a2 * 0.3);
      col = mix(col, storm, min(1.0, tw) * 0.55);
    }

    // 开场：四周弥散的星尘沿螺旋轨迹向中心汇聚，核心先成形，旋臂最后卷入并减速落位
    if (uIntro < 6.0) {
      float rT = length(pos.xy);
      float aT = atan(pos.y, pos.x);
      float delay = aS.y * 0.85 + clamp(aG.x / 3.0, 0.0, 1.0) * 0.75;
      float t = clamp((uIntro - 0.15 - delay) / 2.6, 0.0, 1.0);
      float e = 1.0 - pow(1.0 - t, 3.0);
      float r0 = rT + 2.6 + aS.x * 3.0;
      float rr = mix(r0, rT, e);
      // 投影后星系屏幕旋向为逆时针（角度递增），汇聚须顺着同一旋向
      float aa = aT - (2.2 + aS.x * 1.4) * (1.0 - e);
      pos.xy = vec2(cos(aa), sin(aa)) * rr;
      pos.z += (aS.y - 0.5) * 1.2 * (1.0 - e);
      br *= smoothstep(0.0, 0.3, t) * (0.35 + 0.65 * e) * (1.0 + 0.45 * sin(PI * e));
      col = mix(vec3(0.62, 0.78, 1.0), col, e * e);
    }

    pos *= uScale;
  }

  float par = star > 0.5 ? 0.25 : 1.0;
  pos = rotY(uTilt.x * 0.2 * par) * rotX(uTilt.y * 0.13 * par) * pos;

  float z = pos.z + uCam;
  if (z < 0.06) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    vAlpha = 0.0;
    return;
  }

  vec2 ndc = pos.xy * FOCAL / z;
  ndc.x /= uAspect;
  ndc += off;

  // 鼠标引力场：轻推开 + 照亮
  vec2 sp = vec2(ndc.x * uAspect, ndc.y);
  vec2 dm = sp - uMouse.xy;
  float dd = dot(dm, dm);
  float mf = exp(-dd / 0.022) * uMouse.z * (1.0 - star);
  sp += dm * inversesqrt(dd + 0.00001) * mf * 0.05;
  br *= 1.0 + mf * 1.4;

  // 点击冲击波
  // 多个波纹互相独立，各自扩散到寿命结束
  vec2 push = vec2(0.0);
  float glow = 0.0;
  for (int i = 0; i < 4; i++) {
    vec3 rp = uRipple[i];
    if (rp.z < 1.8) {
      vec2 dr = sp - rp.xy;
      float lr = length(dr);
      float q = (lr - rp.z * 1.15) / 0.07;
      float rf = exp(-q * q) * (1.0 - rp.z / 1.8) * (1.0 - star);
      push += dr / (lr + 0.0001) * rf * 0.06;
      glow += rf;
    }
  }
  sp += push;
  br *= 1.0 + min(glow, 1.5) * 2.2;
  ndc = vec2(sp.x / uAspect, sp.y);

  float size = aS.z * uViewH * 0.5 * FOCAL / z * (star > 0.5 ? 1.0 : uScale);
  float a = br;
  if (size < 1.5) {
    a *= size * size / 2.25;
    size = 1.5;
  } else if (size > 3.0) {
    a *= pow(3.0 / size, 1.5);
  }
  size = min(size, 96.0);

  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = size;
  vColor = col;
  vAlpha = a;
}
`

export const PARTICLE_FRAG = /* glsl */ `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
uniform float uGain;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 4.5) * (1.0 - d2);
  gl_FragColor = vec4(vColor * (a * vAlpha * uGain), 1.0);
}
`

export const QUAD_VERT = /* glsl */ `
attribute vec2 aQ;
varying vec2 vUv;
void main() {
  vUv = aQ;
  gl_Position = vec4(aQ, 0.0, 1.0);
}
`

/** pass 0 = 深空背景；pass 1 = 叠加层（奇点核心、闪白、冲击波环、变形镜头光条） */
export const QUAD_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform float uPass;
uniform float uAspect;
uniform vec2 uCenter;
uniform float uFlash;
uniform float uShock;
uniform float uShockA;
uniform float uCore;
uniform float uStreak;
uniform vec3 uTint;
void main() {
  vec2 p = vec2((vUv.x - uCenter.x) * uAspect, vUv.y - uCenter.y);
  float d = length(p);
  if (uPass < 0.5) {
    vec3 base = vec3(0.005, 0.008, 0.018);
    vec3 glow = uTint * exp(-d * d * 1.1);
    gl_FragColor = vec4(base + glow, 1.0);
    return;
  }
  vec3 c = vec3(0.0);
  c += vec3(0.85, 0.93, 1.0) * uFlash * (0.3 + 0.7 * exp(-d * d * 1.4));
  float w = 0.012 + uShock * 0.06;
  float q = (d - uShock) / w;
  float ring = exp(-q * q);
  c += vec3(0.5, 0.86, 1.0) * ring * uShockA;
  c += vec3(1.0, 0.96, 0.9) * uCore * (exp(-d * d * 1400.0) + 0.3 * exp(-d * d * 70.0));
  c += vec3(0.55, 0.82, 1.0) * uStreak * exp(-abs(p.y) * 160.0) * exp(-abs(p.x) * 1.4);
  gl_FragColor = vec4(c, 1.0);
}
`
