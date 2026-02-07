const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data', 'customPlants.json');

// Knowledge Base: ID -> Enrichment Data
// Note: perSquare updates are applied if present.
const KNOWLEDGE_BASE = {
    // Solanaceae (Nightshades)
    'tomato-beef': { family: 'Solanaceae', companions: ['basil', 'carrot', 'onion', 'parsley'], antagonists: ['potato', 'fennel', 'corn'], perSquare: 1, sowOutdoor: 2, harvest: 20 },
    'tomato-cherry': { family: 'Solanaceae', companions: ['basil', 'carrot', 'onion', 'parsley'], antagonists: ['potato', 'fennel', 'corn'], perSquare: 1, sowOutdoor: 2, harvest: 20 },
    'tomato-roma': { family: 'Solanaceae', companions: ['basil', 'carrot', 'onion', 'parsley'], antagonists: ['potato', 'fennel', 'corn'], perSquare: 1, sowOutdoor: 2, harvest: 20 },
    'tomato-normal': { family: 'Solanaceae', companions: ['basil', 'carrot', 'onion', 'parsley'], antagonists: ['potato', 'fennel', 'corn'], perSquare: 1, sowOutdoor: 2, harvest: 20 },
    'aubergines': { family: 'Solanaceae', companions: ['beans', 'spinach'], antagonists: ['fennel'], perSquare: 1, sowIndoor: -8, sowOutdoor: 2 },
    'chillies': { family: 'Solanaceae', companions: ['basil', 'onion'], antagonists: ['fennel'], perSquare: 1, sowIndoor: -8 },
    'pepper-green': { family: 'Solanaceae', companions: ['basil', 'onion'], antagonists: ['fennel'], perSquare: 1, sowIndoor: -8 },
    'pepper-red': { family: 'Solanaceae', companions: ['basil', 'onion'], antagonists: ['fennel'], perSquare: 1, sowIndoor: -8 },
    'pepper-yellow': { family: 'Solanaceae', companions: ['basil', 'onion'], antagonists: ['fennel'], perSquare: 1, sowIndoor: -8 },
    'potato': { family: 'Solanaceae', companions: ['beans', 'corn', 'cabbage'], antagonists: ['tomato', 'pumpkin', 'squash'], perSquare: 1, sowOutdoor: -2 }, // SFG often says 1 per square for potatoes
    'test-plant': { family: 'Unknown', perSquare: 1 },

    // Brassicaceae (Cole Crops)
    'broccoli': { family: 'Brassicaceae', companions: ['dill', 'celery', 'onion'], antagonists: ['mustard', 'strawberry'], perSquare: 1, sowIndoor: -4, harvest: 16 },
    'purple-sprouting-broccoli': { family: 'Brassicaceae', companions: ['dill', 'celery'], antagonists: ['strawberry'], perSquare: 1 },
    'brussel-sprouts': { family: 'Brassicaceae', companions: ['dill', 'celery'], antagonists: ['strawberry'], perSquare: 1 },
    'cabbage-green': { family: 'Brassicaceae', companions: ['beans', 'celery', 'onion'], antagonists: ['strawberry', 'tomato'], perSquare: 1 },
    'cabbage-purple': { family: 'Brassicaceae', companions: ['beans', 'celery', 'onion'], antagonists: ['strawberry', 'tomato'], perSquare: 1 },
    'winter-cabbage': { family: 'Brassicaceae', companions: ['beans', 'celery'], antagonists: ['strawberry'], perSquare: 1 },
    'califlower': { family: 'Brassicaceae', companions: ['beans', 'celery'], antagonists: ['strawberry'], perSquare: 1 }, // Note: possible typo in filename, checking known list
    'cauliflower': { family: 'Brassicaceae', companions: ['beans', 'celery'], antagonists: ['strawberry'], perSquare: 1 },
    'kale': { family: 'Brassicaceae', companions: ['beetroot', 'celery', 'onion'], antagonists: ['strawberry'], perSquare: 1 },
    'kohl-rabi': { family: 'Brassicaceae', companions: ['beetroot', 'onion'], antagonists: ['strawberry', 'tomato'], perSquare: 4 },
    'pak-choi': { family: 'Brassicaceae', companions: ['carrots'], antagonists: ['strawberry'], perSquare: 4, harvest: 8 }, // Approximation
    'radish': { family: 'Brassicaceae', companions: ['lettuce', 'cucumber', 'peas'], antagonists: ['hyssop'], perSquare: 16, sowOutdoor: -4, harvest: 6 },
    'mooli-radish': { family: 'Brassicaceae', companions: ['lettuce', 'cucumber'], perSquare: 4 }, // Larger radish
    'turnip': { family: 'Brassicaceae', companions: ['peas'], antagonists: ['potato'], perSquare: 9 },
    'rocket': { family: 'Brassicaceae', companions: ['lettuce'], perSquare: 4 },

    // Apiaceae (Umbellifers)
    'carrots': { family: 'Apiaceae', companions: ['onion', 'leek', 'tomato', 'beans'], antagonists: ['dill', 'parsnip'], perSquare: 16, sowOutdoor: -2, harvest: 16 },
    'celery': { family: 'Apiaceae', companions: ['leek', 'tomato', 'beans'], antagonists: [], perSquare: 4, sowIndoor: -10 },
    'celeriac': { family: 'Apiaceae', companions: ['beans', 'brassicas'], perSquare: 1 },
    'coriander': { family: 'Apiaceae', companions: ['dill', 'spinach'], antagonists: ['fennel'], perSquare: 4 },
    'dill': { family: 'Apiaceae', companions: ['brassicas', 'corn', 'cucumber'], antagonists: ['carrot', 'tomato'], perSquare: 1 }, // often self-seeds
    'fennel': { family: 'Apiaceae', companions: [], antagonists: ['beans', 'tomato', 'coriander'], perSquare: 1 }, // Fennel is allelopathic, dislikes most
    'parsley': { family: 'Apiaceae', companions: ['asparagus', 'corn', 'tomato'], antagonists: [], perSquare: 4 },
    'parsnip': { family: 'Apiaceae', companions: ['onion', 'garlic'], antagonists: ['carrot'], perSquare: 9 }, // SFG: 9 or 16
    'parley': { family: 'Apiaceae', companions: ['asparagus', 'corn', 'tomato'], perSquare: 4 }, // Likely typo for parsley in filename

    // Fabaceae (Legumes)
    'beans': { family: 'Fabaceae', companions: ['beetroot', 'carrot', 'corn', 'cucumber'], antagonists: ['onion', 'garlic', 'leek'], perSquare: 9 },
    'broad-bean': { family: 'Fabaceae', companions: ['potato', 'spinach'], antagonists: ['onion'], perSquare: 4 }, // Larger bean
    'french-beans': { family: 'Fabaceae', companions: ['beetroot', 'corn'], antagonists: ['onion'], perSquare: 4 }, // 4 or 9 depending on variety (pole vs bush)
    'green-beans': { family: 'Fabaceae', companions: ['beetroot', 'corn'], antagonists: ['onion'], perSquare: 9 },
    'peas': { family: 'Fabaceae', companions: ['bean', 'carrot', 'corn', 'cucumber'], antagonists: ['onion', 'garlic'], perSquare: 8 },

    // Allium
    'garlic': { family: 'Amaryllidaceae', companions: ['beetroot', 'carrot', 'tomato'], antagonists: ['beans', 'peas'], perSquare: 9, sowOutdoor: -4, harvest: 24 },
    'onion-red': { family: 'Amaryllidaceae', companions: ['beetroot', 'carrot', 'lettuce'], antagonists: ['beans', 'peas'], perSquare: 9 }, // SFG: 9-16
    'onion-yellow': { family: 'Amaryllidaceae', companions: ['beetroot', 'carrot', 'lettuce'], antagonists: ['beans', 'peas'], perSquare: 9 },
    'leek': { family: 'Amaryllidaceae', companions: ['carrot', 'celery', 'onion'], antagonists: ['beans', 'peas'], perSquare: 9 },
    'chives': { family: 'Amaryllidaceae', companions: ['carrot', 'tomato'], antagonists: ['beans'], perSquare: 9 }, // Clumps
    'spring-onion': { family: 'Amaryllidaceae', companions: ['carrot'], antagonists: ['beans'], perSquare: 16 },

    // Cucurbitaceae
    'cucumber': { family: 'Cucurbitaceae', companions: ['beans', 'corn', 'peas', 'radish'], antagonists: ['potato'], perSquare: 2, sowIndoor: -3, harvest: 14 }, // 2 on trellis
    'courgette': { family: 'Cucurbitaceae', companions: ['beans', 'corn'], antagonists: ['potato'], perSquare: 1 }, // 1 per 3x3 actually, but 1 per square for "bush" types is generous. Keep 1.
    'zucchini': { family: 'Cucurbitaceae', companions: ['beans', 'corn'], antagonists: ['potato'], perSquare: 1 },
    'squash-winter': { family: 'Cucurbitaceae', companions: ['corn', 'beans'], antagonists: ['potato'], perSquare: 1 }, // Needs space
    'pumpkin': { family: 'Cucurbitaceae', companions: ['corn'], antagonists: ['potato'], perSquare: 1 },

    // Chenopodiaceae / Amaranthaceae
    'beetroot': { family: 'Amaranthaceae', companions: ['brassicas', 'lettuce', 'onion'], antagonists: ['pole beans'], perSquare: 9, sowOutdoor: -2, harvest: 12 },
    'chard': { family: 'Amaranthaceae', companions: ['brassicas', 'lettuce', 'onion'], perSquare: 4 },
    'spinach': { family: 'Amaranthaceae', companions: ['brassicas', 'strawberry'], perSquare: 9 },

    // Compositae / Asteraceae
    'lettuce-big-head': { family: 'Asteraceae', companions: ['beetroot', 'carrot', 'radish'], antagonists: [], perSquare: 1 }, // Head lettuce need space
    'lettuce-little-gemm': { family: 'Asteraceae', companions: ['beetroot', 'carrot', 'radish'], antagonists: [], perSquare: 4 },
    'salads': { family: 'Asteraceae', companions: ['beetroot', 'carrot'], perSquare: 4 },
    'globe-artichokes': { family: 'Asteraceae', companions: [], perSquare: 1 }, // huge plant
    'sunflower': { family: 'Asteraceae', companions: ['cucumber'], antagonists: ['potato'], perSquare: 1 },
    'sunchoke': { family: 'Asteraceae', companions: ['cucumber'], perSquare: 1 },

    // Lamiaceae (Mints)
    'basil': { family: 'Lamiaceae', companions: ['tomato', 'pepper'], antagonists: ['rue'], perSquare: 4 }, // 1 or 4
    'mint': { family: 'Lamiaceae', companions: ['cabbage', 'tomato'], antagonists: [], perSquare: 1 }, // Invasive, 1 pot
    'rosemary': { family: 'Lamiaceae', companions: ['beans', 'carrot'], antagonists: [], perSquare: 1 },
    'rosemerry': { family: 'Lamiaceae', companions: ['beans', 'carrot'], antagonists: [], perSquare: 1 }, // Typo fix match

    // Poaceae
    'corn': { family: 'Poaceae', companions: ['beans', 'squash', 'cucumber'], antagonists: ['tomato'], perSquare: 4 },

    // Rosaceae (Fruits mostly)
    'strawberries': { family: 'Rosaceae', companions: ['borage', 'bush beans', 'spinach'], antagonists: ['cabbage'], perSquare: 4 },
    'apples': { family: 'Rosaceae', companions: ['chives'], perSquare: 1 }, // Tree
    'pear': { family: 'Rosaceae', companions: [], perSquare: 1 }, // Tree
    'raspberry': { family: 'Rosaceae', companions: ['garlic', 'onion'], perSquare: 1 }, // Cane
    'bramble': { family: 'Rosaceae', companions: [], perSquare: 1 },
    'blackberry': { family: 'Rosaceae', companions: [], perSquare: 1 },

    // Grossulariaceae
    'black-currants': { family: 'Grossulariaceae', companions: [], perSquare: 1 },
    'red-currants': { family: 'Grossulariaceae', companions: [], perSquare: 1 },
    'white-currants': { family: 'Grossulariaceae', companions: [], perSquare: 1 },
    'gooseberry': { family: 'Grossulariaceae', companions: [], perSquare: 1 },

    // Others
    'figs': { family: 'Moraceae', companions: [], perSquare: 1 },
    'ginger': { family: 'Zingiberaceae', companions: [], perSquare: 1 },
    'rhubarb': { family: 'Polygonaceae', companions: ['columbine'], perSquare: 1 }, // Huge
    'asparagus': { family: 'Asparagaceae', companions: ['basil', 'parsley', 'tomato'], antagonists: ['onion', 'garlic'], perSquare: 1 },
    'saffron': { family: 'Iridaceae', companions: [], perSquare: 16 }, // Crocus bulbs
    'blueberries': { family: 'Ericaceae', companions: [], perSquare: 1 },
    'loganberry': { family: 'Rosaceae', companions: [], perSquare: 1 }
};

try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(raw);
    let updatedCount = 0;

    data.plants = data.plants.map(p => {
        const info = KNOWLEDGE_BASE[p.id];
        if (info) {
            updatedCount++;
            return {
                ...p,
                ...info // Overwrite/Add fields from knowledge base
            };
        }
        return p;
    });

    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log(`Successfully enriched ${updatedCount} plants.`);

} catch (e) {
    console.error("Error enriching plants:", e);
    process.exit(1);
}
