import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Command } from "cmdk"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"
import {
  User,
  HeartHandshake,
  ShieldCheck,
  MessagesSquare,
  Hand,
  Database,
  Copy,
  RotateCcw,
  Mic,
  Ear,
  Volume2,
  MessageSquareQuote,
  History,
  Dumbbell,
} from "lucide-react"
import { startDemo } from "../lib/demoRunner"

const ROUTES = [
  { to: "/user", label: "User", hint: "Pictogram communication dashboard", icon: User },
  { to: "/guardian", label: "Guardian", hint: "Live message feed + replies", icon: HeartHandshake },
  { to: "/admin", label: "Admin", hint: "Platform analytics", icon: ShieldCheck },
  { to: "/conversation", label: "Conversation", hint: "Two-way talk: signs + voice", icon: MessagesSquare },
  { to: "/sign", label: "Sign Recognition", hint: "20-gesture camera recognition", icon: Hand },
  { to: "/sign-practice", label: "Sign Practice", hint: "Drill gestures, earn the Gesture Master badge", icon: Dumbbell },
  { to: "/speech", label: "Speech to Text", hint: "Live multilingual transcription", icon: Mic },
  { to: "/text-to-sign", label: "Text to Sign", hint: "Animated sign avatar for any text", icon: Ear },
  { to: "/voices", label: "Voices", hint: "System voice inventory + test phrases", icon: Volume2 },
  { to: "/phrases", label: "My Phrases", hint: "Quick access to your most-used sentences", icon: MessageSquareQuote },
  { to: "/history", label: "History", hint: "Searchable synced conversation history", icon: History },
  { to: "/database", label: "Database", hint: "Browse stored messages", icon: Database },
]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }

  const actions = useMemo(
    () => [
      {
        id: "copy-url",
        label: "Copy URL",
        hint: "Copy this app's link to the clipboard",
        icon: Copy,
        run: () => {
          navigator.clipboard?.writeText(window.location.origin).catch(() => {})
          toast.success("URL copied to clipboard")
          setOpen(false)
        },
      },
      {
        id: "restart-demo",
        label: "Restart demo",
        hint: "Replay the scripted guardian demo",
        icon: RotateCcw,
        run: () => {
          setOpen(false)
          navigate("/guardian?demo=true")
          window.setTimeout(startDemo, 1000)
          toast("Demo restarted")
        },
      },
    ],
    [navigate],
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cmdk-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <Command className="cmdk-panel" loop>
              <Command.Input autoFocus placeholder="Search routes and actions…" />
              <Command.List>
                <Command.Empty>No results found.</Command.Empty>
                <Command.Group heading="Navigation">
                  {ROUTES.map((r) => (
                    <Command.Item key={r.to} onSelect={() => go(r.to)}>
                      <r.icon size={16} aria-hidden="true" />
                      <span>{r.label}</span>
                      <span className="cmdk-hint">{r.hint}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Actions">
                  {actions.map((a) => (
                    <Command.Item key={a.id} onSelect={a.run}>
                      <a.icon size={16} aria-hidden="true" />
                      <span>{a.label}</span>
                      <span className="cmdk-hint">{a.hint}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
