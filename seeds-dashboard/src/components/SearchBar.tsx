import { useEffect, useRef, useState } from 'react';
import './SearchBar.css';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    resultCount: number;
    totalCount: number;
}

export function SearchBar({ value, onChange, resultCount, totalCount }: SearchBarProps) {
    const [localValue, setLocalValue] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    // Debounce the search
    useEffect(() => {
        const timer = setTimeout(() => {
            onChange(localValue);
        }, 300);
        return () => clearTimeout(timer);
    }, [localValue, onChange]);

    // Sync external value changes
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleClear = () => {
        setLocalValue('');
        onChange('');
        inputRef.current?.focus();
    };

    return (
        <div className="search-bar">
            <div className="search-input-container">
                <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                    ref={inputRef}
                    type="text"
                    className="search-input"
                    placeholder="Search plants by name, description..."
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                />
                {localValue && (
                    <button className="search-clear" onClick={handleClear}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
            <div className="search-results-count">
                Showing <strong>{resultCount}</strong> of <strong>{totalCount}</strong> plants
            </div>
        </div>
    );
}
