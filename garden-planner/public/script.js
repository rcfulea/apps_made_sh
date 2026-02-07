// Advanced garden planner client‑side logic supporting multiple beds,
// a larger plant palette, plant details, borders and square foot gardening.

// Plant palette definition. Each entry contains:
// id – unique identifier used internally.
// label – human‑readable name to display.
// emoji – an emoji to represent the plant.
// perSquare – recommended number of plants per square foot when
//             following Square Foot Gardening guidelines. Values come
//             from sources such as community garden cheat sheets and
//             plant spacing charts【440588930283035†L40-L103】【418397088487431†L130-L181】.
// Plant palette definition.
// This list is now populated exclusively from the server via /api/custom-plants.
// Hardcoded emoji plants have been removed.
let PLANTS = [];
let draggedPlantDef = null;

// Constant Month Names
// Constant Month Names
// Constant Month Names
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// DOM references
const loginPanel = document.getElementById('login-panel');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const appContainer = document.getElementById('app');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const plantsContainer = document.getElementById('plants');
const plantSearchInput = document.getElementById('plant-search');
const addBedBtn = document.getElementById('add-bed');
const loadGardenBtn = document.getElementById('load-garden');
const saveGardenBtn = document.getElementById('save-garden');
const sfgCheckbox = document.getElementById('toggle-sfg');
const borderModeCheckbox = document.getElementById('border-mode');
const gardenArea = document.getElementById('garden-area');

// Additional UI elements for advanced features
const savePlanBtn = document.getElementById('save-plan');
const managePlansBtn = document.getElementById('manage-plans');
const managePlantsBtn = document.getElementById('manage-plants');
// Summary button and overlay elements
const summaryBtn = document.getElementById('summary-btn');
const summaryOverlay = document.getElementById('summary-overlay');
const summaryList = document.getElementById('summary-list');
const summaryCloseBtn = document.getElementById('summary-close');
// Replaced select with slider:
const monthSlider = document.getElementById('month-slider');
const currentMonthDisplay = document.getElementById('current-month-display');
const monthLabels = document.getElementById('month-labels');
const copyIndicator = document.getElementById('copy-indicator');
const cancelCopyBtn = document.getElementById('cancel-copy');
const plansOverlay = document.getElementById('plans-overlay');
const plansList = document.getElementById('plans-list');
const plansCloseBtn = document.getElementById('plans-close');
const plantsOverlay = document.getElementById('plants-overlay');
const customPlantsList = document.getElementById('custom-plants-list');
const newPlantNameInput = document.getElementById('new-plant-name');
const newPlantCountInput = document.getElementById('new-plant-count');
const newPlantFileInput = document.getElementById('new-plant-file');
const addCustomPlantBtn = document.getElementById('add-custom-plant');
const plantsCloseBtn = document.getElementById('plants-close');

const bedWidthInput = document.getElementById('bed-width');
const bedHeightInput = document.getElementById('bed-height');
const cellSizeInput = document.getElementById('cell-size');

// State variables
let beds = [];
let squareFootMode = false;
let borderMode = false;

// Border drag state for rectangle drawing
let borderDragStart = null; // {bed, row, col} of drag start
let isBorderDragging = false;

// Clipboard for copy/paste of plant configurations
let clipboardPlant = null;
let copyMode = false;

// Map of overrides for built‑in plants (id -> { label, perSquare, file })
let plantOverrides = {};

// ===== UNDO/REDO SYSTEM =====
// Action types: 'placePlant', 'removePlant', 'addBed', 'deleteBed'
let actionHistory = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

// DOM references for undo/redo buttons
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');

// Push an action onto the history stack
function pushAction(action) {
  // If we're not at the end of history, truncate future actions
  if (historyIndex < actionHistory.length - 1) {
    actionHistory = actionHistory.slice(0, historyIndex + 1);
  }
  actionHistory.push(action);
  // Limit history size
  if (actionHistory.length > MAX_HISTORY) {
    actionHistory.shift();
  } else {
    historyIndex++;
  }
  updateUndoRedoButtons();
}

// Update button states based on history position
function updateUndoRedoButtons() {
  if (undoBtn) undoBtn.disabled = historyIndex < 0;
  if (redoBtn) redoBtn.disabled = historyIndex >= actionHistory.length - 1;
}

// Undo the last action
function undo() {
  if (historyIndex < 0) return;
  const action = actionHistory[historyIndex];
  historyIndex--;
  executeAction(action, true); // true = reverse
  updateUndoRedoButtons();
}

// Redo the next action
function redo() {
  if (historyIndex >= actionHistory.length - 1) return;
  historyIndex++;
  const action = actionHistory[historyIndex];
  executeAction(action, false); // false = forward
  updateUndoRedoButtons();
}

// Execute or reverse an action
function executeAction(action, reverse) {
  switch (action.type) {
    case 'placePlant':
      if (reverse) {
        // Remove the plant that was placed
        const bed = beds.find(b => b.id === action.bedId);
        if (bed && bed.plants[action.cellKey]) {
          // Remove the specific plant record
          bed.plants[action.cellKey] = bed.plants[action.cellKey].filter(
            p => p.date !== action.plantRecord.date
          );
          if (bed.plants[action.cellKey].length === 0) {
            delete bed.plants[action.cellKey];
          }
        }
        applyMonthFilter();
      } else {
        // Re-place the plant
        const bed = beds.find(b => b.id === action.bedId);
        if (bed) {
          if (!bed.plants[action.cellKey]) {
            bed.plants[action.cellKey] = [];
          }
          bed.plants[action.cellKey].push(action.plantRecord);
          applyMonthFilter();
        }
      }
      break;

    case 'removePlant':
      if (reverse) {
        // Restore the removed plants
        const bed = beds.find(b => b.id === action.bedId);
        if (bed) {
          bed.plants[action.cellKey] = action.removedPlants;
          applyMonthFilter();
        }
      } else {
        // Re-remove the plants
        const bed = beds.find(b => b.id === action.bedId);
        if (bed) {
          delete bed.plants[action.cellKey];
          applyMonthFilter();
        }
      }
      break;

    case 'addBed':
      if (reverse) {
        // Remove the bed
        const bed = beds.find(b => b.id === action.bedId);
        if (bed) {
          const index = beds.indexOf(bed);
          if (index !== -1) beds.splice(index, 1);
          if (bed.wrapperEl && bed.wrapperEl.parentNode) {
            bed.wrapperEl.parentNode.removeChild(bed.wrapperEl);
          }
        }
      } else {
        // Re-add the bed
        beds.push(action.bedData);
        createGridForBed(action.bedData);
      }
      break;

    case 'deleteBed':
      if (reverse) {
        // Restore the deleted bed
        beds.splice(action.bedIndex, 0, action.bedData);
        createGridForBed(action.bedData);
        // Re-render plants
        applyMonthFilter();
      } else {
        // Re-delete the bed
        const bed = beds.find(b => b.id === action.bedData.id);
        if (bed) {
          const index = beds.indexOf(bed);
          if (index !== -1) beds.splice(index, 1);
          if (bed.wrapperEl && bed.wrapperEl.parentNode) {
            bed.wrapperEl.parentNode.removeChild(bed.wrapperEl);
          }
        }
      }
      break;
  }
}

// Bind undo/redo buttons
if (undoBtn) undoBtn.addEventListener('click', undo);
if (redoBtn) redoBtn.addEventListener('click', redo);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
  }
});
// ===== END UNDO/REDO SYSTEM =====

// ===== RENAME MODAL SYSTEM =====
const renameOverlay = document.getElementById('rename-overlay');
const renameInput = document.getElementById('rename-input');
const renameSaveBtn = document.getElementById('rename-save');
const renameCancelBtn = document.getElementById('rename-cancel');

let currentRenameBed = null;
let currentRenameLabelNode = null;

function openRenameModal(bed, labelNode) {
  currentRenameBed = bed;
  currentRenameLabelNode = labelNode;
  if (renameInput) renameInput.value = bed.name || '';
  if (renameOverlay) renameOverlay.classList.remove('hidden');
  if (renameInput) renameInput.focus();
}

function closeRenameModal() {
  if (renameOverlay) renameOverlay.classList.add('hidden');
  currentRenameBed = null;
  currentRenameLabelNode = null;
}

function saveRename() {
  if (currentRenameBed && renameInput && renameInput.value.trim()) {
    currentRenameBed.name = renameInput.value.trim();
    if (currentRenameLabelNode) {
      currentRenameLabelNode.textContent = currentRenameBed.name;
    }
  }
  closeRenameModal();
}

// Event handlers for rename modal
if (renameSaveBtn) renameSaveBtn.addEventListener('click', saveRename);
if (renameCancelBtn) renameCancelBtn.addEventListener('click', closeRenameModal);
if (renameInput) {
  renameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveRename();
    if (e.key === 'Escape') closeRenameModal();
  });
}
if (renameOverlay) {
  renameOverlay.addEventListener('click', (e) => {
    if (e.target === renameOverlay) closeRenameModal();
  });
}
// ===== END RENAME MODAL SYSTEM =====

// ===== RESIZE MODAL SYSTEM =====
const resizeOverlay = document.getElementById('resize-overlay');
const resizeWidthInput = document.getElementById('resize-width');
const resizeHeightInput = document.getElementById('resize-height');
const resizeCellSizeInput = document.getElementById('resize-cellsize');
const resizeSaveBtn = document.getElementById('resize-save');
const resizeCancelBtn = document.getElementById('resize-cancel');

let currentResizeBed = null;

function openResizeModal(bed) {
  currentResizeBed = bed;
  if (resizeWidthInput) resizeWidthInput.value = bed.config.widthMeters;
  if (resizeHeightInput) resizeHeightInput.value = bed.config.heightMeters;
  if (resizeCellSizeInput) resizeCellSizeInput.value = bed.config.cellSizeCm;
  if (resizeOverlay) resizeOverlay.classList.remove('hidden');
  if (resizeWidthInput) resizeWidthInput.focus();
}

function closeResizeModal() {
  if (resizeOverlay) resizeOverlay.classList.add('hidden');
  currentResizeBed = null;
}

