const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Data paths
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const PLANTS_FILE = path.join(DATA_DIR, 'plants.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.test(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Helper functions
function loadPlants() {
    if (!fs.existsSync(PLANTS_FILE)) {
        return [];
    }
    const data = fs.readFileSync(PLANTS_FILE, 'utf-8');
    return JSON.parse(data);
}

function savePlants(plants) {
    fs.writeFileSync(PLANTS_FILE, JSON.stringify(plants, null, 2));
}

// API Routes

// GET all plants
app.get('/api/plants', (req, res) => {
    try {
        const plants = loadPlants();
        res.json(plants);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load plants' });
    }
});

// GET single plant
app.get('/api/plants/:id', (req, res) => {
    try {
        const plants = loadPlants();
        const plant = plants.find(p => p.id === parseInt(req.params.id));
        if (!plant) {
            return res.status(404).json({ error: 'Plant not found' });
        }
        res.json(plant);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load plant' });
    }
});

// POST new plant
app.post('/api/plants', (req, res) => {
    try {
        const plants = loadPlants();
        const newId = plants.length > 0 ? Math.max(...plants.map(p => p.id)) + 1 : 1;

        const newPlant = {
            id: newId,
            thisYear: req.body.thisYear || false,
            name: req.body.name || '',
            images: req.body.images || [],
            type: req.body.type || [],
            edible: req.body.edible || false,
            description: req.body.description || '',
            location: req.body.location || '',
            sowingMonth: req.body.sowingMonth || [],
            indoorSeed: req.body.indoorSeed || false,
            dateSown: req.body.dateSown || '',
            outdoorSeed: req.body.outdoorSeed || false,
            plantingOutMonth: req.body.plantingOutMonth || [],
            plantingOutInstruction: req.body.plantingOutInstruction || '',
            sowingInstructions: req.body.sowingInstructions || '',
            pruningMonth: req.body.pruningMonth || [],
            pruningInstructions: req.body.pruningInstructions || '',
            harvestMonth: req.body.harvestMonth || [],
            flowering: req.body.flowering || [],
            preferences: req.body.preferences || '',
            soilPreference: req.body.soilPreference || [],
            careInstructions: req.body.careInstructions || '',
            commonProblems: req.body.commonProblems || '',
            goodForPollinators: req.body.goodForPollinators || false,
            linkToWebsite: req.body.linkToWebsite || '',
            archived: req.body.archived || false,
        };

        plants.push(newPlant);
        savePlants(plants);

        res.status(201).json(newPlant);
    } catch (error) {
        console.error('Error creating plant:', error);
        res.status(500).json({ error: 'Failed to create plant' });
    }
});

// PUT update plant
app.put('/api/plants/:id', (req, res) => {
    try {
        const plants = loadPlants();
        const index = plants.findIndex(p => p.id === parseInt(req.params.id));

        if (index === -1) {
            return res.status(404).json({ error: 'Plant not found' });
        }

        plants[index] = {
            ...plants[index],
            ...req.body,
            id: plants[index].id // Preserve original ID
        };

        savePlants(plants);
        res.json(plants[index]);
    } catch (error) {
        console.error('Error updating plant:', error);
        res.status(500).json({ error: 'Failed to update plant' });
    }
});

// DELETE plant
app.delete('/api/plants/:id', (req, res) => {
    try {
        let plants = loadPlants();
        const index = plants.findIndex(p => p.id === parseInt(req.params.id));

        if (index === -1) {
            return res.status(404).json({ error: 'Plant not found' });
        }

        // Delete associated uploaded images
        const plant = plants[index];
        if (plant.images) {
            plant.images.forEach(imgPath => {
                if (imgPath.startsWith('/uploads/')) {
                    const fullPath = path.join(__dirname, 'public', imgPath);
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                }
            });
        }

        plants = plants.filter(p => p.id !== parseInt(req.params.id));
        savePlants(plants);

        res.json({ message: 'Plant deleted successfully' });
    } catch (error) {
        console.error('Error deleting plant:', error);
        res.status(500).json({ error: 'Failed to delete plant' });
    }
});

// POST upload images
app.post('/api/plants/:id/images', upload.array('images', 10), (req, res) => {
    try {
        const plants = loadPlants();
        const index = plants.findIndex(p => p.id === parseInt(req.params.id));

        if (index === -1) {
            // Clean up uploaded files if plant not found
            req.files.forEach(file => fs.unlinkSync(file.path));
            return res.status(404).json({ error: 'Plant not found' });
        }

        const newImages = req.files.map(file => `/uploads/${file.filename}`);
        plants[index].images = [...(plants[index].images || []), ...newImages];
        savePlants(plants);

        res.json({ images: newImages, plant: plants[index] });
    } catch (error) {
        console.error('Error uploading images:', error);
        res.status(500).json({ error: 'Failed to upload images' });
    }
});

// POST upload images for new plant (returns paths without saving)
app.post('/api/upload', upload.array('images', 10), (req, res) => {
    try {
        const imagePaths = req.files.map(file => `/uploads/${file.filename}`);
        res.json({ images: imagePaths });
    } catch (error) {
        console.error('Error uploading images:', error);
        res.status(500).json({ error: 'Failed to upload images' });
    }
});

// DELETE image from plant
app.delete('/api/plants/:id/images', (req, res) => {
    try {
        const { imagePath } = req.body;
        const plants = loadPlants();
        const index = plants.findIndex(p => p.id === parseInt(req.params.id));

        if (index === -1) {
            return res.status(404).json({ error: 'Plant not found' });
        }

        // Remove from plant's images array
        plants[index].images = plants[index].images.filter(img => img !== imagePath);

        // Delete file if it's an uploaded image
        if (imagePath.startsWith('/uploads/')) {
            const fullPath = path.join(__dirname, 'public', imagePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }

        savePlants(plants);
        res.json({ message: 'Image deleted', plant: plants[index] });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

// Serve static files (React build)
app.use(express.static(path.join(__dirname, 'dist')));

// Serve uploaded images
app.use('/uploads', express.static(UPLOADS_DIR));

// Serve legacy images from public/images
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// SPA fallback - serve index.html for all non-API routes
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`🌱 Seeds Dashboard server running on http://localhost:${PORT}`);
});
