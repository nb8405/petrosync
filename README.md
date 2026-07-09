# PetroSync

Enterprise Petrol Pump Management System for petrol pump onboarding, DSR operations, tank/nozzle management, reporting, backups, and forecourt configuration.

## Prerequisites

- Node.js 20 or newer
- npm
- PostgreSQL 14 or newer

## Environment

Copy the server environment template and fill in local values:

```bash
cd server
cp .env.example .env
```

Required database and security values are documented in `server/.env.example`. Do not commit real `.env` files.

## Database Setup

Create an empty PostgreSQL database that matches your `.env` values. A fresh database must contain no users, no owner account, no sessions, and no workspace before onboarding.

Then run migrations:

```bash
cd server
npm install
npm run migrate
```

## Backend Startup

```bash
cd server
npm start
```

The backend starts from `server/index.js` and listens on the configured `PORT` value.

## Frontend Startup

```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## First-Run Onboarding

After a fresh clone, environment setup, and migrations, open the application. PetroSync should show the onboarding wizard because no owner account exists.

Create the first owner through onboarding. PetroSync stores only an Argon2id password hash after the owner is created. There is no default username, default password, seeded owner, or authentication bypass.

## Production Build

```bash
cd client
npm run build
```

## Verification

Run tests before release:

```bash
cd server
npm test

cd ../client
npm test
npm run build
```
