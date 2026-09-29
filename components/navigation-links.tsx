import { Reveal } from "@/components/reveal"

const links = [
  { name: "GitHub", href: "https://github.com/handsomezhuzhu", description: "代码仓库" },
  { name: "Blog", href: "https://zhuzihan.com", description: "技术博客" },
  { name: "Rank", href: "https://rank.zhuzihan.com", description: "LLM 排行榜", isNew: true },
  { name: "Home", href: "https://home.zhuzihan.com", description: "个人导航" },
  { name: "Status", href: "https://status.zhuzihan.com/", description: "服务状态" },
  { name: "File", href: "https://file.zhuzihan.com", description: "文件快递柜" },
  { name: "Email", href: "mailto:zhuzihan@zhuzihan.com", description: "联系我" },
]

export function NavigationLinks() {
  return (
    <div className="relative z-10 flex min-h-svh flex-col justify-center px-6 py-24 md:px-10 lg:px-16">
      <div className="w-full max-w-2xl">
        <Reveal>
          <div className="mb-10 flex items-end justify-between gap-6">
            <h2 className="flex items-center gap-4 font-mono text-[10px] tracking-[0.4em] text-muted-foreground/80 uppercase">
              <span className="h-px w-10 bg-foreground/30" />
              Links&nbsp;&nbsp;/&nbsp;&nbsp;链接
            </h2>
            <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground/50">
              ({String(links.length).padStart(2, "0")})
            </span>
          </div>
        </Reveal>

        <ul>
          {links.map((link, index) => (
            <Reveal key={link.name} delay={120 + index * 70}>
              <li>
                <a
                  href={link.href}
                  target={link.href.startsWith("mailto:") ? undefined : "_blank"}
                  rel={link.href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                  className="group relative flex items-baseline gap-5 border-t border-foreground/10 py-5 transition-colors duration-500 last:border-b hover:border-foreground/30 md:gap-8"
                >
                  <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/50 transition-colors group-hover:text-foreground/70">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <span className="font-serif text-2xl font-light tracking-[0.06em] text-foreground/85 transition-all duration-500 group-hover:translate-x-2 group-hover:text-foreground md:text-3xl">
                    {link.name}
                  </span>

                  {link.isNew ? (
                    <span className="inline-flex items-center self-center border border-[#68e3ff]/40 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.2em] text-[#68e3ff] uppercase">
                      New
                    </span>
                  ) : null}

                  <span className="ml-auto flex items-baseline gap-4">
                    <span className="text-xs tracking-[0.15em] text-muted-foreground/60 transition-colors group-hover:text-muted-foreground">
                      {link.description}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-sm text-muted-foreground/40 transition-all duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                    >
                      ↗
                    </span>
                  </span>

                  {/* 悬停时底部光线 */}
                  <span className="pointer-events-none absolute -bottom-px left-0 h-px w-0 bg-gradient-to-r from-foreground/60 to-transparent transition-all duration-700 group-hover:w-full" />
                </a>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </div>
  )
}
