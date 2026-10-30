import { CosmosField } from "@/components/cosmos-field"
import { SiteHeader } from "@/components/site-header"
import { HeroSection } from "@/components/hero-section"
import { MottoSection } from "@/components/motto-section"
import { NavigationLinks } from "@/components/navigation-links"
import { Footer } from "@/components/footer"

/**
 * 滚动连续驱动粒子宇宙（data-stage 为形态锚点）：
 *   Hero → 星系（开场大爆炸）
 *   座右铭 → 黑洞吸积盘
 *   链接 → 带环行星
 */
export function HomeShell() {
  return (
    <main className="relative bg-background text-foreground">
      <CosmosField />

      {/* 暗角，保证文字可读性 */}
      <div className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.4)_100%)]" />

      {/* 胶片噪点 */}
      <div className="noise pointer-events-none fixed inset-0 z-[2]" />

      <SiteHeader />

      <section data-stage="galaxy">
        <HeroSection />
      </section>

      <section data-stage="disc" id="motto">
        <MottoSection />
      </section>

      <section data-stage="planet">
        <NavigationLinks />
        <Footer />
      </section>
    </main>
  )
}
