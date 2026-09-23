import React, { Suspense, lazy, useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { WifiOff, RefreshCw } from "lucide-react"
import { Toaster, toast } from "sonner"
import RoleSelection from "./pages/RoleSelection"
import UserDashboard from "./pages/UserDashboard"
import GuardianDashboard from "./pages/GuardianDashboard"
import ConversationPage from "./pages/ConversationPage"
import SignLanguagePage from "./pages/SignLanguagePage"
import CommandPalette from "./components/CommandPalette"
import PageShell from "./components/PageShell"
import { applyA11ySettings, loadA11ySettings } from "./lib/a11y"
import { installSyncListeners, isOnline, getOutboxCount, flushOutbox } from "./lib/offline"
import "./index.css"
import "./command-palette.css"

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"))
const DatabaseViewerPage = lazy(() => import("./pages/DatabaseViewerPage"))
const SpeechPage = lazy(() => import("./pages/SpeechPage"))
const TextToSignPage = lazy(() => import("./pages/TextToSignPage"))
const VoicesPage = lazy(() => import("./pages/VoicesPage"))
const PhrasesPage = lazy(() => import("./pages/PhrasesPage"))
const HistoryPage = lazy(() => import("./pages/HistoryPage"))
const SignPracticePage = lazy(() => import("./pages/SignPracticePage"))
const VoiceSetupPage = lazy(() => import("./pages/VoiceSetupPage"))

/** Global offline indicator + pending-sync counter banner. */
function ConnectivityBanner() {
  const [online, setOnline] = useState(() => isOnline())
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const update = () => {
      setOnline(isOnline())
      void getOutboxCount().then(setPending)
    }
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    const onSynced = (e: Event) => {
      const count = (e as CustomEvent<{ count: number }>).detail?.count ?? 0
      if (count > 0) {
        toast.success(`Synced ${count} message${count === 1 ? "" : "s"}`)
        setPending(0)
      }
    }
    window.addEventListener("vaaksetu:synced", onSynced)
    const interval = window.setInterval(update, 5000)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
      window.removeEventListener("vaaksetu:synced", onSynced)
      window.clearInterval(interval)
    }
  }, [])

  if (online && pending === 0) return null
  return (
    <motion.div
      initial={{ y: -40 }}
      animate={{ y: 0 }}
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 45,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "8px 16px",
        background: online ? "rgba(250, 204, 21, 0.12)" : "rgba(239, 68, 68, 0.16)",
        borderBottom: `1px solid ${online ? "#F59E0B" : "#EF4444"}`,
        color: online ? "#F59E0B" : "#F87171",
        fontSize: 13.5,
        fontWeight: 800,
        fontFamily: "'Inter Display', system-ui, sans-serif",
      }}
    >
      {online ? (
        pending > 0 ? (
          <>
            <RefreshCw size={15} aria-hidden="true" />
            {pending} message{pending === 1 ? "" : "s"} pending sync
            <button
              type="button"
              onClick={() => void flushOutbox()}
              style={{ background: "transparent", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", fontSize: 13, fontWeight: 800 }}
            >
              Sync now
            </button>
          </>
        ) : null
      ) : (
        <>
          <WifiOff size={15} aria-hidden="true" />
          Offline — messages will sync when connected
        </>
      )}
    </motion.div>
  )
}

/** Apply a11y settings once and install offline listeners. */
function Bootstrap() {
  useEffect(() => {
    applyA11ySettings(loadA11ySettings())
    installSyncListeners()
  }, [])
  return null
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname.split("/")[1]}>
        <Route path="/" element={<PageShell><RoleSelection /></PageShell>} />
        <Route path="/user" element={<PageShell><UserDashboard /></PageShell>} />
        <Route path="/conversation" element={<PageShell><ConversationPage /></PageShell>} />
        <Route path="/sign" element={<PageShell><SignLanguagePage /></PageShell>} />
        <Route path="/sign-practice" element={<PageShell><Suspense fallback={null}><SignPracticePage /></Suspense></PageShell>} />
        <Route path="/speech" element={<PageShell><Suspense fallback={null}><SpeechPage /></Suspense></PageShell>} />
        <Route path="/text-to-sign" element={<PageShell><Suspense fallback={null}><TextToSignPage /></Suspense></PageShell>} />
        <Route path="/voices" element={<PageShell><Suspense fallback={null}><VoicesPage /></Suspense></PageShell>} />
        <Route path="/voice-setup" element={<PageShell><Suspense fallback={null}><VoiceSetupPage /></Suspense></PageShell>} />
        <Route path="/phrases" element={<PageShell><Suspense fallback={null}><PhrasesPage /></Suspense></PageShell>} />
        <Route path="/history" element={<PageShell><Suspense fallback={null}><HistoryPage /></Suspense></PageShell>} />
        <Route path="/guardian" element={<PageShell><GuardianDashboard /></PageShell>} />
        <Route
          path="/admin"
          element={
            <PageShell>
              <Suspense fallback={null}>
                <AdminDashboard />
              </Suspense>
            </PageShell>
          }
        />
        <Route
          path="/database"
          element={
            <PageShell>
              <Suspense fallback={null}>
                <DatabaseViewerPage />
              </Suspense>
            </PageShell>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Bootstrap />
      <ConnectivityBanner />
      <AnimatedRoutes />
      <CommandPalette />
      <Toaster theme="dark" position="top-right" richColors />
    </BrowserRouter>
  </React.StrictMode>,
)
