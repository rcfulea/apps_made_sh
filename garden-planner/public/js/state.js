/**
 * State Management Module
 * Centralized state with event-driven updates
 */

const State = (() => {
    // Private state object
    const state = {
        // Auth
        user: null,
        isAdmin: false,

        // Current view
        viewMonth: new Date().getMonth(),
        mode: 'plant', // 'plant' | 'border' | 'erase'
        sfgMode: false,

        // Garden data
        beds: [],
        currentPlanName: 'default',

        // Plants database
        plants: [],

        // UI state
        selectedCell: null,
        selectedBed: null,
        draggedPlant: null,
    };

    // Event subscribers
    const listeners = {};

    // History stack for undo (stores beds snapshots)
    const history = [];
    const MAX_HISTORY = 50;

    /**
     * Save current beds state to history
     */
    function saveHistory() {
        const snapshot = JSON.stringify(state.beds.map(bed => ({
            ...bed,
            borders: Array.from(bed.borders),
        })));
        // Avoid duplicates
        if (history.length > 0 && history[history.length - 1] === snapshot) {
            return;
        }
        history.push(snapshot);
        if (history.length > MAX_HISTORY) {
            history.shift();
        }
        emit('historyChange', { canUndo: history.length > 1 });
    }

    /**
     * Undo last action
     */
    function undo() {
        if (history.length <= 1) {
            return false;
        }

        // Remove current state
        history.pop();

        // Restore previous state
        const previousState = history[history.length - 1];
        if (previousState) {
            state.beds = JSON.parse(previousState).map(bed => ({
                ...bed,
                borders: new Set(bed.borders || []),
            }));
            emit('bedsChange', state.beds);
            emit('historyChange', { canUndo: history.length > 1 });
            return true;
        }
        return false;
    }

    /**
     * Check if undo is available
     */
    function canUndo() {
        return history.length > 1;
    }

    /**
     * Subscribe to state changes
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    function subscribe(event, callback) {
        if (!listeners[event]) {
            listeners[event] = [];
        }
        listeners[event].push(callback);
        return () => {
            listeners[event] = listeners[event].filter(cb => cb !== callback);
        };
    }

    /**
     * Emit an event to all subscribers
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    function emit(event, data) {
        if (listeners[event]) {
            listeners[event].forEach(cb => cb(data));
        }
    }

    /**
     * Get current state (read-only copy)
     */
    function get() {
        return { ...state };
    }

    /**
     * Get a specific state property
     */
    function getProperty(key) {
        return state[key];
    }

    /**
     * Update state and emit change event
     * @param {object} updates - Partial state updates
     */
    function set(updates) {
        const changedKeys = [];
        for (const key in updates) {
            if (state[key] !== updates[key]) {
                state[key] = updates[key];
                changedKeys.push(key);
            }
        }
        if (changedKeys.length > 0) {
            emit('stateChange', { keys: changedKeys, state: get() });
            changedKeys.forEach(key => emit(`${key}Change`, state[key]));
        }
    }

    // ==========================================
    // Bed Management
    // ==========================================

    /**
     * Generate unique bed ID
     */
    function generateBedId() {
        return 'bed-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Add a new bed
     */
    function addBed(name, width, height, cellSize = 30) {
        saveHistory(); // Save before mutation
        const bed = {
            id: generateBedId(),
            name: name || `Area ${state.beds.length + 1}`,
            width: parseInt(width) || 4,
            height: parseInt(height) || 2,
            cellSize: parseInt(cellSize) || 30,
            cells: [], // Array of cell objects
            borders: new Set(), // Set of border strings like "0-top", "3-right"
        };

        // Initialize cells
        const totalCells = bed.width * bed.height;
        for (let i = 0; i < totalCells; i++) {
            bed.cells.push(null); // null = empty cell
        }

        state.beds.push(bed);
        emit('bedAdded', bed);
        emit('bedsChange', state.beds);
        saveHistory(); // Save new state
        return bed;
    }

    /**
     * Remove a bed
     */
    function removeBed(bedId) {
        saveHistory(); // Save before mutation
        const index = state.beds.findIndex(b => b.id === bedId);
        if (index !== -1) {
            const removed = state.beds.splice(index, 1)[0];
            emit('bedRemoved', removed);
            emit('bedsChange', state.beds);
            saveHistory(); // Save new state
        }
    }

    /**
     * Get bed by ID
     */
    function getBed(bedId) {
        return state.beds.find(b => b.id === bedId);
    }

    /**
     * Update bed properties
     */
    function updateBed(bedId, updates) {
        saveHistory(); // Save before mutation
        const bed = getBed(bedId);
        if (bed) {
            Object.assign(bed, updates);
            emit('bedUpdated', bed);
            emit('bedsChange', state.beds);
            saveHistory(); // Save new state
        }
    }

    /**
     * Resize a bed (preserves cells within bounds)
     */
    function resizeBed(bedId, newWidth, newHeight) {
        const bed = getBed(bedId);
        if (!bed) return;

        const oldWidth = bed.width;
        const oldHeight = bed.height;
        const newCells = [];

        for (let y = 0; y < newHeight; y++) {
            for (let x = 0; x < newWidth; x++) {
                if (x < oldWidth && y < oldHeight) {
                    // Copy existing cell
                    const oldIndex = y * oldWidth + x;
                    newCells.push(bed.cells[oldIndex]);
                } else {
                    // New cell
                    newCells.push(null);
                }
            }
        }

        bed.width = newWidth;
        bed.height = newHeight;
        bed.cells = newCells;

        // Clean up borders that are out of bounds
        const newBorders = new Set();
        bed.borders.forEach(border => {
            const [index, side] = border.split('-');
            const idx = parseInt(index);
            const x = idx % newWidth;
            const y = Math.floor(idx / newWidth);
            if (x < newWidth && y < newHeight) {
                newBorders.add(border);
            }
        });
        bed.borders = newBorders;

        emit('bedResized', bed);
        emit('bedsChange', state.beds);
    }

    // ==========================================
    // Cell Management (Multi-Planting Support)
    // ==========================================

    /**
     * Place a plant in a cell.
     * Adds a new planting or replaces an existing one for overlapping months.
     * @param {string} bedId 
     * @param {number} cellIndex 
     * @param {string} plantId 
     * @param {string} variety 
     * @param {number|number[]} monthsOrMonth - Single month or array of active months
     */
    function placeCell(bedId, cellIndex, plantId, variety = '', monthsOrMonth = null) {
        const bed = getBed(bedId);
        if (!bed || cellIndex < 0 || cellIndex >= bed.cells.length) return;

        saveHistory();

        // Normalize to array of active months
        let activeMonths;
        if (monthsOrMonth === null) {
            // Default: all months (plant visible year-round until user customizes)
            activeMonths = Array.from({length: 12}, (_, i) => i);
        } else if (Array.isArray(monthsOrMonth)) {
            activeMonths = monthsOrMonth;
        } else {
            activeMonths = [monthsOrMonth];
        }

        // Ensure cell has plantings array
        if (!bed.cells[cellIndex] || !bed.cells[cellIndex].plantings) {
            bed.cells[cellIndex] = { plantings: [] };
        }

        const cell = bed.cells[cellIndex];

        // Remove any existing planting that covers any of the active months
        cell.plantings = cell.plantings.filter(p => {
            const overlap = (p.activeMonths || []).some(m => activeMonths.includes(m));
            return !overlap;
        });

        // Add the new planting
        cell.plantings.push({ plantId, variety, activeMonths });

        // Clean up: if no plantings left (shouldn't happen), set to null
        if (cell.plantings.length === 0) {
            bed.cells[cellIndex] = null;
        }

        emit('cellUpdated', { bedId, cellIndex, cell: bed.cells[cellIndex] });
        emit('bedsChange', state.beds);
        saveHistory();
    }

    /**
     * Add a planting to a cell without removing existing ones.
     * Returns overlap info if months conflict.
     */
    function addPlanting(bedId, cellIndex, plantId, variety, activeMonths) {
        const bed = getBed(bedId);
        if (!bed || cellIndex < 0 || cellIndex >= bed.cells.length) return { overlap: false };

        saveHistory();

        if (!bed.cells[cellIndex] || !bed.cells[cellIndex].plantings) {
            bed.cells[cellIndex] = { plantings: [] };
        }

        const cell = bed.cells[cellIndex];

        // Check for month overlaps
        const overlapping = [];
        cell.plantings.forEach((p, idx) => {
            const shared = (p.activeMonths || []).filter(m => activeMonths.includes(m));
            if (shared.length > 0) {
                const plant = Plants ? Plants.getPlant(p.plantId) : null;
                overlapping.push({
                    index: idx,
                    plantId: p.plantId,
                    plantName: plant?.label || p.plantId,
                    sharedMonths: shared,
                });
            }
        });

        if (overlapping.length > 0) {
            return { overlap: true, conflicts: overlapping };
        }

        cell.plantings.push({ plantId, variety: variety || '', activeMonths });

        emit('cellUpdated', { bedId, cellIndex, cell: bed.cells[cellIndex] });
        emit('bedsChange', state.beds);
        saveHistory();
        return { overlap: false };
    }

    /**
     * Remove a specific planting from a cell
     */
    function removePlanting(bedId, cellIndex, plantingIndex) {
        const bed = getBed(bedId);
        if (!bed || cellIndex < 0 || cellIndex >= bed.cells.length) return;

        const cell = bed.cells[cellIndex];
        if (!cell || !cell.plantings) return;

        saveHistory();

        cell.plantings.splice(plantingIndex, 1);

        // If no plantings left, clear the cell
        if (cell.plantings.length === 0) {
            bed.cells[cellIndex] = null;
        }

        emit('cellUpdated', { bedId, cellIndex, cell: bed.cells[cellIndex] });
        emit('bedsChange', state.beds);
        saveHistory();
    }

    /**
     * Update the active months of an existing planting
     */
    function updatePlantingMonths(bedId, cellIndex, plantingIndex, newMonths) {
        const bed = getBed(bedId);
        if (!bed || cellIndex < 0 || cellIndex >= bed.cells.length) return;

        const cell = bed.cells[cellIndex];
        if (!cell || !cell.plantings || !cell.plantings[plantingIndex]) return;

        saveHistory();
        cell.plantings[plantingIndex].activeMonths = newMonths;

        emit('cellUpdated', { bedId, cellIndex, cell });
        emit('bedsChange', state.beds);
    }

    /**
     * Update the variety name of an existing planting
     */
    function updatePlantingVariety(bedId, cellIndex, plantingIndex, newVariety) {
        const bed = getBed(bedId);
        if (!bed || cellIndex < 0 || cellIndex >= bed.cells.length) return;

        const cell = bed.cells[cellIndex];
        if (!cell || !cell.plantings || !cell.plantings[plantingIndex]) return;

        cell.plantings[plantingIndex].variety = newVariety;

        emit('cellUpdated', { bedId, cellIndex, cell });
        emit('bedsChange', state.beds);
    }

    /**
     * Remove plant from a cell (all plantings)
     */
    function clearCell(bedId, cellIndex) {
        const bed = getBed(bedId);
        if (!bed || cellIndex < 0 || cellIndex >= bed.cells.length) return;

        saveHistory();
        bed.cells[cellIndex] = null;
        emit('cellUpdated', { bedId, cellIndex, cell: null });
        emit('bedsChange', state.beds);
        saveHistory();
    }

    /**
     * Get cell data
     */
    function getCell(bedId, cellIndex) {
        const bed = getBed(bedId);
        if (!bed) return null;
        return bed.cells[cellIndex];
    }

    /**
     * Get the active planting for a given month
     * Returns { plantId, variety, activeMonths, index } or null
     */
    function getActivePlanting(bedId, cellIndex, month) {
        const cell = getCell(bedId, cellIndex);
        if (!cell) return null;

        // Handle legacy single-planting format
        if (cell.plantId) {
            const am = cell.activeMonths || [];
            if (am.length === 0 || am.includes(month)) {
                return { plantId: cell.plantId, variety: cell.variety || '', activeMonths: am, index: 0 };
            }
            return null;
        }

        // New multi-planting format
        if (cell.plantings) {
            for (let i = 0; i < cell.plantings.length; i++) {
                const p = cell.plantings[i];
                if (p.activeMonths && p.activeMonths.includes(month)) {
                    return { ...p, index: i };
                }
            }
        }

        return null;
    }

    /**
     * Get all plantings for a cell
     */
    function getAllPlantings(bedId, cellIndex) {
        const cell = getCell(bedId, cellIndex);
        if (!cell) return [];

        // Handle legacy format
        if (cell.plantId) {
            return [{ plantId: cell.plantId, variety: cell.variety || '', activeMonths: cell.activeMonths || [] }];
        }

        return cell.plantings || [];
    }

    // ==========================================
    // Border Management (SEPARATE from cells!)
    // ==========================================

    /**
     * Toggle a border on a cell edge
     * @param {string} bedId - Bed ID
     * @param {number} cellIndex - Cell index
     * @param {string} side - 'top' | 'right' | 'bottom' | 'left'
     */
    function toggleBorder(bedId, cellIndex, side) {
        const bed = getBed(bedId);
        if (!bed) return;

        const borderKey = `${cellIndex}-${side}`;

        if (bed.borders.has(borderKey)) {
            bed.borders.delete(borderKey);
        } else {
            bed.borders.add(borderKey);
        }

        emit('borderToggled', { bedId, cellIndex, side, active: bed.borders.has(borderKey) });
        emit('bedsChange', state.beds);
    }

    /**
     * Set border state explicitly
     * @param {boolean} [silent] - Skip emitting bedsChange (for batched updates)
     */
    function setBorder(bedId, cellIndex, side, active, silent = false) {
        const bed = getBed(bedId);
        if (!bed) return;

        const borderKey = `${cellIndex}-${side}`;

        if (active) {
            bed.borders.add(borderKey);
        } else {
            bed.borders.delete(borderKey);
        }

        emit('borderToggled', { bedId, cellIndex, side, active });
        if (!silent) emit('bedsChange', state.beds);
    }

    /**
     * Check if a border exists
     */
    function hasBorder(bedId, cellIndex, side) {
        const bed = getBed(bedId);
        if (!bed) return false;
        return bed.borders.has(`${cellIndex}-${side}`);
    }

    /**
     * Apply borders to a rectangle of cells (toggle mode)
     */
    function applyBordersToRect(bedId, startX, startY, endX, endY) {
        const bed = getBed(bedId);
        if (!bed) return;

        // Normalize rectangle
        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);

        // Check if all perimeter borders exist
        let allExist = true;

        // Top row - top borders
        for (let x = minX; x <= maxX && allExist; x++) {
            const idx = minY * bed.width + x;
            if (!bed.borders.has(`${idx}-top`)) allExist = false;
        }

        // Bottom row - bottom borders
        for (let x = minX; x <= maxX && allExist; x++) {
            const idx = maxY * bed.width + x;
            if (!bed.borders.has(`${idx}-bottom`)) allExist = false;
        }

        // Left column - left borders
        for (let y = minY; y <= maxY && allExist; y++) {
            const idx = y * bed.width + minX;
            if (!bed.borders.has(`${idx}-left`)) allExist = false;
        }

        // Right column - right borders
        for (let y = minY; y <= maxY && allExist; y++) {
            const idx = y * bed.width + maxX;
            if (!bed.borders.has(`${idx}-right`)) allExist = false;
        }

        // If all exist, remove them (toggle off)
        const shouldAdd = !allExist;

        // Apply borders (silent to batch into one bedsChange at the end)
        for (let x = minX; x <= maxX; x++) {
            const topIdx = minY * bed.width + x;
            const bottomIdx = maxY * bed.width + x;
            setBorder(bedId, topIdx, 'top', shouldAdd, true);
            setBorder(bedId, bottomIdx, 'bottom', shouldAdd, true);
        }

        for (let y = minY; y <= maxY; y++) {
            const leftIdx = y * bed.width + minX;
            const rightIdx = y * bed.width + maxX;
            setBorder(bedId, leftIdx, 'left', shouldAdd, true);
            setBorder(bedId, rightIdx, 'right', shouldAdd, true);
        }

        emit('bordersApplied', { bedId, minX, minY, maxX, maxY, added: shouldAdd });
        emit('bedsChange', state.beds);
    }

    // ==========================================
    // Serialization (for save/load)
    // ==========================================

    /**
     * Serialize state for saving
     */
    function serialize() {
        return {
            beds: state.beds.map(bed => ({
                ...bed,
                borders: Array.from(bed.borders), // Convert Set to Array
            })),
            currentPlanName: state.currentPlanName,
        };
    }

    /**
     * Load state from saved data
     */
    function deserialize(data) {
        if (!data || !data.beds) return;

        state.beds = data.beds.map(bed => ({
            ...bed,
            borders: new Set(bed.borders || []),
            // Migrate cells: convert legacy single-planting to multi-planting format
            cells: (bed.cells || []).map(cell => {
                if (!cell) return null;
                // Already in new format
                if (cell.plantings) return cell;
                // Legacy format: { plantId, variety, activeMonths }
                if (cell.plantId) {
                    return {
                        plantings: [{
                            plantId: cell.plantId,
                            variety: cell.variety || '',
                            activeMonths: cell.activeMonths || Array.from({length: 12}, (_, i) => i),
                        }]
                    };
                }
                return null;
            }),
        }));

        state.currentPlanName = data.currentPlanName || 'default';

        emit('stateLoaded', get());
        emit('bedsChange', state.beds);
    }

    /**
     * Clear all beds
     */
    function clearAll() {
        state.beds = [];
        state.currentPlanName = 'default';
        emit('bedsChange', state.beds);
    }

    // Public API
    return {
        get,
        getProperty,
        set,
        subscribe,
        emit,

        // Beds
        addBed,
        removeBed,
        getBed,
        updateBed,
        resizeBed,

        // Cells
        placeCell,
        addPlanting,
        removePlanting,
        updatePlantingMonths,
        updatePlantingVariety,
        clearCell,
        getCell,
        getActivePlanting,
        getAllPlantings,

        // Borders
        toggleBorder,
        setBorder,
        hasBorder,
        applyBordersToRect,

        // Serialization
        serialize,
        deserialize,
        clearAll,

        // Undo
        undo,
        canUndo,
    };
})();
