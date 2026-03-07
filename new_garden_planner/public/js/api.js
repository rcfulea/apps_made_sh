/**
 * API Module
 * Handles all server communication
 */

const API = (() => {
    const BASE_URL = '/api';

    /**
     * Make an API request
     */
    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        const config = {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, config);

            // Handle 401 - redirect to login
            if (response.status === 401) {
                State.set({ user: null, isAdmin: false });
                throw new Error('Unauthorized');
            }

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || `Request failed: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // ==========================================
    // Auth Endpoints
    // ==========================================

    async function checkSetupRequired() {
        return request('/setup-required');
    }

    async function setup(username, password) {
        return request('/setup', {
            method: 'POST',
            body: { username, password },
        });
    }

    async function login(username, password) {
        return request('/login', {
            method: 'POST',
            body: { username, password },
        });
    }

    async function register(username, password) {
        return request('/register', {
            method: 'POST',
            body: { username, password },
        });
    }

    async function logout() {
        return request('/logout', { method: 'POST' });
    }

    async function changePassword(currentPassword, newPassword) {
        return request('/change-password', {
            method: 'POST',
            body: { currentPassword, newPassword },
        });
    }

    async function checkSession() {
        return request('/me');
    }

    // ==========================================
    // Garden Endpoints
    // ==========================================

    async function saveGarden(data) {
        return request('/garden', {
            method: 'POST',
            body: data,
        });
    }

    async function loadGarden() {
        return request('/garden');
    }

    async function getPlans() {
        return request('/plans');
    }

    async function savePlan(name, data) {
        return request(`/plans/${encodeURIComponent(name)}`, {
            method: 'POST',
            body: data,
        });
    }

    async function loadPlan(name) {
        return request(`/plans/${encodeURIComponent(name)}`);
    }

    async function deletePlan(name) {
        return request(`/plans/${encodeURIComponent(name)}`, {
            method: 'DELETE',
        });
    }

    // ==========================================
    // Plants Endpoints
    // ==========================================

    async function getPlants() {
        return request('/plants');
    }

    // ==========================================
    // Admin Endpoints
    // ==========================================

    async function getUsers() {
        return request('/admin/users');
    }

    async function deleteUser(username) {
        return request(`/admin/users/${encodeURIComponent(username)}`, {
            method: 'DELETE',
        });
    }

    async function toggleUserAdmin(username, isAdmin) {
        return request(`/admin/users/${encodeURIComponent(username)}/admin`, {
            method: 'PUT',
            body: { isAdmin },
        });
    }

    // ==========================================
    // Journal Endpoints
    // ==========================================

    async function getJournal() {
        return request('/journal');
    }

    async function addJournalEntry(title, content, category) {
        return request('/journal', {
            method: 'POST',
            body: { title, content, category },
        });
    }

    async function deleteJournalEntry(entryId) {
        return request(`/journal/${encodeURIComponent(entryId)}`, {
            method: 'DELETE',
        });
    }

    // Public API
    return {
        checkSetupRequired,
        setup,
        login,
        register,
        logout,
        changePassword,
        checkSession,

        saveGarden,
        loadGarden,
        getPlans,
        savePlan,
        loadPlan,
        deletePlan,

        getPlants,
        uploadIcon,
        createPlant,
        updatePlant,
        deletePlant,

        getUsers,
        deleteUser,
        toggleUserAdmin,

        getJournal,
        addJournalEntry,
        deleteJournalEntry,
    };

    // ==========================================
    // Plant CRUD Methods
    // ==========================================

    async function uploadIcon(filename, content) {
        return request('/upload-icon', {
            method: 'POST',
            body: { filename, content },
        });
    }

    async function createPlant(plantData) {
        return request('/plants', {
            method: 'POST',
            body: plantData,
        });
    }

    async function updatePlant(plantId, plantData) {
        return request(`/plants/${encodeURIComponent(plantId)}`, {
            method: 'PUT',
            body: plantData,
        });
    }

    async function deletePlant(plantId) {
        return request(`/plants/${encodeURIComponent(plantId)}`, {
            method: 'DELETE',
        });
    }
})();
