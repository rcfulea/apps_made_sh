// Simple HTTP server for the self‑hosted garden planner.
//
// This server uses Node.js built‑in modules only (no external dependencies)
// to provide a minimal API for user authentication, session management and
// persistence of garden plans. It also serves the static files in the
// ./public directory.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths to data files
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users_secure.json');
const gardensFile = path.join(dataDir, 'gardens.json');

// File for storing custom plant definitions. These definitions are
// global across all users and allow uploading SVG icons along with
// a plant name and square‑foot spacing. Each entry has fields
// { id, label, perSquare, file }. The SVG files live in
// ./public/icons and the metadata lives in this JSON file.
const customPlantsFile = path.join(dataDir, 'customPlants.json');

// Ensure the icons directory exists
const iconsDir = path.join(__dirname, 'public', 'icons');
try {
  fs.mkdirSync(iconsDir, { recursive: true });
} catch (e) { }

// Load users and gardens from disk
function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveJSON(filePath, data) {
  try {
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (e) {
    console.error(`Failed to save ${filePath}:`, e);
    // Don't throw, just log. This prevents server crash.
  }
}

// Load users - mutable array for registration/deletion
let usersData = loadJSON(usersFile).users || [];

// Helper to save users back to disk
function saveUsers() {
  saveJSON(usersFile, { users: usersData });
}

let gardensData = loadJSON(gardensFile) || {};

// Load custom plant definitions from disk. Returns an object with
// `plants` (array of full custom plant definitions) and `overrides`
// (object keyed by plant id to override built‑in definitions). If the file
// does not exist or is invalid, defaults are returned.
function loadCustomPlants() {
  try {
    const data = JSON.parse(fs.readFileSync(customPlantsFile, 'utf8'));
    const plants = Array.isArray(data.plants) ? data.plants : [];
    const overrides = data.overrides && typeof data.overrides === 'object' ? data.overrides : {};
    return { plants, overrides };
  } catch (e) {
    return { plants: [], overrides: {} };
  }
}

// Persist custom plant definitions to disk. Ensures both `plants` and
// `overrides` properties exist.
function saveCustomPlants(data) {
  try {
    const toSave = {
      plants: Array.isArray(data.plants) ? data.plants : [],
      overrides: data.overrides && typeof data.overrides === 'object' ? data.overrides : {}
    };
    const tempPath = customPlantsFile + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(toSave, null, 2), 'utf8');
    fs.renameSync(tempPath, customPlantsFile);
  } catch (e) {
    console.error('Failed to save custom plants:', e);
  }
}

// Load custom plants and overrides into memory
let customPlantsData = loadCustomPlants();

// Utility to slugify a label into a file/ID friendly string. This
// removes non‑alphanumeric characters and converts to lower case. It
// also replaces spaces with dashes.
function slugify(label) {
  return String(label)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

// In‑memory session store: sid -> username
const sessions = {};

// Utility to generate a random session ID
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// Parse cookies into an object
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.split('=');
    const key = name && name.trim();
    const rawValue = rest.join('=').trim();
    if (!key) return;
    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch (e) {
      // If decoding fails (malformed URI), keep the raw value
    }
    list[key] = value;
  });
  return list;
}

// Serve static files from the public directory
function serveStaticFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    // Determine content type based on extension
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };
    const ctype = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', ctype);
    res.statusCode = 200;
    res.end(data);
  });
}

// Ensure that a user's entry in gardensData conforms to the new
// structure. Old structures stored a plan directly on the username
// key. The new structure stores an object with `current` and
// optional `plans` properties.
function ensureUserEntry(uname) {
  if (!gardensData[uname]) {
    gardensData[uname] = { current: null, plans: {} };
    return;
  }
  const entry = gardensData[uname];
  // If entry has beds or rows directly, treat as a single plan
  if (entry && (entry.beds || entry.rows)) {
    gardensData[uname] = { current: entry, plans: {} };
    return;
  }
  // If entry lacks current or plans keys, normalize
  if (entry.current === undefined || entry.plans === undefined) {
    gardensData[uname] = {
      current: entry.current || null,
      plans: entry.plans || {}
    };
  }
}

