import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import RoleSelection from "./pages/RoleSelection"
import UserDashboard from "./pages/UserDashboard"
import GuardianDashboard from "./pages/GuardianDashboard"
import AdminDashboard from "./pages/AdminDashboard"
import ConversationPage from "./pages/ConversationPage"
import SignLanguagePage from "./pages/SignLanguagePage"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleSelection />} />
        <Route path="/user" element={<UserDashboard />} />
        <Route path="/conversation" element={<ConversationPage />} />
        <Route path="/sign" element={<SignLanguagePage />} />
        <Route path="/guardian" element={<GuardianDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
