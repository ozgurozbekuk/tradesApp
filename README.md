# TradesApp

TradesApp is a full-stack assistant for small trades businesses. The repository contains:

- `backend/`: Express + Prisma API
- `frontend/`: React + Vite web app

## Requirements
- Node.js 20+
- npm 10+
- PostgreSQL 15+

## Quick Start
1. Install dependencies in both apps.
2. Copy each `.env.example` file to `.env`.
3. Start the backend.
4. Start the frontend.

Backend:
```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run dev
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Environment Files
- `backend/.env.example`
- `frontend/.env.example`

## Production
Build each app in its own directory:

```bash
cd backend
npm run build
```

```bash
cd frontend
npm run build
```

## Notes
- Local `.env` files are ignored and should not be committed.
- Frontend build output is ignored and should be generated in CI or deployment.
