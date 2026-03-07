import './Header.css';

interface HeaderProps {
    darkMode: boolean;
    onToggleDarkMode: () => void;
}

export function Header({ darkMode, onToggleDarkMode }: HeaderProps) {
    return (
        <header className="app-header">
            <div className="header-content">
                <div className="header-brand">
                    <span className="header-logo">🌱</span>
                    <div>
                        <h1>Seeds Dashboard</h1>
                        <p>Your personal garden database</p>
                    </div>
                </div>
                <button
                    className="theme-toggle"
                    onClick={onToggleDarkMode}
                    aria-label="Toggle dark mode"
                >
                    {darkMode ? '☀️' : '🌙'}
                </button>
            </div>
        </header>
    );
}
