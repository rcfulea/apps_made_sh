# 🌱 Self-Hosted Garden Planner

A beautiful, web-based garden planning application with drag-and-drop planting, seasonal visibility, companion planting guides, and Square Foot Gardening support.

![Garden Planner](public/icons/screenshot.png)

## Features

- **Visual Bed Design**: Create multiple garden beds with custom dimensions
- **Drag & Drop Plants**: Easy plant placement with SVG icons
- **Seasonal Timeline**: View what's growing throughout the year
- **Square Foot Gardening Mode**: Shows plants per square foot
- **Companion Planting**: Visual indicators for good/bad plant neighbors
- **Border Mode**: Draw borders and paths with rectangle selection
- **Save/Load Plans**: Multiple named garden plans per user
- **Multi-User Support**: User accounts with password authentication
- **Admin Panel**: Manage users and their permissions

## Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/garden-planner.git
cd garden-planner

# Copy the example config and set your password
cp data/users.json.example data/users.json
# Edit data/users.json and change the default password!

# Build and run with Docker
docker build -t garden-planner .
docker run -p 3000:3000 -v $(pwd)/data:/app/data garden-planner
```

Then open http://localhost:3000

## Manual Installation

```bash
# Install dependencies
npm install

# Copy user config
cp data/users.json.example data/users.json
# Edit data/users.json with your credentials

# Start the server
npm start
```

## Configuration

### User Setup

Copy `data/users.json.example` to `data/users.json` and configure your users:

```json
{
  "users": [
    {
      "username": "admin",
      "password": "your-secure-password",
      "isAdmin": true
    }
  ]
}
```

> ⚠️ **Important**: Change the default password before running!

### Data Storage

- User credentials: `data/users.json`
- Saved garden plans: `data/plans/`
- Custom plants: Managed through the UI

## Screenshots

### Main Interface
Drag plants from the palette to your garden beds. The timeline slider shows seasonal visibility.

### Square Foot Mode
Shows how many plants fit per square foot based on spacing requirements.

### Border Mode
Draw paths, borders, and infrastructure by clicking and dragging rectangles.

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Storage**: JSON files (no database required)
- **Container**: Docker support included

## License

MIT License - feel free to use and modify for your own garden planning needs!
