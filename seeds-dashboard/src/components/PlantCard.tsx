import type { Plant } from '../data/types';
import { getPlantImage, handleImageError } from '../utils/imageUtils';
import './PlantCard.css';

interface PlantCardProps {
    plant: Plant;
    onClick: () => void;
}

export function PlantCard({ plant, onClick }: PlantCardProps) {
    const imageSrc = getPlantImage(plant.images);

    return (
        <div className="plant-card" onClick={onClick}>
            <div className="plant-card-image-container">
                <img
                    src={imageSrc}
                    alt={plant.name}
                    className="plant-card-image"
                    onError={handleImageError}
                    loading="lazy"
                />
                {plant.thisYear && (
                    <span className="plant-card-badge badge-this-year">This Year</span>
                )}
                {plant.archived && (
                    <span className="plant-card-badge badge-archived">Archived</span>
                )}
            </div>
            <div className="plant-card-content">
                <h3 className="plant-card-title">{plant.name}</h3>
                <div className="plant-card-tags">
                    {plant.type.slice(0, 2).map((type, index) => (
                        <span key={index} className="plant-card-tag tag-type">{type}</span>
                    ))}
                    {plant.edible && (
                        <span className="plant-card-tag tag-edible">Edible</span>
                    )}
                    {plant.goodForPollinators && (
                        <span className="plant-card-tag tag-pollinator">🐝</span>
                    )}
                </div>
                {plant.harvestMonth.length > 0 && (
                    <p className="plant-card-harvest">
                        <span className="harvest-icon">🌱</span>
                        Harvest: {plant.harvestMonth.slice(0, 3).join(', ')}
                        {plant.harvestMonth.length > 3 && '...'}
                    </p>
                )}
            </div>
        </div>
    );
}
