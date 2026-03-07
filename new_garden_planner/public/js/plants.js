/**
 * Plants Module
 * Handles plant palette, search, and plant info display
 */

const Plants = (() => {
  let plantData = [];
  let filteredPlants = [];

  // DOM Elements
  const paletteEl = document.getElementById('plant-palette');
  const searchInput = document.getElementById('plant-search');
  const searchClear = document.getElementById('search-clear');
  const detailsPanel = document.getElementById('plant-details');
  const detailsContent = document.getElementById('details-content');
  const closeDetailsBtn = document.getElementById('close-details');

  /**
   * Load plants from server or local data
   */
  async function loadPlants() {
    try {
      const response = await API.getPlants();
      plantData = response.plants || [];
    } catch (error) {
      console.warn('Failed to load plants from API, using local data');
      // Fallback - load from local JSON
      try {
        const response = await fetch('/data/plants.json');
        const data = await response.json();
        plantData = data.plants || [];
      } catch (e) {
        console.error('Failed to load plants:', e);
        plantData = [];
      }
    }

    State.set({ plants: plantData });
    filteredPlants = [...plantData];
    render();
  }

  /**
   * Filter plants by search query
   */
  function filter(query) {
    const q = query.toLowerCase().trim();

    if (!q) {
      filteredPlants = [...plantData];
    } else {
      filteredPlants = plantData.filter(plant =>
        plant.label.toLowerCase().includes(q) ||
        plant.id.toLowerCase().includes(q) ||
        (plant.family && plant.family.toLowerCase().includes(q))
      );
    }

    // Update clear button visibility
    if (searchClear) {
      searchClear.classList.toggle('hidden', !q);
    }

    render();
  }

  /**
   * Render plant palette
   */
  function render() {
    if (!paletteEl) return;

    const sfgMode = State.getProperty('sfgMode');

    paletteEl.innerHTML = filteredPlants.map(plant => `
      <div class="plant-item" 
           draggable="true" 
           data-plant-id="${plant.id}"
           title="${plant.label}">
        <img class="plant-icon" 
             src="icons/${plant.file || plant.id + '.svg'}" 
             alt="${plant.label}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><text y=%2230%22 font-size=%2224%22>${plant.emoji || '🌱'}</text></svg>'">
        <div class="plant-info">
          <div class="plant-name">${plant.label}</div>
          <div class="plant-meta">${plant.family || ''}</div>
        </div>
        ${sfgMode && plant.perSquare ? `<span class="plant-badge">${plant.perSquare}/sq</span>` : ''}
      </div>
    `).join('');

    // Attach drag handlers
    attachDragHandlers();
  }

  /**
   * Attach drag event handlers to plant items
   */
  function attachDragHandlers() {
    const items = paletteEl.querySelectorAll('.plant-item');

    items.forEach(item => {
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragend', handleDragEnd);
      item.addEventListener('click', handlePlantClick);
    });
  }

  /**
   * Handle drag start
   */
  function handleDragStart(e) {
    const plantId = e.currentTarget.dataset.plantId;
    const plant = getPlant(plantId);

    if (!plant) return;

    State.set({ draggedPlant: plant });
    e.currentTarget.classList.add('dragging');

    // Set drag data
    e.dataTransfer.setData('text/plain', plantId);
    e.dataTransfer.effectAllowed = 'copy';

    // Create custom drag ghost
    const ghost = createDragGhost(plant);
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 25, 25);

    // Remove ghost after a tick
    setTimeout(() => ghost.remove(), 0);
  }

  /**
   * Handle drag end
   */
  function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    State.set({ draggedPlant: null });
  }

  /**
   * Create custom drag ghost element
   */
  function createDragGhost(plant) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML = `<img src="icons/${plant.file || plant.id + '.svg'}" alt="${plant.label}">`;
    ghost.style.position = 'fixed';
    ghost.style.top = '-100px';
    ghost.style.left = '-100px';
    return ghost;
  }

  /**
   * Handle plant click - show details
   */
  function handlePlantClick(e) {
    const plantId = e.currentTarget.dataset.plantId;
    showDetails(plantId);
  }

  /**
   * Show plant details in sidebar
   */
  function showDetails(plantId) {
    const plant = getPlant(plantId);
    if (!plant || !detailsPanel || !detailsContent) return;

    const companions = plant.companions || [];
    const antagonists = plant.antagonists || [];

    detailsContent.innerHTML = `
      <img class="detail-plant-icon" 
           src="icons/${plant.file || plant.id + '.svg'}" 
           alt="${plant.label}">
      <h3 style="text-align: center; margin-bottom: 16px;">${plant.label}</h3>
      
      ${plant.family ? `
        <div class="detail-section">
          <h4>Family</h4>
          <p>${plant.family}</p>
        </div>
      ` : ''}
      
      ${plant.perSquare ? `
        <div class="detail-section">
          <h4>Square Foot Gardening</h4>
          <p>${plant.perSquare} plants per square foot</p>
        </div>
      ` : ''}
      
      ${companions.length > 0 ? `
        <div class="detail-section">
          <h4>Companions</h4>
          <div class="detail-tags">
            ${companions.map(c => `<span class="tag tag-companion">${c}</span>`).join('')}
          </div>
        </div>
      ` : ''}
      
      ${antagonists.length > 0 ? `
        <div class="detail-section">
          <h4>Antagonists</h4>
          <div class="detail-tags">
            ${antagonists.map(a => `<span class="tag tag-antagonist">${a}</span>`).join('')}
          </div>
        </div>
      ` : ''}
      
      ${plant.sowIndoor !== undefined || plant.sowOutdoor !== undefined ? `
        <div class="detail-section">
          <h4>Sowing</h4>
          <p>
            ${plant.sowIndoor !== undefined ? `Indoor: ${formatWeeksFromLastFrost(plant.sowIndoor)}<br>` : ''}
            ${plant.sowOutdoor !== undefined ? `Outdoor: ${formatWeeksFromLastFrost(plant.sowOutdoor)}` : ''}
          </p>
        </div>
      ` : ''}
      
      ${plant.harvest !== undefined ? `
        <div class="detail-section">
          <h4>Harvest</h4>
          <p>${plant.harvest} weeks from sowing</p>
        </div>
      ` : ''}
    `;

    detailsPanel.classList.remove('hidden');
  }

  /**
   * Hide details panel
   */
  function hideDetails() {
    if (detailsPanel) {
      detailsPanel.classList.add('hidden');
    }
  }

  /**
   * Format weeks from last frost
   */
  function formatWeeksFromLastFrost(weeks) {
    if (weeks < 0) {
      return `${Math.abs(weeks)} weeks before last frost`;
    } else {
      return `${weeks} weeks after last frost`;
    }
  }

  /**
   * Get plant by ID
   */
  function getPlant(plantId) {
    return plantData.find(p => p.id === plantId);
  }

  /**
   * Initialize module
   */
  function init() {
    // Search handler
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filter(e.target.value);
      });
    }

    // Clear search button
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          filter('');
          searchInput.focus();
        }
      });
    }

    // Close details button
    if (closeDetailsBtn) {
      closeDetailsBtn.addEventListener('click', hideDetails);
    }

    // Subscribe to SFG mode changes
    State.subscribe('sfgModeChange', () => {
      render();
    });

    // Load plants
    loadPlants();
  }

  // Public API
  return {
    init,
    loadPlants,
    getPlant,
    filter,
    render,
    showDetails,
    hideDetails,
  };
})();
