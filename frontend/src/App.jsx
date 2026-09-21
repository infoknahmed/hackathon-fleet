import React, { useState, useEffect } from 'react'
import { Wallet, ArrowUpRight, ArrowDownLeft, Plus, RefreshCw, Layers, ShieldCheck } from 'lucide-react'

export default function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-badge">
          <Wallet className="icon-main" />
          <h1>Ocal Llmash Qwen2.5-Coder Model For Intent Prediction- Ui: Dark Mode, Glassmorphism, Accessible Large-Tap Targets, High Contrastdemo Flow (Must Work End-To-End):1. User Taps 3 Pictograms On Screen2. Ai Predicts A Full Sentence3. Phone Speaks It Aloud In Under 1 Second4. Caregiver Screen (Second Device) Shows The Message Livedeliverables:- Working Frontend + Backend- Deployed To A Live Url- Demo Script For Judges (Hackathon.Md)- Impact Metrics (Lives Improved, Cost Saved Vs $5,000 Hardware)

[Tech Stack Required: Vite + React + Express]</h1>
        </div>
        <div className="status-pill">
          <ShieldCheck size={16} />
          <span>{loading ? 'Connecting...' : data ? 'Backend Online' : 'Local Mode'}</span>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="card hero-card">
          <h2>Overview Dashboard</h2>
          <p className="subtitle">Welcome to your hackathon starter application foundation.</p>
          <div className="metrics-row">
            <div className="metric">
              <span className="label">Status</span>
              <span className="value text-green">Active</span>
            </div>
            <div className="metric">
              <span className="label">Framework</span>
              <span className="value">Vite + React</span>
            </div>
            <div className="metric">
              <span className="label">API Bridge</span>
              <span className="value">Express 4.x</span>
            </div>
          </div>
        </section>

        <section className="card">
          <h3><Layers size={18} /> Quick Start Actions</h3>
          <div className="actions-list">
            <button className="btn btn-primary" onClick={() => alert('Base template initialized successfully!')}>
              <Plus size={16} /> Add Record
            </button>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              <RefreshCw size={16} /> Refresh Data
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
