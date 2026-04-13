import type { Plant } from '../data/types';
import { MONTHS, PLANT_TYPES } from '../data/types';
import './StatsModal.css';

interface StatsModalProps {
    plants: Plant[];
    onClose: () => void;
}

export function StatsModal({ plants, onClose }: StatsModalProps) {
    const activePlants = plants.filter(p => !p.archived);

    const typeCounts = PLANT_TYPES.map(type => ({
        type,
        count: activePlants.filter(p =>
            p.type.some(t => t.toLowerCase() === type.toLowerCase())
        ).length,
    }));

    const edibleCount = activePlants.filter(p => p.edible).length;
    const nonEdibleCount = activePlants.length - edibleCount;

    const sowingCounts = MONTHS.map(month => ({
        month,
        count: activePlants.filter(p => p.sowingMonth.includes(month)).length,
    }));
    const maxSowing = Math.max(...sowingCounts.map(m => m.count), 1);

    const harvestCounts = MONTHS.map(month => ({
        month,
        count: activePlants.filter(p => p.harvestMonth.includes(month)).length,
    }));
    const maxHarvest = Math.max(...harvestCounts.map(m => m.count), 1);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div className="stats-backdrop" onClick={handleBackdropClick}>
            <div className="stats-modal">
                <div className="stats-modal-header">
                    <h2>Garden Stats</h2>
                    <button className="stats-close" onClick={onClose}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="stats-modal-body">
                    <div className="stats-total-row">
                        <div className="stats-total-card">
                            <span className="stats-total-number">{activePlants.length}</span>
                            <span className="stats-total-label">Total Plants</span>
                        </div>
                        <div className="stats-total-card">
                            <span className="stats-total-number">{plants.filter(p => p.archived).length}</span>
                            <span className="stats-total-label">Archived</span>
                        </div>
                        <div className="stats-total-card">
                            <span className="stats-total-number">{activePlants.filter(p => p.thisYear).length}</span>
                            <span className="stats-total-label">This Year</span>
                        </div>
                    </div>

                    <div className="stats-section">
                        <h3>By Type</h3>
                        <div className="stats-type-cards">
                            {typeCounts.map(({ type, count }) => (
                                <div key={type} className="stats-type-card">
                                    <span className="stats-type-count">{count}</span>
                                    <span className="stats-type-label">{type}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="stats-section">
                        <h3>Edibility</h3>
                        <div className="stats-edible-cards">
                            <div className="stats-edible-card edible">
                                <span className="stats-edible-count">{edibleCount}</span>
                                <span className="stats-edible-label">Edible</span>
                            </div>
                            <div className="stats-edible-card non-edible">
                                <span className="stats-edible-count">{nonEdibleCount}</span>
                                <span className="stats-edible-label">Non-Edible</span>
                            </div>
                        </div>
                    </div>

                    <div className="stats-charts-row">
                        <div className="stats-section">
                            <h3>Sowing Activity</h3>
                            <div className="stats-bars">
                                {sowingCounts.map(({ month, count }) => (
                                    <div key={month} className="stats-bar-row">
                                        <span className="stats-bar-label">{month.slice(0, 3)}</span>
                                        <div className="stats-bar-track">
                                            <div
                                                className="stats-bar-fill sowing"
                                                style={{ width: `${(count / maxSowing) * 100}%` }}
                                            />
                                        </div>
                                        <span className="stats-bar-count">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="stats-section">
                            <h3>Harvest Activity</h3>
                            <div className="stats-bars">
                                {harvestCounts.map(({ month, count }) => (
                                    <div key={month} className="stats-bar-row">
                                        <span className="stats-bar-label">{month.slice(0, 3)}</span>
                                        <div className="stats-bar-track">
                                            <div
                                                className="stats-bar-fill harvest"
                                                style={{ width: `${(count / maxHarvest) * 100}%` }}
                                            />
                                        </div>
                                        <span className="stats-bar-count">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
