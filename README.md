# Camera Rental Management System

Full-stack camera equipment rental management app with an admin React frontend, a user-facing Next.js frontend, a Node.js/Express API, and PostgreSQL database.

The project is designed to run entirely inside Docker. Do not install Node dependencies on the host machine for normal setup or development.

## Features

- Dashboard metrics for revenue, expenses, profit, rentals, customers, and equipment availability
- Equipment inventory management with categories, branches, owners, pricing, status, and images
- Rental order management with customers, equipment, dates, pickup branches, status tracking, discounts, and accessories
- Customer management with contact information and rental history
- Calendar views for equipment availability
- Branch, user, role, payroll, performance, reports, ads cost, and activity log modules

## Tech Stack

- Admin frontend: React 18, Vite, Tailwind CSS, React Router, Axios, Recharts, Lucide React
- User frontend: Next.js 16, React 19, Tailwind CSS
- Backend: Node.js, Express, PostgreSQL, JWT, Cloudinary image uploads
- Infrastructure: Docker Compose, PostgreSQL 15, Nginx frontend container, optional pgAdmin

## Prerequisites

- Docker Desktop or Docker Engine with Docker Compose
- Git

No host `npm install`, `yarn install`, `pnpm install`, or `bun install` is required.

## Quick Start

Start the full stack:

```bash
docker compose up --build
```

Open the app:

- Frontend: `http://localhost:3000`
- User frontend: `http://localhost:3001`
- Backend API: `http://localhost:5000`
- pgAdmin: `http://localhost:5050`

Default PostgreSQL connection inside Docker:

```text
host: postgres
port: 5432
database: camera_rental
user: postgres
password: postgres
```

From the host machine, PostgreSQL is exposed at `localhost:5432`.

## Common Commands

Run commands inside containers:

```bash
docker compose exec backend npm run seed
docker compose exec backend npm run migrate
docker compose exec backend npm run backfill:commission:dry-run
docker compose exec backend npm run backfill:commission
docker compose exec backend npm run reconcile:commission
docker compose exec frontend npm run build
docker compose build user-frontend
```

Rebuild services:

```bash
docker compose build
docker compose up -d
```

Stop services:

```bash
docker compose down
```

Stop services and remove the database volume:

```bash
docker compose down -v
```

## Environment

Runtime environment values are currently defined in `docker-compose.yml`.

For local secret overrides, prefer Docker Compose environment overrides or an ignored local compose file rather than committing secrets. `backend/.env.example` is kept only as a reference for the backend variables.

Important backend variables:

```text
DATABASE_URL
PORT
NODE_ENV
DB_SSL
JWT_SECRET
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
CLOUDINARY_UPLOAD_FOLDER
MAX_IMAGES_PER_ENTITY
```

Important frontend build variable:

```text
VITE_API_URL
```

## API Overview

The backend exposes REST endpoints under `/api`.

- `GET /api/dashboard/metrics`
- `GET /api/equipment`
- `POST /api/equipment`
- `GET /api/rentals`
- `POST /api/rentals`
- `GET /api/customers`
- `POST /api/customers`
- `GET /api/calendar`
- `GET /api/branches`
- `GET /api/users`
- `GET /api/reports`
- `GET /api/activity`

See the files in `backend/routes/` for the full route list and request details.

## Project Structure

```text
camera-rental/
|-- .agents/
|-- backend/
|   |-- middleware/
|   |-- routes/
|   |-- scripts/
|   |-- utils/
|   |-- .env.example
|   |-- app.js
|   |-- Dockerfile
|   |-- package-lock.json
|   |-- package.json
|   |-- schema.sql
|   `-- server.js
|-- frontend/
|   |-- public/
|   |-- src/
|   |-- Dockerfile
|   |-- index.html
|   |-- nginx.conf
|   |-- package.json
|   |-- postcss.config.js
|   |-- tailwind.config.js
|   `-- vite.config.js
|-- user-fontend/
|   |-- public/
|   |-- src/
|   |-- Dockerfile
|   |-- next.config.ts
|   |-- package-lock.json
|   `-- package.json
|-- docker-compose.yml
|-- render.yaml
`-- README.md
```

## Deployment

`render.yaml` contains Render service definitions for the backend, admin frontend, and user frontend Docker services. Configure production secrets in the deployment platform instead of committing them to the repository.

To deploy the user frontend on Render, sync the Blueprint from this repository. Render will create `camera-rental-user-frontend` from `user-fontend/Dockerfile` and run the Dockerfile `CMD`. If creating it manually instead, create a Web Service with Docker runtime, set Root Directory to `user-fontend`, and keep the Dockerfile path as `Dockerfile`.

## License

MIT
