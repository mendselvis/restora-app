cat > README.md << 'EOF'
# Restora

AI-verified community waste cleanup and rewards platform — built to help people reconnect with nature and support environmental health.

## What it does

Restora lets users report litter or waste hotspots in their community, then submit before-and-after photos once the area is cleaned. AI-powered image verification (via the Gemini API) confirms the cleanup actually happened, classifies the waste type, and estimates quantity — so every report is real and accountable, not just self-reported.

Verified cleanups earn users points on a transparent rewards ledger. A live map visualizes cleanup activity and waste hotspots across the community, and an impact dashboard shows the bigger picture: total waste collected, active contributors, and estimated environmental impact.

Restora is localized to real environmental challenges facing Ghana, such as e-waste burning at Agbogbloshie and plastic pollution choking the Korle Lagoon.

## Key features

- **AI-powered verification** — Gemini-based image analysis confirms genuine before/after cleanups and classifies waste type and quantity
- **Transparent rewards** — points-based ledger for verified environmental action
- **Community impact map** — live visualization of cleanup activity and waste hotspots
- **Impact dashboard** — real-time community stats on waste collected and contributors
- **Accessible by design** — voice-guided reporting flow for inclusive participation

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express
- **AI:** Google Gemini API for waste image verification
- **Database/Auth:** Supabase

## Getting started

This is a pnpm monorepo. From the repo root:

\`\`\`bash
pnpm install
\`\`\`

### Run the frontend

\`\`\`bash
cd artifacts/restora
PORT=3000 BASE_PATH=/ pnpm dev
\`\`\`

### Run the backend

\`\`\`bash
cd artifacts/api-server
PORT=8080 pnpm dev
\`\`\`

You'll need a `.env` file in `artifacts/api-server` with:

\`\`\`
GEMINI_API_KEY=your-gemini-api-key
SESSION_SECRET=your-session-secret
\`\`\`

## Hackathon context

Built for the prompt: *"Build technology that helps people reconnect with nature or supports environmental health."*
EOF
