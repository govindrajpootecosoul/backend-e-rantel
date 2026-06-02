# Retail Central Backend

Node.js + Express API for the Retail Central executive analytics platform.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

API runs on `http://localhost:5010`

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/auth/signup` | No |
| POST | `/api/v1/auth/signin` | No |
| GET | `/api/v1/executive/filters` | Bearer JWT |
| POST | `/api/v1/executive/dashboard` | Bearer JWT |

## Environment

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Token signing secret |
| `PORT` | Server port (default 5010) |
| `CORS_ORIGIN` | Frontend origin |
