# Garden Planner

A self-hosted, browser-based garden planning tool that lets you design your garden beds, track plants, and manage successional planting.

![Garden Planner Screenshot](https://via.placeholder.com/800x400?text=Garden+Planner+Screenshot)

## Features

- **Visual Bed Planning**: Create beds of custom dimensions and visualize them with a grid system.
- **Drag & Drop Interface**: Easily drag plants from a palette to your garden beds.
- **Plant Database**: Includes a built-in database of common vegetables with companions, antagonists, and spacing information.
- **Square Foot Gardening**: Toggle "Square Foot Mode" to see how many plants fit in each square foot.
- **Succession Planting**: Track planting dates and harvest times. The timeline slider lets you visualize the garden at different times of the year.
- **Custom Plants**: Add your own plant varieties with custom SVG icons.
- **Beds Management**: Rename, resize, and delete beds.
- **User Management**: Multi-user support with admin capabilities.

## Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rcfulea/apps_made_sh.git
   cd apps_made_sh/garden-planner
   ```

2. **Install dependencies** (none required, uses standard Node.js libraries):
   ```bash
   # No npm install needed as it uses zero external dependencies!
   ```

3. **Start the server**:
   ```bash
   npm start
   # OR
   node server.js
   ```

4. **First Run Setup**:
   - Open your browser and navigate to `http://localhost:3000`.
   - You will be greeted with a **Welcome Screen**.
   - Create your **Admin Account** (username and password).
   - Once created, you will be redirected to login.

## Usage

- **Login**: Use your newly created credentials.
- **Add Beds**: Configure width, height, and cell size (default 30cm) to add a new bed.
- **Planting**: Drag plants from the left palette onto the grid cells.
- **Details**: Click on a planted cell to edit variety and planting months.
- **Border Mode**: Enable "Border Mode" to draw borders/fences around cells. Drag to draw, drag over existing borders to remove them.
- **Time Travel**: Use the slider at the top to see what's growing in different months.

## Data Storage

- All data is stored in the `data/` directory.
- `users.json`: User credentials (hashed/stored securely).
- `gardens.json`: Garden layouts and plant data.
- `customPlants.json`: Custom plant definitions.

> **Note**: The `data/users.json` and `data/gardens.json` files are excluded from git to protect your privacy.

## License

MIT