// Handle API requests
function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.sid;
  const username = sid && sessions[sid];

  // First-run setup: check if any users exist
  if (url.pathname === '/api/setup-required' && method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ setupRequired: usersData.length === 0 }));
    return;
  }

  // First-run setup: create initial admin account (only if no users exist)
  if (url.pathname === '/api/setup' && method === 'POST') {
    // Only allow if no users exist yet
    if (usersData.length > 0) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Setup already completed' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      let data;
      try {
        data = JSON.parse(body || '{}');
      } catch (e) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      const { username: uname, password: pwd } = data;
      // Validation
      if (!uname || typeof uname !== 'string' || uname.trim().length < 3) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Username must be at least 3 characters' }));
        return;
      }
      if (!pwd || typeof pwd !== 'string' || pwd.length < 4) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Password must be at least 4 characters' }));
        return;
      }
      // Create admin user
      const adminUser = { username: uname.trim(), password: pwd, isAdmin: true };
      usersData.push(adminUser);
      saveUsers();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', message: 'Admin account created. Please login.' }));
    });
    return;
  }

  if (url.pathname === '/api/login' && method === 'POST') {
    // Collect body
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      let creds;
      try {
        creds = JSON.parse(body || '{}');
      } catch (e) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      const { username: uname, password: pwd } = creds;
      const user = usersData.find(
        (u) => u.username === String(uname) && u.password === String(pwd)
      );
      if (!user) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid credentials' }));
        return;
      }
      // Create session
      const newSid = generateSessionId();
      sessions[newSid] = user.username;
      // Set cookie
      res.setHeader('Set-Cookie', `sid=${newSid}; HttpOnly; Path=/; SameSite=Strict`);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', username: user.username, isAdmin: user.isAdmin || false }));
    });
    return;
  }

  if (url.pathname === '/api/logout' && method === 'POST') {
    if (sid) {
      delete sessions[sid];
      res.setHeader('Set-Cookie', `sid=deleted; Max-Age=0; Path=/`);
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'logged out' }));
    return;
  }

  if (url.pathname === '/api/me' && method === 'GET') {
    if (!username) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not authenticated' }));
      return;
    }
    const user = usersData.find(u => u.username === username);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ username, isAdmin: user?.isAdmin || false }));
    return;
  }

  // User Registration
  if (url.pathname === '/api/register' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      let data;
      try {
        data = JSON.parse(body || '{}');
      } catch (e) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      const { username: uname, password: pwd } = data;
      // Validation
      if (!uname || typeof uname !== 'string' || uname.trim().length < 3) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Username must be at least 3 characters' }));
        return;
      }
      if (!pwd || typeof pwd !== 'string' || pwd.length < 4) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Password must be at least 4 characters' }));
        return;
      }
      const cleanName = uname.trim().toLowerCase();
      if (usersData.find(u => u.username.toLowerCase() === cleanName)) {
        res.statusCode = 409;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Username already exists' }));
        return;
      }
      // Create user
      const newUser = { username: uname.trim(), password: pwd };
      usersData.push(newUser);
      saveUsers();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', message: 'Account created. Please login.' }));
    });
    return;
  }

  // Change password for logged-in user
  if (url.pathname === '/api/change-password' && method === 'POST') {
    if (!username) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not authenticated' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      let data;
      try {
        data = JSON.parse(body || '{}');
      } catch (e) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      const { currentPassword, newPassword } = data;
      const user = usersData.find(u => u.username === username);
      if (!user || user.password !== currentPassword) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Current password is incorrect' }));
        return;
      }
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'New password must be at least 4 characters' }));
        return;
      }
      user.password = newPassword;
      saveUsers();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', message: 'Password changed successfully' }));
    });
    return;
  }

  // Admin: List all users
  if (url.pathname === '/api/admin/users' && method === 'GET') {
    if (!username) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not authenticated' }));
      return;
    }
    const currentUser = usersData.find(u => u.username === username);
    if (!currentUser?.isAdmin) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Admin access required' }));
      return;
    }
    // Return list of users (without passwords)
    const userList = usersData.map(u => ({
      username: u.username,
      isAdmin: u.isAdmin || false
    }));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ users: userList }));
    return;
  }

  // Admin: Delete a user
  if (url.pathname.startsWith('/api/admin/users/') && method === 'DELETE') {
    if (!username) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not authenticated' }));
      return;
    }
    const currentUser = usersData.find(u => u.username === username);
    if (!currentUser?.isAdmin) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Admin access required' }));
      return;
    }
    const targetUsername = decodeURIComponent(url.pathname.split('/').pop());
    // Prevent deleting yourself
    if (targetUsername === username) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Cannot delete your own account' }));
      return;
    }
    const idx = usersData.findIndex(u => u.username === targetUsername);
    if (idx === -1) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'User not found' }));
      return;
    }
    usersData.splice(idx, 1);
    saveUsers();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', message: `User ${targetUsername} deleted` }));
    return;
  }


  // Plans management: return list of saved plan names for current user
  if (url.pathname === '/api/plans') {
    if (!username) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not authenticated' }));
      return;
    }
    ensureUserEntry(username);
    const userEntry = gardensData[username];
    const plans = Object.keys(userEntry.plans || {});
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ plans }));
    return;
  }

  // Custom plants management
  if (url.pathname === '/api/custom-plants') {
    // GET: list all custom plants and overrides
    if (method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        plants: customPlantsData.plants,
        overrides: customPlantsData.overrides
      }));
      return;
    }
    // POST or PUT: add or update a custom plant or override
    if (method === 'POST' || method === 'PUT') {
      // Only authenticated users can add or modify custom plants
      if (!username) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Not authenticated' }));
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        let payload;
        try {
          payload = JSON.parse(body || '{}');
        } catch (e) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        const { id, label, perSquare, svg } = payload;
        // If id is provided and a custom plant exists, update it. Otherwise, if id matches
        // a built‑in plant or override, store/update an override. If id is absent,
        // create a new custom plant.
        if (id) {
          // Check if existing custom plant
          const idx = customPlantsData.plants.findIndex((p) => p.id === id);
          if (idx !== -1) {
            // Update existing custom plant
            const plant = customPlantsData.plants[idx];
            if (label) plant.label = String(label);
            if (typeof perSquare === 'number') plant.perSquare = perSquare;
            if (svg) {
              // decode svg and replace file
              const match = /^data:image\/svg\+xml;base64,(.+)$/i.exec(svg.trim());
              if (!match) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid SVG data URI' }));
                return;
              }
              const buffer = Buffer.from(match[1], 'base64');
              // Use existing filename or new slug
              const fileName = `${id}.svg`;
              const filePath = path.join(iconsDir, fileName);
              try {
                fs.writeFileSync(filePath, buffer);
              } catch (e) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Failed to save SVG file' }));
                return;
              }
              plant.file = fileName;
            }
            saveCustomPlants(customPlantsData);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(plant));
            return;
          }
          // Otherwise update override for built-in plant or existing override
          const override = customPlantsData.overrides[id] || {};
          if (label) override.label = String(label);
          if (typeof perSquare === 'number') override.perSquare = perSquare;
          if (svg) {
            const match = /^data:image\/svg\+xml;base64,(.+)$/i.exec(svg.trim());
            if (!match) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Invalid SVG data URI' }));
              return;
            }
            const buffer = Buffer.from(match[1], 'base64');
            // Save as id.svg
            const fileName = `${id}.svg`;
            const filePath = path.join(iconsDir, fileName);
            try {
              fs.writeFileSync(filePath, buffer);
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Failed to save SVG file' }));
              return;
            }
            override.file = fileName;
          }
          // Save override
          customPlantsData.overrides[id] = override;
          saveCustomPlants(customPlantsData);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ id, ...override }));
          return;
        }
        // No id: create new custom plant
        const newLabel = label;
        const newPerSquare = perSquare;
        const newSvg = svg;
        if (!newLabel || !newSvg || typeof newPerSquare !== 'number') {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing label, perSquare or svg' }));
          return;
        }
        // Generate unique ID based on label
        let baseId = slugify(newLabel);
        if (!baseId) baseId = 'plant';
        let uniqueId = baseId;
        let counter = 1;
        while (customPlantsData.plants.some((p) => p.id === uniqueId) || customPlantsData.overrides[uniqueId]) {
          uniqueId = `${baseId}-${counter++}`;
        }
        // Decode base64
        const match = /^data:image\/svg\+xml;base64,(.+)$/i.exec(newSvg.trim());
        if (!match) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid SVG data URI' }));
          return;
        }
        const buffer = Buffer.from(match[1], 'base64');
        const fileName = `${uniqueId}.svg`;
        const filePath = path.join(iconsDir, fileName);
        try {
          fs.writeFileSync(filePath, buffer);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Failed to save SVG file' }));
          return;
        }
        const entry = { id: uniqueId, label: String(newLabel), perSquare: newPerSquare, file: fileName };
        customPlantsData.plants.push(entry);
        saveCustomPlants(customPlantsData);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(entry));
      });
      return;
    }
    // DELETE: remove a custom plant or an override
    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing id' }));
        return;
      }
      // Try deleting from custom plants list
      const index = customPlantsData.plants.findIndex((p) => p.id === id);
      if (index !== -1) {
        const [removed] = customPlantsData.plants.splice(index, 1);
        // Delete associated file
        try {
          fs.unlinkSync(path.join(iconsDir, removed.file));
        } catch (e) { }
        saveCustomPlants(customPlantsData);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'deleted' }));
        return;
      }
      // Try deleting override
      if (customPlantsData.overrides[id]) {
        // Delete override file if exists
        const ov = customPlantsData.overrides[id];
        if (ov.file) {
          try {
            fs.unlinkSync(path.join(iconsDir, ov.file));
          } catch (e) { }
        }
        delete customPlantsData.overrides[id];
        saveCustomPlants(customPlantsData);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'deleted' }));
        return;
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Plant not found' }));
      return;
    }
    // Unsupported method for /api/custom-plants
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    res.end();
    return;
  }

  // Garden plan management. The base path /api/garden handles both
  // unnamed (current) plans and named plans via the `name` query
  // parameter. When `name` is provided, we operate on the named
  // collection within the user's plan store. When omitted, the
  // request targets the user's current working plan for backwards
  // compatibility.
  if (url.pathname === '/api/garden') {
    if (!username) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not authenticated' }));
      return;
    }
    const planName = url.searchParams.get('name');
    ensureUserEntry(username);
    const userEntry = gardensData[username];
    if (method === 'GET') {
      let plan;
      if (planName) {
        plan = userEntry.plans && userEntry.plans[planName];
        if (!plan) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Plan not found' }));
          return;
        }
      } else {
        plan = userEntry.current;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(plan || {}));
      return;
    }
    if (method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        let plan;
        try {
          plan = JSON.parse(body || '{}');
        } catch (e) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }
        if (planName) {
          // Save named plan
          userEntry.plans[planName] = plan;
        } else {
          // Save as current plan
          userEntry.current = plan;
        }
        // Persist changes
        saveJSON(gardensFile, gardensData);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'saved' }));
      });
      return;
    }
    if (method === 'DELETE') {
      if (!planName) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing name parameter for deletion' }));
        return;
      }
      if (!userEntry.plans[planName]) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Plan not found' }));
        return;
      }
      delete userEntry.plans[planName];
      // Persist changes
      saveJSON(gardensFile, gardensData);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'deleted' }));
      return;
    }
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST, DELETE');
    res.end();
    return;
  }

  // Unknown API endpoint
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not found' }));
}

// Create and start HTTP server
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }
  // For static files: map URL to a file inside public directory. Default to index.html
  let requestedPath = req.url;
  if (requestedPath === '/' || requestedPath === '') {
    requestedPath = '/index.html';
  }
  // Prevent directory traversal
  const safePath = path.normalize(requestedPath).replace(/^\/+/, '');
  const filePath = path.join(__dirname, 'public', safePath);
  // Check if file exists; if not, serve index.html (for SPA routing)
  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      serveStaticFile(filePath, res);
    } else {
      // fallback to index.html
      serveStaticFile(path.join(__dirname, 'public', 'index.html'), res);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});