/**
 * 7System - Central Editor State & Undo/Redo History
 * Single source of truth for the mutable mindmap state, undo/redo snapshots,
 * localStorage persistence, and node tree mutations shared by the desktop editor.
 */

import { showNotification } from '../shared/notifications.js';
import { setTheme } from '../shared/theme.js';

export function createEditorState() {
    return {
        nodes: [],
        pan: { x: 0, y: 0 },
        zoom: 1,
        nextNodeId: 1,
        selectedNodeId: null,
        editingNodeId: null,
        editingOriginalText: null,
        draggingNodeId: null,
        dragStart: { x: 0, y: 0 },
        hasPointerMoved: false,
        isDragging: false,
        isPanning: false,
        history: [],
        historyIndex: -1,
        redrawPending: false,
        connecting: false,
        nodesLocked: false,
        showGrid: true,
        cancelingEdit: false,
        isDark: false
    };
}

// Iterative, cycle-safe deletion: removes a node and all of its
// descendants without risking a stack overflow on cyclic data.
export const deleteNode = (state, nodeId) => {
    const toDelete = new Set([nodeId]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const n of state.nodes) {
            if (n.parentId !== null && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
                toDelete.add(n.id);
                changed = true;
            }
        }
    }
    state.nodes = state.nodes.filter(n => !toDelete.has(n.id));
};

export const saveToLocalStorage = (state) => {
    const saveData = {
        nodes: state.nodes,
        nextNodeId: state.nextNodeId,
        zoom: state.zoom,
        pan: state.pan,
        showGrid: state.showGrid
    };
    try {
        localStorage.setItem('mindmap-data', JSON.stringify(saveData));
    } catch (error) {
        showNotification('Storage Full', 'Could not save changes locally.', 'error');
    }
};

export const updateHistoryButtons = (state, dom) => {
    if (!dom) return;
    if (dom.undoBtn) dom.undoBtn.disabled = state.historyIndex <= 0;
    if (dom.redoBtn) dom.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
};

export const saveState = (state, dom) => {
    const snapshot = JSON.stringify({ nodes: state.nodes, nextNodeId: state.nextNodeId });
    state.historyIndex++;
    state.history = state.history.slice(0, state.historyIndex);
    state.history.push(snapshot);

    // Cap history at 100 entries to prevent memory bloat
    if (state.history.length > 100) {
        state.history.shift();
        state.historyIndex--;
    }
    updateHistoryButtons(state, dom);
    saveToLocalStorage(state);
};

export const applyProjectData = (state, data, updateDimensionsFn = null, dom = null) => {
    if (!data || !Array.isArray(data.nodes)) {
        throw new Error('Invalid mind map data');
    }

    state.nodes = data.nodes.map(node => ({
        ...node,
        id: Number(node.id),
        x: Number.isFinite(Number(node.x)) ? Number(node.x) : 0,
        y: Number.isFinite(Number(node.y)) ? Number(node.y) : 0,
        width: Number.isFinite(Number(node.width)) ? Number(node.width) : 120,
        height: Number.isFinite(Number(node.height)) ? Number(node.height) : 60,
        text: typeof node.text === 'string' ? node.text : 'New Idea',
        parentId: node.parentId ?? null
    })).filter(node => Number.isFinite(node.id));

    const maxNodeId = state.nodes.reduce((max, node) => Math.max(max, node.id), 0);
    state.nextNodeId = Math.max(Number(data.metadata?.nextNodeId) || Number(data.nextNodeId) || 1, maxNodeId + 1);

    // Sanitize parent links: drop references to missing nodes and break cycles
    // so later traversals can never hang or overflow.
    const nodeById = new Map(state.nodes.map(n => [n.id, n]));
    state.nodes.forEach(node => {
        if (node.parentId !== null && !nodeById.has(node.parentId)) {
            node.parentId = null;
        }
    });
    state.nodes.forEach(node => {
        const seen = new Set([node.id]);
        let ptr = node;
        while (ptr.parentId !== null) {
            if (seen.has(ptr.parentId)) { node.parentId = null; break; }
            seen.add(ptr.parentId);
            const parent = nodeById.get(ptr.parentId);
            if (!parent) { node.parentId = null; break; }
            ptr = parent;
        }
    });

    const settings = data.settings || data;
    state.zoom = Number.isFinite(Number(settings.zoom)) ? Math.max(0.1, Math.min(15, Number(settings.zoom))) : 1;
    state.pan = settings.pan && Number.isFinite(Number(settings.pan.x)) && Number.isFinite(Number(settings.pan.y))
        ? { x: Number(settings.pan.x), y: Number(settings.pan.y) }
        : { x: 0, y: 0 };

    if (settings.theme) {
        setTheme(settings.theme === 'dark');
    }
    if (settings.showGrid !== undefined) {
        state.showGrid = Boolean(settings.showGrid);
        if (dom && dom.gridToggle) dom.gridToggle.classList.toggle('is-active', state.showGrid);
    }

    state.selectedNodeId = null;
    state.editingNodeId = null;

    if (typeof updateDimensionsFn === 'function') {
        state.nodes.forEach(updateDimensionsFn);
    }

    if (dom && dom.zoomIndicator) {
        dom.zoomIndicator.textContent = `${Math.round(state.zoom * 100)}%`;
    }
};

export const loadFromLocalStorage = (state, updateDimensionsFn = null, dom = null) => {
    const saved = localStorage.getItem('mindmap-data');
    if (saved) {
        try {
            applyProjectData(state, JSON.parse(saved), updateDimensionsFn, dom);
            return true;
        } catch {
            localStorage.removeItem('mindmap-data');
        }
    }
    return false;
};
