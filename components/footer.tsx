import Image from "next/image"
import { siteConfig } from "@/lib/config"

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative z-10 px-6 pb-10 md:px-10 lg:px-16">
      <div className="max-w-2xl">
        <div className="h-px w-full bg-gradient-to-r from-foreground/15 to-transparent" />
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground/60 uppercase">
            © {currentYear} Simon
          </p>

          {siteConfig.showBeian ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] tracking-[0.15em] text-muted-foreground/50">
              <a
                href={siteConfig.beian.icpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-muted-foreground"
              >
                {siteConfig.beian.icp}
              </a>
              <span className="text-muted-foreground/25">|</span>
              <a
                href="https://beian.mps.gov.cn"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors hover:text-muted-foreground"
              >
                <Image src="/beian.png" alt="公安备案" width={12} height={12} className="opacity-50" />
                {siteConfig.beian.psr}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
