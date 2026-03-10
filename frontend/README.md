# Frontend (React + Vite)

## Run
```bash
cd frontend
npm install
npm run dev
```

Required env:
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL` (default backend: `http://localhost:3000`)

## Pages
- `/` landing
- `/register` register form (UI wired placeholder)
- `/login` login form (UI wired placeholder)
- `/dashboard` simple dashboard shell

## Next Integration
- Clerk SignUp / SignIn integrated
- Dashboard calls Clerk-protected backend APIs
