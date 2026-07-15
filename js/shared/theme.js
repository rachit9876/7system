export function setTheme(isDark, updateCallback = null) {
    if (isDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('mindmap-theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('mindmap-theme', 'light');
    }
    
    if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
    }
    
    updateThemeIcons(isDark);

    if (updateCallback) {
        updateCallback(isDark);
    }
}

export function updateThemeIcons(isDark) {
    const iconLight = document.getElementById('theme-icon-light') || document.getElementById('icon-light');
    const iconDark = document.getElementById('theme-icon-dark') || document.getElementById('icon-dark');
    const themeToggle = document.getElementById('themeToggle') || document.getElementById('themeToggleBtn');
    
    if (iconLight) iconLight.classList.toggle('hidden', isDark);
    if (iconDark) iconDark.classList.toggle('hidden', !isDark);
    if (themeToggle && themeToggle.classList.contains('btn-secondary')) {
        themeToggle.classList.toggle('is-active', isDark);
    }
}

export function initTheme(updateCallback = null) {
    const savedTheme = localStorage.getItem('mindmap-theme');
    const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    setTheme(isDark, updateCallback);
    
    const themeToggle = document.getElementById('themeToggle') || document.getElementById('themeToggleBtn');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentlyDark = document.documentElement.classList.contains('dark');
            setTheme(!currentlyDark, updateCallback);
        });
    }
    
    return isDark;
}

window.setTheme = setTheme;
window.initTheme = initTheme;
