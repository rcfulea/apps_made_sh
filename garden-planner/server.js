/**
 * Garden Planner Server
 * Node.js HTTP server with no external dependencies
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Data files
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GARDENS_FILE = path.join(DATA_DIR, 'gardens.json');
const PLANTS_FILE = path.join(DATA_DIR, 'plants.json');
const JOURNAL_FILE = path.join(DATA_DIR, 'journal.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ==========================================
// Data Helpers
// ==========================================

function loadJSON(filePath, defaultValue = {}) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return defaultValue;
    }
}

function saveJSON(filePath, data) {
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
}

// Load data
let users = loadJSON(USERS_FILE, { users: [] }).users || [];
let gardens = loadJSON(GARDENS_FILE, {});
let plants = loadJSON(PLANTS_FILE, { plants: [] });

function saveUsers() {
    saveJSON(USERS_FILE, { users });
}

function saveGardens() {
    saveJSON(GARDENS_FILE, gardens);
}

// ==========================================
// Session Management
// ==========================================

// Load persisted sessions, dropping any that already expired
const now = Date.now();
const sessions = Object.fromEntries(
    Object.entries(loadJSON(SESSIONS_FILE, {}))
        .filter(([, s]) => s.expiresAt > now)
);
saveJSON(SESSIONS_FILE, sessions); // persist the cleaned-up state

function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;

    cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.trim().split('=');
        cookies[name] = rest.join('=');
    });

    return cookies;
}

function getSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies.sid;
    if (!sid || !sessions[sid]) return null;
    if (sessions[sid].expiresAt < Date.now()) {
        delete sessions[sid];
        return null;
    }
    return sessions[sid];
}

function createSession(res, username, isAdmin) {
    const sid = generateSessionId();
    sessions[sid] = { username, isAdmin, expiresAt: Date.now() + SESSION_TTL_MS };

    saveJSON(SESSIONS_FILE, sessions);
    res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`);
    return sessions[sid];
}

function destroySession(req, res) {
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies.sid;

    if (sid && sessions[sid]) {
        delete sessions[sid];
        saveJSON(SESSIONS_FILE, sessions);
    }

    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
}

// ==========================================
// Password Hashing
// ==========================================

function hashPassword(password, salt = null) {
    salt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
}

function verifyPassword(password, salt, hash) {
    const result = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return result === hash;
}

// ==========================================
// MIME Types
// ==========================================

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
};

// ==========================================
// Static File Server
// ==========================================

function serveStatic(req, res) {
    let urlPath = req.url.split('?')[0];

    // Default to index.html
    if (urlPath === '/') {
        urlPath = '/index.html';
    }

    // Serve from public directory
    let filePath = path.join(PUBLIC_DIR, urlPath);

    // Also serve plants.json from data directory
    if (urlPath === '/data/plants.json') {
        filePath = PLANTS_FILE;
    }

    // Security: prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR) && !filePath.startsWith(DATA_DIR)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // SPA fallback
                fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, html) => {
                    if (err2) {
                        res.statusCode = 404;
                        res.end('Not Found');
                    } else {
                        res.setHeader('Content-Type', 'text/html');
                        res.end(html);
                    }
                });
            } else {
                res.statusCode = 500;
                res.end('Server Error');
            }
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        res.end(data);
    });
}

// ==========================================
// API Handlers
// ==========================================

function handleAPI(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;
    const pathname = url.pathname;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    // Parse JSON body helper
    const parseBody = () => new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error('Invalid JSON'));
            }
        });
    });

    // Response helpers
    const sendJSON = (data, status = 200) => {
        res.statusCode = status;
        res.end(JSON.stringify(data));
    };

    const sendError = (message, status = 400) => {
        res.statusCode = status;
        res.end(JSON.stringify({ error: message }));
    };

    // Route handling
    (async () => {
        try {
            // ==========================================
            // Auth Routes
            // ==========================================

            if (pathname === '/api/setup-required' && method === 'GET') {
                return sendJSON({ setupRequired: users.length === 0 });
            }

            if (pathname === '/api/setup' && method === 'POST') {
                if (users.length > 0) {
                    return sendError('Setup already completed', 400);
                }

                const { username, password } = await parseBody();

                if (!username || !password) {
                    return sendError('Username and password required');
                }

                const { salt, hash } = hashPassword(password);
                users.push({ username, salt, hashedPassword: hash, isAdmin: true });
                saveUsers();

                return sendJSON({ success: true }, 201);
            }

            if (pathname === '/api/login' && method === 'POST') {
                const { username, password } = await parseBody();

                const user = users.find(u => u.username === username);
                if (!user || !verifyPassword(password, user.salt, user.hashedPassword)) {
                    return sendError('Invalid credentials', 401);
                }

                createSession(res, username, user.isAdmin);
                return sendJSON({ username, isAdmin: user.isAdmin });
            }

            if (pathname === '/api/register' && method === 'POST') {
                const { username, password } = await parseBody();

                if (!username || !password) {
                    return sendError('Username and password required');
                }

                if (users.find(u => u.username === username)) {
                    return sendError('Username already exists');
                }

                const { salt, hash } = hashPassword(password);
                users.push({ username, salt, hashedPassword: hash, isAdmin: false });
                saveUsers();

                createSession(res, username, false);
                return sendJSON({ username, isAdmin: false }, 201);
            }

            if (pathname === '/api/logout' && method === 'POST') {
                destroySession(req, res);
                return sendJSON({ success: true });
            }

            if (pathname === '/api/me' && method === 'GET') {
                const session = getSession(req);
                if (!session) {
                    return sendError('Not authenticated', 401);
                }
                return sendJSON({ username: session.username, isAdmin: session.isAdmin });
            }

            if (pathname === '/api/change-password' && method === 'POST') {
                const session = getSession(req);
                if (!session) return sendError('Not authenticated', 401);

                const { currentPassword, newPassword } = await parseBody();
                const user = users.find(u => u.username === session.username);

                if (!user || !verifyPassword(currentPassword, user.salt, user.hashedPassword)) {
                    return sendError('Current password incorrect', 400);
                }

                const { salt, hash } = hashPassword(newPassword);
                user.salt = salt;
                user.hashedPassword = hash;
                saveUsers();

                return sendJSON({ success: true });
            }

            // ==========================================
            // Plants Route (public read, auth for write)
            // ==========================================

            if (pathname === '/api/plants' && method === 'GET') {
                return sendJSON(plants);
            }

            // ==========================================
            // Garden Routes (require auth)
            // ==========================================

            const session = getSession(req);
            if (!session && (pathname.startsWith('/api/garden') || pathname === '/api/plans' || pathname.startsWith('/api/plans/'))) {
                return sendError('Not authenticated', 401);
            }

            if (pathname === '/api/garden' && method === 'GET') {
                const data = gardens[session.username]?.current || { beds: [] };
                return sendJSON(data);
            }

            if (pathname === '/api/garden' && method === 'POST') {
                const data = await parseBody();

                if (!gardens[session.username]) {
                    gardens[session.username] = { current: null, plans: {} };
                }

                gardens[session.username].current = data;
                saveGardens();

                return sendJSON({ success: true });
            }

            if (pathname === '/api/plans' && method === 'GET') {
                const userGardens = gardens[session.username];
                const plans = userGardens?.plans ? Object.keys(userGardens.plans) : [];
                return sendJSON({ plans });
            }

            if (pathname.startsWith('/api/plans/') && method === 'POST') {
                const planName = decodeURIComponent(pathname.split('/api/plans/')[1]);
                const data = await parseBody();

                if (!gardens[session.username]) {
                    gardens[session.username] = { current: null, plans: {} };
                }

                gardens[session.username].plans[planName] = data;
                gardens[session.username].current = data;
                saveGardens();

                return sendJSON({ success: true });
            }

            if (pathname.startsWith('/api/plans/') && method === 'GET') {
                const planName = decodeURIComponent(pathname.split('/api/plans/')[1]);
                const data = gardens[session.username]?.plans?.[planName];

                if (!data) return sendError('Plan not found', 404);
                return sendJSON(data);
            }

            if (pathname.startsWith('/api/plans/') && method === 'DELETE') {
                const planName = decodeURIComponent(pathname.split('/api/plans/')[1]);

                if (gardens[session.username]?.plans?.[planName]) {
                    delete gardens[session.username].plans[planName];
                    saveGardens();
                }

                return sendJSON({ success: true });
            }

            // ==========================================
            // Journal Photo Upload Route
            // ==========================================

            if (pathname === '/api/journal/photo' && method === 'POST') {
                const session = getSession(req);
                if (!session) return sendError('Not authenticated', 401);

                const { filename, data } = await parseBody();
                if (!filename || !data) return sendError('Filename and data required', 400);

                const ext = path.extname(filename).toLowerCase();
                if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
                    return sendError('Only image files allowed', 400);
                }

                const uploadsDir = path.join(PUBLIC_DIR, 'uploads', 'journal');
                if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

                const safeName = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
                const base64Data = data.replace(/^data:[^;]+;base64,/, '');
                fs.writeFileSync(path.join(uploadsDir, safeName), Buffer.from(base64Data, 'base64'));

                return sendJSON({ path: `/uploads/journal/${safeName}` });
            }

            // ==========================================
            // Icon Upload Route
            // ==========================================

            if (pathname === '/api/upload-icon' && method === 'POST') {
                const session = getSession(req);
                if (!session) return sendError('Not authenticated', 401);

                const { filename, content } = await parseBody();

                if (!filename || !content) {
                    return sendError('Filename and content are required');
                }

                // Sanitize filename - only allow alphanumeric, hyphens, underscores, dots
                const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
                if (!safeName.endsWith('.svg')) {
                    return sendError('Only SVG files are allowed');
                }

                // Validate that content looks like SVG
                if (!content.includes('<svg') && !content.includes('<?xml')) {
                    return sendError('File does not appear to be a valid SVG');
                }

                // Save to public/icons/
                const iconsDir = path.join(PUBLIC_DIR, 'icons');
                if (!fs.existsSync(iconsDir)) {
                    fs.mkdirSync(iconsDir, { recursive: true });
                }

                const filePath = path.join(iconsDir, safeName);
                fs.writeFileSync(filePath, content, 'utf8');

                return sendJSON({ filename: safeName, success: true }, 201);
            }

            // ==========================================
            // Plants Write Routes
            // ==========================================

            if (pathname === '/api/plants' && method === 'POST') {
                const session = getSession(req);
                if (!session) return sendError('Not authenticated', 401);

                const plantData = await parseBody();

                if (!plantData.label) {
                    return sendError('Plant name (label) is required');
                }

                // Generate ID from label if not provided
                const id = plantData.id || plantData.label.toLowerCase().replace(/[^a-z0-9]/g, '-');

                // Check for duplicate
                if (plants.plants.find(p => p.id === id)) {
                    return sendError('Plant with this ID already exists');
                }

                const newPlant = {
                    id,
                    label: plantData.label,
                    family: plantData.family || '',
                    file: plantData.file || `${id}.svg`,
                    perSquare: plantData.perSquare ? parseInt(plantData.perSquare) : 4,
                    companions: plantData.companions || [],
                    antagonists: plantData.antagonists || [],
                };

                plants.plants.push(newPlant);
                saveJSON(PLANTS_FILE, plants);

                return sendJSON(newPlant, 201);
            }

            if (pathname.startsWith('/api/plants/') && method === 'PUT') {
                const session = getSession(req);
                if (!session) return sendError('Not authenticated', 401);

                const plantId = decodeURIComponent(pathname.split('/api/plants/')[1]);
                const plantData = await parseBody();

                const plantIndex = plants.plants.findIndex(p => p.id === plantId);
                if (plantIndex === -1) {
                    return sendError('Plant not found', 404);
                }

                // Update plant
                plants.plants[plantIndex] = {
                    ...plants.plants[plantIndex],
                    label: plantData.label || plants.plants[plantIndex].label,
                    family: plantData.family ?? plants.plants[plantIndex].family,
                    file: plantData.file || plants.plants[plantIndex].file,
                    perSquare: plantData.perSquare !== undefined
                        ? parseInt(plantData.perSquare)
                        : plants.plants[plantIndex].perSquare,
                    companions: plantData.companions ?? plants.plants[plantIndex].companions,
                    antagonists: plantData.antagonists ?? plants.plants[plantIndex].antagonists,
                };

                saveJSON(PLANTS_FILE, plants);
                return sendJSON(plants.plants[plantIndex]);
            }

            if (pathname.startsWith('/api/plants/') && method === 'DELETE') {
                const session = getSession(req);
                if (!session) return sendError('Not authenticated', 401);

                const plantId = decodeURIComponent(pathname.split('/api/plants/')[1]);

                const plantIndex = plants.plants.findIndex(p => p.id === plantId);
                if (plantIndex === -1) {
                    return sendError('Plant not found', 404);
                }

                plants.plants.splice(plantIndex, 1);
                saveJSON(PLANTS_FILE, plants);

                return sendJSON({ success: true });
            }

            // ==========================================
            // Admin Routes
            // ==========================================

            if (pathname === '/api/admin/users' && method === 'GET') {
                if (!session?.isAdmin) return sendError('Admin required', 403);

                const userList = users.map(u => ({
                    username: u.username,
                    isAdmin: u.isAdmin,
                }));

                return sendJSON({ users: userList });
            }

            if (pathname.startsWith('/api/admin/users/') && method === 'DELETE') {
                if (!session?.isAdmin) return sendError('Admin required', 403);

                const username = decodeURIComponent(pathname.split('/api/admin/users/')[1].split('/')[0]);

                if (username === session.username) {
                    return sendError('Cannot delete yourself', 400);
                }

                users = users.filter(u => u.username !== username);
                saveUsers();

                return sendJSON({ success: true });
            }

            // ==========================================
            // Journal Routes
            // ==========================================

            if (pathname === '/api/journal' && method === 'GET') {
                const allJournals = loadJSON(JOURNAL_FILE, {});
                const userEntries = allJournals[session.username] || [];
                return sendJSON({ entries: userEntries });
            }

            if (pathname === '/api/journal' && method === 'POST') {
                const { title, content, category, date, value, valueUnit, photo } = await parseBody();
                if (!content) return sendError('Content is required', 400);

                const allJournals = loadJSON(JOURNAL_FILE, {});
                if (!allJournals[session.username]) allJournals[session.username] = [];

                const entry = {
                    id: Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5),
                    date: date || new Date().toISOString().split('T')[0],
                    title: title || '',
                    content,
                    category: category || 'general',
                    value: value != null && value !== '' ? parseFloat(value) : null,
                    valueUnit: valueUnit || '',
                    photo: photo || null,
                };

                allJournals[session.username].unshift(entry);
                saveJSON(JOURNAL_FILE, allJournals);
                return sendJSON({ success: true, entry });
            }

            if (pathname.startsWith('/api/journal/') && method === 'DELETE') {
                const entryId = decodeURIComponent(pathname.split('/api/journal/')[1]);
                const allJournals = loadJSON(JOURNAL_FILE, {});
                const userEntries = allJournals[session.username] || [];

                // Clean up photo file if present
                const entry = userEntries.find(e => e.id === entryId);
                if (entry?.photo) {
                    const photoPath = path.join(PUBLIC_DIR, entry.photo);
                    try { fs.unlinkSync(photoPath); } catch {}
                }

                allJournals[session.username] = userEntries.filter(e => e.id !== entryId);
                saveJSON(JOURNAL_FILE, allJournals);
                return sendJSON({ success: true });
            }

            // 404 for unknown API routes
            sendError('Not Found', 404);

        } catch (error) {
            console.error('API Error:', error);
            sendError(error.message || 'Server Error', 500);
        }
    })();
}

// ==========================================
// Main Server
// ==========================================

const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
        handleAPI(req, res);
    } else {
        serveStatic(req, res);
    }
});

server.listen(PORT, () => {
    console.log(`🌱 Garden Planner running at http://localhost:${PORT}`);
});
