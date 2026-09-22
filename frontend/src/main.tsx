import React, { Suspense, lazy } from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { AnimatePresence } from "motion/react"
import { Toaster } from "sonner"
import RoleSelection from "./pages/RoleSelection"
import UserDashboard from "./pages/UserDashboard"
import GuardianDashboard from "./pages/GuardianDashboard"
import ConversationPage from "./pages/ConversationPage"
import SignLanguagePage from "./pages/SignLanguagePage"
import CommandPalette from "./components/CommandPalette"
import PageShell from "./components/PageShell"
import "./index.css"
import "./command-palette.css"

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"))
const DatabaseViewerPage = lazy(() => import("./pages/DatabaseViewerPage"))

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname.split("/")[1]}>
        <Route path="/" element={<PageShell><RoleSelection /></PageShell>} />
        <Route path="/user" element={<PageShell><UserDashboard /></PageShell>} />
        <Route path="/conversation" element={<PageShell><ConversationPage /></PageShell>} />
        <Route path="/sign" element={<PageShell><SignLanguagePage /></PageShell>} />
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
      <AnimatedRoutes />
      <CommandPalette />
      <Toaster theme="dark" position="top-right" richColors />
    </BrowserRouter>
  </React.StrictMode>,
)