function saveResize() {
  if (!currentResizeBed || !resizeWidthInput || !resizeHeightInput || !resizeCellSizeInput) {
    closeResizeModal();
    return;
  }

  const widthMeters = parseFloat(resizeWidthInput.value);
  const heightMeters = parseFloat(resizeHeightInput.value);
  const cellSizeCm = parseFloat(resizeCellSizeInput.value);

  if (!widthMeters || !heightMeters || !cellSizeCm || widthMeters <= 0 || heightMeters <= 0 || cellSizeCm <= 0) {
    alert('Please provide valid dimensions.');
    return;
  }

  const newCols = Math.floor((widthMeters * 100) / cellSizeCm);
  const newRows = Math.floor((heightMeters * 100) / cellSizeCm);

  if (newCols <= 0 || newRows <= 0) {
    alert('Bed is too small for the specified cell size.');
    return;
  }

  const bed = currentResizeBed;

  // Update bed config
  bed.config.widthMeters = widthMeters;
  bed.config.heightMeters = heightMeters;
  bed.config.cellSizeCm = cellSizeCm;
  bed.config.rows = newRows;
  bed.config.cols = newCols;

  // Remove plants that are outside the new grid
  const plantsToRemove = [];
  Object.keys(bed.plants).forEach(key => {
    const [r, c] = key.split(',').map(Number);
    if (r >= newRows || c >= newCols) {
      plantsToRemove.push(key);
    }
  });
  plantsToRemove.forEach(key => delete bed.plants[key]);

  // Remove borders that are outside the new grid
  const bordersToRemove = [];
  Object.keys(bed.borders).forEach(key => {
    const [r, c] = key.split(',').map(Number);
    if (r >= newRows || c >= newCols) {
      bordersToRemove.push(key);
    }
  });
  bordersToRemove.forEach(key => delete bed.borders[key]);

  // Rebuild the grid DOM
  if (bed.wrapperEl && bed.wrapperEl.parentNode) {
    bed.wrapperEl.parentNode.removeChild(bed.wrapperEl);
  }
  createGridForBed(bed);

  // Re-apply plants and borders to the new grid
  Object.keys(bed.plants).forEach(key => {
    const [r, c] = key.split(',').map(Number);
    const cell = bed.gridEl.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
    if (cell) {
      const records = bed.plants[key];
      const plantRecords = Array.isArray(records) ? records : [records];
      if (plantRecords.length > 0) {
        const plantDef = PLANTS.find(p => p.id === plantRecords[0].plantId);
        if (plantDef) {
          const plantEl = document.createElement('div');
          plantEl.className = 'plant';
          if (plantDef.icon) {
            plantEl.innerHTML = `<img src="${plantDef.icon}" alt="${plantDef.label}" style="width:100%;height:100%;object-fit:contain;" />`;
          } else {
            plantEl.textContent = plantDef.emoji || '🌱';
          }
          cell.appendChild(plantEl);
        }
      }
    }
  });

  Object.keys(bed.borders).forEach(key => {
    if (bed.borders[key]) {
      const [r, c] = key.split(',').map(Number);
      const cell = bed.gridEl.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
      if (cell) cell.classList.add('border-active');
    }
  });

  // Apply month filter
  applyMonthFilter();

  closeResizeModal();
}

// Event handlers for resize modal
if (resizeSaveBtn) resizeSaveBtn.addEventListener('click', saveResize);
if (resizeCancelBtn) resizeCancelBtn.addEventListener('click', closeResizeModal);
if (resizeOverlay) {
  resizeOverlay.addEventListener('click', (e) => {
    if (e.target === resizeOverlay) closeResizeModal();
  });
}
// ===== END RESIZE MODAL SYSTEM =====

// Enable copy mode: show the copy indicator and set copy flag
function enableCopyMode() {
  copyMode = true;
  if (copyIndicator) {
    copyIndicator.classList.remove('hidden');
  }
}

// Cancel copy mode: clear clipboard and hide the indicator
function cancelCopyMode() {
  copyMode = false;
  clipboardPlant = null;
  if (copyIndicator) {
    copyIndicator.classList.add('hidden');
  }
}

// Copy the current plant details (plantId, variety, date, months, timing) into the clipboard
function copyPlantDetails() {
  if (!currentEditing) return;
  const { bed, cell } = currentEditing;
  const key = `${cell.dataset.row},${cell.dataset.col}`;
  let info = bed.plants[key];
  if (!info) return;

  // Handle array format (succession planting) - copy the first/active plant
  if (Array.isArray(info)) {
    if (info.length === 0) return;
    info = info[0]; // Copy the first plant entry
  }

  clipboardPlant = {
    plantId: info.plantId,
    variety: info.variety || '',
    date: info.date || '',
    months: Array.isArray(info.months) ? [...info.months] : [],
    startWeek: info.startWeek,
    endWeek: info.endWeek
  };
  enableCopyMode();
  closePlantDetailsDialog();
}

// Paste the plant stored in the clipboard into the target cell. This
// preserves the copied variety/date/months/timing and sets the tooltip.
function pastePlantInCell(bed, cell) {
  if (!clipboardPlant) return;
  const { plantId, variety, date, months, startWeek, endWeek } = clipboardPlant;

  const key = `${cell.dataset.row},${cell.dataset.col}`;

  // Create new plant record preserving copied timing
  const newRecord = {
    plantId,
    variety: variety || '',
    date: new Date().toISOString(),
    months: Array.isArray(months) ? [...months] : [],
    startWeek: startWeek,
    endWeek: endWeek
  };

  // Initialize or get existing plants array
  if (!bed.plants[key]) {
    bed.plants[key] = [];
  } else if (!Array.isArray(bed.plants[key])) {
    // Migrate old format
    const old = bed.plants[key];
    bed.plants[key] = [old];
  }

  // Check for collision (same as placePlantInCell)
  const hasCollision = bed.plants[key].some(p => {
    if (newRecord.startWeek === undefined || p.startWeek === undefined) {
      return false;
    }
    return newRecord.startWeek < p.endWeek && newRecord.endWeek > p.startWeek;
  });

  if (hasCollision) {
    alert('Cannot paste here: Another crop is growing during this time.');
    return;
  }

  // Add the plant
  bed.plants[key].push(newRecord);

  // Track action for undo/redo
  pushAction({
    type: 'placePlant',
    bedId: bed.id,
    cellKey: key,
    plantRecord: { ...newRecord }
  });

  // Refresh view and update tooltip
  applyMonthFilter();
  setPlantDetailsTooltip(bed, cell);
  // Keep copy mode active so user can paste repeatedly
}

// Apply a month filter to the entire garden. When `month` is
// 'all', all plants are shown normally. Otherwise, plants whose
// months array does not include the selected month will appear
// faded. This function iterates all beds and their plants.
// Apply a month filter to the entire garden.
// Logic:
// 1. If user manually selected months for a specific plant (override), use that.
// 2. Otherwise, calculate active range:
//    - Start: LAST_FROST_WEEK (18) + sowOffset (indoor or outdoor)
//    - End: Start + harvest duration
//    - Convert weeks to months (week / 4)
function applyMonthFilter() {
  // Constants
  const LAST_FROST_WEEK = 18; // Early May (Week 18 of 52)
  const WEEKS_PER_MONTH = 4.3; // Average

  // Helper to map month name to index (0-11)
  const monthIndex = (m) => {
    // Check match against short or long names to be robust 
    const idx = MONTH_NAMES.indexOf(m);
    if (idx !== -1) return idx;
    // Try first 3 chars
    return MONTH_NAMES.findIndex(mn => mn.startsWith(m.substring(0, 3)));
  };

  // If we are using the slider, the value is an index (0-11)
  // If no slider (legacy), use 'all' or month name
  let currentMonthIdx = -1; // -1 means all
  let currentMonthName = 'all';

  if (monthSlider) {
    currentMonthIdx = parseInt(monthSlider.value, 10);
    if (isNaN(currentMonthIdx)) currentMonthIdx = 0; // Safety

    currentMonthName = MONTH_NAMES[currentMonthIdx];

    // Full names for display
    // Update display text
    if (currentMonthDisplay) {
      if (currentMonthIdx === -1) {
        currentMonthDisplay.textContent = 'Year Round (All)';
      } else {
        currentMonthDisplay.textContent = currentMonthName;
      }
    }
    // Highlight label
    if (monthLabels) {
      const targetIdx = currentMonthIdx + 1; // -1 -> 0 (All), 0 -> 1 (Jan), ...
      Array.from(monthLabels.children).forEach((span, idx) => {
        if (idx === targetIdx) {
          span.classList.add('active');
          span.style.color = '#2e7d32';
          span.style.fontWeight = 'bold';
          // Add border/bg if it's the "All" label (idx 0)
          if (idx === 0) {
            span.style.backgroundColor = '#d4edda';
            span.style.borderColor = '#2e7d32';
          }
        } else {
          span.classList.remove('active');
          span.style.color = '#666';
          span.style.fontWeight = 'normal';
          if (idx === 0) {
            span.style.backgroundColor = 'transparent'; // or #f0f0f0
            span.style.borderColor = 'transparent';
          }
        }
      });
    }
  }

  beds.forEach((bed) => {
    const grid = bed.gridEl;
    if (!grid) return;
    const cells = grid.querySelectorAll('.cell');

    cells.forEach((cell) => {
      const key = `${cell.dataset.row},${cell.dataset.col}`;
      const info = bed.plants[key];
      // Reset classes
      cell.classList.remove('month-hidden', 'month-ended');

      // If no data, clear cell
      if (!info) {
        cell.innerHTML = ''; // Clear content
        cell.className = 'cell'; // Reset classes
        cell.dataset.row = cell.dataset.row; // Maintain data attrs
        return;
      }

      // If no data, clear cell
      if (!info) {
        cell.innerHTML = ''; // Clear content
        cell.className = 'cell'; // Reset classes
        cell.dataset.row = cell.dataset.row; // Maintain data attrs (simplified reset)
        return;
      }

      // Normalize to array
      let records = Array.isArray(info) ? info : [info];
      if (records.length === 0) {
        cell.innerHTML = '';
        return;
      }

      // Find which plant is visible for currentMonthIdx
      const WEEKS_PER_MONTH = 52 / 12;
      // Convert currentMonthIdx to a Week range (Start of month to End of month)
      // Actually simpler: just pick the middle of the month?
      const checkWeek = (currentMonthIdx * WEEKS_PER_MONTH) + 2;

      let activeRecord = null;
      let ghostRecord = null;

      // 1. Find ACTIVE
      activeRecord = records.find(r => {
        // Feature: If slider is at -1 (All), SHOW EVERYTHING.
        if (currentMonthIdx === -1) return true;

        // PRIORITY 1: Check the 'months' array (set via plant details dialog)
        // If months array EXISTS and HAS VALUES, use it for visibility
        if (r.months && r.months.length > 0) {
          const shortName = currentMonthName.substring(0, 3);
          return r.months.some(m => m === currentMonthName || m === shortName);
        }

        // PRIORITY 2: If no months are set, show the plant ALWAYS
        // (User expectation: "if no months are selected then display it always")
        if (!r.months || r.months.length === 0) {
          return true;
        }

        // PRIORITY 3 (Fallback): Time-based check using startWeek/endWeek
        let s = r.startWeek || 0;
        let e = r.endWeek || 52;
        return checkWeek >= s && checkWeek <= e;
      });

      // 2. REMOVED: Ghost display logic. 
      // User requested: If plant has a specific month, only show it in that month.
      // If no month was set (All mode), show it always.

      // If no active record, leave cell empty
      if (!activeRecord) {
        cell.innerHTML = '';
        cell.classList.remove('month-hidden', 'month-ended', 'dragover', 'companion-good', 'companion-bad');
        return;
      }

      const recordToShow = activeRecord;
      cell.innerHTML = ''; // Clear previous
      cell.classList.remove('month-hidden', 'month-ended', 'dragover', 'companion-good', 'companion-bad'); // Reset

      // Render the Plant
      const plantDef = PLANTS.find(p => p.id === recordToShow.plantId);
      if (!plantDef) return;

      const wrapper = document.createElement('span');
      wrapper.className = 'plant';

      if (plantDef.icon) {
        const imgEl = document.createElement('img');
        imgEl.src = plantDef.icon;
        imgEl.alt = plantDef.label;
        imgEl.style.width = '24px';
        imgEl.style.height = '24px';
        wrapper.appendChild(imgEl);
      } else {
        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'plant-emoji';
        emojiSpan.textContent = plantDef.emoji;
        wrapper.appendChild(emojiSpan);
      }

      // Count overlay
      const countSpan = document.createElement('span');
      countSpan.className = 'plant-count';
      if (squareFootMode && (plantDef.category !== 'infrastructure' || plantDef.perSquare > 1)) {
        countSpan.textContent = plantDef.perSquare;
      }
      wrapper.appendChild(countSpan);

      // Tooltip: Show Sequence?
      // "Radish (Active) \n Lettuce (Future)"
      let tooltip = `${plantDef.label}`;
      if (recordToShow.startWeek !== undefined) {
        const startM = Math.floor(recordToShow.startWeek / WEEKS_PER_MONTH);
        const endM = Math.floor(recordToShow.endWeek / WEEKS_PER_MONTH);
        const mName = (i) => MONTH_NAMES[Math.min(11, Math.max(0, i))];
        tooltip += ` (${mName(startM)}-${mName(endM)})`;
      }
      // Add info about other plants in this cell
      if (records.length > 1) {
        tooltip += '\n-- Sequence --';
        records.sort((a, b) => a.startWeek - b.startWeek).forEach(r => {
          const p = PLANTS.find(x => x.id === r.plantId);
          if (p) tooltip += `\n${p.label}`;
        });
      }
      wrapper.title = tooltip;

      cell.appendChild(wrapper);

      if (!activeRecord && ghostRecord) {
        cell.classList.add('month-ended');
      }
      // Note: We don't apply 'month-hidden' because we simply don't render future/gap plants.
    });
  });
}

