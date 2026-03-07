import type { Plant } from '../data/types';
import { PlantCard } from './PlantCard';
import './PlantGrid.css';

interface PlantGridProps {
    plants: Plant[];
    onPlantClick: (plant: Plant) => void;
    loading?: boolean;
}

export function PlantGrid({ plants, onPlantClick, loading }: PlantGridProps) {
    if (loading) {
        return (
            <div className="plant-grid-loading">
                <div className="loading-spinner"></div>
                <p>Loading plants...</p>
            </div>
        );
    }

    if (plants.length === 0) {
        return (
            <div className="plant-grid-empty">
                <div className="empty-icon">🌱</div>
                <h3>No plants found</h3>
                <p>Try adjusting your search or filters</p>
            </div>
        );
    }

    return (
        <div className="plant-grid">
            {plants.map((plant) => (
                <PlantCard
                    key={plant.id}
                    plant={plant}
                    onClick={() => onPlantClick(plant)}
                />
            ))}
        </div>
    );
}
