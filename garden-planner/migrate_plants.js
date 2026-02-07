const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'public', 'icons');
const oldDataPath = path.join(__dirname, 'data', 'customPlants.json');
const newDataPath = path.join(__dirname, 'data', 'customPlants_new.json');

// Helper to title case
function toTitleCase(str) {
    return str.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

try {
    // 1. Read existing data to preserve perSquare values
    let oldData = { plants: [], overrides: {} };
    if (fs.existsSync(oldDataPath)) {
        try {
            oldData = JSON.parse(fs.readFileSync(oldDataPath, 'utf8'));
        } catch (e) {
            console.warn("Could not parse old data, starting fresh for perSquare values.");
        }
    }

    // Create a map of existing plants for fast lookup
    const existingMap = new Map();
    // Index existing plants array
    (oldData.plants || []).forEach(p => existingMap.set(p.id, p));
    // Also check overrides if any match the ID
    Object.keys(oldData.overrides || {}).forEach(k => {
        // If an override exists for a key, we might want to use its perSquare
        // But overrides were for built-ins. We are making everything custom effectively.
        // We'll prioritize the 'plants' array, then check overrides if we have a filename match in logic?
        // Actually, let's just use the 'plants' array and maybe the overrides if the IDs match filenames.
        existingMap.set(k, { ...existingMap.get(k), ...oldData.overrides[k] });
    });

    // 2. Scan icons directory
    const files = fs.readdirSync(iconsDir).filter(f => f.endsWith('.svg'));
    
    const newPlants = [];

    files.forEach(file => {
        const id = path.basename(file, '.svg');
        // Check if we have existing data for this ID
        const existing = existingMap.get(id);
        
        const label = existing && existing.label ? existing.label : toTitleCase(id);
        const perSquare = existing && existing.perSquare ? existing.perSquare : 1; // Default to 1

        newPlants.push({
            id: id,
            label: label,
            perSquare: perSquare,
            file: file,
            isCustom: true // Mark all as custom/file-based
        });
    });

    // Sort alphabetically by label
    newPlants.sort((a, b) => a.label.localeCompare(b.label));

    // 3. Write new file
    // We clear 'overrides' because we are removing built-in plants, so overrides concept is moot.
    // Everything is a "custom plant" now.
    const newData = {
        plants: newPlants,
        overrides: {} 
    };

    fs.writeFileSync(newDataPath, JSON.stringify(newData, null, 2));
    console.log(`Generated ${newPlants.length} plants in ${newDataPath}`);

} catch (err) {
    console.error("Error generating plants JSON:", err);
    process.exit(1);
}
