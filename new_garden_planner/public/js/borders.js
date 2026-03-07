/**
 * Borders Module
 * Handles border drawing mode with rectangle selection
 * CRITICAL: Borders are stored SEPARATELY from cells to prevent overwriting
 */

const Borders = (() => {
    let isDrawing = false;
    let startCell = null;
    let startBedId = null;
    let selectionRect = null;

    /**
     * Initialize border mode handlers
     */
    function init() {
        const gardenArea = document.getElementById('garden-area');
        if (!gardenArea) return;

        // Listen for border mode changes
        State.subscribe('modeChange', (mode) => {
            gardenArea.classList.toggle('border-mode', mode === 'border');
            if (mode !== 'border') {
                cancelDrawing();
            }
        });
    }

    /**
     * Handle mouse down on a cell (start drawing)
     */
    function startDrawing(bedId, cellIndex, cellEl) {
        if (State.getProperty('mode') !== 'border') return;

        isDrawing = true;
        startBedId = bedId;
        startCell = cellIndex;

        // Create selection rectangle overlay
        const bed = State.getBed(bedId);
        if (!bed) return;

        const gridEl = cellEl.closest('.bed-grid');
        if (!gridEl) return;

        selectionRect = document.createElement('div');
        selectionRect.className = 'border-selection';
        gridEl.appendChild(selectionRect);

        updateSelectionRect(bedId, cellIndex, cellIndex);
    }

    /**
     * Handle mouse move (update selection)
     */
    function updateDrawing(bedId, cellIndex) {
        if (!isDrawing || bedId !== startBedId || !selectionRect) return;

        updateSelectionRect(startBedId, startCell, cellIndex);
    }

    /**
     * Handle mouse up (finish drawing)
     */
    function finishDrawing(bedId, cellIndex) {
        if (!isDrawing || bedId !== startBedId) {
            cancelDrawing();
            return;
        }

        const bed = State.getBed(bedId);
        if (!bed) {
            cancelDrawing();
            return;
        }

        // Calculate rectangle bounds
        const startX = startCell % bed.width;
        const startY = Math.floor(startCell / bed.width);
        const endX = cellIndex % bed.width;
        const endY = Math.floor(cellIndex / bed.width);

        // Apply borders to rectangle
        State.applyBordersToRect(bedId, startX, startY, endX, endY);

        // Cleanup
        cancelDrawing();

        // Re-render borders
        Garden.renderBedBorders(bedId);
    }

    /**
     * Cancel drawing operation
     */
    function cancelDrawing() {
        isDrawing = false;
        startCell = null;
        startBedId = null;

        if (selectionRect) {
            selectionRect.remove();
            selectionRect = null;
        }
    }

    /**
     * Update selection rectangle position
     */
    function updateSelectionRect(bedId, startIdx, endIdx) {
        if (!selectionRect) return;

        const bed = State.getBed(bedId);
        if (!bed) return;

        const startX = startIdx % bed.width;
        const startY = Math.floor(startIdx / bed.width);
        const endX = endIdx % bed.width;
        const endY = Math.floor(endIdx / bed.width);

        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);

        // Calculate position (assuming 60px cells + 2px gap)
        const cellSize = 60;
        const gap = 2;
        const padding = 3;

        const left = minX * (cellSize + gap) + padding;
        const top = minY * (cellSize + gap) + padding;
        const width = (maxX - minX + 1) * (cellSize + gap) - gap;
        const height = (maxY - minY + 1) * (cellSize + gap) - gap;

        selectionRect.style.left = `${left}px`;
        selectionRect.style.top = `${top}px`;
        selectionRect.style.width = `${width}px`;
        selectionRect.style.height = `${height}px`;
    }

    /**
     * Render borders for a cell
     */
    function renderCellBorders(bedId, cellIndex, cellEl) {
        const bed = State.getBed(bedId);
        if (!bed || !cellEl) return;

        // Check each border side
        const sides = ['top', 'right', 'bottom', 'left'];
        const activeBorders = [];

        sides.forEach(side => {
            const hasBorder = bed.borders.has(`${cellIndex}-${side}`);
            cellEl.classList.toggle(`border-${side}`, hasBorder);
            if (hasBorder) activeBorders.push(side);
        });

        // For multiple borders, we need to use a combined box-shadow
        if (activeBorders.length > 1) {
            const shadows = [];
            const borderColor = 'var(--color-secondary)';
            const borderWidth = 3;

            if (activeBorders.includes('top')) {
                shadows.push(`inset 0 ${borderWidth}px 0 0 ${borderColor}`);
            }
            if (activeBorders.includes('right')) {
                shadows.push(`inset -${borderWidth}px 0 0 0 ${borderColor}`);
            }
            if (activeBorders.includes('bottom')) {
                shadows.push(`inset 0 -${borderWidth}px 0 0 ${borderColor}`);
            }
            if (activeBorders.includes('left')) {
                shadows.push(`inset ${borderWidth}px 0 0 0 ${borderColor}`);
            }

            cellEl.style.boxShadow = shadows.join(', ');
        } else if (activeBorders.length === 1) {
            // Single border uses the CSS class
            cellEl.style.boxShadow = '';
        } else {
            cellEl.style.boxShadow = '';
        }
    }

    // Public API
    return {
        init,
        startDrawing,
        updateDrawing,
        finishDrawing,
        cancelDrawing,
        renderCellBorders,
    };
})();
