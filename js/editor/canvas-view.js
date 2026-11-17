/**
 * 7System - Canvas Viewport & Connector Engine
 * Handles coordinate mapping (world <-> screen), zoom/pan math, fit-to-view,
 * infinite dot-grid rendering, and Bézier connection lines.
 */

import { getCachedVar } from './markdown-canvas.js';

export const screenToWorld = (pan, zoom, x, y) => ({
    x: (x - pan.x) / zoom,
    y: (y - pan.y) / zoom
});

export const worldToScreen = (pan, zoom, x, y) => ({
    x: x * zoom + pan.x,
    y: y * zoom + pan.y
});

export const getMousePos = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

export const findNodeById = (nodes, id) => {
    if (!Array.isArray(nodes)) return null;
    return nodes.find(n => n.id === id) || null;
};

export const findNodeAt = (nodes, pan, zoom, x, y) => {
    if (!Array.isArray(nodes)) return null;
    const worldPos = screenToWorld(pan, zoom, x, y);
    // Iterate in reverse so the topmost node receives the click, without
    // allocating a reversed copy of the array on every mouse move.
    for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (
            worldPos.x >= n.x && worldPos.x <= n.x + n.width &&
            worldPos.y >= n.y && worldPos.y <= n.y + n.height
        ) {
            return n.id;
        }
    }
    return null;
};

export const drawGrid = (ctx, canvas, state) => {
    if (!state.showGrid) return;
    const dotSpacing = 30;
    const effectiveSpacing = dotSpacing * state.zoom;
    // Skip grid rendering if dots would be too dense
    if (effectiveSpacing < 8) return;

    const dotSize = 1.5;
    const startX = Math.floor(-state.pan.x / state.zoom / dotSpacing) * dotSpacing;
    const startY = Math.floor(-state.pan.y / state.zoom / dotSpacing) * dotSpacing;
    const endX = startX + (canvas.clientWidth / state.zoom) + dotSpacing;
    const endY = startY + (canvas.clientHeight / state.zoom) + dotSpacing;

    ctx.fillStyle = getCachedVar('--border') || '#383b42';
    ctx.globalAlpha = state.isDark ? 0.12 : 0.18;
    ctx.beginPath();
    for (let x = startX; x < endX; x += dotSpacing) {
        for (let y = startY; y < endY; y += dotSpacing) {
            ctx.moveTo(x + dotSize, y);
            ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        }
    }
    ctx.fill();
    ctx.globalAlpha = 1;
};

export const drawConnections = (ctx, state, findNodeFn = (id) => findNodeById(state.nodes, id)) => {
    ctx.strokeStyle = getCachedVar('--line') || '#cbd5e1';
    ctx.lineWidth = 2;
    for (const node of state.nodes) {
        if (node.parentId) {
            const parent = findNodeFn(node.parentId);
            if (parent) {
                const start = { x: parent.x + parent.width / 2, y: parent.y + parent.height / 2 };
                const end = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
                const dx = end.x - start.x;
                const dy = end.y - start.y;

                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                if (Math.abs(dy) >= Math.abs(dx)) {
                    const cpY = start.y + dy * 0.5;
                    ctx.bezierCurveTo(start.x, cpY, end.x, cpY, end.x, end.y);
                } else {
                    const cpX = start.x + dx * 0.5;
                    ctx.bezierCurveTo(cpX, start.y, cpX, end.y, end.x, end.y);
                }
                ctx.stroke();
            }
        }
    }
};

export const drawConnectionLineToCursor = (ctx, state, findNodeFn = (id) => findNodeById(state.nodes, id)) => {
    const startNode = findNodeFn(state.selectedNodeId);
    if (!startNode) return;

    const start = { x: startNode.x + startNode.width / 2, y: startNode.y + startNode.height / 2 };
    const end = screenToWorld(state.pan, state.zoom, state.dragStart.x, state.dragStart.y);

    ctx.strokeStyle = getCachedVar('--selection') || '#a78bfa';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
};

export const zoomViewport = (canvas, state, factor, pivot = null, onUpdate = null) => {
    const p = pivot || { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
    const newZoom = Math.max(0.1, Math.min(15, state.zoom * factor));
    const worldPos = screenToWorld(state.pan, state.zoom, p.x, p.y);

    state.pan.x = p.x - worldPos.x * newZoom;
    state.pan.y = p.y - worldPos.y * newZoom;
    state.zoom = newZoom;

    if (typeof onUpdate === 'function') onUpdate();
};

export const fitViewport = (canvas, state, onUpdate = null) => {
    if (!state.nodes || state.nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
    });

    const padX = 60;
    const padTop = 100;
    const padBottom = 50;
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const scaleX = (canvas.clientWidth - padX * 2) / contentWidth;
    const scaleY = (canvas.clientHeight - padTop - padBottom) / contentHeight;
    state.zoom = Math.min(scaleX, scaleY, 1);

    const centerX = minX + contentWidth / 2;
    const centerY = minY + contentHeight / 2;

    state.pan.x = canvas.clientWidth / 2 - centerX * state.zoom;
    state.pan.y = padTop + (canvas.clientHeight - padTop - padBottom) / 2 - centerY * state.zoom;

    if (typeof onUpdate === 'function') onUpdate();
};
