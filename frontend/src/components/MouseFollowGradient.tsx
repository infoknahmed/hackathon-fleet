import { useEffect, useRef, useState } from "react"
import { tokens } from "../styles/tokens"

/** Radial aurora gradient that follows the cursor (desktop, fine pointers only). */
export default function MouseFollowGradient() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Skip touch devices and reduced-motion users.
    if (!window.matchMedia("(pointer: fine)").matches) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let raf = 0
    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 3 }
    const target = { ...pos }

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX
      target.y = e.clientY
      setVisible(true)
    }
    const tick = () => {
      pos.x += (target.x - pos.x) * 0.08
      pos.y += (target.y - pos.y) * 0.08
      if (ref.current) {
        ref.current.style.transform = `translate3d(${pos.x - 300}px, ${pos.y - 300}px, 0)`
      }
      raf = requestAnimationFrame(tick)
    }
    window.addEventListener("mousemove", onMove)
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener("mousemove", onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  if (!visible) return null
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 600,
        height: 600,
        borderRadius: "50%",
        pointerEvents: "none",
        zIndex: 1,
        opacity: 0.3,
        background: `radial-gradient(circle, ${tokens.aurora.cyan}22 0%, ${tokens.aurora.violet}18 35%, transparent 70%)`,
        filter: "blur(60px)",
      }}
    />
  )
}
