import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono, Noto_Serif_TC } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const notoSerifTC = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-serif",
})

export const metadata: Metadata = {
  title: "simon",
  description: "同是天涯淪落人，相逢何必曾相識",
  generator: "v0.app",
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-HK">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSerifTC.variable} font-serif antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  )
}
