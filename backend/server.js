const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT_BACKEND || process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'ocal llmash qwen2.5-coder model for intent prediction- UI: Dark mode, glassmorphism, accessible large-tap targets, high contrastDEMO FLOW (must work end-to-end):1. User taps 3 pictograms on screen2. AI predicts a full sentence3. Phone speaks it aloud in under 1 second4. Caregiver screen (second device) shows the message liveDELIVERABLES:- Working frontend + backend- Deployed to a live URL- Demo script for judges (HACKATHON.md)- Impact metrics (lives improved, cost saved vs $5,000 hardware)

[TECH STACK REQUIRED: Vite + React + Express]', timestamp: new Date().toISOString() });
});

app.get('/api/data', (req, res) => {
  res.json({
    message: 'Base API data loaded successfully',
    items: [
      { id: 1, title: 'Sample Transaction 1', amount: 1500, type: 'credit' },
      { id: 2, title: 'Sample Expense 2', amount: 450, type: 'debit' }
    ]
  });
});

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) {
        res.status(200).send('<h2>API Server Running. Frontend dist not built yet.</h2>');
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend API server running on http://localhost:${PORT}`);
});