// Note: Month slider event listeners are set up at the bottom of the file with debouncing

// Compute a summary of all plants across all beds. The summary groups plant
// placements by plant ID, variety and months combination and counts how many
// cells contain each group. It returns an array of objects with fields:
// { label, variety, months: [..], count }.
function computeSummaryData() {
  const summaryMap = {};
  beds.forEach((bed) => {
    const plantsMap = bed.plants || {};
    Object.keys(plantsMap).forEach((cellKey) => {
      const info = plantsMap[cellKey];
      let records = [];
      if (Array.isArray(info)) {
        records = info;
      } else if (typeof info === 'string') {
        records = [{ plantId: info }];
      } else if (info) {
        records = [info];
      }

      records.forEach((rec) => {
        if (!rec || !rec.plantId) return;

        let variety = rec.variety || '';
        let monthsArr = Array.isArray(rec.months) ? rec.months : [];
        let plantId = rec.plantId;

        // Determine plant label (check overrides first, then built‑in)
        let label = plantId;
        if (plantOverrides[plantId] && plantOverrides[plantId].label) {
          label = plantOverrides[plantId].label;
        } else {
          const pDef = PLANTS.find((p) => p.id === plantId);
          if (pDef) label = pDef.label;
        }

        // For summary, we might want to group by time too, but simple grouping:
        // Use months OR week range to distinguish? 
        // For now, keep simple grouping key.
        const monthsKey = monthsArr.join(',');
        const groupKey = `${plantId}|${variety}|${monthsKey}`;

        if (!summaryMap[groupKey]) {
          summaryMap[groupKey] = {
            label,
            variety,
            months: monthsArr.slice(),
            count: 0
          };
        }
        summaryMap[groupKey].count += 1;
      });
    });
  });
  return Object.values(summaryMap);
}

// Open the summary overlay and render the current summary
function openSummaryOverlay() {
  if (!summaryOverlay) return;
  const data = computeSummaryData();
  summaryList.innerHTML = '';
  if (!data.length) {
    summaryList.textContent = 'No plants in the current plan.';
  } else {
    data.forEach((item) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.marginBottom = '6px';
      const labelSpan = document.createElement('span');
      // Build description: label + optional variety + months list
      const monthsStr = item.months && item.months.length ? item.months.join(', ') : '—';
      labelSpan.textContent = `${item.label}${item.variety ? ' (' + item.variety + ')' : ''} – ${monthsStr}`;
      const countSpan = document.createElement('span');
      countSpan.textContent = `×${item.count}`;
      row.appendChild(labelSpan);
      row.appendChild(countSpan);
      summaryList.appendChild(row);
    });
  }
  summaryOverlay.classList.remove('hidden');
}

// Close the summary overlay
function closeSummaryOverlay() {
  if (summaryOverlay) summaryOverlay.classList.add('hidden');
}

// Fetch the list of saved plan names from the server
async function fetchPlans() {
  try {
    const res = await fetch('/api/plans', { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.plans)) return [];
    return data.plans;
  } catch (e) {
    return [];
  }
}

// Save the current garden as a named plan. Prompts the user for a name and
// sends the plan to the server. If a plan with the same name exists, the
// user is asked to confirm overwriting it.
async function savePlanAs() {
  const planName = prompt('Enter a name for this plan:');
  if (!planName) return;
  // Trim whitespace
  const name = planName.trim();
  if (!name) return;
  // Check existing plans to avoid accidental overwrite
  const existingPlans = await fetchPlans();
  if (existingPlans.includes(name)) {
    const confirmOverwrite = confirm(`A plan named "${name}" already exists. Overwrite?`);
    if (!confirmOverwrite) return;
  }
  const plan = buildPlan();
  try {
    const res = await fetch(`/api/garden?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan)
    });
    if (res.ok) {
      alert('Plan saved successfully');
    } else {
      const err = await res.json();
      alert('Error saving plan: ' + (err.error || res.status));
    }
  } catch (e) {
    alert('Network error while saving plan');
  }
}

// Open the plans overlay and populate the list of saved plans
async function openPlansOverlay() {
  if (!plansOverlay) return;
  // Fetch plans and build list
  const planNames = await fetchPlans();
  plansList.innerHTML = '';
  if (!planNames.length) {
    plansList.textContent = 'No saved plans.';
  } else {
    planNames.forEach((name) => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.marginBottom = '6px';
      const title = document.createElement('span');
      title.textContent = name;
      item.appendChild(title);
      const btnGroup = document.createElement('div');
      // Load button
      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn';
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', async () => {
        await loadNamedPlan(name);
        closePlansOverlay();
      });
      btnGroup.appendChild(loadBtn);
      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-secondary';
      delBtn.textContent = 'Delete';
      delBtn.style.marginLeft = '4px';
      delBtn.addEventListener('click', async () => {
        const confirmDel = confirm(`Are you sure you want to delete the plan "${name}"?`);
        if (!confirmDel) return;
        await deletePlan(name);
        // Refresh list
        await openPlansOverlay();
      });
      btnGroup.appendChild(delBtn);
      item.appendChild(btnGroup);
      plansList.appendChild(item);
    });
  }
  plansOverlay.classList.remove('hidden');
}

function closePlansOverlay() {
  if (plansOverlay) plansOverlay.classList.add('hidden');
}

// Load a named plan from the server and reconstruct the beds. This
// behaves similarly to loadGarden() but targets a specific plan name.
async function loadNamedPlan(name) {
  if (!name) return;
  try {
    const res = await fetch(`/api/garden?name=${encodeURIComponent(name)}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (!data || (!data.beds && !data.rows)) {
        alert('Plan is empty or corrupt');
        return;
      }
      // Clear existing beds and DOM
      beds = [];
      gardenArea.innerHTML = '';
      // Determine multi‑bed format
      if (data.beds) {
        squareFootMode = !!data.squareFootMode;
        sfgCheckbox.checked = squareFootMode;
        populatePalette();
        data.beds.forEach((b) => {
          const bed = {
            id: b.id,
            name: b.name || `Bed ${beds.length + 1}`,
            config: b.config,
            plants: b.plants || {},
            borders: b.borders || {},
            gridEl: null,
            wrapperEl: null
          };
          beds.push(bed);
          createGridForBed(bed);
          Object.keys(bed.plants).forEach((key) => {
            const [r, c] = key.split(',').map((n) => parseInt(n, 10));
            const plantId = bed.plants[key].plantId || bed.plants[key];
            const cell = bed.gridEl.querySelector(
              `.cell[data-row='${r}'][data-col='${c}']`
            );
            if (cell) {
              placePlantInCell(bed, cell, plantId);
              const { variety, date, months } = bed.plants[key];
              bed.plants[key] = {
                plantId,
                variety: variety || '',
                date: date || '',
                months: Array.isArray(months) ? months : []
              };
              if (variety || date || (bed.plants[key].months && bed.plants[key].months.length)) {
                setPlantDetailsTooltip(bed, cell);
              }
            }
          });
          Object.keys(bed.borders).forEach((key) => {
            if (bed.borders[key]) {
              const [r, c] = key.split(',').map((n) => parseInt(n, 10));
              const cell = bed.gridEl.querySelector(
                `.cell[data-row='${r}'][data-col='${c}']`
              );
              if (cell) cell.classList.add('border-active');
            }
          });
        });
        applyMonthFilter();
      } else {
        // Legacy single bed format
        squareFootMode = false;
        sfgCheckbox.checked = false;
        populatePalette();
        const config = {
          widthMeters: data.widthMeters,
          heightMeters: data.heightMeters,
          cellSizeCm: data.cellSizeCm,
          rows: data.rows,
          cols: data.cols
        };
        const bed = {
          id: Date.now() + '-0',
          config,
          plants: {},
          borders: {},
          gridEl: null,
          wrapperEl: null
        };
        beds.push(bed);
        createGridForBed(bed);
        if (data.plants) {
          Object.keys(data.plants).forEach((key) => {
            const [row, col] = key.split(',').map((n) => parseInt(n, 10));
            const plantId = data.plants[key];
            const cell = bed.gridEl.querySelector(
              `.cell[data-row='${row}'][data-col='${col}']`
            );
            if (cell) {
              placePlantInCell(bed, cell, plantId);
              bed.plants[`${row},${col}`] = { plantId, variety: '', date: '', months: [] };
            }
          });
        }
        applyMonthFilter();
      }
    } else if (res.status === 401) {
      alert('Please log in again');
      showLogin();
    } else {
      alert('Error loading plan');
    }
  } catch (e) {
    alert('Network error while loading plan');
  }
}

