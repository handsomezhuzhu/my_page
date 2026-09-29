import { Reveal } from "@/components/reveal"

export function HeroSection() {
  return (
    <div className="relative z-10 flex min-h-svh flex-col justify-center px-6 md:px-10 lg:px-16">
      <div className="on-particles max-w-2xl -translate-y-6 md:-translate-y-10">
        <Reveal>
          <p className="mb-8 flex items-center gap-4 font-mono text-[10px] tracking-[0.4em] text-muted-foreground/80 uppercase">
            <span className="h-px w-10 bg-foreground/30" />
            Personal&nbsp;Homepage&nbsp;—&nbsp;個人主頁
          </p>
        </Reveal>

        <Reveal delay={150}>
          <h1 className="font-serif text-[12vw] leading-[0.95] font-light tracking-[0.08em] text-foreground sm:text-6xl md:text-7xl lg:text-8xl">
            SIMON&nbsp;ZHU
          </h1>
        </Reveal>

        <Reveal delay={300}>
          <div className="mt-10 flex items-center gap-5">
            <span className="h-px flex-1 bg-gradient-to-r from-foreground/25 to-transparent" />
            <p className="font-mono text-[10px] leading-relaxed tracking-[0.3em] text-muted-foreground/70 uppercase">
              Est.&nbsp;2025&nbsp;&nbsp;/&nbsp;&nbsp;Code&nbsp;&&nbsp;Words
            </p>
          </div>
        </Reveal>

        <Reveal delay={450}>
          <p className="mt-8 max-w-md font-serif text-base leading-loose tracking-[0.1em] text-foreground/80 md:text-lg">
            獨立思考，明辨是非。
          </p>
        </Reveal>
      </div>

      {/* 滚动提示：底部居中的倒三角，与 9q.hk 一致 */}
      <Reveal delay={700} className="scroll-cue">
        <a href="#motto" aria-label="向下查看">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path
              d="M5 9.5 12 16l7-6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8 9.5 12 13l4-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth=".75"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity=".45"
            />
          </svg>
        </a>
      </Reveal>
    </div>
  )
}
