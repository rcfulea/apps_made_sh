import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Plant, FilterState } from './data/types';
import { fetchPlants } from './utils/api';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { FilterPanel } from './components/FilterPanel';
import { PlantGrid } from './components/PlantGrid';
import { PlantModal } from './components/PlantModal';
import { AddPlantModal } from './components/AddPlantModal';
import './App.css';

const initialFilters: FilterState = {
  search: '',
  types: [],
  edible: 'all',
  sowingMonths: [],
  harvestMonths: [],
  thisYearOnly: false,
};

function App() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [showFilters, setShowFilters] = useState(false);

  // Load plants from API
  const loadPlants = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPlants();
      setPlants(data);
    } catch (error) {
      console.error('Failed to load plants:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlants();
  }, [loadPlants]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Close modal on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPlant(null);
        setShowAddModal(false);
        setEditingPlant(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const filteredPlants = useMemo(() => {
    return plants.filter((plant) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          plant.name.toLowerCase().includes(searchLower) ||
          plant.description.toLowerCase().includes(searchLower) ||
          plant.type.some(t => t.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      // This year filter
      if (filters.thisYearOnly && !plant.thisYear) return false;

      // Type filter
      if (filters.types.length > 0) {
        const hasType = plant.type.some(t =>
          filters.types.some(ft => t.toLowerCase().includes(ft.toLowerCase()))
        );
        if (!hasType) return false;
      }

      // Edible filter
      if (filters.edible === 'yes' && !plant.edible) return false;
      if (filters.edible === 'no' && plant.edible) return false;

      // Sowing month filter
      if (filters.sowingMonths.length > 0) {
        const hasSowingMonth = plant.sowingMonth.some(m => filters.sowingMonths.includes(m));
        if (!hasSowingMonth) return false;
      }

      // Harvest month filter
      if (filters.harvestMonths.length > 0) {
        const hasHarvestMonth = plant.harvestMonth.some(m => filters.harvestMonths.includes(m));
        if (!hasHarvestMonth) return false;
      }

      return true;
    });
  }, [plants, filters]);

  const handleResetFilters = () => {
    setFilters(initialFilters);
  };

  // CRUD handlers
  const handlePlantSaved = (savedPlant: Plant) => {
    setPlants(prev => {
      const existingIndex = prev.findIndex(p => p.id === savedPlant.id);
      if (existingIndex >= 0) {
        // Update existing
        const updated = [...prev];
        updated[existingIndex] = savedPlant;
        return updated;
      } else {
        // Add new
        return [...prev, savedPlant];
      }
    });
    setShowAddModal(false);
    setEditingPlant(null);
  };

  const handlePlantDeleted = (plantId: number) => {
    setPlants(prev => prev.filter(p => p.id !== plantId));
    setSelectedPlant(null);
  };

  const handleEditPlant = (plant: Plant) => {
    setSelectedPlant(null);
    setEditingPlant(plant);
  };

  return (
    <div className="app">
      <Header
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
      />

      <main className="main-content">
        <div className="content-wrapper">
          <aside className={`sidebar ${showFilters ? 'show' : ''}`}>
            <button
              className="sidebar-close"
              onClick={() => setShowFilters(false)}
            >
              ×
            </button>
            <FilterPanel
              filters={filters}
              onFilterChange={setFilters}
              onReset={handleResetFilters}
            />
          </aside>

          <div className="main-area">
            <div className="toolbar">
              <button
                className="filter-toggle-btn"
                onClick={() => setShowFilters(!showFilters)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M6 12h12M8 18h8" />
                </svg>
                Filters
              </button>
              <button
                className="add-plant-btn"
                onClick={() => setShowAddModal(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Plant
              </button>
            </div>

            <SearchBar
              value={filters.search}
              onChange={(search) => setFilters({ ...filters, search })}
              resultCount={filteredPlants.length}
              totalCount={plants.length}
            />

            <PlantGrid
              plants={filteredPlants}
              onPlantClick={setSelectedPlant}
              loading={loading}
            />
          </div>
        </div>
      </main>

      {selectedPlant && (
        <PlantModal
          plant={selectedPlant}
          onClose={() => setSelectedPlant(null)}
          onEdit={handleEditPlant}
          onDelete={handlePlantDeleted}
        />
      )}

      {(showAddModal || editingPlant) && (
        <AddPlantModal
          plant={editingPlant}
          onClose={() => {
            setShowAddModal(false);
            setEditingPlant(null);
          }}
          onSave={handlePlantSaved}
        />
      )}
    </div>
  );
}

export default App;
