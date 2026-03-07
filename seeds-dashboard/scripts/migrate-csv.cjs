// Script to convert CSV to JSON for initial data migration
// Properly handles multiline fields in CSV (newlines inside quoted cells)
const fs = require('fs');
const path = require('path');

// Read CSV file
const csvPath = path.join(__dirname, '..', 'public', 'plants.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

/**
 * Parse CSV with proper handling of:
 * - Multiline fields (newlines inside quoted cells)
 * - Escaped quotes ("" inside quoted fields)
 * - Mixed quoted and unquoted fields
 */
function parseCSV(csv) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    let i = 0;

    while (i < csv.length) {
        const char = csv[i];
        const nextChar = csv[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // Escaped quote - add single quote and skip next
                currentCell += '"';
                i += 2;
                continue;
            } else if (char === '"') {
                // End of quoted field
                inQuotes = false;
                i++;
                continue;
            } else {
                // Regular character inside quotes (including newlines)
                currentCell += char;
                i++;
                continue;
            }
        } else {
            if (char === '"') {
                // Start of quoted field
                inQuotes = true;
                i++;
                continue;
            } else if (char === ',') {
                // Field separator
                currentRow.push(currentCell.trim());
                currentCell = '';
                i++;
                continue;
            } else if (char === '\r' && nextChar === '\n') {
                // Windows line ending - end of row
                currentRow.push(currentCell.trim());
                if (currentRow.length > 1 || currentRow[0] !== '') {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentCell = '';
                i += 2;
                continue;
            } else if (char === '\n') {
                // Unix line ending - end of row
                currentRow.push(currentCell.trim());
                if (currentRow.length > 1 || currentRow[0] !== '') {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentCell = '';
                i++;
                continue;
            } else {
                // Regular character
                currentCell += char;
                i++;
                continue;
            }
        }
    }

    // Don't forget the last cell/row
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.length > 1 || currentRow[0] !== '') {
            rows.push(currentRow);
        }
    }

    // First row is headers
    if (rows.length === 0) return [];

    const headers = rows[0];
    const plants = [];

    for (let r = 1; r < rows.length; r++) {
        const values = rows[r];
        const plant = {};

        headers.forEach((header, index) => {
            plant[header] = values[index] || '';
        });

        plants.push(plant);
    }

    return plants;
}

function parseBoolean(value) {
    return value?.toLowerCase() === 'yes';
}

function parseArray(value) {
    if (!value || value.trim() === '') return [];
    return value.split(',').map(s => s.trim()).filter(s => s !== '');
}

function parseImagePath(imagePath) {
    if (!imagePath || imagePath.trim() === '') {
        return [];
    }
    const paths = imagePath.split(',').map(p => p.trim());
    return paths.map(imgPath => {
        const decoded = decodeURIComponent(imgPath);
        const filename = decoded.split('/').pop() || '';
        return `/images/${filename}`;
    }).filter(p => p !== '/images/');
}

// Transform to our schema
const rawPlants = parseCSV(csvContent);
const plants = rawPlants
    .filter(row => row.Name && row.Name.trim() !== '')
    .map((row, index) => ({
        id: index + 1,
        thisYear: parseBoolean(row['This Year']),
        name: row['Name'] || '',
        images: parseImagePath(row['Image']),
        type: parseArray(row['Type']),
        edible: parseBoolean(row['Edible']),
        description: row['Description'] || '',
        location: row['Location'] || '',
        sowingMonth: parseArray(row['Sowing month']),
        indoorSeed: parseBoolean(row['Indoor seed']),
        dateSown: row['Date sown'] || '',
        outdoorSeed: parseBoolean(row['Outdoor seed']),
        plantingOutMonth: parseArray(row['Planting out month']),
        plantingOutInstruction: row['Planting out instruction'] || '',
        sowingInstructions: row['Sowing Instructions'] || '',
        pruningMonth: parseArray(row['Pruning month']),
        pruningInstructions: row['Pruning Instructions'] || '',
        harvestMonth: parseArray(row['Harvest month']),
        flowering: parseArray(row['Flowering']),
        preferences: row['Preferences'] || '',
        soilPreference: parseArray(row['Soil Preference']),
        careInstructions: row['Care Instructions'] || '',
        commonProblems: row['Common problems'] || '',
        goodForPollinators: parseBoolean(row['Good for pollinators']),
        linkToWebsite: row['Link to Useful Website'] || '',
        archived: parseBoolean(row['Archived']),
    }));

// Write JSON
const outputPath = path.join(__dirname, '..', 'data', 'plants.json');
fs.writeFileSync(outputPath, JSON.stringify(plants, null, 2));

console.log(`✅ Converted ${plants.length} plants to JSON`);
console.log(`📁 Output: ${outputPath}`);
