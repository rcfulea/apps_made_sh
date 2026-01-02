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
const PLANTS = [
  { id: 'tomato', label: 'Tomato', emoji: '🍅', perSquare: 1 },
  { id: 'carrot', label: 'Carrot', emoji: '🥕', perSquare: 16 },
  { id: 'lettuce', label: 'Lettuce', emoji: '🥬', perSquare: 4 },
  { id: 'cucumber', label: 'Cucumber', emoji: '🥒', perSquare: 2 },
  { id: 'pepper', label: 'Pepper', emoji: '🫑', perSquare: 1 },
  { id: 'beans', label: 'Beans', emoji: '🫘', perSquare: 9 },
  { id: 'pumpkin', label: 'Pumpkin', emoji: '🎃', perSquare: 1 },
  { id: 'strawberry', label: 'Strawberry', emoji: '🍓', perSquare: 4 },
  { id: 'garlic', label: 'Garlic', emoji: '🧄', perSquare: 9 },
  { id: 'onion', label: 'Onion', emoji: '🧅', perSquare: 16 },
  { id: 'basil', label: 'Basil', emoji: '🌿', perSquare: 1 },
  { id: 'broccoli', label: 'Broccoli', emoji: '🥦', perSquare: 1 },
  { id: 'cabbage', label: 'Cabbage', emoji: '🥬', perSquare: 1 },
  { id: 'corn', label: 'Corn', emoji: '🌽', perSquare: 4 },
  { id: 'radish', label: 'Radish', emoji: '🫜', perSquare: 16 },
  { id: 'beet', label: 'Beet', emoji: '🫜', perSquare: 9 },
  { id: 'eggplant', label: 'Eggplant', emoji: '🍆', perSquare: 1 },
  { id: 'kale', label: 'Kale', emoji: '🥬', perSquare: 1 },
  { id: 'melon', label: 'Melon', emoji: '🍉', perSquare: 1 },
  { id: 'peas', label: 'Peas', emoji: '🫛', perSquare: 8 },
  { id: 'turnip', label: 'Turnip', emoji: '🫜', perSquare: 9 },
  { id: 'leek', label: 'Leek', emoji: '🧅', perSquare: 4 },
  { id: 'parsnip', label: 'Parsnip', emoji: '🫜', perSquare: 16 },
  { id: 'potato', label: 'Potato', emoji: '🥔', perSquare: 4 },
  { id: 'spinach', label: 'Spinach', emoji: '🥬', perSquare: 9 },
  { id: 'chard', label: 'Swiss Chard', emoji: '🥬', perSquare: 4 },
  { id: 'okra', label: 'Okra', emoji: '🥒', perSquare: 1 },
  { id: 'celery', label: 'Celery', emoji: '🥬', perSquare: 1 },
  { id: 'collards', label: 'Collards', emoji: '🥬', perSquare: 1 },
  { id: 'parsley', label: 'Parsley', emoji: '🌿', perSquare: 1 },
  { id: 'kohlrabi', label: 'Kohlrabi', emoji: '🥬', perSquare: 4 },
  { id: 'greens', label: 'Greens', emoji: '🥬', perSquare: 9 },
  { id: 'tomatillo', label: 'Tomatillo', emoji: '🍅', perSquare: 1 },
  { id: 'radicchio', label: 'Radicchio', emoji: '🥬', perSquare: 4 },
  { id: 'zucchini', label: 'Zucchini', emoji: '🥒', perSquare: 2 }
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
const monthFilterSelect = document.getElementById('month-filter');
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

// Clipboard for copy/paste of plant configurations
let clipboardPlant = null;
let copyMode = false;

// Map of overrides for built‑in plants (id -> { label, perSquare, file })
let plantOverrides = {};

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

// Copy the current plant details (plantId, variety, date and months) into the clipboard
function copyPlantDetails() {
  if (!currentEditing) return;
  const { bed, cell } = currentEditing;
  const key = `${cell.dataset.row},${cell.dataset.col}`;
  const info = bed.plants[key];
  if (!info) return;
  clipboardPlant = {
    plantId: info.plantId,
    variety: info.variety || '',
    date: info.date || '',
    months: Array.isArray(info.months) ? [...info.months] : []
  };
  enableCopyMode();
  closePlantDetailsDialog();
}

// Paste the plant stored in the clipboard into the target cell. This
// preserves the copied variety/date/months and sets the tooltip.
function pastePlantInCell(bed, cell) {
  if (!clipboardPlant) return;
  const { plantId, variety, date, months } = clipboardPlant;
  // Place the plant visually
  placePlantInCell(bed, cell, plantId);
  // Store details
  const key = `${cell.dataset.row},${cell.dataset.col}`;
  bed.plants[key] = {
    plantId,
    variety: variety || '',
    date: date || '',
    months: Array.isArray(months) ? [...months] : []
  };
  // Update tooltip with variety/month/date
  setPlantDetailsTooltip(bed, cell);
  // Keep copy mode active so user can paste repeatedly
}

// Apply a month filter to the entire garden. When `month` is
// 'all', all plants are shown normally. Otherwise, plants whose
// months array does not include the selected month will appear
// faded. This function iterates all beds and their plants.
function applyMonthFilter() {
  const month = monthFilterSelect ? monthFilterSelect.value : 'all';
  beds.forEach((bed) => {
    const grid = bed.gridEl;
    if (!grid) return;
    const cells = grid.querySelectorAll('.cell');
    cells.forEach((cell) => {
      const key = `${cell.dataset.row},${cell.dataset.col}`;
      const info = bed.plants[key];
      const plantEl = cell.querySelector('.plant');
      if (!plantEl || !info) {
        cell.classList.remove('month-hidden');
        return;
      }
      if (month === 'all') {
        cell.classList.remove('month-hidden');
      } else {
        const months = info.months || [];
        if (months.includes(month)) {
          cell.classList.remove('month-hidden');
        } else {
          cell.classList.add('month-hidden');
        }
      }
    });
  });
}

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
      let plantId;
      let variety = '';
      let monthsArr = [];
      if (typeof info === 'string') {
        plantId = info;
      } else if (info) {
        plantId = info.plantId;
        if (info.variety) variety = info.variety;
        if (Array.isArray(info.months)) monthsArr = info.months;
      }
      if (!plantId) return;
      // Determine plant label (check overrides first, then built‑in)
      let label = plantId;
      if (plantOverrides[plantId] && plantOverrides[plantId].label) {
        label = plantOverrides[plantId].label;
      } else {
        const pDef = PLANTS.find((p) => p.id === plantId);
        if (pDef) label = pDef.label;
      }
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
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
    const custom = Array.isArray(data.plants) ? data.plants : [];
    const overrides = data.overrides && typeof data.overrides === 'object' ? data.overrides : {};
    // Reset overrides map
    plantOverrides = overrides;
    // Add custom plants
    custom.forEach((pl) => {
      if (!PLANTS.some((p) => p.id === pl.id)) {
        PLANTS.push({
          id: pl.id,
          label: pl.label,
          perSquare: pl.perSquare,
          icon: '/icons/' + pl.file,
          isCustom: true
        });
      }
    });
    // Apply overrides to built‑in plants
    Object.keys(overrides).forEach((id) => {
      const override = overrides[id];
      const plant = PLANTS.find((p) => p.id === id);
      if (plant) {
        if (override.label) plant.label = override.label;
        if (typeof override.perSquare === 'number') plant.perSquare = override.perSquare;
        if (override.file) plant.icon = '/icons/' + override.file;
        plant.isOverride = true;
      }
    });
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
      showApp(data.username);
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

function showApp(username) {
  loginPanel.classList.add('hidden');
  appContainer.classList.remove('hidden');
  userInfo.textContent = `Logged in as: ${username}`;
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
function populatePalette() {
  plantsContainer.innerHTML = '';
  const query = plantSearchInput ? plantSearchInput.value.trim().toLowerCase() : '';
  const toShow = PLANTS.filter((p) =>
    !query || p.label.toLowerCase().includes(query)
  );
  toShow.forEach((plant) => {
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
    // Count overlay for SFG mode
    const countSpan = document.createElement('span');
    countSpan.className = 'plant-count-overlay';
    countSpan.textContent = squareFootMode ? plant.perSquare : '';
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
      e.dataTransfer.setData('text/plain', plant.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    plantsContainer.appendChild(item);
  });
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
  const config = { widthMeters, heightMeters, cellSizeCm, rows, cols };
  const bed = {
    id: bedId,
    config,
    plants: {}, // key: "row,col" -> { plantId, variety, date }
    borders: {}, // key: "row,col" -> boolean
    gridEl: null,
    wrapperEl: null
  };
  beds.push(bed);
  createGridForBed(bed);
}

// Create grid DOM structure for a given bed.
function createGridForBed(bed) {
  const { rows, cols, cellSizeCm } = bed.config;
  // Create wrapper for the bed with a heading
  const wrapper = document.createElement('div');
  wrapper.className = 'bed-wrapper';
  const heading = document.createElement('div');
  heading.className = 'bed-heading';
  const index = beds.indexOf(bed) + 1;
  // Create text node for bed label
  const labelNode = document.createElement('span');
  labelNode.className = 'bed-title';
  labelNode.textContent = `Bed ${index}`;
  heading.appendChild(labelNode);
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
        e.dataTransfer.dropEffect = 'copy';
      });
      cell.addEventListener('dragleave', () => {
        cell.classList.remove('dragover');
      });
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('dragover');
        const plantId = e.dataTransfer.getData('text/plain');
        if (!plantId) return;
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
        // If in border mode, toggle border on this cell
        if (borderMode) {
          toggleBorderOnCell(bed, cell);
        } else {
          const plantElem = cell.querySelector('.plant');
          if (plantElem) {
            // Open details dialog on click
            openPlantDetailsDialog(bed, cell);
          }
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
function placePlantInCell(bed, cell, plantId) {
  // Remove existing plant if present
  const existing = cell.querySelector('.plant');
  if (existing) {
    existing.remove();
  }
  const plant = PLANTS.find((p) => p.id === plantId);
  if (!plant) return;
  // Create container for plant emoji/icon and count overlay
  const wrapper = document.createElement('span');
  wrapper.className = 'plant';
  // Determine whether to use an SVG icon or emoji
  if (plant.icon) {
    const imgEl = document.createElement('img');
    imgEl.src = plant.icon;
    imgEl.alt = plant.label;
    // Size similar to emoji (24px) so it doesn't fill the whole cell
    imgEl.style.width = '24px';
    imgEl.style.height = '24px';
    wrapper.appendChild(imgEl);
  } else {
    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'plant-emoji';
    emojiSpan.textContent = plant.emoji;
    wrapper.appendChild(emojiSpan);
  }
  // Count element (only visible in SFG mode)
  const countSpan = document.createElement('span');
  countSpan.className = 'plant-count';
  countSpan.textContent = squareFootMode ? plant.perSquare : '';
  wrapper.appendChild(countSpan);
  // Title attribute for tooltip
  wrapper.title = squareFootMode
    ? `${plant.label} – ${plant.perSquare} per square`
    : plant.label;
  cell.appendChild(wrapper);
  // Save plant info to bed.plants
  const key = `${cell.dataset.row},${cell.dataset.col}`;
  bed.plants[key] = {
    plantId: plant.id,
    variety: bed.plants[key]?.variety || '',
    date: bed.plants[key]?.date || '',
    months: Array.isArray(bed.plants[key]?.months) ? bed.plants[key].months : []
  };
}

// Remove plant from cell
function removePlantFromCell(bed, cell) {
  const existing = cell.querySelector('.plant');
  if (existing) existing.remove();
  const key = `${cell.dataset.row},${cell.dataset.col}`;
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

// Delete a bed with confirmation
function deleteBed(bed) {
  // Ask for confirmation before deleting
  const confirmed = confirm('Are you sure you want to delete this garden bed?');
  if (!confirmed) return;
  const index = beds.indexOf(bed);
  if (index === -1) return;
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
  const info = bed.plants[key];
  if (!info) return;
  currentEditing = { bed, cell };
  if (!detailsOverlay) {
    // Build overlay HTML
    detailsOverlay = document.createElement('div');
    detailsOverlay.className = 'details-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'details-dialog';
    dialog.innerHTML = `
      <h3>Plant Details</h3>
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
  const info = bed.plants[key];
  if (!info) {
    closePlantDetailsDialog();
    return;
  }
  const varietyInput = detailsOverlay.querySelector('#detail-variety');
  const monthsChecked = Array.from(
    detailsOverlay.querySelectorAll('#detail-months input[type="checkbox"]:checked')
  ).map((cb) => cb.value);
  info.variety = varietyInput.value.trim();
  info.months = monthsChecked;
  // Update tooltip
  setPlantDetailsTooltip(bed, cell);
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
              bed.plants[`${row},${col}`] = { plantId, variety: '', date: '', months: [] };
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
function setPlantDetailsTooltip(bed, cell) {
  const key = `${cell.dataset.row},${cell.dataset.col}`;
  const info = bed.plants[key];
  const plantElem = cell.querySelector('.plant');
  if (!plantElem || !info) return;
  const plant = PLANTS.find((p) => p.id === info.plantId);
  let title = plant ? plant.label : '';
  if (squareFootMode && plant) title += ` – ${plant.perSquare} per square`;
  if (info.variety) title += `\nVariety: ${info.variety}`;
  if (info.months && info.months.length) title += `\nMonths: ${info.months.join(', ')}`;
  if (info.date) title += `\nPlanted: ${info.date}`;
  plantElem.title = title;
}

// Toggle Square Foot Gardening mode on/off
function toggleSFGMode() {
  squareFootMode = sfgCheckbox.checked;
  populatePalette();
  // Update all existing plant counts in grids
  beds.forEach((bed) => {
    Object.keys(bed.plants).forEach((key) => {
      const [r, c] = key.split(',').map((n) => parseInt(n, 10));
      const info = bed.plants[key];
      const cell = bed.gridEl.querySelector(
        `.cell[data-row='${r}'][data-col='${c}']`
      );
      if (!cell) return;
      const plantElem = cell.querySelector('.plant');
      if (plantElem) {
        const countSpan = plantElem.querySelector('.plant-count');
        const plant = PLANTS.find((p) => p.id === info.plantId);
        if (countSpan && plant) {
          countSpan.textContent = squareFootMode ? plant.perSquare : '';
        }
        // Update tooltip
        setPlantDetailsTooltip(bed, cell);
      }
    });
  });
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

// Filter plant palette when user types in search box
if (plantSearchInput) {
  plantSearchInput.addEventListener('input', populatePalette);
}

// Plan and plant management buttons
if (savePlanBtn) savePlanBtn.addEventListener('click', savePlanAs);
if (managePlansBtn) managePlansBtn.addEventListener('click', openPlansOverlay);
if (managePlantsBtn) managePlantsBtn.addEventListener('click', openPlantsOverlay);
if (monthFilterSelect) monthFilterSelect.addEventListener('change', applyMonthFilter);
if (cancelCopyBtn) cancelCopyBtn.addEventListener('click', cancelCopyMode);
if (plansCloseBtn) plansCloseBtn.addEventListener('click', closePlansOverlay);
if (plantsCloseBtn) plantsCloseBtn.addEventListener('click', closePlantsOverlay);
if (addCustomPlantBtn) addCustomPlantBtn.addEventListener('click', addCustomPlant);

// Summary button events
if (summaryBtn) summaryBtn.addEventListener('click', openSummaryOverlay);
if (summaryCloseBtn) summaryCloseBtn.addEventListener('click', closeSummaryOverlay);

// Cancel copy mode on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && copyMode) {
    cancelCopyMode();
  }
});

// Initialize on page load
initPage();