# 🌱 Seeds Dashboard

A personal garden database to track your plants, seeds, and growing schedules.

## Features

- **Plant Database**: 132+ plants with detailed growing info
- **Search & Filter**: Find plants by name, type, sowing month, etc.
- **Add/Edit/Delete**: Full CRUD through the UI
- **Image Upload**: Drag-and-drop multiple images per plant
- **Dark Mode**: Toggle for comfortable viewing
- **Docker Ready**: Persistent data with Docker volumes

## Quick Start

### Development (2 terminals)

```bash
# Terminal 1: API Server
npm install
npm run server

# Terminal 2: Frontend
npm run dev
```

### Docker Deployment

```bash
docker-compose up --build
# Open http://localhost:3000
```

## Data Persistence

Data is stored in:
- `data/plants.json` - Plant database
- `public/uploads/` - Uploaded images

In Docker, these are mounted as volumes for persistence.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express.js
- **Styling**: CSS with dark mode
- **Storage**: JSON file + image uploads
