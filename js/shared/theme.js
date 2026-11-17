/**
 * 7System - Unified Theme & Mermaid Configuration Module
 * Single source of truth for dark/light mode and Mermaid theming across Desktop, Portal, and Mobile.
 */

export function getStoredTheme() {
    try {
        const saved = localStorage.getItem('mindmap-theme');
        // Default to dark mode on first visit
        return saved === 'light' ? 'light' : 'dark';
    } catch (e) {
        return 'dark';
    }
}

export function isDarkMode() {
    return document.documentElement.classList.contains('dark');
}

export function getMermaidConfig(isDark) {
    return {
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        themeVariables: isDark ? {
            darkMode: true,
            primaryTextColor: '#f3f4f6',
            textColor: '#f3f4f6',
            lineColor: '#d1d5db',
            arrowheadColor: '#d1d5db',
            edgeLabelBackground: '#1f2937',
            mainBkg: '#1f2937',
            nodeBorder: '#6b7280'
        } : {
            primaryTextColor: '#1f2937',
            textColor: '#1f2937',
            lineColor: '#4b5563',
            arrowheadColor: '#4b5563',
            edgeLabelBackground: '#ffffff',
            mainBkg: '#ffffff',
            nodeBorder: '#9ca3af'
        }
    };
}

export function configureMermaid(isDark = isDarkMode()) {
    if (typeof window !== 'undefined' && window.mermaid && typeof window.mermaid.initialize === 'function') {
        try {
            window.mermaid.initialize(getMermaidConfig(isDark));
        } catch (e) {
            console.warn('Failed to configure Mermaid:', e);
        }
    }
}

export function updateThemeIcons(isDark) {
    const iconLight = document.getElementById('theme-icon-light') || document.getElementById('icon-light');
    const iconDark = document.getElementById('theme-icon-dark') || document.getElementById('icon-dark');
    const themeToggle = document.getElementById('themeToggle') || document.getElementById('themeToggleBtn');

    if (iconLight) iconLight.classList.toggle('hidden', isDark);
    if (iconDark) iconDark.classList.toggle('hidden', !isDark);
    if (themeToggle) {
        themeToggle.classList.toggle('is-active', isDark);
    }
}

const themeListeners = new Set();

export function registerThemeListener(callback) {
    if (typeof callback === 'function') {
        themeListeners.add(callback);
    }
    return () => themeListeners.delete(callback);
}

export function setTheme(isDark, updateCallback = null) {
    if (isDark) {
        document.documentElement.classList.add('dark');
        try { localStorage.setItem('mindmap-theme', 'dark'); } catch (e) {}
    } else {
        document.documentElement.classList.remove('dark');
        try { localStorage.setItem('mindmap-theme', 'light'); } catch (e) {}
    }

    configureMermaid(isDark);
    updateThemeIcons(isDark);

    if (typeof updateCallback === 'function') {
        try { updateCallback(isDark); } catch (e) { console.error('Theme callback error:', e); }
    }
    themeListeners.forEach(cb => {
        try { cb(isDark); } catch (e) { console.error('Theme listener error:', e); }
    });
}

export function toggleTheme(updateCallback = null) {
    const nextDark = !isDarkMode();
    setTheme(nextDark, updateCallback);
    return nextDark;
}

export function initTheme(updateCallback = null) {
    if (typeof updateCallback === 'function') {
        registerThemeListener(updateCallback);
    }
    const shouldBeDark = getStoredTheme() === 'dark';
    setTheme(shouldBeDark);

    const themeToggle = document.getElementById('themeToggle') || document.getElementById('themeToggleBtn');
    if (themeToggle && !themeToggle.dataset.themeBound) {
        themeToggle.dataset.themeBound = 'true';
        themeToggle.addEventListener('click', () => toggleTheme());
    }

    return shouldBeDark;
}

// Global browser window bindings for compatibility
if (typeof window !== 'undefined') {
    window.setTheme = setTheme;
    window.toggleTheme = toggleTheme;
    window.initTheme = initTheme;
    window.configureMermaid = configureMermaid;
}
