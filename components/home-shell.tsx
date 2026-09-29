"use client"

import { useEffect, useState } from "react"
import { ParticleField, type ParticleShape } from "@/components/particle-field"
import { SiteHeader } from "@/components/site-header"
import { HeroSection } from "@/components/hero-section"
import { MottoSection } from "@/components/motto-section"
import { NavigationLinks } from "@/components/navigation-links"
import { Footer } from "@/components/footer"

/**
 * 滚动驱动粒子形态：
 *   Hero → corridor（无限回廊）
 *   座右铭 → ring（墨环）
 *   链接 → globe（点阵地球）
 */
export function HomeShell() {
  const [shape, setShape] = useState<ParticleShape>("corridor")

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("[data-shape]")
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShape((entry.target as HTMLElement).dataset.shape as ParticleShape)
          }
        }
      },
      // 段落跨越视口中线时切换形态
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [])

  return (
    <main className="relative bg-background text-foreground">
      {/* 粒子背景层 */}
      <ParticleField shape={shape} />

      {/* 暗角，保证文字可读性 */}
      <div className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.4)_100%)]" />

      {/* 胶片噪点 */}
      <div className="noise pointer-events-none fixed inset-0 z-[2]" />

      <SiteHeader />

      <section data-shape="corridor">
        <HeroSection />
      </section>

      <section data-shape="ring" id="motto">
        <MottoSection />
      </section>

      <section data-shape="globe">
        <NavigationLinks />
        <Footer />
      </section>
    </main>
  )
}
