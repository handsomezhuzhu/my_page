import { Reveal } from "@/components/reveal"

export function MottoSection() {
  return (
    <div className="relative z-10 flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <Reveal>
        <p className="mb-10 font-mono text-[10px] tracking-[0.4em] text-muted-foreground/70 uppercase">
          Motto&nbsp;&nbsp;/&nbsp;&nbsp;座右銘
        </p>
      </Reveal>

      <Reveal delay={150}>
        <blockquote className="on-particles">
          <p className="font-serif text-3xl font-light leading-snug tracking-[0.12em] text-foreground/90 md:text-5xl md:leading-snug">
            同是天涯淪落人
          </p>
          <p className="mt-4 font-serif text-3xl font-light leading-snug tracking-[0.12em] text-foreground/90 md:mt-6 md:text-5xl md:leading-snug">
            相逢何必曾相識
          </p>
        </blockquote>
      </Reveal>

      <Reveal delay={350}>
        <cite className="mt-12 flex items-center justify-center gap-4 not-italic">
          <span className="h-px w-10 bg-foreground/25" />
          <span className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground/70 uppercase">
            白居易 · 琵琶行
          </span>
          <span className="h-px w-10 bg-foreground/25" />
        </cite>
      </Reveal>
    </div>
  )
}
