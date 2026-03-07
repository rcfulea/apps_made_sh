import type { FilterState } from '../data/types';
import { MONTHS, PLANT_TYPES } from '../data/types';
import './FilterPanel.css';

interface FilterPanelProps {
    filters: FilterState;
    onFilterChange: (filters: FilterState) => void;
    onReset: () => void;
}

export function FilterPanel({ filters, onFilterChange, onReset }: FilterPanelProps) {
    const handleTypeToggle = (type: string) => {
        const newTypes = filters.types.includes(type)
            ? filters.types.filter(t => t !== type)
            : [...filters.types, type];
        onFilterChange({ ...filters, types: newTypes });
    };

    const handleEdibleChange = (value: 'all' | 'yes' | 'no') => {
        onFilterChange({ ...filters, edible: value });
    };

    const handleMonthToggle = (month: string, field: 'sowingMonths' | 'harvestMonths') => {
        const currentMonths = filters[field];
        const newMonths = currentMonths.includes(month)
            ? currentMonths.filter(m => m !== month)
            : [...currentMonths, month];
        onFilterChange({ ...filters, [field]: newMonths });
    };

    const handleThisYearToggle = () => {
        onFilterChange({ ...filters, thisYearOnly: !filters.thisYearOnly });
    };

    const hasActiveFilters = filters.types.length > 0 ||
        filters.edible !== 'all' ||
        filters.sowingMonths.length > 0 ||
        filters.harvestMonths.length > 0 ||
        filters.thisYearOnly;

    return (
        <div className="filter-panel">
            <div className="filter-header">
                <h3>Filters</h3>
                {hasActiveFilters && (
                    <button className="filter-reset" onClick={onReset}>
                        Clear All
                    </button>
                )}
            </div>

            <div className="filter-section">
                <label className="filter-toggle-label">
                    <input
                        type="checkbox"
                        checked={filters.thisYearOnly}
                        onChange={handleThisYearToggle}
                    />
                    <span className="toggle-switch"></span>
                    <span>This Year Only</span>
                </label>
            </div>

            <div className="filter-section">
                <h4>Type</h4>
                <div className="filter-chips">
                    {PLANT_TYPES.map(type => (
                        <button
                            key={type}
                            className={`filter-chip ${filters.types.includes(type) ? 'active' : ''}`}
                            onClick={() => handleTypeToggle(type)}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            <div className="filter-section">
                <h4>Edible</h4>
                <div className="filter-radio-group">
                    {(['all', 'yes', 'no'] as const).map(value => (
                        <label key={value} className="filter-radio">
                            <input
                                type="radio"
                                name="edible"
                                checked={filters.edible === value}
                                onChange={() => handleEdibleChange(value)}
                            />
                            <span>{value === 'all' ? 'All' : value === 'yes' ? 'Edible' : 'Non-Edible'}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="filter-section">
                <h4>Sowing Month</h4>
                <div className="filter-month-grid">
                    {MONTHS.map(month => (
                        <button
                            key={month}
                            className={`filter-month ${filters.sowingMonths.includes(month) ? 'active' : ''}`}
                            onClick={() => handleMonthToggle(month, 'sowingMonths')}
                        >
                            {month.slice(0, 3)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="filter-section">
                <h4>Harvest Month</h4>
                <div className="filter-month-grid">
                    {MONTHS.map(month => (
                        <button
                            key={month}
                            className={`filter-month ${filters.harvestMonths.includes(month) ? 'active' : ''}`}
                            onClick={() => handleMonthToggle(month, 'harvestMonths')}
                        >
                            {month.slice(0, 3)}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
