/**
 * 7System - Canvas Node Search Controller (Ctrl+F)
 * Searches mindmap node text, highlights matches, and smoothly pans to the selected result.
 */

export function initCanvasSearch({ dom, state, canvas, requestRedraw, persistView }) {
    let searchMatches = [];
    let searchMatchIndex = -1;

    const focusSearchMatch = (idx) => {
        if (searchMatches.length === 0) {
            if (dom.canvasSearchCount) dom.canvasSearchCount.textContent = '0/0';
            return;
        }
        searchMatchIndex = (idx + searchMatches.length) % searchMatches.length;
        const node = searchMatches[searchMatchIndex];
        state.selectedNodeId = node.id;
        state.pan.x = canvas.clientWidth / 2 - (node.x + node.width / 2) * state.zoom;
        state.pan.y = canvas.clientHeight / 2 - (node.y + node.height / 2) * state.zoom;
        if (dom.canvasSearchCount) {
            dom.canvasSearchCount.textContent = `${searchMatchIndex + 1}/${searchMatches.length}`;
        }
        if (typeof requestRedraw === 'function') requestRedraw();
        // Persist the jumped-to view so a reload does not snap back.
        if (typeof persistView === 'function') persistView();
    };

    const runCanvasSearch = () => {
        const q = (dom.canvasSearchInput?.value || '').trim().toLowerCase();
        if (!q) {
            searchMatches = [];
            searchMatchIndex = -1;
            if (dom.canvasSearchCount) dom.canvasSearchCount.textContent = '0/0';
            return;
        }
        searchMatches = state.nodes.filter(n => (n.text || '').toLowerCase().includes(q));
        focusSearchMatch(0);
    };

    const openCanvasSearch = () => {
        if (!dom.canvasSearchBar) return;
        dom.canvasSearchBar.classList.remove('hidden');
        dom.canvasSearchInput.focus();
        dom.canvasSearchInput.select();
        runCanvasSearch();
    };

    const closeCanvasSearch = () => {
        if (!dom.canvasSearchBar) return;
        dom.canvasSearchBar.classList.add('hidden');
    };

    if (dom.canvasSearchInput) {
        dom.canvasSearchInput.addEventListener('input', runCanvasSearch);
        dom.canvasSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                focusSearchMatch(searchMatchIndex + (e.shiftKey ? -1 : 1));
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeCanvasSearch();
            }
        });
    }

    if (dom.canvasSearchPrev) dom.canvasSearchPrev.addEventListener('click', () => focusSearchMatch(searchMatchIndex - 1));
    if (dom.canvasSearchNext) dom.canvasSearchNext.addEventListener('click', () => focusSearchMatch(searchMatchIndex + 1));
    if (dom.canvasSearchClose) dom.canvasSearchClose.addEventListener('click', closeCanvasSearch);

    return {
        openCanvasSearch,
        closeCanvasSearch,
        runCanvasSearch,
        focusSearchMatch
    };
}
