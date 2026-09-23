# Contributing to VaakSetu

Thank you for helping build a voice bridge! This guide covers setup, conventions,
and the PR process.

## 🛠️ Dev Setup

```bash
# 1. Clone and install
git clone https://github.com/infoknahmed/vaaksetu.git
cd vaaksetu

# 2. Backend (Node 18+, 22.5+ recommended for built-in node:sqlite)
cd backend && npm install && npm start     # http://localhost:3001

# 3. Frontend (new terminal)
cd frontend && npm install && npm run dev  # http://localhost:5173
```

The Vite dev server proxies `/api` and `/socket.io` to `localhost:3001`, so no
env vars are needed locally.

### Useful checks before every PR

```bash
cd frontend && npm run build          # production build must pass
cd backend  && npm run build          # syntax check (node --check)
```

## 🌿 Branching & PRs

1. Fork (or branch from `main`): `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`
2. Keep PRs focused — one feature or fix per PR
3. Describe **what** and **why**; link issues with `Fixes #<n>`
4. Screenshots/GIFs for UI changes are strongly appreciated
5. CI-relevant gates: build must pass; no new console errors on page load

## 🎨 Code Style

- **TypeScript strict-ish**: explicit types for public APIs; no `any` unless escaping a third-party shape
- **Imports**: no circular imports — if two modules need each other's types, extract them to a shared module
- **Declaration order matters**: module-level `const`s used by functions called during module init must be declared *before* those calls (we shipped a real TDZ bug this way — see commit `55e494a`)
- **Components**: function components + hooks; inline styles use the shared design tokens from `src/theme.ts` / `src/styles/tokens.ts`
- **Accessibility**: every interactive element needs an accessible name; live regions for async status; `aria-pressed` for toggles
- **Commits**: conventional commits — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`

## 🧪 Testing Manually

There is no unit-test suite yet. For now:

- `npm run build` + `npm run preview`, then load `/`, `/avatar-talk`, `/sign`, `/text-to-sign`
- Headless smoke test: `node scripts/cdp-smoke.cjs http://localhost:4173/avatar-talk`
  (requires local Chrome; prints root DOM fill + console exceptions)
- Verify no red errors in DevTools console

## 🐛 Reporting Bugs

Open an issue with: what you did, what happened, what you expected, browser +
OS, and console output. Feature requests welcome too — describe the user need,
not just the solution.

## 📜 License

By contributing, you agree your contributions are licensed under the MIT License.
