/**
 * Timeline Module
 * Handles month slider and navigation
 */

const Timeline = (() => {
    const MONTHS = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let sliderEl = null;
    let monthDisplayEl = null;
    let prevBtn = null;
    let nextBtn = null;

    /**
     * Initialize timeline
     */
    function init() {
        sliderEl = document.getElementById('timeline-slider');
        monthDisplayEl = document.getElementById('timeline-month');
        prevBtn = document.getElementById('timeline-prev');
        nextBtn = document.getElementById('timeline-next');

        if (!sliderEl || !monthDisplayEl) return;

        // Set initial value
        const currentMonth = State.getProperty('viewMonth');
        sliderEl.value = currentMonth;
        updateDisplay(currentMonth);

        // Event handlers
        sliderEl.addEventListener('input', (e) => {
            const month = parseInt(e.target.value);
            setMonth(month);
        });

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                const current = State.getProperty('viewMonth');
                setMonth((current - 1 + 12) % 12);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const current = State.getProperty('viewMonth');
                setMonth((current + 1) % 12);
            });
        }

        // Subscribe to state changes
        State.subscribe('viewMonthChange', (month) => {
            if (sliderEl) sliderEl.value = month;
            updateDisplay(month);
        });
    }

    /**
     * Set current month
     */
    function setMonth(month) {
        State.set({ viewMonth: month });
    }

    /**
     * Update month display
     */
    function updateDisplay(month) {
        if (monthDisplayEl) {
            monthDisplayEl.textContent = MONTHS[month];
        }
    }

    /**
     * Get month name
     */
    function getMonthName(month) {
        return MONTHS[month];
    }

    // Public API
    return {
        init,
        setMonth,
        getMonthName,
    };
})();
