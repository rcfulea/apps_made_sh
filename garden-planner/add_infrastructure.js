const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data', 'customPlants.json');

const infrastructureItems = [
    {
        id: "obj-shed",
        label: "Shed",
        perSquare: 1,
        file: "shed.svg",
        category: "infrastructure",
        isCustom: true
    },
    {
        id: "obj-compost",
        label: "Compost Bin",
        perSquare: 1,
        file: "compost.svg",
        category: "infrastructure",
        isCustom: true
    },
    {
        id: "obj-path",
        label: "Path",
        perSquare: 1,
        file: "path.svg",
        category: "infrastructure",
        isCustom: true
    },
    {
        id: "obj-waterbutt",
        label: "Water Butt",
        perSquare: 1,
        file: "waterbutt.svg",
        category: "infrastructure",
        isCustom: true
    }
];

try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(raw);

    // Check if they already exist to avoid duplicates
    let addedCount = 0;
    infrastructureItems.forEach(item => {
        if (!data.plants.find(p => p.id === item.id)) {
            data.plants.push(item);
            addedCount++;
        }
    });

    if (addedCount > 0) {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
        console.log(`Added ${addedCount} infrastructure items.`);
    } else {
        console.log("Infrastructure items already exist.");
    }

} catch (e) {
    console.error("Error updating database:", e);
}
