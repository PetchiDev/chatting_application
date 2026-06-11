# Ephemeral Chat

Real-time chat app with **SignalR**, **React**, **GSAP**, and **Supabase** (Postgres + Storage).

Messages, attachments, and guest accounts are **hard-deleted every 24 hours**.

## Features

- Register / login with **email or username** + password
- **Guest login** with username only (24-hour account validity)
- Failed login removes the account (invalid credentials)
- **Group chat** on landing + **direct messages**
- **Active user list** in left sidebar
- **File attachments** and **voice messages** (hold mic to record)
- Update **username** and **profile picture**
- GSAP animations for messages, sidebar, modals
- Auto cleanup every 15 minutes + SignalR `ChatReset` broadcast

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, Vite, GSAP, Zustand, SignalR client |
| Backend | ASP.NET Core 8, SignalR, JWT |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage |
| Deploy | Vercel (frontend), Railway (backend), Supabase (DB) |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_initial.sql` in **SQL Editor**
3. Create a **public** storage bucket named `chat-attachments`
4. Copy your DB connection string, project URL, and **service role key**

### 2. Backend

```bash
cd backend
# Edit appsettings.json with your Supabase + JWT settings
dotnet run
```

API runs at `http://localhost:5000`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173` (proxies API to port 5000)

## Deployment

### Vercel (Frontend)

1. Import the `frontend` folder as a Vercel project
2. Set environment variable:
   - `VITE_API_URL` = your backend URL (e.g. `https://your-api.railway.app`)
3. Deploy

### Railway (Backend)

1. Deploy the `backend` folder
2. Set environment variables from `backend/.env.example`
3. Add your Vercel URL to `Cors__Origins`

### Supabase

- Database and storage stay on Supabase free tier
- Optional: enable `pg_cron` for SQL-level cleanup (see migration file)

## Project Structure

```
/backend          ASP.NET Core API + SignalR Hub
/frontend         React + Vite + GSAP
/supabase         SQL migrations
```

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register with email, username, password |
| POST | `/api/auth/login` | Login with email/username + password |
| POST | `/api/auth/guest` | Guest login with username |
| GET | `/api/message/group` | Group chat history |
| GET | `/api/message/direct/{id}` | DM history |
| POST | `/api/upload` | Upload attachment |
| PUT | `/api/profile` | Update username |
| POST | `/api/profile/picture` | Update profile picture |
| WS | `/hubs/chat` | SignalR hub |
