/**
 * Garden Module
 * Handles bed rendering, cell interactions, and drag & drop
 */

const Garden = (() => {
    const gardenArea = document.getElementById('garden-area');

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /**
     * Initialize garden module
     */
    function init() {
        if (!gardenArea) return;

        // Subscribe to state changes
        State.subscribe('bedsChange', renderAll);
        State.subscribe('viewMonthChange', updateVisibility);

        // Initial render
        renderAll();
    }

    /**
     * Render all beds
     */
    function renderAll() {
        if (!gardenArea) return;

        const beds = State.getProperty('beds');

        if (beds.length === 0) {
            gardenArea.innerHTML = `
        <div class="garden-empty">
          <div class="garden-empty-icon">🌱</div>
          <h3>No garden beds yet</h3>
          <p>Click "Add Area" to create your first area</p>
        </div>
      `;
            return;
        }

        gardenArea.innerHTML = beds.map(bed => renderBed(bed)).join('');

        // Attach event handlers
        attachBedHandlers();
    }

    /**
     * Render a single bed
     */
    function renderBed(bed) {
        const sfgMode = State.getProperty('sfgMode');
        const viewMonth = State.getProperty('viewMonth');

        const cellsHtml = bed.cells.map((cell, index) => {
            const activePlanting = State.getActivePlanting(bed.id, index, viewMonth);
            const plant = activePlanting ? Plants.getPlant(activePlanting.plantId) : null;
            const allPlantings = State.getAllPlantings(bed.id, index);
            const hasMultiple = allPlantings.length > 1;
            const isVisible = !!activePlanting;

            return `
        <div class="cell" 
             data-bed-id="${bed.id}" 
             data-cell-index="${index}"
             data-visible="${isVisible}">
          ${plant ? `
            <img class="cell-plant"
                 src="icons/${escapeHtml(plant.file || plant.id + '.svg')}"
                 alt="${escapeHtml(plant.label)}">
            ${sfgMode && plant.perSquare ? `<span class="cell-badge">${plant.perSquare}</span>` : ''}
            ${activePlanting.variety ? `<span class="cell-variety">${escapeHtml(activePlanting.variety)}</span>` : ''}
          ` : ''}
          ${hasMultiple ? `<span class="cell-multi-badge" title="${allPlantings.length} plantings">${allPlantings.length}</span>` : ''}
        </div>
      `;
        }).join('');

        return `
      <div class="bed" data-bed-id="${bed.id}">
        <div class="bed-header">
          <span class="bed-name">${escapeHtml(bed.name)}</span>
          <div class="bed-actions">
            <button class="btn btn-notes" data-action="notes" title="Area Notes">${bed.notes ? '📝' : '🗒️'}</button>
            <button class="btn btn-rename" data-action="rename">Rename</button>
            <button class="btn btn-resize" data-action="resize">Resize</button>
            <button class="btn btn-delete" data-action="delete">×</button>
          </div>
        </div>
        <div class="bed-grid" style="grid-template-columns: repeat(${bed.width}, 60px);">
          ${cellsHtml}
        </div>
      </div>
    `;
    }

    /**
     * Attach event handlers to beds
     */
    function attachBedHandlers() {
        const beds = gardenArea.querySelectorAll('.bed');

        beds.forEach(bedEl => {
            const bedId = bedEl.dataset.bedId;

            // Bed action buttons
            bedEl.querySelectorAll('.bed-actions .btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleBedAction(bedId, btn.dataset.action);
                });
            });

            // Cell handlers
            const cells = bedEl.querySelectorAll('.cell');
            cells.forEach(cellEl => {
                const cellIndex = parseInt(cellEl.dataset.cellIndex);

                // Drag & drop
                cellEl.addEventListener('dragover', handleDragOver);
                cellEl.addEventListener('dragleave', handleDragLeave);
                cellEl.addEventListener('drop', (e) => handleDrop(e, bedId, cellIndex));

                // Click to edit
                cellEl.addEventListener('click', (e) => handleCellClick(e, bedId, cellIndex));

                // Border mode handlers
                cellEl.addEventListener('mousedown', (e) => {
                    if (e.button === 0) Borders.startDrawing(bedId, cellIndex, cellEl);
                });
                cellEl.addEventListener('mouseenter', () => {
                    Borders.updateDrawing(bedId, cellIndex);
                });
                cellEl.addEventListener('mouseup', () => {
                    Borders.finishDrawing(bedId, cellIndex);
                });

                // Render borders for this cell
                Borders.renderCellBorders(bedId, cellIndex, cellEl);
            });
        });

        // Global mouseup to cancel border drawing
        document.addEventListener('mouseup', () => {
            Borders.cancelDrawing();
        });
    }

    /**
     * Handle bed action buttons
     */
    function handleBedAction(bedId, action) {
        switch (action) {
            case 'rename':
                const bed = State.getBed(bedId);
                const newName = prompt('Enter new name:', bed?.name || '');
                if (newName && newName.trim()) {
                    State.updateBed(bedId, { name: newName.trim() });
                }
                break;

            case 'resize':
                App.openResizeModal(bedId);
                break;

            case 'notes':
                App.openBedNotes(bedId);
                break;

            case 'delete':
                if (confirm('Delete this area?')) {
                    State.removeBed(bedId);
                }
                break;
        }
    }

    /**
     * Handle drag over cell
     */
    function handleDragOver(e) {
        if (State.getProperty('mode') !== 'plant') return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        e.currentTarget.classList.add('dragover');
    }

    /**
     * Handle drag leave cell
     */
    function handleDragLeave(e) {
        e.currentTarget.classList.remove('dragover');
    }

    /**
     * Handle drop on cell
     */
    function handleDrop(e, bedId, cellIndex) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');

        if (State.getProperty('mode') !== 'plant') return;

        const plantId = e.dataTransfer.getData('text/plain');
        if (!plantId) return;

        // Place the plant for the current view month
        State.placeCell(bedId, cellIndex, plantId);

        // Toast notification
        const plant = Plants.getPlant(plantId);
        if (plant) {
            App.showToast(`Planted ${plant.label}`, 'success');
        }
    }

    /**
     * Handle cell click - select for copy/paste, double-click to edit
     */
    function handleCellClick(e, bedId, cellIndex) {
        if (State.getProperty('mode') === 'border') return;

        // Always select the cell for copy/paste operations
        App.selectCell(bedId, cellIndex);

        const cell = State.getCell(bedId, cellIndex);

        // Double-click opens edit modal for cells with plantings
        if (e.detail === 2 && cell) {
            App.openCellEditModal(bedId, cellIndex);
        }
    }

    /**
     * Update visibility based on current month
     */
    function updateVisibility() {
        const viewMonth = State.getProperty('viewMonth');
        const cells = gardenArea.querySelectorAll('.cell[data-bed-id]');

        cells.forEach(cellEl => {
            const bedId = cellEl.dataset.bedId;
            const cellIndex = parseInt(cellEl.dataset.cellIndex);
            const activePlanting = State.getActivePlanting(bedId, cellIndex, viewMonth);
            const plant = activePlanting ? Plants.getPlant(activePlanting.plantId) : null;

            cellEl.dataset.visible = !!activePlanting;

            // Update the cell content for the active planting
            const existingImg = cellEl.querySelector('.cell-plant');
            if (plant) {
                if (existingImg) {
                    existingImg.src = `icons/${plant.file || plant.id + '.svg'}`;
                    existingImg.alt = plant.label;
                } else {
                    const img = document.createElement('img');
                    img.className = 'cell-plant';
                    img.src = `icons/${plant.file || plant.id + '.svg'}`;
                    img.alt = plant.label;
                    cellEl.prepend(img);
                }
            } else {
                if (existingImg) existingImg.remove();
            }
        });
    }

    /**
     * Render borders for a specific bed
     */
    function renderBedBorders(bedId) {
        const bedEl = gardenArea.querySelector(`.bed[data-bed-id="${bedId}"]`);
        if (!bedEl) return;

        const cells = bedEl.querySelectorAll('.cell');
        cells.forEach(cellEl => {
            const cellIndex = parseInt(cellEl.dataset.cellIndex);
            Borders.renderCellBorders(bedId, cellIndex, cellEl);
        });
    }

    // Public API
    return {
        init,
        renderAll,
        renderBed,
        renderBedBorders,
        updateVisibility,
    };
})();