// Delete a named plan from the server
async function deletePlan(name) {
  if (!name) return;
  try {
    const res = await fetch(`/api/garden?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) {
      const err = await res.json();
      alert('Error deleting plan: ' + (err.error || res.status));
    }
  } catch (e) {
    alert('Network error while deleting plan');
  }
}

// Open the plant management overlay and render the list of all plants
async function openPlantsOverlay() {
  if (!plantsOverlay) return;
  await renderPlantManagerList();
  plantsOverlay.classList.remove('hidden');
}

function closePlantsOverlay() {
  if (plantsOverlay) plantsOverlay.classList.add('hidden');
}

// Render all plants (built‑in, overrides and custom) in the management overlay.
// Provides editing and deletion capabilities.
async function renderPlantManagerList() {
  customPlantsList.innerHTML = '';
  // Ensure custom plants and overrides are up to date
  try {
    const res = await fetch('/api/custom-plants', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      plantOverrides = data.overrides || {};
    }
  } catch (e) {
    // ignore
  }
  // Build list based on PLANTS array
  if (!PLANTS.length) {
    customPlantsList.textContent = 'No plants available.';
    return;
  }
  PLANTS.forEach((plant) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.borderBottom = '1px solid #eee';
    row.style.padding = '6px 0';
    // Display row
    const displayRow = document.createElement('div');
    displayRow.style.display = 'flex';
    displayRow.style.justifyContent = 'space-between';
    displayRow.style.alignItems = 'center';
    // Left side: icon + label (perSquare)
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    // icon or emoji
    let iconEl;
    if (plant.icon) {
      iconEl = document.createElement('img');
      iconEl.src = plant.icon;
      iconEl.style.width = '20px';
      iconEl.style.height = '20px';
      iconEl.style.marginRight = '6px';
    } else {
      iconEl = document.createElement('span');
      iconEl.textContent = plant.emoji;
      iconEl.style.fontSize = '20px';
      iconEl.style.marginRight = '6px';
    }
    left.appendChild(iconEl);
    const nameText = document.createElement('span');
    nameText.textContent = `${plant.label} (${plant.perSquare})`;
    left.appendChild(nameText);
    displayRow.appendChild(left);
    // Right side buttons: edit, delete/reset
    const btnGroup = document.createElement('div');
    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-secondary';
    editBtn.textContent = 'Edit';
    btnGroup.appendChild(editBtn);
    // Delete or reset button
    const extraBtn = document.createElement('button');
    extraBtn.className = 'btn-secondary';
    extraBtn.style.marginLeft = '4px';
    if (plant.isCustom) {
      extraBtn.textContent = 'Delete';
    } else if (plantOverrides && plantOverrides[plant.id]) {
      extraBtn.textContent = 'Reset';
    } else {
      // For built‑in plants without override, we don't show an extra button
      extraBtn.style.display = 'none';
    }
    btnGroup.appendChild(extraBtn);
    displayRow.appendChild(btnGroup);
    row.appendChild(displayRow);
    // Editing form row (hidden by default)
    const editRow = document.createElement('div');
    editRow.style.display = 'none';
    editRow.style.marginTop = '6px';
    editRow.style.borderTop = '1px dashed #ccc';
    editRow.style.paddingTop = '6px';
    // Name input
    const nameLabel = document.createElement('label');
    nameLabel.style.display = 'block';
    nameLabel.textContent = 'Name:';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = plant.label;
    nameInput.style.width = '100%';
    nameLabel.appendChild(nameInput);
    editRow.appendChild(nameLabel);
    // PerSquare input
    const psLabel = document.createElement('label');
    psLabel.style.display = 'block';
    psLabel.textContent = 'Plants per square:';
    const psInput = document.createElement('input');
    psInput.type = 'number';
    psInput.min = '1';
    psInput.max = '64';
    psInput.value = plant.perSquare;
    psInput.style.width = '100%';
    psLabel.appendChild(psInput);
    editRow.appendChild(psLabel);
    // SVG file input
    const fileLabel = document.createElement('label');
    fileLabel.style.display = 'block';
    fileLabel.textContent = 'SVG file (optional):';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/svg+xml';
    fileLabel.appendChild(fileInput);
    editRow.appendChild(fileLabel);
    // Save and cancel buttons
    const actionRow = document.createElement('div');
    actionRow.style.textAlign = 'right';
    actionRow.style.marginTop = '6px';
    const cancelEditBtn = document.createElement('button');
    cancelEditBtn.className = 'btn-secondary';
    cancelEditBtn.textContent = 'Cancel';
    const saveEditBtn = document.createElement('button');
    saveEditBtn.className = 'btn';
    saveEditBtn.textContent = 'Save';
    actionRow.appendChild(cancelEditBtn);
    actionRow.appendChild(saveEditBtn);
    editRow.appendChild(actionRow);
    row.appendChild(editRow);
    // Event handlers for edit
    editBtn.addEventListener('click', () => {
      // Toggle editing form
      editRow.style.display = editRow.style.display === 'none' ? 'block' : 'none';
    });
    cancelEditBtn.addEventListener('click', () => {
      editRow.style.display = 'none';
    });
    saveEditBtn.addEventListener('click', async () => {
      const newName = nameInput.value.trim();
      const newPS = parseInt(psInput.value, 10);
      const file = fileInput.files && fileInput.files[0];
      if (!newName || !newPS) {
        alert('Name and plants per square are required.');
        return;
      }
      // Read file if provided
      let svgData = null;
      if (file) {
        try {
          svgData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('File read error'));
            reader.readAsDataURL(file);
          });
        } catch (err) {
          alert('Failed to read SVG file');
          return;
        }
      }
      // Send update request
      try {
        const res = await fetch('/api/custom-plants', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: plant.id, label: newName, perSquare: newPS, svg: svgData })
        });
        if (res.ok) {
          // Update PLANTS array
          plant.label = newName;
          plant.perSquare = newPS;
          if (svgData) {
            plant.icon = `/icons/${plant.id}.svg`;
            delete plant.emoji;
          }
          editRow.style.display = 'none';
          // Reload overrides and palette
          await loadCustomPlants();
          populatePalette();
          await renderPlantManagerList();
        } else {
          const err = await res.json();
          alert('Error updating plant: ' + (err.error || res.status));
        }
      } catch (e) {
        alert('Network error while updating plant');
      }
    });
    // Extra button: delete for custom or reset for override
    if (plant.isCustom) {
      extraBtn.addEventListener('click', async () => {
        const confirmDel = confirm(`Delete custom plant "${plant.label}"?`);
        if (!confirmDel) return;
        try {
          const resDel = await fetch(`/api/custom-plants?id=${encodeURIComponent(plant.id)}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          if (resDel.ok) {
            // Remove from PLANTS
            const idx = PLANTS.findIndex((it) => it.id === plant.id);
            if (idx !== -1) PLANTS.splice(idx, 1);
            await loadCustomPlants();
            populatePalette();
            await renderPlantManagerList();
          } else {
            const err = await resDel.json();
            alert('Error deleting plant: ' + (err.error || resDel.status));
          }
        } catch (err) {
          alert('Network error deleting plant');
        }
      });
    } else if (plantOverrides && plantOverrides[plant.id]) {
      // Reset override for built-in plant
      extraBtn.addEventListener('click', async () => {
        const confirmReset = confirm(`Reset customisation for "${plant.label}"?`);
        if (!confirmReset) return;
        try {
          const resDel = await fetch(`/api/custom-plants?id=${encodeURIComponent(plant.id)}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          if (resDel.ok) {
            // Remove override; reload plants
            await loadCustomPlants();
            populatePalette();
            await renderPlantManagerList();
          } else {
            const err = await resDel.json();
            alert('Error resetting plant: ' + (err.error || resDel.status));
          }
        } catch (err) {
          alert('Network error resetting plant');
        }
      });
    }
    customPlantsList.appendChild(row);
  });
}

// Add a custom plant by uploading its SVG icon along with name and perSquare
async function addCustomPlant() {
  const name = newPlantNameInput.value.trim();
  const perSquare = parseInt(newPlantCountInput.value, 10);
  const file = newPlantFileInput.files && newPlantFileInput.files[0];
  if (!name || !perSquare || !file) {
    alert('Please provide name, plants per square and select an SVG file.');
    return;
  }
  // Read file as data URL
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    try {
      const res = await fetch('/api/custom-plants', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: name, perSquare, svg: dataUrl })
      });
      if (res.ok) {
        const entry = await res.json();
        // Update local PLANTS array
        PLANTS.push({ id: entry.id, label: entry.label, perSquare: entry.perSquare, icon: '/icons/' + entry.file });
        // Clear inputs
        newPlantNameInput.value = '';
        newPlantCountInput.value = '1';
        newPlantFileInput.value = '';
        await renderCustomPlantsList();
        populatePalette();
      } else {
        const err = await res.json();
        alert('Error uploading plant: ' + (err.error || res.status));
      }
    } catch (err) {
      alert('Network error uploading plant');
    }
  };
  reader.readAsDataURL(file);
}


// Overlay for editing plant details
let detailsOverlay = null;
let currentEditing = null; // { bed, cell }

// List of month names for details dialog
// const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Use the global MONTH_NAMES instead (full names).
// If components need short names, we can map it.
// Actually, earlier definition used full names.
// Let's stick to full names everywhere for consistency or provide a helper for short names.

/**
 * Fetch custom plant definitions from the server and merge them into
 * the PLANTS array. Custom plant definitions come from the
 * /api/custom-plants endpoint and include a unique id, label, perSquare
 * value, and a filename for the SVG stored in the public/icons
 * directory. The resulting plant objects added to PLANTS include an
 * `icon` property pointing to the server path for the SVG.
 */
async function loadCustomPlants() {
  try {
    const res = await fetch('/api/custom-plants', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;
    // We strictly use the server provided list.
    // Hardcoded built-ins are gone, so overrides are not needed for them.
    const custom = Array.isArray(data.plants) ? data.plants : [];

    // Clear array
    PLANTS = [];

    // Populate PLANTS
    custom.forEach((pl) => {
      PLANTS.push({
        id: pl.id,
        label: pl.label,
        perSquare: pl.perSquare,
        icon: '/icons/' + pl.file,
        isCustom: true,
        // Enriched data
        family: pl.family,
        companions: pl.companions || [],
        antagonists: pl.antagonists || [],
        sowIndoor: pl.sowIndoor,
        sowOutdoor: pl.sowOutdoor,
        category: pl.category || 'plant'
      });
    });

    // Sort alphabetically
    PLANTS.sort((a, b) => a.label.localeCompare(b.label));

  } catch (err) {
    console.error('Failed to load custom plants:', err);
  }
}

// Initialization: check if session exists
async function initPage() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      showApp(data);
    } else {
      showLogin();
    }
  } catch (e) {
    showLogin();
  }
}

function showLogin() {
  loginPanel.classList.remove('hidden');
  appContainer.classList.add('hidden');
  loginError.textContent = '';
}

function showApp(userData) {
  const username = typeof userData === 'string' ? userData : userData.username;
  const isAdmin = typeof userData === 'object' ? userData.isAdmin : false;

  loginPanel.classList.add('hidden');
  appContainer.classList.remove('hidden');
  userInfo.textContent = `Logged in as: ${username}`;
  document.body.classList.remove('login-page');

  // Show admin button if user is admin
  const adminBtnElem = document.getElementById('admin-btn');
  if (isAdmin && adminBtnElem) {
    adminBtnElem.classList.remove('hidden');
  }

  // Load custom plant definitions from server before populating the palette
  loadCustomPlants().then(() => {
    populatePalette();
  }).catch(() => {
    // If loading custom plants fails, still populate default palette
    populatePalette();
  });
}

// Build the plant palette UI. Each plant shows its emoji and name. When squareFootMode
// is enabled, the number of plants per square foot is also displayed on the icon.
// Build the plant palette UI. Grouped by category.
function populatePalette() {
  plantsContainer.innerHTML = '';
  const query = plantSearchInput ? plantSearchInput.value.trim().toLowerCase() : '';

  const allPlants = PLANTS.filter((p) =>
    !query || p.label.toLowerCase().includes(query)
  );

  // Group by category
  const categories = {
    'infrastructure': [],
    'plant': []
  };

  allPlants.forEach(p => {
    if (p.category === 'infrastructure') categories.infrastructure.push(p);
    else categories.plant.push(p);
  });

  // Helper to render a group
  const renderGroup = (title, items) => {
    if (items.length === 0) return;

    const groupHeader = document.createElement('div');
    groupHeader.style.width = '100%';
    groupHeader.style.fontWeight = 'bold';
    groupHeader.style.marginTop = '10px';
    groupHeader.style.marginBottom = '5px';
    groupHeader.style.paddingLeft = '5px';
    groupHeader.style.color = '#555';
    groupHeader.style.borderBottom = '1px solid #eee';
    groupHeader.textContent = title;
    plantsContainer.appendChild(groupHeader);

    items.forEach((plant) => {
      const item = document.createElement('div');
      item.className = 'plant-item';
      item.draggable = true;
      item.dataset.id = plant.id;
      // Outer wrapper to position emoji/icon and count overlay
      const emojiWrapper = document.createElement('div');
      emojiWrapper.className = 'plant-emoji-wrapper';
      // Show either an SVG icon or an emoji
      if (plant.icon) {
        const imgEl = document.createElement('img');
        imgEl.src = plant.icon;
        imgEl.alt = plant.label;
        imgEl.style.width = '24px';
        imgEl.style.height = '24px';
        emojiWrapper.appendChild(imgEl);
      } else {
        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'plant-emoji';
        emojiSpan.textContent = plant.emoji;
        emojiWrapper.appendChild(emojiSpan);
      }
      // Count overlay for SFG mode (only for plants, hide for infrastructure if 1)
      const countSpan = document.createElement('span');
      countSpan.className = 'plant-count-overlay';
      if (squareFootMode && (plant.category !== 'infrastructure' || plant.perSquare > 1)) {
        countSpan.textContent = plant.perSquare;
      } else {
        countSpan.textContent = '';
      }
      emojiWrapper.appendChild(countSpan);
      // Label
      const labelSpan = document.createElement('div');
      labelSpan.className = 'plant-label';
      labelSpan.textContent = plant.label;
      item.appendChild(emojiWrapper);
      item.appendChild(labelSpan);
      // Title for tooltip
      item.title = squareFootMode
        ? `${plant.label} – ${plant.perSquare} per square`
        : plant.label;
      // Drag start
      item.addEventListener('dragstart', (e) => {
        console.log('🚀 DRAG START:', plant.id, plant.label);
        draggedPlantDef = plant;
        e.dataTransfer.setData('text/plain', plant.id);
        e.dataTransfer.effectAllowed = 'copy';

        // Create a custom drag ghost showing the plant icon/emoji
        const dragGhost = document.createElement('div');
        dragGhost.style.cssText = `
          position: absolute;
          left: -9999px;
          width: 40px;
          height: 40px;
          background: rgba(76, 175, 80, 0.9);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          pointer-events: none;
        `;

        if (plant.icon) {
          const ghostImg = document.createElement('img');
          ghostImg.src = plant.icon;
          ghostImg.alt = plant.label;
          ghostImg.style.cssText = 'width: 32px; height: 32px; object-fit: contain;';
          dragGhost.appendChild(ghostImg);
        } else {
          dragGhost.textContent = plant.emoji || '🌱';
          dragGhost.style.fontSize = '24px';
        }

        document.body.appendChild(dragGhost);
        e.dataTransfer.setDragImage(dragGhost, 20, 20);

        // Remove ghost after a brief delay
        setTimeout(() => {
          if (dragGhost.parentNode) {
            dragGhost.parentNode.removeChild(dragGhost);
          }
        }, 0);
      });
      item.addEventListener('dragend', () => {
        console.log('🏁 DRAG END');
        // Clean up if needed, though drop/leave usually handles it
        // draggedPlantDef = null; 
      });
      plantsContainer.appendChild(item);
    });
  };

  renderGroup('Infrastructure', categories.infrastructure);
  renderGroup('Plants', categories.plant);
}

// Add a new bed to the garden area.
function addBed() {
  const widthMeters = parseFloat(bedWidthInput.value);
  const heightMeters = parseFloat(bedHeightInput.value);
  const cellSizeCm = parseFloat(cellSizeInput.value);
  if (!widthMeters || !heightMeters || !cellSizeCm) {
    alert('Please provide valid bed dimensions and cell size.');
    return;
  }
  const cols = Math.floor((widthMeters * 100) / cellSizeCm);
  const rows = Math.floor((heightMeters * 100) / cellSizeCm);
  if (cols <= 0 || rows <= 0) {
    alert('Bed is too small for the specified cell size.');
    return;
  }
  const bedId = Date.now() + '-' + beds.length;
  // Default name
  const name = `Bed ${beds.length + 1}`;
  const config = { widthMeters, heightMeters, cellSizeCm, rows, cols };
  const bed = {
    id: bedId,
    name: name,
    config,
    plants: {}, // key: "row,col" -> { plantId, variety, date }
    borders: {}, // key: "row,col" -> boolean
    gridEl: null,
    wrapperEl: null
  };
  beds.push(bed);
  createGridForBed(bed);

  // Track action for undo/redo
  pushAction({
    type: 'addBed',
    bedId: bed.id,
    bedData: bed
  });

  // Reset inputs to defaults for next bed
  if (bedWidthInput) bedWidthInput.value = '2';
  if (bedHeightInput) bedHeightInput.value = '1';
  if (cellSizeInput) cellSizeInput.value = '30';
}

// Create grid DOM structure for a given bed.
function createGridForBed(bed) {
  const { rows, cols, cellSizeCm } = bed.config;
  // Create wrapper for the bed with a heading
  const wrapper = document.createElement('div');
  wrapper.className = 'bed-wrapper';
  const heading = document.createElement('div');
  heading.className = 'bed-heading';
  // Bed name label
  const labelNode = document.createElement('span');
  labelNode.className = 'bed-title';
  labelNode.textContent = bed.name || `Bed ${beds.indexOf(bed) + 1}`;
  heading.appendChild(labelNode);

  // Rename button
  const renameBtn = document.createElement('button');
  renameBtn.className = 'btn-secondary';
  renameBtn.style.marginLeft = '10px';
  renameBtn.style.fontSize = '0.8rem';
  renameBtn.textContent = 'Rename';
  renameBtn.addEventListener('click', () => {
    openRenameModal(bed, labelNode);
  });
  heading.appendChild(renameBtn);

  // Resize button
  const resizeBtn = document.createElement('button');
  resizeBtn.className = 'btn-secondary';
  resizeBtn.style.marginLeft = '6px';
  resizeBtn.style.fontSize = '0.8rem';
  resizeBtn.textContent = 'Resize';
  resizeBtn.addEventListener('click', () => {
    openResizeModal(bed);
  });
  heading.appendChild(resizeBtn);

  // Delete button for bed
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-bed-btn';
  deleteBtn.title = 'Delete this bed';
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', () => {
    deleteBed(bed);
  });
  heading.appendChild(deleteBtn);
  wrapper.appendChild(heading);
  // Create grid
  const grid = document.createElement('div');
  grid.className = 'grid';
  // Set CSS grid template sizes based on scale (1 cm = 1 px) – you can change
  const scale = 1;
  const cellPx = cellSizeCm * scale;
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = `repeat(${cols}, ${cellPx}px)`;
  grid.style.gridTemplateRows = `repeat(${rows}, ${cellPx}px)`;
  // Build cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.dataset.bed = bed.id;
      // Drag over behavior
      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        cell.classList.add('dragover');
        highlightCompanions(bed, r, c);
        e.dataTransfer.dropEffect = 'copy';
      });
      cell.addEventListener('dragleave', (e) => {
        // Prevent flickering when hovering over children
        if (e.relatedTarget && cell.contains(e.relatedTarget)) return;
        cell.classList.remove('dragover');
        clearCompanionHighlights(cell);
      });
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        console.log('📍 DROP EVENT');
        cell.classList.remove('dragover');
        clearCompanionHighlights(cell);
        const plantId = e.dataTransfer.getData('text/plain');
        console.log('  Dropped plant ID:', plantId);
        if (!plantId) {
          console.error('  ❌ No plant ID!');
          return;
        }
        placePlantInCell(bed, cell, plantId);
      });
      // Right‑click to remove plant
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        removePlantFromCell(bed, cell);
      });
      // Click behaviour: handle copy mode, border mode and details
      cell.addEventListener('click', (e) => {
        // If copy mode is active, paste the copied plant here
        if (copyMode) {
          pastePlantInCell(bed, cell);
          // Do not proceed to border or detail handling
          return;
        }
        // Border mode click is handled by pointerdown/up for drag support
        if (borderMode) {
          return; // Handled by pointer events below
        }
        // Normal click: open plant details if plant exists
        const plantElem = cell.querySelector('.plant');
        if (plantElem) {
          openPlantDetailsDialog(bed, cell);
        }
      });

      // Border mode: pointer events for rectangle drawing
      cell.addEventListener('pointerdown', (e) => {
        if (!borderMode) return;
        e.preventDefault();
        startBorderDrag(bed, cell);
      });

      cell.addEventListener('pointerenter', (e) => {
        if (!borderMode || !isBorderDragging) return;
        // Check that the drag is for this bed
        if (borderDragStart && borderDragStart.bed === bed) {
          previewBorderRect(cell);
        }
      });

      cell.addEventListener('pointerup', (e) => {
        if (!borderMode || !isBorderDragging) return;
        // Check that the drag is for this bed
        if (borderDragStart && borderDragStart.bed === bed) {
          applyBorderRect(cell);
        } else {
          cancelBorderDrag();
        }
      });

      grid.appendChild(cell);
    }
  }
  wrapper.appendChild(grid);
  gardenArea.appendChild(wrapper);
  bed.gridEl = grid;
  bed.wrapperEl = wrapper;
}

// Place a plant into a cell within a given bed
// Successive Planting Update:
// - Uses current slider month as start date.
// - Stores in an array `bed.plants[key] = [...]`.
// - Checks for collision.
function placePlantInCell(bed, cell, plantId) {
  console.log('📦 placePlantInCell called:', { plantId, bed: bed?.name, cellRow: cell?.dataset?.row, cellCol: cell?.dataset?.col });
  try {
    const currentMonthIdx = monthSlider ? parseInt(monthSlider.value, 10) : 0;
    console.log('  Month index:', currentMonthIdx);

    const plantDef = PLANTS.find((p) => p.id === plantId);
    if (!plantDef) {
      console.error("  ❌ Plant definition not found for:", plantId);
      console.log("  Available PLANTS:", PLANTS.map(p => p.id).slice(0, 10), '...');
      return;
    }
    console.log('  ✅ Plant found:', plantDef.label);

    // Determine timing
    const isInfra = plantDef.category === 'infrastructure';
    const isAllYear = currentMonthIdx === -1;

    let startW, endW;
    if (isAllYear || isInfra) {
      startW = undefined;
      endW = undefined;
    } else {
      const WEEKS_PER_MONTH = 52 / 12;
      const currentWeek = Math.floor(currentMonthIdx * WEEKS_PER_MONTH);
      const duration = plantDef.harvest || 16;
      startW = currentWeek;
      endW = currentWeek + duration;
    }

    const newRecord = {
      plantId: plantDef.id,
      startWeek: startW,
      endWeek: endW,
      variety: '',
      date: new Date().toISOString()
    };
    console.log('  New record:', newRecord);

    const key = `${cell.dataset.row},${cell.dataset.col}`;
    console.log('  Cell key:', key);

    // Initialize or Migrate existing data
    let cellPlants = [];
    if (bed.plants[key]) {
      if (Array.isArray(bed.plants[key])) {
        cellPlants = bed.plants[key];
      } else {
        const p = bed.plants[key];
        const def = PLANTS.find(x => x.id === p.plantId);
        let s = 18;
        if (def && def.sowOutdoor) s = 18 + def.sowOutdoor;
        let e = s + (def?.harvest || 16);
        cellPlants.push({ ...p, startWeek: s, endWeek: e });
      }
    }
    console.log('  Existing plants in cell:', cellPlants.length);

    // Check Collision
    const hasCollision = cellPlants.some(p => {
      if (newRecord.startWeek === undefined || p.startWeek === undefined) {
        return false;
      }
      return newRecord.startWeek < p.endWeek && newRecord.endWeek > p.startWeek;
    });

    if (hasCollision) {
      console.log('  ⚠️ Collision detected!');
      alert('Cannot plant here: Another crop is growing during this time.');
      return;
    }

    // Add
    cellPlants.push(newRecord);
    bed.plants[key] = cellPlants;
    console.log('  ✅ Plant added! Total in cell:', cellPlants.length);

    // Track action for undo/redo
    pushAction({
      type: 'placePlant',
      bedId: bed.id,
      cellKey: key,
      plantRecord: { ...newRecord }
    });

    // Refresh View
    console.log('  Calling applyMonthFilter...');
    applyMonthFilter();
    console.log('  ✅ View refreshed');

  } catch (err) {
    console.error("❌ Error placing plant:", err);
    alert("Error placing plant: " + err.message);
  }
}

// Remove plant from cell
function removePlantFromCell(bed, cell) {
  const key = `${cell.dataset.row},${cell.dataset.col}`;
  const removedPlants = bed.plants[key] ? [...bed.plants[key]] : null;

  const existing = cell.querySelector('.plant');
  if (existing) existing.remove();

  if (removedPlants && removedPlants.length > 0) {
    // Track action for undo/redo
    pushAction({
      type: 'removePlant',
      bedId: bed.id,
      cellKey: key,
      removedPlants: removedPlants
    });
  }

  delete bed.plants[key];
}

// Toggle a border on the given cell when border mode is enabled
function toggleBorderOnCell(bed, cell) {
  const key = `${cell.dataset.row},${cell.dataset.col}`;
  const isActive = bed.borders[key];
  if (isActive) {
    delete bed.borders[key];
    cell.classList.remove('border-active');
  } else {
    bed.borders[key] = true;
    cell.classList.add('border-active');
  }
}

// ===== BORDER RECTANGLE DRAWING =====

// Start border rectangle drag
function startBorderDrag(bed, cell) {
  borderDragStart = {
    bed,
    row: parseInt(cell.dataset.row, 10),
    col: parseInt(cell.dataset.col, 10)
  };
  isBorderDragging = true;
  cell.classList.add('border-preview');
}

// Preview border rectangle during drag
function previewBorderRect(endCell) {
  if (!borderDragStart || !isBorderDragging) return;

  const bed = borderDragStart.bed;
  const startRow = borderDragStart.row;
  const startCol = borderDragStart.col;
  const endRow = parseInt(endCell.dataset.row, 10);
  const endCol = parseInt(endCell.dataset.col, 10);

  // Clear previous preview
  clearBorderPreview();

  // Calculate rectangle bounds
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);

  // Add preview to all cells in rectangle
  const cells = bed.gridEl.querySelectorAll('.cell');
  cells.forEach(cell => {
    const r = parseInt(cell.dataset.row, 10);
    const c = parseInt(cell.dataset.col, 10);
    if (r >= minRow && r <= maxRow && c >= minCol && c <= maxCol) {
      cell.classList.add('border-preview');
    }
  });
}

// Apply border to all cells in rectangle (toggle: if all bordered, remove; otherwise add)
function applyBorderRect(endCell) {
  if (!borderDragStart || !isBorderDragging) return;

  const bed = borderDragStart.bed;
  const startRow = borderDragStart.row;
  const startCol = borderDragStart.col;
  const endRow = parseInt(endCell.dataset.row, 10);
  const endCol = parseInt(endCell.dataset.col, 10);

  // Calculate rectangle bounds
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);

  // Find all cells in rectangle
  const cells = bed.gridEl.querySelectorAll('.cell');
  const rectCells = [];
  cells.forEach(cell => {
    const r = parseInt(cell.dataset.row, 10);
    const c = parseInt(cell.dataset.col, 10);
    if (r >= minRow && r <= maxRow && c >= minCol && c <= maxCol) {
      rectCells.push(cell);
    }
  });

  // Check if ALL cells in rectangle are already bordered
  const allBordered = rectCells.every(cell => {
    const key = `${cell.dataset.row},${cell.dataset.col}`;
    return bed.borders[key];
  });

  // Toggle: if all bordered, remove; otherwise add
  rectCells.forEach(cell => {
    const key = `${cell.dataset.row},${cell.dataset.col}`;
    if (allBordered) {
      // Remove borders
      delete bed.borders[key];
      cell.classList.remove('border-active');
    } else {
      // Add borders
      bed.borders[key] = true;
      cell.classList.add('border-active');
    }
  });

  // Clear drag state
  clearBorderPreview();
  borderDragStart = null;
  isBorderDragging = false;
}

// Clear all border preview highlights
function clearBorderPreview() {
  document.querySelectorAll('.cell.border-preview').forEach(cell => {
    cell.classList.remove('border-preview');
  });
}

// Cancel border drag without applying
function cancelBorderDrag() {
  clearBorderPreview();
  borderDragStart = null;
  isBorderDragging = false;
}


// Delete a bed with confirmation
function deleteBed(bed) {
  // Ask for confirmation before deleting
  const confirmed = confirm('Are you sure you want to delete this garden bed?');
  if (!confirmed) return;
  const index = beds.indexOf(bed);
  if (index === -1) return;

  // Track action for undo/redo (capture state before deletion)
  // Deep copy the bed data for restoration
  const bedSnapshot = {
    id: bed.id,
    name: bed.name,
    config: { ...bed.config },
    plants: JSON.parse(JSON.stringify(bed.plants)),
    borders: { ...bed.borders }
  };
  pushAction({
    type: 'deleteBed',
    bedIndex: index,
    bedData: bedSnapshot
  });

  // Remove from array and DOM
  beds.splice(index, 1);
  if (bed.wrapperEl && bed.wrapperEl.parentNode) {
    bed.wrapperEl.parentNode.removeChild(bed.wrapperEl);
  }
  // Update titles for remaining beds
  beds.forEach((b, idx) => {
    const heading = b.wrapperEl.querySelector('.bed-heading .bed-title');
    if (heading) heading.textContent = `Bed ${idx + 1}`;
  });
}

// Create and display the plant details dialog overlay
function openPlantDetailsDialog(bed, cell) {
  const key = `${cell.dataset.row},${cell.dataset.col}`;
  let info = bed.plants[key];
  if (!info) return;

  // Handle array format (succession planting) - use the first plant entry
  if (Array.isArray(info)) {
    if (info.length === 0) return;
    info = info[0];
  }
  currentEditing = { bed, cell };
  if (!detailsOverlay) {
    // Build overlay HTML
    detailsOverlay = document.createElement('div');
    detailsOverlay.className = 'details-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'details-dialog';
    dialog.innerHTML = `
      <h3>Plant Details</h3>
      <div id="plant-info-header" style="margin-bottom:12px;border-bottom:1px solid #ddd;padding-bottom:8px;"></div>
      <label style="display:block;margin-bottom:8px;">
        Variety:<br/>
        <input type="text" id="detail-variety" style="width:100%;padding:4px;box-sizing:border-box;" />
      </label>
      <div style="margin-bottom:4px;">Months:</div>
      <div id="detail-months" class="months-container"></div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:6px;">
        <button type="button" id="details-copy" class="btn-secondary">Copy</button>
        <button type="button" id="details-cancel" class="btn-secondary">Cancel</button>
        <button type="button" id="details-save" class="btn">Save</button>
      </div>
    `;
    detailsOverlay.appendChild(dialog);
    document.body.appendChild(detailsOverlay);
    // Cancel button handler
    detailsOverlay.querySelector('#details-cancel').addEventListener('click', () => {
      closePlantDetailsDialog();
    });
    // Save button handler
    detailsOverlay.querySelector('#details-save').addEventListener('click', () => {
      savePlantDetails();
    });
    // Copy button handler
    detailsOverlay.querySelector('#details-copy').addEventListener('click', () => {
      copyPlantDetails();
    });
    // Close overlay when clicking outside the dialog
    detailsOverlay.addEventListener('click', (evt) => {
      if (evt.target === detailsOverlay) {
        closePlantDetailsDialog();
      }
    });
  }

  // Populate plant info header
  const header = detailsOverlay.querySelector('#plant-info-header');
  const plantDef = PLANTS.find(p => p.id === info.plantId);
  if (header && plantDef) {
    let html = `<strong>${plantDef.label}</strong>`;
    if (plantDef.family) {
      html += `<div style="font-size:0.9em;color:#666;">Family: ${plantDef.family}</div>`;
    }
    if (plantDef.companions && plantDef.companions.length) {
      html += `<div style="font-size:0.85em;margin-top:4px;"><strong>Companions:</strong> ${plantDef.companions.join(', ')}</div>`;
    }
    if (plantDef.antagonists && plantDef.antagonists.length) {
      html += `<div style="font-size:0.85em;margin-top:2px;color:#c00;"><strong>Avoid:</strong> ${plantDef.antagonists.join(', ')}</div>`;
    }
    header.innerHTML = html;
  } else if (header) {
    header.innerHTML = '';
  }

  // Populate months checkboxes
  const monthsContainer = detailsOverlay.querySelector('#detail-months');
  monthsContainer.innerHTML = '';
  MONTH_NAMES.forEach((name) => {
    const label = document.createElement('label');
    label.style.marginRight = '8px';
    label.style.fontSize = '0.8rem';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = name;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' ' + name));
    monthsContainer.appendChild(label);
  });
  // Set values from existing info
  const varietyInput = detailsOverlay.querySelector('#detail-variety');
  varietyInput.value = info.variety || '';
  const months = info.months || [];
  monthsContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = months.includes(cb.value);
  });
  // Show overlay
  detailsOverlay.style.display = 'flex';
}

// Close the plant details dialog overlay
function closePlantDetailsDialog() {
  if (detailsOverlay) {
    detailsOverlay.style.display = 'none';
  }
  currentEditing = null;
}

// Save details from the overlay into the plant info and update tooltip
function savePlantDetails() {
  if (!currentEditing) return;
  const { bed, cell } = currentEditing;
  const key = `${cell.dataset.row},${cell.dataset.col}`;
  let info = bed.plants[key];
  if (!info) {
    closePlantDetailsDialog();
    return;
  }

  // CRITICAL FIX: Handle array-based storage
  // `info` might be an array of records, not a single record
  let record;
  if (Array.isArray(info)) {
    // For now, update the first record (most recently visible one)
    // In the future, this could be extended to edit a specific record
    if (info.length === 0) {
      closePlantDetailsDialog();
      return;
    }
    record = info[0];
  } else {
    // Legacy single-object format
    record = info;
  }

  const varietyInput = detailsOverlay.querySelector('#detail-variety');
  const monthsChecked = Array.from(
    detailsOverlay.querySelectorAll('#detail-months input[type="checkbox"]:checked')
  ).map((cb) => cb.value);

  record.variety = varietyInput.value.trim();
  record.months = monthsChecked;

  console.log('📝 Saved plant details:', { key, variety: record.variety, months: record.months });

  // Close the dialog first
  closePlantDetailsDialog();

  // Reapply month filter to reflect changes
  applyMonthFilter();
}

// Prompt user for plant details (variety and date) and store on bed
function setPlantDetails(bed, cell) {
  // For backward compatibility, open the new details dialog
  openPlantDetailsDialog(bed, cell);
}

// Build a JSON representation of the entire garden plan
function buildPlan() {
  const planBeds = beds.map((bed) => {
    return {
      id: bed.id,
      name: bed.name,
      config: bed.config,
      plants: bed.plants,
      borders: bed.borders
    };
  });
  return {
    beds: planBeds,
    squareFootMode
  };
}

// Save the current plan to the server
async function saveGarden() {
  const plan = buildPlan();
  if (!plan || !plan.beds.length) {
    alert('Nothing to save');
    return;
  }
  try {
    const res = await fetch('/api/garden', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan)
    });
    if (res.ok) {
      alert('Garden saved successfully');
    } else {
      const err = await res.json();
      alert('Error saving: ' + (err.error || res.status));
    }
  } catch (e) {
    alert('Network error while saving');
  }
}

// Load plan from the server and reconstruct the beds
async function loadGarden() {
  try {
    const res = await fetch('/api/garden', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (!data || (!data.beds && !data.rows)) {
        alert('No saved garden found');
        return;
      }
      // Clear existing beds and DOM
      beds = [];
      gardenArea.innerHTML = '';
      // Determine if legacy single bed or new multi-bed format
      if (data.beds) {
        // New format with multiple beds
        squareFootMode = !!data.squareFootMode;
        sfgCheckbox.checked = squareFootMode;
        populatePalette();
        data.beds.forEach((b) => {
          const bed = {
            id: b.id,
            name: b.name || `Bed ${beds.length + 1}`,
            config: b.config,
            plants: b.plants || {},
            borders: b.borders || {},
            gridEl: null,
            wrapperEl: null
          };
          beds.push(bed);
          createGridForBed(bed);
          // Place plants and borders
          Object.keys(bed.plants).forEach((key) => {
            const [r, c] = key.split(',').map((n) => parseInt(n, 10));
            const plantId = bed.plants[key].plantId || bed.plants[key];
            const cell = bed.gridEl.querySelector(
              `.cell[data-row='${r}'][data-col='${c}']`
            );
            if (cell) {
              placePlantInCell(bed, cell, plantId);
              // Update variety and date if present
              if (typeof bed.plants[key] === 'object') {
                // Set details on the stored plant info
                const { variety, date, months } = bed.plants[key];
                bed.plants[key] = {
                  plantId,
                  variety: variety || '',
                  date: date || '',
                  months: Array.isArray(months) ? months : []
                };
                if (variety || date) {
                  // Update tooltip
                  setPlantDetailsTooltip(bed, cell);
                }
              }
            }
          });
          Object.keys(bed.borders).forEach((key) => {
            if (bed.borders[key]) {
              const [r, c] = key.split(',').map((n) => parseInt(n, 10));
              const cell = bed.gridEl.querySelector(
                `.cell[data-row='${r}'][data-col='${c}']`
              );
              if (cell) {
                cell.classList.add('border-active');
              }
            }
          });
        });
        // Apply month filter on loaded beds
        applyMonthFilter();
      } else {
        // Legacy format: single bed saved previously
        // Use existing fields rows/cols/plants
        squareFootMode = false;
        sfgCheckbox.checked = false;
        populatePalette();
        const config = {
          widthMeters: data.widthMeters,
          heightMeters: data.heightMeters,
          cellSizeCm: data.cellSizeCm,
          rows: data.rows,
          cols: data.cols
        };
        const bed = {
          id: Date.now() + '-0',
          config,
          plants: {},
          borders: {},
          gridEl: null,
          wrapperEl: null
        };
        beds.push(bed);
        createGridForBed(bed);
        // Place plants
        if (data.plants) {
          Object.keys(data.plants).forEach((key) => {
            const [row, col] = key.split(',').map((n) => parseInt(n, 10));
            const plantId = data.plants[key];
            const cell = bed.gridEl.querySelector(
              `.cell[data-row='${row}'][data-col='${col}']`
            );
            if (cell) {
              placePlantInCell(bed, cell, plantId);
              // Do NOT overwrite bed.plants w/ legacy object here. 
              // placePlantInCell already updates bed.plants correctly (as array).
            }
          });
        }
        // Apply month filter on loaded legacy bed
        applyMonthFilter();
      }
    } else if (res.status === 401) {
      alert('Please log in again');
      showLogin();
    } else {
      alert('Error loading garden');
    }
  } catch (e) {
    alert('Network error while loading');
  }
}

// Update tooltip on existing plant element based on stored variety/date
// setPlantDetailsTooltip is deprecated in favor of dynamic rendering in applyMonthFilter

// Toggle Square Foot Gardening mode on/off
function toggleSFGMode() {
  squareFootMode = sfgCheckbox.checked;
  // Re-populate palette to show/hide badges
  populatePalette();
  // Simply re-apply the month filter to update correct counts/badges on the grid
  applyMonthFilter();
}

// Toggle border editing mode
function toggleBorderMode() {
  borderMode = borderModeCheckbox.checked;
  if (borderMode) {
    gardenArea.classList.add('border-editing');
  } else {
    gardenArea.classList.remove('border-editing');
  }
}

// Event listeners
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      showApp(data.username);
      // Show admin button if user is admin
      if (typeof onLoginSuccess === 'function') {
        onLoginSuccess(data);
      }
    } else {
      const err = await res.json();
      loginError.textContent = err.error || 'Login failed';
    }
  } catch (e) {
    loginError.textContent = 'Network error';
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  // clear state
  beds = [];
  gardenArea.innerHTML = '';
  showLogin();
});

addBedBtn.addEventListener('click', addBed);
saveGardenBtn.addEventListener('click', saveGarden);
loadGardenBtn.addEventListener('click', loadGarden);
sfgCheckbox.addEventListener('change', toggleSFGMode);
borderModeCheckbox.addEventListener('change', toggleBorderMode);

// Cancel border drag if pointer released outside cells
document.addEventListener('pointerup', () => {
  if (isBorderDragging) {
    cancelBorderDrag();
  }
});

// Filter plant palette when user types in search box
if (plantSearchInput) {
  plantSearchInput.addEventListener('input', populatePalette);
}

// Debounce function to limit rate of execution
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Plan and plant management buttons
if (savePlanBtn) savePlanBtn.addEventListener('click', savePlanAs);
if (managePlansBtn) managePlansBtn.addEventListener('click', openPlansOverlay);
if (managePlantsBtn) managePlantsBtn.addEventListener('click', openPlantsOverlay);
if (monthSlider) {
  // Use debounce for smooth sliding without UI freezing
  // 16ms = ~60fps target, but 50ms is safer for heavy DOM work
  monthSlider.addEventListener('input', debounce(applyMonthFilter, 20));
  // Update display immediately for feedback, but defer heavy rendering?
  // Ideally split: Update Text immediately, Update Grid debounced.
  monthSlider.addEventListener('input', () => {
    // Immediate UI update for the label text so it feels responsive
    const idx = parseInt(monthSlider.value, 10);
    const name = MONTH_NAMES[idx];
    if (currentMonthDisplay) currentMonthDisplay.textContent = name;
  });

  // Init display
  applyMonthFilter();
}
// monthFilterSelect removed.
if (cancelCopyBtn) cancelCopyBtn.addEventListener('click', cancelCopyMode);
if (plansCloseBtn) plansCloseBtn.addEventListener('click', closePlansOverlay);
if (plantsCloseBtn) plantsCloseBtn.addEventListener('click', closePlantsOverlay);
if (addCustomPlantBtn) addCustomPlantBtn.addEventListener('click', addCustomPlant);

// Summary button events
if (summaryBtn) summaryBtn.addEventListener('click', openSummaryOverlay);
if (summaryCloseBtn) summaryCloseBtn.addEventListener('click', closeSummaryOverlay);

// Search clear button
const searchClearBtn = document.getElementById('search-clear');
if (searchClearBtn) {
  searchClearBtn.addEventListener('click', () => {
    if (plantSearchInput) {
      plantSearchInput.value = '';
      populatePalette();
      plantSearchInput.focus();
    }
  });
}

// Cancel copy mode on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && copyMode) {
    cancelCopyMode();
  }
});

// Initialize on page load
initPage();

// Helper to highlight cell based on companion planting logic
function highlightCompanions(bed, r, c) {
  if (!draggedPlantDef) return;

  let score = 0;
  // Check 8 neighbors
  for (let nr = r - 1; nr <= r + 1; nr++) {
    for (let nc = c - 1; nc <= c + 1; nc++) {
      if (nr === r && nc === c) continue;
      const key = `${nr},${nc}`;
      const neighborInfo = bed.plants[key];
      if (neighborInfo) {
        const neighborPlant = PLANTS.find(p => p.id === neighborInfo.plantId);
        if (neighborPlant) {
          // Check if dragged plant lists neighbor as companion/antagonist
          // Use loose matching (includes) to handle 'onion' matching 'onion-red'
          if (draggedPlantDef.companions && draggedPlantDef.companions.some(comp => neighborPlant.id.toLowerCase().includes(comp.toLowerCase()))) {
            score++;
          }
          if (draggedPlantDef.antagonists && draggedPlantDef.antagonists.some(ant => neighborPlant.id.toLowerCase().includes(ant.toLowerCase()))) {
            score--;
          }
          // Check reverse: neighbor lists dragged plant
          if (neighborPlant.companions && neighborPlant.companions.some(comp => draggedPlantDef.id.toLowerCase().includes(comp.toLowerCase()))) {
            score++;
          }
          if (neighborPlant.antagonists && neighborPlant.antagonists.some(ant => draggedPlantDef.id.toLowerCase().includes(ant.toLowerCase()))) {
            score--;
          }
        }
      }
    }
  }

  const cell = bed.gridEl.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
  if (cell) {
    if (score > 0) cell.classList.add('companion-good');
    if (score < 0) cell.classList.add('companion-bad');
  }
}

function clearCompanionHighlights(cell) {
  if (cell) cell.classList.remove('companion-good', 'companion-bad');
}

// ========================================
// USER MANAGEMENT: Registration, Password Change, Admin Panel
// ========================================

// DOM references for user management
const registerForm = document.getElementById('register-form');
const authTitle = document.getElementById('auth-title');
const toggleToRegister = document.getElementById('toggle-to-register');
const toggleToLogin = document.getElementById('toggle-to-login');
const loginSuccess = document.getElementById('login-success');
const adminBtn = document.getElementById('admin-btn');
const adminOverlay = document.getElementById('admin-overlay');
const adminClose = document.getElementById('admin-close');
const userList = document.getElementById('user-list');
const changePasswordBtn = document.getElementById('change-password-btn');
const passwordOverlay = document.getElementById('password-overlay');
const passwordCancel = document.getElementById('password-cancel');
const passwordSave = document.getElementById('password-save');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const passwordError = document.getElementById('password-error');
const passwordSuccess = document.getElementById('password-success');

// Track if current user is admin
let currentUserIsAdmin = false;

// Toggle between login and register forms
if (toggleToRegister) {
  toggleToRegister.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    toggleToRegister.classList.add('hidden');
    toggleToLogin.classList.remove('hidden');
    authTitle.textContent = 'Create Account';
    loginError.textContent = '';
    if (loginSuccess) loginSuccess.classList.add('hidden');
  });
}

if (toggleToLogin) {
  toggleToLogin.addEventListener('click', () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    toggleToLogin.classList.add('hidden');
    toggleToRegister.classList.remove('hidden');
    authTitle.textContent = 'Garden Planner Login';
    loginError.textContent = '';
    if (loginSuccess) loginSuccess.classList.add('hidden');
  });
}

// Registration form submission
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uname = document.getElementById('reg-username').value.trim();
    const pwd = document.getElementById('reg-password').value;
    const pwdConfirm = document.getElementById('reg-password-confirm').value;

    loginError.textContent = '';
    if (loginSuccess) loginSuccess.classList.add('hidden');

    if (pwd !== pwdConfirm) {
      loginError.textContent = 'Passwords do not match';
      return;
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, password: pwd })
      });
      const data = await res.json();
      if (res.ok) {
        if (loginSuccess) {
          loginSuccess.textContent = data.message || 'Account created! Please login.';
          loginSuccess.classList.remove('hidden');
        }
        // Switch to login form
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        toggleToLogin.classList.add('hidden');
        toggleToRegister.classList.remove('hidden');
        authTitle.textContent = 'Garden Planner Login';
        // Pre-fill username
        document.getElementById('username').value = uname;
      } else {
        loginError.textContent = data.error || 'Registration failed';
      }
    } catch (err) {
      loginError.textContent = 'Network error';
    }
  });
}

// Remove login-page class and show admin button on successful login
function onLoginSuccess(userData) {
  document.body.classList.remove('login-page');
  currentUserIsAdmin = userData.isAdmin || false;
  if (currentUserIsAdmin && adminBtn) {
    adminBtn.classList.remove('hidden');
  }
}

// Modify the existing checkSession to include isAdmin handling
const originalCheckSession = window.checkSession;
window.checkSession = async function () {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      userInfo.textContent = `Logged in as: ${data.username}`;
      loginPanel.classList.add('hidden');
      appContainer.classList.remove('hidden');
      onLoginSuccess(data);
      return true;
    }
  } catch (e) { }
  return false;
};

// Password Change Dialog
if (changePasswordBtn) {
  changePasswordBtn.addEventListener('click', () => {
    if (passwordOverlay) {
      passwordOverlay.classList.remove('hidden');
      if (currentPasswordInput) currentPasswordInput.value = '';
      if (newPasswordInput) newPasswordInput.value = '';
      if (confirmPasswordInput) confirmPasswordInput.value = '';
      if (passwordError) passwordError.textContent = '';
      if (passwordSuccess) passwordSuccess.classList.add('hidden');
    }
  });
}

if (passwordCancel) {
  passwordCancel.addEventListener('click', () => {
    if (passwordOverlay) passwordOverlay.classList.add('hidden');
  });
}

if (passwordSave) {
  passwordSave.addEventListener('click', async () => {
    const currentPwd = currentPasswordInput?.value || '';
    const newPwd = newPasswordInput?.value || '';
    const confirmPwd = confirmPasswordInput?.value || '';

    if (passwordError) passwordError.textContent = '';
    if (passwordSuccess) passwordSuccess.classList.add('hidden');

    if (newPwd !== confirmPwd) {
      if (passwordError) passwordError.textContent = 'New passwords do not match';
      return;
    }

    if (newPwd.length < 4) {
      if (passwordError) passwordError.textContent = 'New password must be at least 4 characters';
      return;
    }

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
      });
      const data = await res.json();
      if (res.ok) {
        if (passwordSuccess) {
          passwordSuccess.textContent = data.message || 'Password changed successfully';
          passwordSuccess.classList.remove('hidden');
        }
        setTimeout(() => {
          if (passwordOverlay) passwordOverlay.classList.add('hidden');
        }, 1500);
      } else {
        if (passwordError) passwordError.textContent = data.error || 'Failed to change password';
      }
    } catch (err) {
      if (passwordError) passwordError.textContent = 'Network error';
    }
  });
}

// Admin Panel
if (adminBtn) {
  adminBtn.addEventListener('click', async () => {
    if (!adminOverlay || !userList) return;

    adminOverlay.classList.remove('hidden');
    userList.innerHTML = '<li>Loading...</li>';

    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        userList.innerHTML = '';
        data.users.forEach(u => {
          const li = document.createElement('li');
          const nameSpan = document.createElement('span');
          nameSpan.className = 'username';
          nameSpan.textContent = u.username;
          if (u.isAdmin) {
            const badge = document.createElement('span');
            badge.className = 'admin-badge';
            badge.textContent = 'ADMIN';
            nameSpan.appendChild(badge);
          }
          li.appendChild(nameSpan);

          if (!u.isAdmin) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', async () => {
              if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
              try {
                const delRes = await fetch(`/api/admin/users/${encodeURIComponent(u.username)}`, {
                  method: 'DELETE',
                  credentials: 'include'
                });
                if (delRes.ok) {
                  li.remove();
                } else {
                  const err = await delRes.json();
                  alert(err.error || 'Failed to delete user');
                }
              } catch (e) {
                alert('Network error');
              }
            });
            li.appendChild(deleteBtn);
          }
          userList.appendChild(li);
        });
      } else {
        userList.innerHTML = '<li>Failed to load users</li>';
      }
    } catch (err) {
      userList.innerHTML = '<li>Network error</li>';
    }
  });
}

if (adminClose) {
  adminClose.addEventListener('click', () => {
    if (adminOverlay) adminOverlay.classList.add('hidden');
  });
}

// Close overlays on background click
if (passwordOverlay) {
  passwordOverlay.addEventListener('click', (e) => {
    if (e.target === passwordOverlay) passwordOverlay.classList.add('hidden');
  });
}

if (adminOverlay) {
  adminOverlay.addEventListener('click', (e) => {
    if (e.target === adminOverlay) adminOverlay.classList.add('hidden');
  });
}

// ==========================================
// FIRST-RUN SETUP LOGIC
// ==========================================
const setupPanel = document.getElementById('setup-panel');
const setupForm = document.getElementById('setup-form');
const setupError = document.getElementById('setup-error');

// Check if setup is required on page load
async function checkSetupRequired() {
  try {
    const res = await fetch('/api/setup-required');
    if (res.ok) {
      const data = await res.json();
      if (data.setupRequired) {
        // Show setup panel, hide login panel
        if (loginPanel) loginPanel.classList.add('hidden');
        if (setupPanel) setupPanel.classList.remove('hidden');
      }
    }
  } catch (e) {
    console.error('Failed to check setup requirement', e);
  }
}

// Handle setup form submission
if (setupForm) {
  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setupError.textContent = '';

    const username = document.getElementById('setup-username').value.trim();
    const password = document.getElementById('setup-password').value;
    const confirm = document.getElementById('setup-password-confirm').value;

    if (password !== confirm) {
      setupError.textContent = 'Passwords do not match';
      return;
    }

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        alert('Admin account created successfully! Please log in.');
        // Switch to login view
        if (setupPanel) setupPanel.classList.add('hidden');
        if (loginPanel) loginPanel.classList.remove('hidden');
        setupForm.reset();
      } else {
        const err = await res.json();
        setupError.textContent = err.error || 'Setup failed';
      }
    } catch (e) {
      setupError.textContent = 'Network error';
    }
  });
}

// Run the check on load
document.addEventListener('DOMContentLoaded', () => {
  checkSetupRequired();
});