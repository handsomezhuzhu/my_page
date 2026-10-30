"use client"

import { useEffect, useState } from "react"

export function SiteHeader() {
  const [time, setTime] = useState("")
  const [offset, setOffset] = useState("UTC+8")

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(
        now.toLocaleTimeString("zh-CN", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      )
      // 标签跟随访客本地时区，与上方时间一秒一同步（含小数时区，如 UTC+5:30）
      const offsetMinutes = -now.getTimezoneOffset()
      const sign = offsetMinutes >= 0 ? "+" : "-"
      const abs = Math.abs(offsetMinutes)
      const h = Math.floor(abs / 60)
      const m = abs % 60
      setOffset(`UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 md:px-10">
      <a href="/" className="group flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center border border-foreground/50 text-[11px] font-medium leading-none text-foreground/90 transition-colors group-hover:border-foreground">
          S
        </span>
        <span className="text-[11px] tracking-[0.35em] text-foreground/80 uppercase">
          Simon
        </span>
      </a>

      <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.25em] text-muted-foreground/70 uppercase">
        <span className="hidden sm:inline">Personal&nbsp;Homepage</span>
        <span className="hidden h-3 w-px bg-border sm:inline" />
        <span suppressHydrationWarning>{time || "00:00:00"}</span>
        <span>{offset}</span>
      </div>
    </header>
  )
}
