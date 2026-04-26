/**
 * Main Application Module
 * Handles initialization, modals, auth, and global UI
 */

const App = (() => {
    // DOM Elements
    const loginPanel = document.getElementById('login-panel');
    const setupPanel = document.getElementById('setup-panel');
    const appContainer = document.getElementById('app');
    const modalOverlay = document.getElementById('modal-overlay');

    // Current edit state
    let editingBedId = null;
    let editingCellIndex = null;

    // Clipboard for copy/paste
    let clipboard = null;
    let selectedBedId = null;
    let selectedCellIndex = null;

    /**
     * Initialize application
     */
    async function init() {
        // Check if setup is required
        try {
            const { setupRequired } = await API.checkSetupRequired();

            if (setupRequired) {
                showSetup();
            } else {
                // Try to restore session
                try {
                    const user = await API.checkSession();
                    showApp(user);
                } catch {
                    showLogin();
                }
            }
        } catch (error) {
            console.error('Init error:', error);
            showLogin();
        }

        // Initialize modules
        Plants.init();
        Timeline.init();
        Borders.init();
        Garden.init();

        // Setup event handlers
        setupAuthHandlers();
        setupModalHandlers();
        setupToolbarHandlers();
        setupPlantManagementHandlers();
        setupKeyboardShortcuts();
        setupCellEditHandlers();
        setupCompanionHighlights();
        setupNotesHandlers();
        setupStatsAndRotationHandlers();
        setupJournalHandlers();
    }

    // ==========================================
    // View Management
    // ==========================================

    function showLogin() {
        loginPanel?.classList.remove('hidden');
        setupPanel?.classList.add('hidden');
        appContainer?.classList.add('hidden');
    }

    function showSetup() {
        loginPanel?.classList.add('hidden');
        setupPanel?.classList.remove('hidden');
        appContainer?.classList.add('hidden');
    }

    function showApp(user) {
        loginPanel?.classList.add('hidden');
        setupPanel?.classList.add('hidden');
        appContainer?.classList.remove('hidden');

        State.set({ user: user.username, isAdmin: user.isAdmin });

        // Update UI
        const userDisplay = document.getElementById('user-display');
        const adminBtn = document.getElementById('btn-admin');

        if (userDisplay) userDisplay.textContent = user.username;
        if (adminBtn) adminBtn.classList.toggle('hidden', !user.isAdmin);

        // Load garden data
        loadGarden();
    }

    // ==========================================
    // Auth Handlers
    // ==========================================

    function setupAuthHandlers() {
        // Login form
        const loginForm = document.getElementById('login-form');
        const loginError = document.getElementById('login-error');

        loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginError.textContent = '';

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const isRegister = loginForm.getAttribute('data-mode') === 'register';

            try {
                let user;
                if (isRegister) {
                    user = await API.register(username, password);
                    showToast('Account created!', 'success');
                } else {
                    user = await API.login(username, password);
                }
                showApp(user);
            } catch (error) {
                loginError.textContent = error.message || (isRegister ? 'Registration failed' : 'Login failed');
            }
        });

        // Setup form
        const setupForm = document.getElementById('setup-form');
        const setupError = document.getElementById('setup-error');

        setupForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            setupError.textContent = '';

            const username = document.getElementById('setup-username').value.trim();
            const password = document.getElementById('setup-password').value;
            const confirm = document.getElementById('setup-confirm').value;

            if (password !== confirm) {
                setupError.textContent = 'Passwords do not match';
                return;
            }

            try {
                await API.setup(username, password);
                showToast('Admin account created! Please log in.', 'success');
                showLogin();
            } catch (error) {
                setupError.textContent = error.message || 'Setup failed';
            }
        });

        // Toggle between login and register
        const toggleToRegister = document.getElementById('toggle-to-register');
        const toggleToLogin = document.getElementById('toggle-to-login');

        toggleToRegister?.addEventListener('click', (e) => {
            e.preventDefault();
            toggleToRegister.classList.add('hidden');
            toggleToLogin?.classList.remove('hidden');
            // Switch form to register mode
            const loginBtn = loginForm?.querySelector('button[type="submit"]');
            if (loginBtn) loginBtn.textContent = 'Register';
            loginForm?.setAttribute('data-mode', 'register');
        });

        toggleToLogin?.addEventListener('click', (e) => {
            e.preventDefault();
            toggleToLogin.classList.add('hidden');
            toggleToRegister?.classList.remove('hidden');
            const loginBtn = loginForm?.querySelector('button[type="submit"]');
            if (loginBtn) loginBtn.textContent = 'Login';
            loginForm?.setAttribute('data-mode', 'login');
        });

        // Logout
        document.getElementById('btn-logout')?.addEventListener('click', async () => {
            try {
                await API.logout();
            } catch { }
            State.clearAll();
            showLogin();
        });

        // Change Password button
        document.getElementById('btn-password')?.addEventListener('click', () => {
            // Clear form
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-new-password').value = '';
            document.getElementById('password-error').textContent = '';
            openModal('modal-password');
        });

        // Confirm password change
        document.getElementById('btn-confirm-password')?.addEventListener('click', async () => {
            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-new-password').value;
            const errorEl = document.getElementById('password-error');

            errorEl.textContent = '';

            if (!currentPassword || !newPassword) {
                errorEl.textContent = 'Please fill in all fields';
                return;
            }

            if (newPassword !== confirmPassword) {
                errorEl.textContent = 'New passwords do not match';
                return;
            }

            if (newPassword.length < 4) {
                errorEl.textContent = 'Password must be at least 4 characters';
                return;
            }

            try {
                await API.changePassword(currentPassword, newPassword);
                closeModal();
                showToast('Password updated successfully!', 'success');
            } catch (error) {
                errorEl.textContent = error.message || 'Failed to update password';
            }
        });

        // Admin button - manage users
        document.getElementById('btn-admin')?.addEventListener('click', async () => {
            await loadUserList();
            openModal('modal-admin');
        });
    }

    // Load user list for admin panel
    async function loadUserList() {
        const listEl = document.getElementById('admin-user-list');
        if (!listEl) return;

        try {
            const response = await API.getUsers();
            const users = response.users || [];
            const currentUser = State.getProperty('user');

            listEl.innerHTML = users.map(user => `
                <div class="admin-user-item">
                    <div class="admin-user-info">
                        <span class="admin-user-name">${user.username}</span>
                        ${user.isAdmin ? '<span class="admin-badge">Admin</span>' : ''}
                    </div>
                    <div class="admin-user-actions">
                        ${user.username !== currentUser ? `
                            <button class="btn btn-sm btn-secondary" onclick="App.toggleAdmin('${user.username}', ${!user.isAdmin})">
                                ${user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="App.deleteUser('${user.username}')">
                                Delete
                            </button>
                        ` : '<span class="current-user-label">(You)</span>'}
                    </div>
                </div>
            `).join('');
        } catch (error) {
            listEl.innerHTML = `<p class="error-message">Failed to load users: ${error.message}</p>`;
        }
    }

    async function toggleAdmin(username, makeAdmin) {
        try {
            await API.toggleUserAdmin(username, makeAdmin);
            await loadUserList();
            showToast(`${username} ${makeAdmin ? 'is now an admin' : 'is no longer an admin'}`, 'success');
        } catch (error) {
            showToast(error.message || 'Failed to update user', 'error');
        }
    }

    async function deleteUser(username) {
        if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;

        try {
            await API.deleteUser(username);
            await loadUserList();
            showToast(`User ${username} deleted`, 'success');
        } catch (error) {
            showToast(error.message || 'Failed to delete user', 'error');
        }
    }

    // ==========================================
    // Toolbar Handlers
    // ==========================================

    function setupToolbarHandlers() {
        // Add Bed button
        document.getElementById('btn-add-bed')?.addEventListener('click', () => {
            openModal('modal-add-bed');
        });

        // Live preview for Add Area modal
        function updateAddAreaPreview() {
            const wM = parseFloat(document.getElementById('bed-width').value) || 0;
            const hM = parseFloat(document.getElementById('bed-height').value) || 0;
            const w = Math.max(1, Math.round(wM / 0.3048));
            const h = Math.max(1, Math.round(hM / 0.3048));
            const preview = document.getElementById('bed-cells-preview');
            if (preview) preview.textContent = `→ ${w} × ${h} sq ft cells`;
        }
        document.getElementById('bed-width')?.addEventListener('input', updateAddAreaPreview);
        document.getElementById('bed-height')?.addEventListener('input', updateAddAreaPreview);
        updateAddAreaPreview();

        // Confirm Add Area
        document.getElementById('btn-confirm-add-bed')?.addEventListener('click', () => {
            const name = document.getElementById('bed-name').value.trim();
            const widthM = parseFloat(document.getElementById('bed-width').value) || 1.2;
            const heightM = parseFloat(document.getElementById('bed-height').value) || 0.6;
            const width = Math.max(1, Math.round(widthM / 0.3048));
            const height = Math.max(1, Math.round(heightM / 0.3048));

            State.addBed(name, width, height, 30.48);
            closeModal();
            showToast('Area added!', 'success');

            // Reset form
            document.getElementById('bed-name').value = '';
            document.getElementById('bed-width').value = '1.2';
            document.getElementById('bed-height').value = '0.6';
            updateAddAreaPreview();
        });

        // Save button — saves to current named plan if one is active, else saves working garden
        document.getElementById('btn-save')?.addEventListener('click', saveCurrent);

        // Save As button
        document.getElementById('btn-save-as')?.addEventListener('click', () => {
            const current = State.getProperty('currentPlanName');
            const input = document.getElementById('save-as-name');
            if (input && current && current !== 'default') input.value = current;
            openModal('modal-save-as');
        });

        // Load button
        document.getElementById('btn-load')?.addEventListener('click', () => {
            openModal('modal-plans');
            loadPlansList();
        });

        // SFG mode toggle (button)
        const sfgBtn = document.getElementById('toggle-sfg');
        sfgBtn?.addEventListener('click', () => {
            const isActive = sfgBtn.classList.toggle('active');
            State.set({ sfgMode: isActive });
            Garden.renderAll();
        });

        // Border mode toggle (button)
        const borderBtn = document.getElementById('toggle-borders');
        borderBtn?.addEventListener('click', () => {
            const isActive = borderBtn.classList.toggle('active');
            State.set({ mode: isActive ? 'border' : 'plant' });
        });

        // Summary button
        document.getElementById('btn-summary')?.addEventListener('click', () => {
            generateSummary();
            openModal('modal-summary');
        });

        // Undo button
        document.getElementById('btn-undo')?.addEventListener('click', () => {
            if (State.undo()) {
                showToast('Undone!', 'info');
            } else {
                showToast('Nothing to undo', 'info');
            }
        });
    }

    /**
     * Generate plant summary for all beds
     */
    function generateSummary() {
        const summaryContent = document.getElementById('summary-content');
        if (!summaryContent) return;

        const beds = State.getProperty('beds') || [];
        const plants = State.getProperty('plants') || [];
        const borderedOnly = document.getElementById('summary-bordered-only')?.checked || false;

        // Helper: check if a cell has any borders
        function cellHasBorder(bedId, cellIndex) {
            return ['top','right','bottom','left'].some(side => State.hasBorder(bedId, cellIndex, side));
        }

        // Collect all plants across all beds
        const plantCounts = {};
        let totalCells = 0;
        let usedCells = 0;
        let totalPlantsWithSFG = 0;

        beds.forEach(bed => {
            bed.cells.forEach((cell, cellIdx) => {
                // If bordered-only mode, skip cells without borders
                if (borderedOnly && !cellHasBorder(bed.id, cellIdx)) return;

                totalCells++;
                if (cell && cell.plantings) {
                    cell.plantings.forEach(planting => {
                        usedCells++;
                        const key = planting.plantId + (planting.variety ? `|${planting.variety}` : '');

                        // Get plant data for perSquare
                        const plant = plants.find(p => p.id === planting.plantId);
                        const perSquare = plant?.perSquare || 1;

                        if (!plantCounts[key]) {
                            plantCounts[key] = {
                                plantId: planting.plantId,
                                variety: planting.variety,
                                cellCount: 0,
                                sfgTotal: 0,
                                perSquare: perSquare,
                                activeMonths: new Set()
                            };
                        }
                        plantCounts[key].cellCount++;
                        plantCounts[key].sfgTotal += perSquare;
                        totalPlantsWithSFG += perSquare;

                        // Track active months
                        const months = planting.activeMonths || [0];
                        months.forEach(m => plantCounts[key].activeMonths.add(m));
                    });
                } else if (cell && cell.plantId) {
                    // Legacy format fallback
                    usedCells++;
                    const key = cell.plantId + (cell.variety ? `|${cell.variety}` : '');
                    const plant = plants.find(p => p.id === cell.plantId);
                    const perSquare = plant?.perSquare || 1;
                    if (!plantCounts[key]) {
                        plantCounts[key] = {
                            plantId: cell.plantId,
                            variety: cell.variety,
                            cellCount: 0,
                            sfgTotal: 0,
                            perSquare: perSquare,
                            activeMonths: new Set()
                        };
                    }
                    plantCounts[key].cellCount++;
                    plantCounts[key].sfgTotal += perSquare;
                    totalPlantsWithSFG += perSquare;
                    const months = cell.activeMonths || [0];
                    months.forEach(m => plantCounts[key].activeMonths.add(m));
                }
            });
        });

        // Build HTML
        let html = '';

        // Bordered-only toggle
        html += `
            <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;">
                <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:13px;">
                    <input type="checkbox" id="summary-bordered-only" ${borderedOnly ? 'checked' : ''}>
                    Count only outlined cells
                </label>
            </div>
        `;

        // Stats section - show both cells and total plants
        html += `
            <div class="summary-stats">
                <div class="summary-stat">
                    <div class="summary-stat-value">${beds.length}</div>
                    <div class="summary-stat-label">Areas</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-value">${usedCells}</div>
                    <div class="summary-stat-label">Cells Used</div>
                </div>
                <div class="summary-stat highlight">
                    <div class="summary-stat-value">${totalPlantsWithSFG}</div>
                    <div class="summary-stat-label">Total Plants (SFG)</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-value">${Object.keys(plantCounts).length}</div>
                    <div class="summary-stat-label">Varieties</div>
                </div>
            </div>
        `;

        if (Object.keys(plantCounts).length === 0) {
            html += '<div class="summary-empty">No plants in your garden yet. Start by dragging plants from the sidebar!</div>';
        } else {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            // Sort by sfgTotal descending
            const sortedPlants = Object.values(plantCounts).sort((a, b) => b.sfgTotal - a.sfgTotal);

            html += '<div class="summary-bed"><h4>All Plants</h4>';

            sortedPlants.forEach(item => {
                const plant = plants.find(p => p.id === item.plantId);
                const plantName = plant ? plant.label : item.plantId;
                const icon = plant ? (plant.file || plant.id + '.svg') : '';
                const variety = item.variety ? ` (${item.variety})` : '';
                const monthsArr = Array.from(item.activeMonths).sort((a, b) => a - b);
                const monthsStr = monthsArr.map(m => monthNames[m]).join(', ');

                // Show both cells and total plants for SFG
                const sfgInfo = item.perSquare > 1
                    ? `<strong>${item.cellCount}</strong> cells × <strong>${item.perSquare}</strong>/sq = <strong class="sfg-total">${item.sfgTotal}</strong> plants`
                    : `<strong>${item.cellCount}</strong> planted`;

                html += `
                    <div class="summary-plant">
                        ${icon ? `<img src="icons/${icon}" alt="${plantName}">` : ''}
                        <div class="summary-plant-info">
                            <div class="summary-plant-name">${plantName}${variety}</div>
                            <div class="summary-plant-meta">
                                ${sfgInfo}
                                ${monthsStr ? ` • Active: ${monthsStr}` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        }

        summaryContent.innerHTML = html;

        // Wire up bordered-only toggle to re-generate
        document.getElementById('summary-bordered-only')?.addEventListener('change', () => {
            generateSummary();
        });
    }

    // ==========================================
    // Modal Handlers
    // ==========================================

    function setupModalHandlers() {
        // Close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });

        // Overlay click to close
        modalOverlay?.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });

        // Live preview for Resize Area modal
        function updateResizePreview() {
            const wM = parseFloat(document.getElementById('resize-width').value) || 0;
            const hM = parseFloat(document.getElementById('resize-height').value) || 0;
            const w = Math.max(1, Math.round(wM / 0.3048));
            const h = Math.max(1, Math.round(hM / 0.3048));
            const preview = document.getElementById('resize-cells-preview');
            if (preview) preview.textContent = `→ ${w} × ${h} sq ft cells`;
        }
        document.getElementById('resize-width')?.addEventListener('input', updateResizePreview);
        document.getElementById('resize-height')?.addEventListener('input', updateResizePreview);

        // Resize modal
        document.getElementById('btn-confirm-resize')?.addEventListener('click', () => {
            if (!editingBedId) return;

            const widthM = parseFloat(document.getElementById('resize-width').value);
            const heightM = parseFloat(document.getElementById('resize-height').value);
            const width = Math.max(1, Math.round(widthM / 0.3048));
            const height = Math.max(1, Math.round(heightM / 0.3048));

            State.resizeBed(editingBedId, width, height);
            closeModal();
            showToast('Area resized!', 'success');
        });

        // Month toggle handlers
        document.querySelectorAll('.month-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
            });
        });

        // Plant edit modal - Save
        document.getElementById('btn-save-plant')?.addEventListener('click', () => {
            if (editingBedId === null || editingCellIndex === null) return;

            const variety = document.getElementById('plant-variety').value.trim();

            // Get all active months
            const activeMonths = [];
            document.querySelectorAll('.month-toggle.active').forEach(btn => {
                activeMonths.push(parseInt(btn.dataset.month));
            });

            const viewMonth = State.getProperty('viewMonth');
            const activePlanting = State.getActivePlanting(editingBedId, editingCellIndex, viewMonth);
            if (activePlanting) {
                State.placeCell(editingBedId, editingCellIndex, activePlanting.plantId, variety, activeMonths);
            }

            closeModal();
            showToast('Plant updated!', 'success');
        });

        document.getElementById('btn-remove-plant')?.addEventListener('click', () => {
            if (editingBedId === null || editingCellIndex === null) return;

            State.clearCell(editingBedId, editingCellIndex);
            closeModal();
            showToast('Plant removed', 'info');
        });

        // Save As modal confirm
        document.getElementById('btn-confirm-save-as')?.addEventListener('click', async () => {
            const name = document.getElementById('save-as-name').value.trim();
            if (!name) {
                showToast('Please enter a plan name', 'error');
                return;
            }

            try {
                await API.savePlan(name, State.serialize());
                State.set({ currentPlanName: name });
                updatePlanDisplay();
                closeModal();
                showToast(`Saved as "${name}"`, 'success');
            } catch (error) {
                showToast(error.message || 'Save failed', 'error');
            }
        });
    }

    function openModal(modalId) {
        modalOverlay?.classList.remove('hidden');
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        document.getElementById(modalId)?.classList.remove('hidden');
    }

    function closeModal() {
        modalOverlay?.classList.add('hidden');
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        editingBedId = null;
        editingCellIndex = null;
    }

    /**
     * Open resize modal for a bed
     */
    function openResizeModal(bedId) {
        const bed = State.getBed(bedId);
        if (!bed) return;

        editingBedId = bedId;

        document.getElementById('resize-width').value = (bed.width * 0.3048).toFixed(2);
        document.getElementById('resize-height').value = (bed.height * 0.3048).toFixed(2);
        document.getElementById('resize-warning')?.classList.add('hidden');
        const preview = document.getElementById('resize-cells-preview');
        if (preview) preview.textContent = `→ ${bed.width} × ${bed.height} sq ft cells`;

        openModal('modal-resize-bed');
    }

    /**
     * Open plant edit modal
     */
    function openPlantEditModal(bedId, cellIndex, cell) {
        editingBedId = bedId;
        editingCellIndex = cellIndex;

        document.getElementById('plant-variety').value = cell.variety || '';

        // Reset all month toggles
        document.querySelectorAll('.month-toggle').forEach(btn => {
            btn.classList.remove('active');
        });

        // Activate the saved months
        const activeMonths = cell.activeMonths || [cell.plantMonth || 0];
        activeMonths.forEach(month => {
            const btn = document.querySelector(`.month-toggle[data-month="${month}"]`);
            if (btn) btn.classList.add('active');
        });

        openModal('modal-plant-edit');
    }

    // ==========================================
    // Save/Load
    // ==========================================

    async function saveGarden() {
        try {
            await API.saveGarden(State.serialize());
            showToast('Garden saved!', 'success');
        } catch (error) {
            showToast(error.message || 'Save failed', 'error');
        }
    }

    async function saveCurrent() {
        const planName = State.getProperty('currentPlanName');
        if (planName && planName !== 'default') {
            try {
                await API.savePlan(planName, State.serialize());
                showToast(`Saved "${planName}"`, 'success');
            } catch (error) {
                showToast(error.message || 'Save failed', 'error');
            }
        } else {
            await saveGarden();
        }
    }

    async function loadGarden() {
        try {
            const data = await API.loadGarden();
            State.deserialize(data);
            updatePlanDisplay();
        } catch (error) {
            console.warn('No saved garden found');
        }
    }

    async function loadPlansList() {
        const listEl = document.getElementById('plans-list');
        if (!listEl) return;

        try {
            const { plans } = await API.getPlans();

            if (!plans || plans.length === 0) {
                listEl.innerHTML = '<p style="color: var(--color-text-secondary);">No saved plans</p>';
                return;
            }

            listEl.innerHTML = plans.map(name => `
        <div class="plan-item ${name === State.getProperty('currentPlanName') ? 'active' : ''}" 
             data-plan-name="${name}">
          <span>${name}</span>
          <button class="btn btn-icon" data-action="delete" title="Delete">×</button>
        </div>
      `).join('');

            // Attach handlers
            listEl.querySelectorAll('.plan-item').forEach(item => {
                const planName = item.dataset.planName;

                item.addEventListener('click', async (e) => {
                    if (e.target.dataset.action === 'delete') {
                        if (confirm(`Delete plan "${planName}"?`)) {
                            await API.deletePlan(planName);
                            loadPlansList();
                        }
                        return;
                    }

                    // Load plan
                    const data = await API.loadPlan(planName);
                    State.deserialize(data);
                    State.set({ currentPlanName: planName });
                    updatePlanDisplay();
                    closeModal();
                    showToast(`Loaded "${planName}"`, 'success');
                });
            });
        } catch (error) {
            listEl.innerHTML = '<p style="color: var(--color-error);">Failed to load plans</p>';
        }
    }

    function updatePlanDisplay() {
        const planName = State.getProperty('currentPlanName');
        const planNameEl = document.getElementById('current-plan-name');
        if (planNameEl) planNameEl.textContent = planName && planName !== 'default' ? planName : '';

        const saveBtn = document.getElementById('btn-save');
        if (saveBtn) {
            if (planName && planName !== 'default') {
                saveBtn.title = `Save changes to "${planName}"`;
                saveBtn.textContent = '💾 Save';
            } else {
                saveBtn.title = 'Save garden';
                saveBtn.textContent = '💾 Save';
            }
        }
    }

    // ==========================================
    // Keyboard Shortcuts
    // ==========================================

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Escape to close modals
            if (e.key === 'Escape') {
                closeModal();
                Plants.hideDetails();
            }

            // Ctrl+S to save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                saveCurrent();
            }
        });
    }

    // ==========================================
    // Toast Notifications
    // ==========================================

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==========================================
    // Plant Management
    // ==========================================

    function setupPlantManagementHandlers() {
        // Open manage plants modal
        document.getElementById('btn-manage-plants')?.addEventListener('click', () => {
            renderManagePlantList();
            openModal('modal-manage-plants');
        });

        // Add new plant button
        document.getElementById('btn-add-new-plant')?.addEventListener('click', () => {
            showPlantForm(null);
        });

        // Cancel plant form
        document.getElementById('btn-cancel-plant')?.addEventListener('click', () => {
            hidePlantForm();
        });

        // SVG file upload handler
        document.getElementById('plant-icon-file')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const status = document.getElementById('icon-upload-status');
            const preview = document.getElementById('icon-preview');
            const filenameInput = document.getElementById('plant-icon');

            // Validate file type
            if (!file.name.toLowerCase().endsWith('.svg')) {
                status.textContent = '❌ Only SVG files allowed';
                status.className = 'icon-upload-status error';
                return;
            }

            // Validate file size (max 500KB)
            if (file.size > 500 * 1024) {
                status.textContent = '❌ File too large (max 500KB)';
                status.className = 'icon-upload-status error';
                return;
            }

            status.textContent = '⏳ Uploading...';
            status.className = 'icon-upload-status uploading';

            try {
                const content = await file.text();

                // Show local preview immediately
                const blob = new Blob([content], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                preview.innerHTML = `<img src="${url}" alt="Icon preview">`;

                // Upload to server
                const result = await API.uploadIcon(file.name, content);

                filenameInput.value = result.filename;
                status.textContent = '✅ Uploaded!';
                status.className = 'icon-upload-status success';
            } catch (error) {
                status.textContent = `❌ ${error.message || 'Upload failed'}`;
                status.className = 'icon-upload-status error';
            }
        });

        // Save plant form
        document.getElementById('plant-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await savePlant();
        });
    }

    function renderManagePlantList() {
        const container = document.getElementById('manage-plant-list');
        if (!container) return;

        const plants = State.getProperty('plants') || [];

        if (plants.length === 0) {
            container.innerHTML = '<div class="summary-empty">No plants loaded.</div>';
            return;
        }

        container.innerHTML = plants.map(plant => `
            <div class="manage-plant-item" data-plant-id="${plant.id}">
                <img src="icons/${plant.file || plant.id + '.svg'}" 
                     alt="${plant.label}"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><text y=%2230%22 font-size=%2224%22>🌱</text></svg>'">
                <div class="manage-plant-item-info">
                    <div class="manage-plant-item-name">${plant.label}</div>
                    <div class="manage-plant-item-meta">${plant.family || ''}</div>
                </div>
                <div class="manage-plant-item-actions">
                    <button class="btn-action btn-edit" data-id="${plant.id}">Edit</button>
                    <button class="btn-action btn-danger btn-delete" data-id="${plant.id}">Delete</button>
                </div>
            </div>
        `).join('');

        // Edit buttons
        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const plantId = btn.dataset.id;
                const plant = plants.find(p => p.id === plantId);
                if (plant) showPlantForm(plant);
            });
        });

        // Delete buttons
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const plantId = btn.dataset.id;
                if (confirm('Delete this plant?')) {
                    await deletePlant(plantId);
                }
            });
        });
    }

    function showPlantForm(plant = null) {
        const formSection = document.getElementById('plant-form-section');
        const formTitle = document.getElementById('plant-form-title');

        if (!formSection) return;

        formSection.classList.remove('hidden');
        formTitle.textContent = plant ? 'Edit Plant' : 'Add New Plant';

        // Populate form
        document.getElementById('edit-plant-id').value = plant?.id || '';
        document.getElementById('plant-label').value = plant?.label || '';
        document.getElementById('plant-family').value = plant?.family || '';
        document.getElementById('plant-perSquare').value = plant?.perSquare || '';
        document.getElementById('plant-icon').value = plant?.file || '';
        document.getElementById('plant-companions').value = (plant?.companions || []).join(', ');
        document.getElementById('plant-antagonists').value = (plant?.antagonists || []).join(', ');

        // Reset icon upload UI
        const preview = document.getElementById('icon-preview');
        const fileInput = document.getElementById('plant-icon-file');
        const status = document.getElementById('icon-upload-status');
        if (fileInput) fileInput.value = '';
        if (status) { status.textContent = ''; status.className = 'icon-upload-status'; }
        if (preview) {
            if (plant?.file) {
                preview.innerHTML = `<img src="icons/${plant.file}" alt="${plant.label}" onerror="this.parentElement.innerHTML='<span class=icon-preview-placeholder>🌱</span>'">`;
            } else {
                preview.innerHTML = '<span class="icon-preview-placeholder">🌱</span>';
            }
        }
    }

    function hidePlantForm() {
        const formSection = document.getElementById('plant-form-section');
        if (formSection) {
            formSection.classList.add('hidden');
        }
    }

    async function savePlant() {
        const editId = document.getElementById('edit-plant-id').value;
        const label = document.getElementById('plant-label').value.trim();
        const family = document.getElementById('plant-family').value.trim();
        const perSquare = document.getElementById('plant-perSquare').value;
        const file = document.getElementById('plant-icon').value.trim();
        const companions = document.getElementById('plant-companions').value
            .split(',').map(s => s.trim()).filter(Boolean);
        const antagonists = document.getElementById('plant-antagonists').value
            .split(',').map(s => s.trim()).filter(Boolean);

        const plantData = {
            label,
            family,
            file,
            perSquare: perSquare ? parseInt(perSquare) : 4,
            companions,
            antagonists,
        };

        try {
            if (editId) {
                await API.updatePlant(editId, plantData);
                showToast('Plant updated!', 'success');
            } else {
                await API.createPlant(plantData);
                showToast('Plant added!', 'success');
            }

            // Reload plants
            await Plants.loadPlants();
            renderManagePlantList();
            hidePlantForm();
        } catch (error) {
            showToast(error.message || 'Failed to save plant', 'error');
        }
    }

    async function deletePlant(plantId) {
        try {
            await API.deletePlant(plantId);
            showToast('Plant deleted!', 'success');

            // Reload plants
            await Plants.loadPlants();
            renderManagePlantList();
        } catch (error) {
            showToast(error.message || 'Failed to delete plant', 'error');
        }
    }

    // ==========================================
    // Cell Edit Modal (Succession Planting)
    // ==========================================

    const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    let cellEditBedId = null;
    let cellEditCellIndex = null;

    function openCellEditModal(bedId, cellIndex) {
        cellEditBedId = bedId;
        cellEditCellIndex = cellIndex;

        // Populate the plant dropdown
        const select = document.getElementById('cell-plant-select');
        const plants = State.getProperty('plants') || [];
        select.innerHTML = '<option value="">Choose a plant...</option>' +
            plants.map(p => `<option value="${p.id}">${p.label}</option>`).join('');

        // Build the month grid
        buildMonthGrid(bedId, cellIndex);

        // Render existing plantings
        renderCellPlantings(bedId, cellIndex);

        // Reset the form
        document.getElementById('cell-variety').value = '';
        document.getElementById('cell-overlap-warning').classList.add('hidden');

        // Reset succession toggle
        const addSection = document.getElementById('cell-add-section');
        const toggleBtn = document.getElementById('btn-toggle-succession');
        if (addSection) addSection.classList.add('hidden');
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = '🔄 Add Succession Planting';
        }

        // Open modal
        openModal('modal-cell-edit');
    }

    function buildMonthGrid(bedId, cellIndex) {
        const grid = document.getElementById('cell-months-grid');
        const allPlantings = State.getAllPlantings(bedId, cellIndex);

        // Determine which months are occupied
        const occupiedMonths = new Set();
        allPlantings.forEach(p => {
            (p.activeMonths || []).forEach(m => occupiedMonths.add(m));
        });

        grid.innerHTML = MONTH_NAMES_SHORT.map((name, i) => {
            const isOccupied = occupiedMonths.has(i);
            return `
                <label class="month-checkbox ${isOccupied ? 'conflict' : ''}" 
                       data-month="${i}"
                       title="${isOccupied ? 'Already occupied' : name}">
                    <input type="checkbox" value="${i}">
                    ${name}
                </label>
            `;
        }).join('');

        // Toggle handler
        grid.querySelectorAll('.month-checkbox').forEach(label => {
            label.addEventListener('click', (e) => {
                e.preventDefault();
                const cb = label.querySelector('input');
                cb.checked = !cb.checked;
                label.classList.toggle('selected', cb.checked);
                updateOverlapWarning();
            });
        });
    }

    function updateOverlapWarning() {
        const grid = document.getElementById('cell-months-grid');
        const warning = document.getElementById('cell-overlap-warning');
        const warningText = document.getElementById('cell-overlap-text');

        const selectedMonths = [];
        grid.querySelectorAll('input:checked').forEach(cb => {
            selectedMonths.push(parseInt(cb.value));
        });

        if (selectedMonths.length === 0) {
            warning.classList.add('hidden');
            return;
        }

        const allPlantings = State.getAllPlantings(cellEditBedId, cellEditCellIndex);
        const conflicts = [];

        allPlantings.forEach(p => {
            const shared = (p.activeMonths || []).filter(m => selectedMonths.includes(m));
            if (shared.length > 0) {
                const plant = Plants.getPlant(p.plantId);
                const monthNames = shared.map(m => MONTH_NAMES_SHORT[m]).join(', ');
                conflicts.push(`${plant?.label || p.plantId} (${monthNames})`);
            }
        });

        if (conflicts.length > 0) {
            warning.classList.remove('hidden');
            warningText.textContent = `Overlaps with: ${conflicts.join('; ')}`;
        } else {
            warning.classList.add('hidden');
        }
    }

    function renderCellPlantings(bedId, cellIndex) {
        const container = document.getElementById('cell-plantings-list');
        const allPlantings = State.getAllPlantings(bedId, cellIndex);

        if (allPlantings.length === 0) {
            container.innerHTML = '<div class="summary-empty">No plantings yet. Drag a plant to this cell or add one below.</div>';
            return;
        }

        container.innerHTML = allPlantings.map((p, idx) => {
            const plant = Plants.getPlant(p.plantId);
            const months = p.activeMonths || [];
            return `
                <div class="planting-item" data-planting-index="${idx}">
                    <div class="planting-item-icon">
                        <img src="icons/${plant?.file || p.plantId + '.svg'}" 
                             alt="${plant?.label || p.plantId}"
                             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><text y=%2230%22 font-size=%2224%22>🌱</text></svg>'">
                    </div>
                    <div class="planting-item-info">
                        <div class="planting-item-name">${plant?.label || p.plantId}</div>
                        <div class="planting-item-variety">
                            <input type="text" class="variety-input" data-idx="${idx}" 
                                   value="${p.variety || ''}" placeholder="Variety name (optional)">
                        </div>
                        <div class="planting-item-months-edit">
                            ${MONTH_NAMES_SHORT.map((name, m) => {
                                const active = months.includes(m);
                                return `<span class="month-chip ${active ? 'active' : ''}" data-month="${m}" data-idx="${idx}">${name}</span>`;
                            }).join('')}
                        </div>
                    </div>
                    <button class="btn btn-danger btn-remove-planting" data-index="${idx}">×</button>
                </div>
            `;
        }).join('');

        // Variety input handlers — save on blur or enter
        container.querySelectorAll('.variety-input').forEach(input => {
            const saveVariety = () => {
                const idx = parseInt(input.dataset.idx);
                const newVariety = input.value.trim();
                State.updatePlantingVariety(bedId, cellIndex, idx, newVariety);
            };
            input.addEventListener('blur', saveVariety);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveVariety(); input.blur(); }
            });
        });

        // Month chip toggle handlers — click to add/remove months
        container.querySelectorAll('.month-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const monthNum = parseInt(chip.dataset.month);
                const plantingIdx = parseInt(chip.dataset.idx);
                const planting = allPlantings[plantingIdx];
                if (!planting) return;

                let newMonths = [...(planting.activeMonths || [])];
                if (newMonths.includes(monthNum)) {
                    // Don't allow removing the last month
                    if (newMonths.length <= 1) {
                        showToast('Cannot remove the last month — remove the planting instead', 'error');
                        return;
                    }
                    newMonths = newMonths.filter(m => m !== monthNum);
                } else {
                    // Check overlap with OTHER plantings
                    const otherPlantings = allPlantings.filter((_, i) => i !== plantingIdx);
                    const conflict = otherPlantings.find(op => (op.activeMonths || []).includes(monthNum));
                    if (conflict) {
                        const conflictPlant = Plants.getPlant(conflict.plantId);
                        showToast(`${MONTH_NAMES_SHORT[monthNum]} is used by ${conflictPlant?.label || conflict.plantId}`, 'error');
                        return;
                    }
                    newMonths.push(monthNum);
                    newMonths.sort((a, b) => a - b);
                }

                // Update the planting months
                State.updatePlantingMonths(bedId, cellIndex, plantingIdx, newMonths);
                renderCellPlantings(bedId, cellIndex);
                buildMonthGrid(bedId, cellIndex);
            });
        });

        // Delete handlers
        container.querySelectorAll('.btn-remove-planting').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                State.removePlanting(bedId, cellIndex, idx);
                renderCellPlantings(bedId, cellIndex);
                buildMonthGrid(bedId, cellIndex);
                showToast('Planting removed', 'info');
            });
        });
    }

    function setupCellEditHandlers() {
        // Add planting button
        document.getElementById('btn-add-planting')?.addEventListener('click', () => {
            if (cellEditBedId === null) return;

            const plantId = document.getElementById('cell-plant-select').value;
            if (!plantId) {
                showToast('Please select a plant', 'error');
                return;
            }

            const grid = document.getElementById('cell-months-grid');
            const selectedMonths = [];
            grid.querySelectorAll('input:checked').forEach(cb => {
                selectedMonths.push(parseInt(cb.value));
            });

            if (selectedMonths.length === 0) {
                showToast('Please select at least one month', 'error');
                return;
            }

            const variety = document.getElementById('cell-variety').value.trim();

            // Try adding the planting (checks for overlaps)
            const result = State.addPlanting(cellEditBedId, cellEditCellIndex, plantId, variety, selectedMonths);

            if (result.overlap) {
                const conflicts = result.conflicts.map(c => c.plantName).join(', ');
                showToast(`Month overlap with: ${conflicts}. Remove existing first.`, 'error');
                return;
            }

            const plant = Plants.getPlant(plantId);
            showToast(`Added ${plant?.label || plantId} planting!`, 'success');

            // Refresh UI
            renderCellPlantings(cellEditBedId, cellEditCellIndex);
            buildMonthGrid(cellEditBedId, cellEditCellIndex);

            // Reset form
            document.getElementById('cell-plant-select').value = '';
            document.getElementById('cell-variety').value = '';
            grid.querySelectorAll('input').forEach(cb => { cb.checked = false; });
            grid.querySelectorAll('.month-checkbox').forEach(l => l.classList.remove('selected'));
            document.getElementById('cell-overlap-warning').classList.add('hidden');
        });

        // Clear all button
        document.getElementById('btn-clear-cell')?.addEventListener('click', () => {
            if (cellEditBedId === null) return;
            if (confirm('Remove all plantings from this cell?')) {
                State.clearCell(cellEditBedId, cellEditCellIndex);
                renderCellPlantings(cellEditBedId, cellEditCellIndex);
                buildMonthGrid(cellEditBedId, cellEditCellIndex);
                showToast('Cell cleared', 'info');
            }
        });

        // Succession planting toggle
        document.getElementById('btn-toggle-succession')?.addEventListener('click', () => {
            const addSection = document.getElementById('cell-add-section');
            const toggleBtn = document.getElementById('btn-toggle-succession');
            if (addSection.classList.contains('hidden')) {
                addSection.classList.remove('hidden');
                toggleBtn.classList.add('active');
                toggleBtn.textContent = '🔄 Hide Succession Planting';
            } else {
                addSection.classList.add('hidden');
                toggleBtn.classList.remove('active');
                toggleBtn.textContent = '🔄 Add Succession Planting';
            }
        });
    }

    // ==========================================
    // Companion Planting Warnings
    // ==========================================

    function setupCompanionHighlights() {
        const gardenArea = document.getElementById('garden-area');
        if (!gardenArea) return;

        gardenArea.addEventListener('mouseenter', (e) => {
            const cell = e.target.closest('.cell');
            if (!cell) return;
            highlightCompanions(cell);
        }, true);

        gardenArea.addEventListener('mouseleave', (e) => {
            const cell = e.target.closest('.cell');
            if (!cell) return;
            clearCompanionHighlights();
        }, true);
    }

    function highlightCompanions(cellEl) {
        const bedId = cellEl.dataset.bedId;
        const cellIndex = parseInt(cellEl.dataset.cellIndex);
        const viewMonth = State.getProperty('viewMonth');
        const activePlanting = State.getActivePlanting(bedId, cellIndex, viewMonth);
        if (!activePlanting) return;

        const plant = Plants.getPlant(activePlanting.plantId);
        if (!plant) return;

        const companions = (plant.companions || []).map(c => c.toLowerCase());
        const antagonists = (plant.antagonists || []).map(a => a.toLowerCase());
        if (companions.length === 0 && antagonists.length === 0) return;

        const bed = State.getBed(bedId);
        if (!bed) return;

        // Highlight all cells in the same bed
        const allCells = document.querySelectorAll(`.cell[data-bed-id="${bedId}"]`);
        allCells.forEach(otherCell => {
            const otherIndex = parseInt(otherCell.dataset.cellIndex);
            if (otherIndex === cellIndex) return;

            const otherPlanting = State.getActivePlanting(bedId, otherIndex, viewMonth);
            if (!otherPlanting) return;

            const otherPlant = Plants.getPlant(otherPlanting.plantId);
            if (!otherPlant) return;

            const otherName = otherPlant.label.toLowerCase();
            const otherId = otherPlant.id.toLowerCase();

            // Fuzzy match: check if companion name is contained in plant id/label or vice versa
            const matchesCompanion = companions.some(c => 
                otherName.includes(c) || otherId.includes(c) || c.includes(otherId) || c.includes(otherName)
            );
            const matchesAntagonist = antagonists.some(a => 
                otherName.includes(a) || otherId.includes(a) || a.includes(otherId) || a.includes(otherName)
            );

            if (matchesCompanion) {
                otherCell.classList.add('cell-companion');
            }
            if (matchesAntagonist) {
                otherCell.classList.add('cell-antagonist');
            }
        });
    }

    function clearCompanionHighlights() {
        document.querySelectorAll('.cell-companion, .cell-antagonist').forEach(el => {
            el.classList.remove('cell-companion', 'cell-antagonist');
        });
    }

    // ==========================================
    // Garden Statistics Panel
    // ==========================================

    function generateStats() {
        const content = document.getElementById('stats-content');
        if (!content) return;

        const beds = State.getProperty('beds') || [];
        const plants = State.getProperty('plants') || [];

        let totalCells = 0;
        let occupiedCells = 0;
        const familyCounts = {};
        const plantUsage = {};

        beds.forEach(bed => {
            bed.cells.forEach((cell, idx) => {
                totalCells++;
                const allPlantings = State.getAllPlantings(bed.id, idx);
                if (allPlantings.length > 0) {
                    occupiedCells++;
                    allPlantings.forEach(p => {
                        const plant = plants.find(pl => pl.id === p.plantId);
                        const family = plant?.family || 'Unknown';
                        const label = plant?.label || p.plantId;

                        familyCounts[family] = (familyCounts[family] || 0) + 1;
                        plantUsage[label] = (plantUsage[label] || 0) + 1;
                    });
                }
            });
        });

        const utilization = totalCells > 0 ? Math.round((occupiedCells / totalCells) * 100) : 0;

        // Sort plants by usage
        const topPlants = Object.entries(plantUsage)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Family colors for the chart
        const familyColors = ['#4caf50','#2196f3','#ff9800','#e91e63','#9c27b0','#00bcd4','#ff5722','#607d8b','#795548','#cddc39'];

        const familyEntries = Object.entries(familyCounts).sort((a, b) => b[1] - a[1]);
        const totalPlantings = familyEntries.reduce((sum, [, count]) => sum + count, 0);

        let html = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <div>
                    <h4 style="margin-bottom:8px;">Overview</h4>
                    <table style="width:100%;border-collapse:collapse;">
                        <tr><td style="padding:4px 8px;">Total Beds</td><td style="font-weight:bold;text-align:right;">${beds.length}</td></tr>
                        <tr><td style="padding:4px 8px;">Total Cells</td><td style="font-weight:bold;text-align:right;">${totalCells}</td></tr>
                        <tr><td style="padding:4px 8px;">Occupied Cells</td><td style="font-weight:bold;text-align:right;">${occupiedCells}</td></tr>
                        <tr><td style="padding:4px 8px;">Utilization</td><td style="font-weight:bold;text-align:right;color:${utilization > 70 ? '#4caf50' : utilization > 40 ? '#ff9800' : '#f44336'};">${utilization}%</td></tr>
                        <tr><td style="padding:4px 8px;">Total Plantings</td><td style="font-weight:bold;text-align:right;">${totalPlantings}</td></tr>
                        <tr><td style="padding:4px 8px;">Plant Families</td><td style="font-weight:bold;text-align:right;">${familyEntries.length}</td></tr>
                    </table>
                </div>
                <div>
                    <h4 style="margin-bottom:8px;">Plants by Family</h4>
                    ${familyEntries.map(([family, count], i) => {
                        const pct = totalPlantings > 0 ? Math.round((count / totalPlantings) * 100) : 0;
                        const color = familyColors[i % familyColors.length];
                        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                            <div style="width:12px;height:12px;border-radius:2px;background:${color};flex-shrink:0;"></div>
                            <span style="flex:1;font-size:13px;">${family}</span>
                            <span style="font-size:12px;color:#666;">${count} (${pct}%)</span>
                            <div style="width:60px;height:8px;background:#eee;border-radius:4px;overflow:hidden;">
                                <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;"></div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            ${topPlants.length > 0 ? `
            <h4 style="margin-top:16px;margin-bottom:8px;">Most Used Plants</h4>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <tr style="background:#f5f5f5;"><th style="text-align:left;padding:4px 8px;">Plant</th><th style="text-align:right;padding:4px 8px;">Plantings</th></tr>
                ${topPlants.map(([name, count]) => `
                    <tr><td style="padding:4px 8px;">${name}</td><td style="text-align:right;padding:4px 8px;font-weight:bold;">${count}</td></tr>
                `).join('')}
            </table>` : ''}
        `;

        content.innerHTML = html;
        openModal('modal-stats');
    }

    // ==========================================
    // Bed Notes / Journal
    // ==========================================

    let notesBedId = null;

    function openBedNotes(bedId) {
        notesBedId = bedId;
        const bed = State.getBed(bedId);
        if (!bed) return;

        document.getElementById('notes-bed-name').textContent = bed.name;
        document.getElementById('bed-notes-text').value = bed.notes || '';
        openModal('modal-notes');
    }

    function setupNotesHandlers() {
        document.getElementById('btn-save-notes')?.addEventListener('click', () => {
            if (!notesBedId) return;
            const notes = document.getElementById('bed-notes-text').value.trim();
            State.updateBed(notesBedId, { notes: notes || '' });
            closeModal();
            showToast('Notes saved!', 'success');
        });
    }

    // ==========================================
    // Crop Rotation Advisor
    // ==========================================

    async function analyzeCropRotation() {
        const content = document.getElementById('rotation-content');
        if (!content) return;

        content.innerHTML = '<p>Analyzing saved plans...</p>';
        openModal('modal-rotation');

        try {
            const plansData = await API.getPlans();
            const plans = Array.isArray(plansData) ? plansData :
                         (plansData?.plans || Object.keys(plansData || {}).map(name => ({ name })));
            
            const plants = State.getProperty('plants') || [];

            if (plans.length < 2) {
                content.innerHTML = '<div class="summary-empty">Need at least 2 saved plans to analyze rotation. Save different season/year plans to compare.</div>';
                return;
            }

            // Load each plan and analyze families per bed
            const planFamilies = {};

            for (const plan of plans) {
                const planName = plan.name || plan;
                try {
                    const data = await API.getGarden(planName);
                    if (!data || !data.beds) continue;

                    planFamilies[planName] = {};
                    data.beds.forEach(bed => {
                        const families = new Set();
                        (bed.cells || []).forEach(cell => {
                            if (!cell) return;
                            const plantings = cell.plantings || (cell.plantId ? [cell] : []);
                            plantings.forEach(p => {
                                const plant = plants.find(pl => pl.id === (p.plantId || ''));
                                if (plant?.family) families.add(plant.family);
                            });
                        });
                        planFamilies[planName][bed.name] = Array.from(families);
                    });
                } catch (e) {
                    console.warn(`Could not load plan: ${planName}`, e);
                }
            }

            // Find repeated families per bed across plans
            const warnings = [];
            const bedNames = new Set();
            Object.values(planFamilies).forEach(beds => {
                Object.keys(beds).forEach(name => bedNames.add(name));
            });

            bedNames.forEach(bedName => {
                const familyHistory = {};
                Object.entries(planFamilies).forEach(([planName, beds]) => {
                    (beds[bedName] || []).forEach(family => {
                        if (!familyHistory[family]) familyHistory[family] = [];
                        familyHistory[family].push(planName);
                    });
                });

                Object.entries(familyHistory).forEach(([family, planNames]) => {
                    if (planNames.length > 1) {
                        warnings.push({ bedName, family, plans: planNames });
                    }
                });
            });

            if (warnings.length === 0) {
                content.innerHTML = `
                    <div style="text-align:center;padding:20px;">
                        <div style="font-size:48px;">✅</div>
                        <h4>Great rotation!</h4>
                        <p>No repeated plant families found across ${Object.keys(planFamilies).length} plans.</p>
                    </div>`;
            } else {
                content.innerHTML = `
                    <p style="margin-bottom:12px;">Found <strong>${warnings.length}</strong> repeated plant families across plans:</p>
                    <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <tr style="background:#f5f5f5;">
                            <th style="text-align:left;padding:6px 8px;">Area</th>
                            <th style="text-align:left;padding:6px 8px;">Family</th>
                            <th style="text-align:left;padding:6px 8px;">Repeated In</th>
                        </tr>
                        ${warnings.map(w => `
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="padding:6px 8px;">${w.bedName}</td>
                                <td style="padding:6px 8px;color:#e65100;font-weight:500;">⚠️ ${w.family}</td>
                                <td style="padding:6px 8px;font-size:12px;">${w.plans.join(', ')}</td>
                            </tr>
                        `).join('')}
                    </table>
                    <p style="margin-top:12px;font-size:12px;color:#666;">
                        💡 <em>Tip: Rotate plant families to prevent soil depletion and disease buildup. Avoid planting the same family in the same area for 3+ seasons.</em>
                    </p>`;
            }
        } catch (error) {
            content.innerHTML = `<p style="color:red;">Error analyzing rotation: ${error.message}</p>`;
        }
    }

    function setupStatsAndRotationHandlers() {
        document.getElementById('btn-stats')?.addEventListener('click', generateStats);
        document.getElementById('btn-rotation')?.addEventListener('click', analyzeCropRotation);
    }

    // ==========================================
    // Garden Journal
    // ==========================================

    const CATEGORY_ICONS = {
        general: '📝', observation: '👁️', planting: '🌱',
        harvest: '🥕', pest: '🐛', weather: '🌤️',
        task: '✅', amendment: '🧪'
    };

    let cachedJournalEntries = [];
    let pendingPhotoPath = null;

    function journalDateStr(dateField) {
        if (!dateField) return '';
        if (dateField.length === 10) {
            const [y, m, d] = dateField.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
            });
        }
        return new Date(dateField).toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
        });
    }

    async function openJournal() {
        const container = document.getElementById('journal-entries');
        container.innerHTML = '<p style="text-align:center;">Loading entries...</p>';
        openModal('modal-journal');

        try {
            const data = await API.getJournal();
            cachedJournalEntries = data.entries || [];
            renderJournalEntries(cachedJournalEntries);
            populateTotalsYears(cachedJournalEntries);
        } catch (error) {
            container.innerHTML = `<p style="color:red;">Failed to load journal: ${error.message}</p>`;
        }
    }

    function renderJournalEntries(entries) {
        const container = document.getElementById('journal-entries');

        if (entries.length === 0) {
            container.innerHTML = '<div class="summary-empty" style="margin-top:16px;">No journal entries yet. Start by adding your first entry above!</div>';
            return;
        }

        container.innerHTML = entries.map(entry => {
            const icon = CATEGORY_ICONS[entry.category] || '📝';
            const categoryLabel = entry.category ? entry.category.charAt(0).toUpperCase() + entry.category.slice(1) : 'General';
            const valueBadge = entry.value != null
                ? `<span class="journal-value-badge">${entry.value} ${entry.valueUnit || ''}</span>`
                : '';
            const photoHtml = entry.photo
                ? `<a href="${entry.photo}" target="_blank"><img src="${entry.photo}" class="journal-photo-thumb" alt="Photo"></a>`
                : '';

            return `
                <div class="journal-entry">
                    <div class="journal-entry-header">
                        <div class="journal-entry-meta">
                            <span class="journal-category-badge" data-category="${entry.category}">${icon} ${categoryLabel}</span>
                            ${valueBadge}
                            <span class="journal-date">${journalDateStr(entry.date)}</span>
                        </div>
                        <button class="btn btn-danger btn-sm btn-delete-entry" data-id="${entry.id}" title="Delete entry">×</button>
                    </div>
                    ${entry.title ? `<div class="journal-entry-title">${escapeHtml(entry.title)}</div>` : ''}
                    <div class="journal-entry-content">${escapeHtml(entry.content).replace(/\n/g, '<br>')}</div>
                    ${photoHtml}
                </div>
            `;
        }).join('');

        container.querySelectorAll('.btn-delete-entry').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this journal entry?')) return;
                try {
                    await API.deleteJournalEntry(btn.dataset.id);
                    showToast('Entry deleted', 'info');
                    const data = await API.getJournal();
                    cachedJournalEntries = data.entries || [];
                    renderJournalEntries(cachedJournalEntries);
                    populateTotalsYears(cachedJournalEntries);
                } catch (error) {
                    showToast('Failed to delete: ' + error.message, 'error');
                }
            });
        });
    }

    function populateTotalsYears(entries) {
        const yearSel = document.getElementById('totals-year');
        if (!yearSel) return;
        const years = [...new Set(entries
            .filter(e => e.date)
            .map(e => e.date.substring(0, 4))
        )].sort((a, b) => b - a);

        const current = yearSel.value;
        yearSel.innerHTML = `<option value="">All years</option>` +
            years.map(y => `<option value="${y}" ${y === current ? 'selected' : ''}>${y}</option>`).join('');
    }

    function renderTotals(entries, year) {
        const el = document.getElementById('totals-content');
        if (!el) return;

        const filtered = entries.filter(e =>
            e.value != null &&
            ['harvest', 'planting'].includes(e.category) &&
            (!year || (e.date && e.date.startsWith(year)))
        );

        if (filtered.length === 0) {
            el.innerHTML = '<p style="color:#999;">No harvest or planting records' + (year ? ` for ${year}` : '') + '.</p>';
            return;
        }

        // Group by category + title + unit
        const groups = {};
        filtered.forEach(e => {
            const key = `${e.category}|${e.title || '(untitled)'}|${e.valueUnit || ''}`;
            if (!groups[key]) groups[key] = { category: e.category, title: e.title || '(untitled)', unit: e.valueUnit || '', total: 0, entries: 0 };
            groups[key].total += e.value;
            groups[key].entries++;
        });

        const tableRows = (rows) => rows.map(g => `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:6px 8px;">${escapeHtml(g.title)}</td>
                <td style="padding:6px 8px;font-weight:600;">${+g.total.toFixed(3)} ${escapeHtml(g.unit)}</td>
                <td style="padding:6px 8px;color:#999;font-size:12px;">${g.entries} ${g.entries === 1 ? 'entry' : 'entries'}</td>
            </tr>`).join('');

        const tableHead = `<tr style="background:#f5f5f5;font-size:12px;">
            <th style="text-align:left;padding:6px 8px;">Plant</th>
            <th style="text-align:left;padding:6px 8px;">Total</th>
            <th style="text-align:left;padding:6px 8px;">Records</th>
        </tr>`;

        const harvests = Object.values(groups).filter(g => g.category === 'harvest');
        const plantings = Object.values(groups).filter(g => g.category === 'planting');

        let html = '';
        if (harvests.length) {
            html += `<h4 style="margin:0 0 8px;">🥕 Harvest Totals</h4>
                <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
                ${tableHead}${tableRows(harvests)}</table>`;
        }
        if (plantings.length) {
            html += `<h4 style="margin:0 0 8px;">🌱 Planting Totals</h4>
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                ${tableHead}${tableRows(plantings)}</table>`;
        }
        el.innerHTML = html;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function clearPhotoState() {
        pendingPhotoPath = null;
        document.getElementById('journal-photo-input').value = '';
        document.getElementById('journal-photo-name').textContent = '';
        document.getElementById('journal-photo-preview').style.display = 'none';
        document.getElementById('journal-photo-img').src = '';
    }

    function setupJournalHandlers() {
        const VALUE_CATEGORIES = new Set(['harvest', 'planting']);

        document.getElementById('btn-journal')?.addEventListener('click', () => {
            const dateEl = document.getElementById('journal-date');
            if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
            openJournal();
        });

        // Tab switching
        document.querySelectorAll('.journal-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.journal-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const isEntries = tab.dataset.tab === 'entries';
                document.getElementById('journal-tab-entries').style.display = isEntries ? '' : 'none';
                document.getElementById('journal-tab-totals').style.display = isEntries ? 'none' : '';
                if (!isEntries) renderTotals(cachedJournalEntries, document.getElementById('totals-year')?.value || '');
            });
        });

        // Totals year filter
        document.getElementById('totals-year')?.addEventListener('change', (e) => {
            renderTotals(cachedJournalEntries, e.target.value);
        });

        // Show/hide value row based on category
        document.getElementById('journal-category')?.addEventListener('change', (e) => {
            const row = document.getElementById('journal-value-row');
            if (row) row.style.display = VALUE_CATEGORIES.has(e.target.value) ? 'flex' : 'none';
        });

        // Photo upload
        document.getElementById('btn-journal-photo')?.addEventListener('click', () => {
            document.getElementById('journal-photo-input').click();
        });

        document.getElementById('journal-photo-input')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Show local preview immediately
            const reader = new FileReader();
            reader.onload = (ev) => {
                document.getElementById('journal-photo-img').src = ev.target.result;
                document.getElementById('journal-photo-preview').style.display = 'block';
                document.getElementById('journal-photo-name').textContent = file.name;
            };
            reader.readAsDataURL(file);

            // Upload to server
            try {
                const dataUrl = await new Promise((res, rej) => {
                    const r = new FileReader();
                    r.onload = (ev) => res(ev.target.result);
                    r.onerror = rej;
                    r.readAsDataURL(file);
                });
                const result = await API.uploadJournalPhoto(file.name, dataUrl);
                pendingPhotoPath = result.path;
            } catch (error) {
                showToast('Photo upload failed: ' + error.message, 'error');
                clearPhotoState();
            }
        });

        // Click photo preview to remove
        document.getElementById('journal-photo-img')?.addEventListener('click', clearPhotoState);

        document.getElementById('btn-add-journal')?.addEventListener('click', async () => {
            const title = document.getElementById('journal-title').value.trim();
            const content = document.getElementById('journal-content').value.trim();
            const category = document.getElementById('journal-category').value;
            const date = document.getElementById('journal-date').value;
            const value = document.getElementById('journal-value').value;
            const valueUnit = document.getElementById('journal-value-unit').value;

            if (!content) {
                showToast('Please write something in your journal entry', 'error');
                return;
            }

            try {
                await API.addJournalEntry(title, content, category, date, value || null, value ? valueUnit : '', pendingPhotoPath);
                document.getElementById('journal-title').value = '';
                document.getElementById('journal-content').value = '';
                document.getElementById('journal-category').value = 'general';
                document.getElementById('journal-value').value = '';
                document.getElementById('journal-value-row').style.display = 'none';
                clearPhotoState();
                showToast('Journal entry added!', 'success');
                const data = await API.getJournal();
                cachedJournalEntries = data.entries || [];
                renderJournalEntries(cachedJournalEntries);
                populateTotalsYears(cachedJournalEntries);
            } catch (error) {
                showToast('Failed to add entry: ' + error.message, 'error');
            }
        });
    }

    // ==========================================
    // Copy/Paste Functionality
    // ==========================================

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only handle when not in a text input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Ctrl+C - Copy selected cell
            if (e.ctrlKey && e.key === 'c') {
                copySelectedCell();
            }

            // Ctrl+Z - Undo
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                if (State.undo()) {
                    showToast('Undone!', 'info');
                } else {
                    showToast('Nothing to undo', 'info');
                }
            }

            // Ctrl+V - Paste to selected cell
            if (e.ctrlKey && e.key === 'v') {
                pasteToSelectedCell();
            }

            // Delete - Clear selected cell
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedBedId !== null && selectedCellIndex !== null) {
                    e.preventDefault();
                    State.clearCell(selectedBedId, selectedCellIndex);
                    showToast('Cell cleared', 'info');
                }
            }

            // Escape - Deselect
            if (e.key === 'Escape') {
                deselectCell();
            }
        });
    }

    function selectCell(bedId, cellIndex) {
        // Clear previous selection
        document.querySelectorAll('.cell.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // Set new selection
        selectedBedId = bedId;
        selectedCellIndex = cellIndex;

        // Highlight selected cell
        const cell = document.querySelector(`.cell[data-bed-id="${bedId}"][data-cell-index="${cellIndex}"]`);
        if (cell) {
            cell.classList.add('selected');
        }
    }

    function deselectCell() {
        document.querySelectorAll('.cell.selected').forEach(el => {
            el.classList.remove('selected');
        });
        selectedBedId = null;
        selectedCellIndex = null;
    }

    function copySelectedCell() {
        if (selectedBedId === null || selectedCellIndex === null) {
            showToast('Click a cell first to select it', 'info');
            return;
        }

        const viewMonth = State.getProperty('viewMonth');
        const activePlanting = State.getActivePlanting(selectedBedId, selectedCellIndex, viewMonth);
        if (!activePlanting) {
            showToast('Cell is empty for this month', 'info');
            return;
        }

        // Copy the active planting data
        clipboard = JSON.parse(JSON.stringify(activePlanting));

        const plant = Plants.getPlant(activePlanting.plantId);
        showToast(`Copied ${plant?.label || 'plant'}`, 'success');

        // Visual feedback
        const cellEl = document.querySelector(`.cell[data-bed-id="${selectedBedId}"][data-cell-index="${selectedCellIndex}"]`);
        if (cellEl) {
            cellEl.classList.add('copied');
            setTimeout(() => cellEl.classList.remove('copied'), 500);
        }
    }

    function pasteToSelectedCell() {
        if (!clipboard) {
            showToast('Nothing to paste (Ctrl+C to copy first)', 'info');
            return;
        }

        if (selectedBedId === null || selectedCellIndex === null) {
            showToast('Click a cell first to select it', 'info');
            return;
        }

        // Paste the copied planting data
        State.placeCell(
            selectedBedId,
            selectedCellIndex,
            clipboard.plantId,
            clipboard.variety || '',
            clipboard.activeMonths || [State.getProperty('viewMonth')]
        );

        const plant = Plants.getPlant(clipboard.plantId);
        showToast(`Pasted ${plant?.label || 'plant'}`, 'success');
    }

    // Public API
    return {
        init,
        showLogin,
        showSetup,
        showApp,
        openModal,
        closeModal,
        openResizeModal,
        openCellEditModal,
        openBedNotes,
        showToast,
        saveGarden,
        loadGarden,
        selectCell,
        deselectCell,
        toggleAdmin,
        deleteUser,
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
