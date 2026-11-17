import { showNotification } from "./shared/notifications.js";
import { initTheme, toggleTheme as toggleSharedTheme, setTheme, registerThemeListener, configureMermaid } from "./shared/theme.js";
import { layoutNodeTree } from "./shared/layout.js";
import { nodesToMarkdown, markdownToNodes as parseMarkdownTree } from "./shared/markdown-tree.js";
import { formatSmartPastedUrl } from "./shared/smart-url.js";
import { initNodeModal } from "./editor/node-modal.js";
import { initCanvasSearch } from "./editor/search.js";
import {
    FONT_SIZE, NODE_PADDING, fillRoundedRect, strokeRoundedRect,
    refreshCssVars, getCachedVar, measureMarkdownText, renderMarkdownText,
    findLinkAtPosition, clearMarkdownCaches, setContentUpdateCallback
} from "./editor/markdown-canvas.js";
import {
    screenToWorld as cvScreenToWorld,
    worldToScreen as cvWorldToScreen,
    getMousePos as cvGetMousePos,
    findNodeById as cvFindNodeById,
    findNodeAt as cvFindNodeAt,
    drawGrid,
    drawConnections,
    drawConnectionLineToCursor,
    zoomViewport,
    fitViewport
} from "./editor/canvas-view.js";
import { initCloudSync } from "./editor/cloud-sync.js";

document.addEventListener('DOMContentLoaded', () => {
            const canvas = document.getElementById('mindMapCanvas');
            const ctx = canvas.getContext('2d');
            const nodeEditor = document.getElementById('node-editor');
            const contextMenu = document.getElementById('context-menu');

            let state = {
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
                isDark: document.documentElement.classList.contains('dark'),
            };

            const dom = {
                undoBtn: document.getElementById('undoBtn'),
                redoBtn: document.getElementById('redoBtn'),
                newCanvasBtn: document.getElementById('newCanvasBtn'),
                addNodeBtn: document.getElementById('addNodeBtn'),
                zoomInBtn: document.getElementById('zoomInBtn'),
                zoomOutBtn: document.getElementById('zoomOutBtn'),
                zoomIndicator: document.getElementById('zoomIndicator'),
                fitViewBtn: document.getElementById('fitViewBtn'),
                autoLayoutBtn: document.getElementById('autoLayoutBtn'),
                canvasSearchBar: document.getElementById('canvasSearchBar'),
                canvasSearchInput: document.getElementById('canvasSearchInput'),
                canvasSearchCount: document.getElementById('canvasSearchCount'),
                canvasSearchPrev: document.getElementById('canvasSearchPrev'),
                canvasSearchNext: document.getElementById('canvasSearchNext'),
                canvasSearchClose: document.getElementById('canvasSearchClose'),
                importBtn: document.getElementById('importBtn'),
                exportBtn: document.getElementById('exportBtn'),
                importMdBtn: document.getElementById('importMdBtn'),
                exportMdBtn: document.getElementById('exportMdBtn'),
                cloudSaveBtn: document.getElementById('cloudSaveBtn'),
                cloudLoadBtn: document.getElementById('cloudLoadBtn'),
                themeToggle: document.getElementById('themeToggle'),
                themeIconLight: document.getElementById('theme-icon-light'),
                themeIconDark: document.getElementById('theme-icon-dark'),
                lockBtn: document.getElementById('lockBtn'),
                lockIconUnlocked: document.getElementById('lock-icon-unlocked'),
                lockIconLocked: document.getElementById('lock-icon-locked'),
                gridToggle: document.getElementById('gridToggle'),
                accountBtn: document.getElementById('accountBtn'),
                logoutBtn: document.getElementById('logoutBtn'),
                fileInput: document.getElementById('file-input'),
                confirmModal: document.getElementById('confirmModal'),
                confirmModalTitle: document.getElementById('confirmModalTitle'),
                confirmModalMessage: document.getElementById('confirmModalMessage'),
                confirmModalCancel: document.getElementById('confirmModalCancel'),
                confirmModalNo: document.getElementById('confirmModalNo'),
                confirmModalYes: document.getElementById('confirmModalYes')
            };

            // Geometry & Node Query Helpers
            const getMousePos = (e) => cvGetMousePos(canvas, e);
            const screenToWorld = (x, y) => cvScreenToWorld(state.pan, state.zoom, x, y);
            const worldToScreen = (x, y) => cvWorldToScreen(state.pan, state.zoom, x, y);
            const findNodeById = (id) => cvFindNodeById(state.nodes, id);
            const findNodeAt = (x, y) => cvFindNodeAt(state.nodes, state.pan, state.zoom, x, y);
            const getCssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

            const PADDING = 10;
            const BORDER_RADIUS = 5;

            let cloudSync = null;

            // Global Keyboard Handler for Modals
            document.addEventListener('keydown', (e) => {
                const openModal = document.querySelector('div[role="dialog"]:not(.hidden)');
                if (!openModal) return;

                if (e.key === 'Escape') {
                    if (cloudSync) {
                        if (openModal.id === 'accountModal') cloudSync.hideAccountModal();
                        else if (openModal.id === 'cloudModal') cloudSync.hideCloudModal();
                    }
                    if (openModal.id === 'projectListModal') openModal.classList.add('hidden');
                    return;
                }

                if (e.key === 'Tab') {
                    const focusableElements = openModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                    if (focusableElements.length === 0) return;

                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if (e.shiftKey) {
                        if (document.activeElement === firstElement || document.activeElement === document.body) {
                            e.preventDefault();
                            lastElement.focus();
                        }
                    } else {
                        if (document.activeElement === lastElement || document.activeElement === document.body) {
                            e.preventDefault();
                            firstElement.focus();
                        }
                    }
                }
            });

            const showConfirm = (message, title = 'Confirm', yesText = 'OK', noText = 'Cancel', cancelText = null) => {
                return new Promise((resolve) => {
                    dom.confirmModalTitle.textContent = title;
                    dom.confirmModalMessage.textContent = message;
                    dom.confirmModalYes.textContent = yesText;
                    dom.confirmModalNo.textContent = noText;
                    
                    if (cancelText) {
                        dom.confirmModalCancel.textContent = cancelText;
                        dom.confirmModalCancel.classList.remove('hidden');
                    } else {
                        dom.confirmModalCancel.classList.add('hidden');
                    }
                    
                    dom.confirmModal.classList.remove('hidden');
                    
                    // Trap focus in the newly opened modal
                    dom.confirmModalYes.focus();
                    
                    const cleanup = () => {
                        dom.confirmModal.classList.add('hidden');
                        dom.confirmModalYes.removeEventListener('click', onYes);
                        dom.confirmModalNo.removeEventListener('click', onNo);
                        dom.confirmModalCancel.removeEventListener('click', onCancel);
                        dom.confirmModal.removeEventListener('keydown', onEsc);
                        dom.confirmModal.removeEventListener('click', onBackdrop);
                    };

                    const onYes = () => { cleanup(); resolve(cancelText ? 'yes' : true); };
                    const onNo = () => { cleanup(); resolve(cancelText ? 'no' : false); };
                    const onCancel = () => { cleanup(); resolve('cancel'); };
                    const onEsc = (e) => { if (e.key === 'Escape') onCancel(); };
                    const onBackdrop = (e) => { if (e.target === dom.confirmModal) onCancel(); };

                    dom.confirmModalYes.addEventListener('click', onYes);
                    dom.confirmModalNo.addEventListener('click', onNo);
                    dom.confirmModalCancel.addEventListener('click', onCancel);
                    dom.confirmModal.addEventListener('keydown', onEsc);
                    dom.confirmModal.addEventListener('click', onBackdrop);
                });
            };

            // --- Core Functions ---
            const resizeCanvas = () => {
                const container = canvas.parentElement;
                const rect = container.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                canvas.style.width = `${rect.width}px`;
                canvas.style.height = `${rect.height}px`;
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                requestRedraw();
            };

            const requestRedraw = () => {
                if (state.redrawPending) return;
                state.redrawPending = true;
                requestAnimationFrame(draw);
            };

            const draw = () => {
                state.redrawPending = false;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.restore();
                
                // Draw dot grid and connectors
                ctx.save();
                ctx.translate(state.pan.x, state.pan.y);
                ctx.scale(state.zoom, state.zoom);
                
                drawGrid(ctx, canvas, state);
                drawConnections(ctx, state, findNodeById);
                drawNodes();

                if (state.connecting && state.selectedNodeId) {
                    drawConnectionLineToCursor(ctx, state, findNodeById);
                }

                ctx.restore();
                
                // Keep the text editor overlay glued to the node when panning or zooming
                if (state.editingNodeId) {
                    updateEditorSize();
                }
            };

            const drawNodes = () => {
                ctx.font = `500 ${FONT_SIZE}px sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                for (const node of state.nodes) {
                    // Only recalculate dimensions when text changes
                    if (node._cachedText !== node.text) {
                        updateNodeDimensions(node);
                        node._cachedText = node.text;
                    }
                    
                    ctx.fillStyle = getCachedVar('--node-bg');
                    ctx.strokeStyle = getCachedVar(node.id === state.selectedNodeId ? '--selection' : '--node-border');
                    ctx.lineWidth = 2;
                    ctx.shadowColor = getCachedVar('--node-shadow');
                    ctx.shadowBlur = 10;

                    fillRoundedRect(ctx, node.x, node.y, node.width, node.height, 8);
                    strokeRoundedRect(ctx, node.x, node.y, node.width, node.height, 8);
                    
                    ctx.shadowColor = 'transparent';
                    
                    if (node.id !== state.editingNodeId) {
                        ctx.fillStyle = getCachedVar('--node-text');
                        renderMarkdownText(ctx, node.text, node.x + NODE_PADDING, node.y + NODE_PADDING);
                    }
                }
            };

            // --- State & History ---
            const saveState = () => {
                const snapshot = JSON.stringify({ nodes: state.nodes, nextNodeId: state.nextNodeId });
                state.historyIndex++;
                state.history = state.history.slice(0, state.historyIndex);
                state.history.push(snapshot);
                // Cap history at 100 entries to prevent memory bloat
                if (state.history.length > 100) {
                    state.history.shift();
                    state.historyIndex--;
                }
                updateHistoryButtons();
                saveToLocalStorage();
            };

            const saveToLocalStorage = () => {
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

            const applyProjectData = (data) => {
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

                // Sanitize parent links: drop references to missing nodes and
                // break cycles so later traversals can never hang or overflow.
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
                    dom.gridToggle.classList.toggle('is-active', state.showGrid);
                }

                state.selectedNodeId = null;
                state.editingNodeId = null;
                state.nodes.forEach(updateNodeDimensions);
                dom.zoomIndicator.textContent = `${Math.round(state.zoom * 100)}%`;
            };

            const loadFromLocalStorage = () => {
                const saved = localStorage.getItem('mindmap-data');
                if (saved) {
                    try {
                        applyProjectData(JSON.parse(saved));
                        return true;
                    } catch {
                        localStorage.removeItem('mindmap-data');
                    }
                }
                return false;
            };

            const undo = () => {
                if (state.historyIndex > 0) {
                    state.historyIndex--;
                    loadState(state.history[state.historyIndex]);
                }
            };

            const redo = () => {
                if (state.historyIndex < state.history.length - 1) {
                    state.historyIndex++;
                    loadState(state.history[state.historyIndex]);
                }
            };
            
            const loadState = (snapshot) => {
                const loaded = JSON.parse(snapshot);
                state.nodes = loaded.nodes;
                state.nextNodeId = loaded.nextNodeId;
                state.selectedNodeId = null;
                state.editingNodeId = null;
                hideNodeEditor();
                updateHistoryButtons();
                requestRedraw();
                saveToLocalStorage();
            };

            const updateHistoryButtons = () => {
                dom.undoBtn.disabled = state.historyIndex <= 0;
                dom.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
            };

            const syncToggleControls = () => {
                const isDark = document.documentElement.classList.contains('dark');
                dom.themeIconLight.classList.toggle('hidden', isDark);
                dom.themeIconDark.classList.toggle('hidden', !isDark);
                dom.themeToggle.classList.toggle('is-active', isDark);
                dom.lockIconUnlocked.classList.toggle('hidden', state.nodesLocked);
                dom.lockIconLocked.classList.toggle('hidden', !state.nodesLocked);
                dom.lockBtn.classList.toggle('is-active', state.nodesLocked);
                dom.lockBtn.title = state.nodesLocked ? 'Unlock Nodes' : 'Lock Nodes';
                dom.gridToggle.classList.toggle('is-active', state.showGrid);
                dom.gridToggle.title = state.showGrid ? 'Hide Grid' : 'Show Grid';
            };

            // --- Node Management ---
            const createNode = (x, y, text = 'New Idea', parentId = null) => {
                const newNode = {
                    id: state.nextNodeId++,
                    text,
                    x, y,
                    width: 0, height: 0,
                    parentId,
                };
                updateNodeDimensions(newNode);
                state.nodes.push(newNode);
                return newNode;
            };

            // Iterative, cycle-safe deletion: removes a node and all of its
            // descendants without risking a stack overflow on cyclic data.
            const deleteNode = (nodeId) => {
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

            // True when linking targetId under sourceId would create a cycle.
            // Connecting makes `targetId` a child of `sourceId`, which loops
            // exactly when sourceId is already a descendant of targetId, i.e.
            // when walking up from sourceId we reach targetId.
            const wouldCreateCycle = (sourceId, targetId) => {
                const seen = new Set();
                let current = findNodeById(sourceId);
                while (current) {
                    if (current.id === targetId) return true;
                    if (seen.has(current.id)) return true; // defensive: corrupt chain
                    seen.add(current.id);
                    current = current.parentId !== null ? findNodeById(current.parentId) : null;
                }
                return false;
            };

            // Only allow clicking through to http(s)/mailto links. This blocks
            // `javascript:` and other dangerous schemes embedded in node text.
            const isSafeUrl = (url) => {
                if (typeof url !== 'string' || !url.trim()) return false;
                try {
                    const parsed = new URL(url.trim(), window.location.href);
                    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
                } catch {
                    return false;
                }
            };

            const updateNodeDimensions = (node) => {
                ctx.font = `500 ${FONT_SIZE}px sans-serif`;
                const dimensions = measureMarkdownText(ctx, node.text);
                node.width = dimensions.width + NODE_PADDING * 2;
                node.height = dimensions.height + NODE_PADDING * 2;
            };

            const nodeModal = initNodeModal({
                state,
                findNodeById,
                updateNodeDimensions,
                saveState: () => saveState(),
                requestRedraw: () => requestRedraw(),
                worldToScreen
            });
            const startEditingNode = nodeModal ? nodeModal.startEditingNode : () => {};
            const finishEditingNode = nodeModal ? nodeModal.finishEditingNode : () => {};
            const cancelEditingNode = nodeModal ? nodeModal.cancelEditingNode : () => {};
            const hideNodeEditor = nodeModal ? nodeModal.hideNodeEditor : () => {};
            const updateEditorSize = nodeModal ? nodeModal.updateEditorSize : () => {};

            cloudSync = initCloudSync({
                state,
                dom,
                showConfirm,
                applyProjectData,
                saveState: () => saveState(),
                requestRedraw: () => requestRedraw()
            });

            // --- Event Handlers ---
            const setupEventListeners = () => {
                canvas.addEventListener('mousedown', onMouseDown);
                canvas.addEventListener('mousemove', onMouseMove);
                canvas.addEventListener('mouseup', onMouseUp);
                canvas.addEventListener('mouseleave', onMouseUp);
                canvas.addEventListener('wheel', onWheel);
                canvas.addEventListener('dblclick', onDoubleClick);
                canvas.addEventListener('contextmenu', onContextMenu);

                dom.newCanvasBtn.addEventListener('click', async () => {
                    if (state.nodes.length > 0) {
                        const confirmed = await showConfirm('Are you sure you want to create a new canvas? Any unsaved changes will be lost.');
                        if (!confirmed) return;
                    }
                    state.nodes = [];
                    state.nextNodeId = 1;
                    // Reset the view BEFORE computing the center so the new
                    // node actually ends up in the middle of the screen.
                    state.pan = { x: 0, y: 0 };
                    state.zoom = 1;
                    const center = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
                    const newNode = createNode(center.x, center.y, "Central Idea");
                    state.selectedNodeId = newNode.id;
                    state.editingNodeId = null;
                    dom.zoomIndicator.textContent = '100%';
                    hideNodeEditor();
                    saveState();
                    requestRedraw();
                });

                dom.addNodeBtn.addEventListener('click', () => {
                    const center = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
                    const newNode = createNode(center.x, center.y);
                    state.selectedNodeId = newNode.id;
                    saveState();
                    requestRedraw();
                    startEditingNode(newNode.id);
                });

                dom.zoomInBtn.addEventListener('click', () => zoom(1.2));
                dom.zoomOutBtn.addEventListener('click', () => zoom(0.8));
                dom.zoomIndicator.addEventListener('click', () => {
                    const cx = canvas.clientWidth / 2;
                    const cy = canvas.clientHeight / 2;
                    const worldX = (cx - state.pan.x) / state.zoom;
                    const worldY = (cy - state.pan.y) / state.zoom;
                    state.zoom = 1;
                    state.pan.x = cx - worldX;
                    state.pan.y = cy - worldY;
                    dom.zoomIndicator.textContent = '100%';
                    requestRedraw();
                });
                dom.fitViewBtn.addEventListener('click', fitView);
                if (dom.autoLayoutBtn) dom.autoLayoutBtn.addEventListener('click', () => autoArrangeTree());
                dom.undoBtn.addEventListener('click', undo);
                dom.redoBtn.addEventListener('click', redo);
                dom.importBtn.addEventListener('click', () => dom.fileInput.click());
                dom.exportBtn.addEventListener('click', exportAsJSON);
                dom.importMdBtn.addEventListener('click', pasteMarkdownTree);
                dom.exportMdBtn.addEventListener('click', copyMarkdownTree);
                dom.fileInput.addEventListener('change', importJSON);
                dom.cloudSaveBtn.addEventListener('click', cloudSync.showCloudSaveModal);
                dom.cloudLoadBtn.addEventListener('click', cloudSync.showCloudLoadModal);
                dom.lockBtn.addEventListener('click', toggleLock);
                dom.gridToggle.addEventListener('click', toggleGrid);
                dom.accountBtn.addEventListener('click', cloudSync.showAccountModal);
                dom.logoutBtn.addEventListener('click', cloudSync.handleLogout);

                let resizeTimeout;
                window.addEventListener('resize', () => {
                    clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(resizeCanvas, 100);
                });
                window.addEventListener('keydown', onKeyDown);
                document.addEventListener('click', () => hideContextMenu());
            };

            const onMouseDown = (e) => {
                if (e.button === 2) return; // Disable right-click drag
                
                hideContextMenu();
                finishEditingNode();
                const pos = getMousePos(e);
                const clickedNodeId = findNodeAt(pos.x, pos.y);

                if (state.connecting) {
                    if (clickedNodeId && clickedNodeId !== state.selectedNodeId) {
                        if (wouldCreateCycle(state.selectedNodeId, clickedNodeId)) {
                            showNotification('Error', 'Cannot connect a node to its own descendant.', 'error');
                        } else {
                            const child = findNodeById(clickedNodeId);
                            if (child) {
                                child.parentId = state.selectedNodeId;
                                saveState();
                            }
                        }
                    }
                    state.connecting = false;
                    requestRedraw();
                    return;
                }

                // Check for link click before setting up drag
                if (clickedNodeId) {
                    const node = findNodeById(clickedNodeId);
                    if (node) {
                        const worldPos = screenToWorld(pos.x, pos.y);
                        const relativeX = worldPos.x - node.x - NODE_PADDING;
                        const relativeY = worldPos.y - node.y - NODE_PADDING;
                        const clickedLink = findLinkAtPosition(node.text, relativeX, relativeY);
                        if (clickedLink) {
                            if (isSafeUrl(clickedLink)) {
                                window.open(clickedLink, '_blank', 'noopener,noreferrer');
                            } else {
                                showNotification('Blocked', 'This link uses an unsupported protocol and was not opened.', 'error');
                            }
                            return;
                        }
                    }
                }

                state.selectedNodeId = clickedNodeId;

                if (clickedNodeId && !state.nodesLocked) {
                    state.isDragging = true;
                    state.draggingNodeId = clickedNodeId;
                } else {
                    state.isPanning = true;
                }
                
                state.dragStart = { x: pos.x, y: pos.y };
                state.hasPointerMoved = false;
                requestRedraw();
            };

            const onMouseMove = (e) => {
                const pos = getMousePos(e);
                const dx = (pos.x - state.dragStart.x);
                const dy = (pos.y - state.dragStart.y);

                // Check if hovering over a link
                const clickedNodeId = findNodeAt(pos.x, pos.y);
                if (clickedNodeId && !state.isDragging && !state.isPanning) {
                    const node = findNodeById(clickedNodeId);
                    if (node) {
                        const worldPos = screenToWorld(pos.x, pos.y);
                        const relativeX = worldPos.x - node.x - NODE_PADDING;
                        const relativeY = worldPos.y - node.y - NODE_PADDING;
                        const hoveredLink = findLinkAtPosition(node.text, relativeX, relativeY);
                        canvas.style.cursor = hoveredLink ? 'pointer' : 'default';
                    }
                } else {
                    canvas.style.cursor = 'default';
                }

                if (state.connecting) {
                    state.dragStart = { x: pos.x, y: pos.y };
                    requestRedraw();
                    return;
                }

                if (state.isDragging && state.draggingNodeId) {
                    const node = findNodeById(state.draggingNodeId);
                    if (node) {
                        node.x += dx / state.zoom;
                        node.y += dy / state.zoom;
                        state.hasPointerMoved = state.hasPointerMoved || Math.abs(dx) > 0 || Math.abs(dy) > 0;
                        requestRedraw();
                    }
                } else if (state.isPanning) {
                    state.pan.x += dx;
                    state.pan.y += dy;
                    state.hasPointerMoved = state.hasPointerMoved || Math.abs(dx) > 0 || Math.abs(dy) > 0;
                    requestRedraw();
                }
                state.dragStart = { x: pos.x, y: pos.y };
            };

            const onMouseUp = () => {
                if (state.isDragging && state.hasPointerMoved) saveState();
                if (state.isPanning && state.hasPointerMoved) saveToLocalStorage();
                state.isDragging = false;
                state.isPanning = false;
                state.hasPointerMoved = false;
                state.draggingNodeId = null;
            };

            const onWheel = (e) => {
                e.preventDefault();
                const pos = getMousePos(e);
                const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
                zoom(zoomFactor, pos);
            };

            const onDoubleClick = (e) => {
                const pos = getMousePos(e);
                const clickedNodeId = findNodeAt(pos.x, pos.y);
                if (clickedNodeId) {
                    startEditingNode(clickedNodeId);
                }
            };

            const onKeyDown = (e) => {
                if (state.editingNodeId) return;

                // Ignore hotkeys when typing in an input, textarea, or contenteditable element
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                    return;
                }

                // Ignore app hotkeys while a dialog is open so actions like
                // undo/delete cannot fire behind a modal.
                if (document.querySelector('div[role="dialog"]:not(.hidden)')) return;

                if (e.key === 'Escape' && state.connecting) {
                    state.connecting = false;
                    requestRedraw();
                }

                const key = e.key.toLowerCase();
                if ((e.ctrlKey || e.metaKey) && key === 'o') {
                    e.preventDefault();
                    dom.fileInput.click();
                }
                if (e.key === 'Delete') {
                    if (state.selectedNodeId) {
                        deleteNode(state.selectedNodeId);
                        state.selectedNodeId = null;
                        state.connecting = false;
                        saveState();
                        requestRedraw();
                    }
                }
                if ((e.ctrlKey || e.metaKey) && key === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) redo(); else undo();
                }
                if ((e.ctrlKey || e.metaKey) && key === 'y') {
                    e.preventDefault();
                    redo();
                }
            };

            const onContextMenu = (e) => {
                e.preventDefault();
                const pos = getMousePos(e);
                const nodeId = findNodeAt(pos.x, pos.y);
                state.selectedNodeId = nodeId;
                requestRedraw();
                showContextMenu(e.clientX, e.clientY, nodeId);
            };

            // --- UI & Menus ---
            const showContextMenu = (x, y, nodeId) => {
                // Clamp context menu position to stay within viewport
                const menuWidth = 192; // w-48 = 12rem = 192px
                const menuHeight = contextMenu.offsetHeight || 200;
                const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
                const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);
                contextMenu.style.left = `${clampedX}px`;
                contextMenu.style.top = `${clampedY}px`;
                contextMenu.classList.remove('hidden');
                
                const menuAddNode = document.getElementById('menu-add-node');
                const menuAddChild = document.getElementById('menu-add-child');
                const menuConnect = document.getElementById('menu-connect');
                const menuDeleteNode = document.getElementById('menu-delete-node');
                const menuDisconnect = document.getElementById('menu-disconnect');

                menuAddNode.style.display = 'block';
                menuAddNode.onclick = () => {
                    const pos = screenToWorld(x, y);
                    const newNode = createNode(pos.x, pos.y);
                    state.selectedNodeId = newNode.id;
                    saveState();
                    requestRedraw();
                    startEditingNode(newNode.id);
                };

                if (nodeId) {
                    menuAddChild.style.display = 'block';
                    menuConnect.style.display = 'block';
                    menuDeleteNode.style.display = 'block';
                    const node = findNodeById(nodeId);
                    if (!node) return;
                    menuDisconnect.style.display = node.parentId ? 'block' : 'none';

                    menuAddChild.onclick = () => {
                        const parent = findNodeById(nodeId);
                        const child = createNode(parent.x + parent.width + 50, parent.y, 'New Child', nodeId);
                        saveState();
                        startEditingNode(child.id);
                    };
                    menuConnect.onclick = () => {
                        state.connecting = true;
                        hideContextMenu();
                    };
                    menuDeleteNode.onclick = () => {
                        deleteNode(nodeId);
                        state.selectedNodeId = null;
                        saveState();
                        requestRedraw();
                    };
                    menuDisconnect.onclick = () => {
                        node.parentId = null;
                        saveState();
                        requestRedraw();
                    };
                } else {
                    menuAddChild.style.display = 'none';
                    menuConnect.style.display = 'none';
                    menuDeleteNode.style.display = 'none';
                    menuDisconnect.style.display = 'none';
                }
            };

            const hideContextMenu = () => contextMenu.classList.add('hidden');

            const importJSON = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
                        if (data && typeof data.markdown === 'string') {
                            const result = markdownToNodes(data.markdown, 100, 100);
                            state.nodes = result.nodes;
                            state.nextNodeId = result.nextId;
                            state.selectedNodeId = null;
                            state.editingNodeId = null;
                            saveState();
                            fitView();
                            showNotification('Imported', `Imported ${result.nodes.length} nodes.`, 'success');
                        } else {
                            applyProjectData(data);
                            saveState();
                            requestRedraw();
                        }
                    } catch (error) {
                        showNotification('Error', 'Invalid file format', 'error');
                    }
                };
                reader.readAsText(file);
                e.target.value = '';
            };

            const markdownToNodes = (md, startX, startY) => {
                return parseMarkdownTree(md, startX, startY, state.nextNodeId, updateNodeDimensions);
            };

            const copyMarkdownTree = async () => {
            if (state.nodes.length === 0) {
                showNotification('Nothing to Copy', 'The mind map is empty.', 'error');
                return;
            }
            const md = nodesToMarkdown(state.nodes);
            const aiPrompt = "Proofread and fix grammar/spelling in the indented markdown list below, then return ONLY the corrected list inside a single code block. Keep the exact 2-space indentation (`-` bullets) and `<br>` line breaks within nodes, and preserve all URLs, image links, tables, and code/mermaid blocks unchanged:\n\n";
            const clipboardText = aiPrompt + md;
            try {
                await navigator.clipboard.writeText(clipboardText);
                showNotification('Copied', 'Markdown tree copied to clipboard!', 'success');
            } catch (err) {
                showNotification('Error', 'Failed to copy to clipboard.', 'error');
            }
        };

        const pasteMarkdownTree = async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (!text) {
                    showNotification('Clipboard Empty', 'Clipboard is empty.', 'error');
                    return;
                }
                
                // Use CSS-pixel dimensions (clientWidth) so the pasted tree is
                // centered correctly on HiDPI screens where canvas.width is
                // scaled by the device pixel ratio.
                const centerX = (canvas.clientWidth / 2 - state.pan.x) / state.zoom;
                const centerY = (canvas.clientHeight / 2 - state.pan.y) / state.zoom;
                
                const result = markdownToNodes(text, centerX, centerY);
                if (result.nodes.length > 0) {
                    let shouldReplace = false;
                    
                    if (state.nodes.length > 0) {
                        const action = await showConfirm(
                            'Do you want to replace the current mind map with the pasted tree, or append to it?', 
                            'Paste Markdown', 
                            'Replace', 
                            'Append', 
                            'Cancel'
                        );
                        
                        if (action === 'cancel') return;
                        shouldReplace = (action === 'yes');
                    } else {
                        shouldReplace = true;
                    }
                    
                    if (shouldReplace) {
                        state.nodes = result.nodes;
                    } else {
                        state.nodes = state.nodes.concat(result.nodes);
                    }
                    state.nextNodeId = result.nextId;
                    saveState();
                    requestRedraw();
                    showNotification('Pasted', `Pasted ${result.nodes.length} nodes!`, 'success');
                } else {
                    showNotification('Error', 'No valid markdown list found in clipboard.', 'error');
                }
            } catch (err) {
                showNotification('Error', 'Failed to read clipboard.', 'error');
            }
        };

        const exportAsJSON = () => {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
                
                const exportData = {
                    markdown: nodesToMarkdown(state.nodes)
                };
                
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `mindmap-${timestamp}.json`;
                a.click();
                URL.revokeObjectURL(url);
            };

            const toggleTheme = () => {
                toggleSharedTheme();
            };

            const toggleLock = () => {
                state.nodesLocked = !state.nodesLocked;
                dom.lockIconUnlocked.classList.toggle('hidden', state.nodesLocked);
                dom.lockIconLocked.classList.toggle('hidden', !state.nodesLocked);
                dom.lockBtn.classList.toggle('is-active', state.nodesLocked);
                dom.lockBtn.title = state.nodesLocked ? 'Unlock Nodes' : 'Lock Nodes';
                localStorage.setItem('mindmap-locked', state.nodesLocked ? 'on' : 'off');
            };

            const toggleGrid = () => {
                state.showGrid = !state.showGrid;
                dom.gridToggle.classList.toggle('is-active', state.showGrid);
                dom.gridToggle.title = state.showGrid ? 'Hide Grid' : 'Show Grid';
                localStorage.setItem('mindmap-grid', state.showGrid ? 'on' : 'off');
                saveToLocalStorage();
                requestRedraw();
            };













            // --- Actions ---
            const zoom = (factor, pivot = null) => {
                zoomViewport(canvas, state, factor, pivot, () => {
                    dom.zoomIndicator.textContent = `${Math.round(state.zoom * 100)}%`;
                    saveToLocalStorage();
                    requestRedraw();
                });
            };

            const fitView = () => {
                fitViewport(canvas, state, () => {
                    dom.zoomIndicator.textContent = `${Math.round(state.zoom * 100)}%`;
                    saveToLocalStorage();
                    requestRedraw();
                });
            };

            // --- Initialization ---
            const init = () => {
                const handleThemeChange = (isDark) => {
                    state.isDark = isDark;
                    clearMarkdownCaches();
                    refreshCssVars();
                    syncToggleControls();
                    requestRedraw();
                };
                registerThemeListener(handleThemeChange);
                initTheme();

                setContentUpdateCallback(() => {
                    state.nodes.forEach(updateNodeDimensions);
                    requestRedraw();
                });
                setupEventListeners();
                resizeCanvas();
                
                // Load saved data or load sample JSON on first visit
                const hasLoadedData = loadFromLocalStorage();
                if (!hasLoadedData) {
                    // First time visit - load sample JSON
                    fetch('sample-mindmap.json')
                        .then(r => r.json())
                        .then(data => {
                            if (data && typeof data.markdown === 'string') {
                                const result = markdownToNodes(data.markdown, 100, 100);
                                state.nodes = result.nodes;
                                state.nextNodeId = result.nextId;
                                fitView();
                            } else {
                                applyProjectData(data);
                            }
                            const savedGrid = localStorage.getItem('mindmap-grid');
                            if (savedGrid) state.showGrid = savedGrid === 'on';
                            syncToggleControls();
                            saveState();
                            fitView();
                            requestRedraw();
                        })
                        .catch(() => {
                            // Fallback if sample file not found
                            const cX = canvas.clientWidth / 2;
                            const cY = canvas.clientHeight / 2;
                            createNode(screenToWorld(cX, cY).x - 50, screenToWorld(cX, cY).y - 25, 'Welcome!');
                            const savedGrid = localStorage.getItem('mindmap-grid');
                            if (savedGrid) state.showGrid = savedGrid === 'on';
                            syncToggleControls();
                            saveState();
                            fitView();
                            requestRedraw();
                        });
                } else {
                    const savedGrid = localStorage.getItem('mindmap-grid');
                    if (savedGrid) state.showGrid = savedGrid === 'on';
                    // Update UI to reflect loaded state
                    dom.zoomIndicator.textContent = `${Math.round(state.zoom * 100)}%`;
                    syncToggleControls();
                    saveState();
                    requestRedraw();
                }

                const savedLocked = localStorage.getItem('mindmap-locked');
                if (savedLocked === 'on') {
                    state.nodesLocked = true;
                } else {
                    state.nodesLocked = false;
                }
                syncToggleControls();
                
                state.isDark = document.documentElement.classList.contains('dark');
                configureMermaid(state.isDark);
            };

            init();

        const autoArrangeTree = () => {
            if (state.nodes.length === 0) return;
            layoutNodeTree(state.nodes, 100, 100);
            saveState();
            fitView();
            showNotification('Auto-Arranged', `Horizontal tree layout (${dom.zoomIndicator.textContent})`, 'success');
        };

        window.addEventListener('paste', async (e) => {
            if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
                return;
            }
            
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (!text) return;

            const trimmed = text.trim();
            const fallback = screenToWorld(canvas.clientWidth / 2, canvas.clientHeight / 2);
            const mouseX = window.lastMousePos ? window.lastMousePos.x : fallback.x;
            const mouseY = window.lastMousePos ? window.lastMousePos.y : fallback.y;

            // 1. Smart bare-URL paste directly onto canvas
            if (/^(https?:\/\/[^\s]+)$/i.test(trimmed)) {
                e.preventDefault();
                const formatted = formatSmartPastedUrl(trimmed, '');
                const newNode = {
                    id: state.nextNodeId++,
                    text: formatted,
                    x: mouseX,
                    y: mouseY,
                    width: 220,
                    height: 80,
                    parentId: state.selectedNodeId || null
                };
                state.nodes.push(newNode);
                state.selectedNodeId = newNode.id;
                saveState();
                requestRedraw();
                showNotification('Link Pasted', 'Created node from pasted URL.', 'success');
                return;
            }

            // 2. Markdown bullet tree paste
            if (!text.split('\n').some(l => /^[-*+•]\s/.test(l.trim()))) {
                return;
            }
            e.preventDefault();
            
            const result = markdownToNodes(text, mouseX, mouseY);
            if (result.nodes.length > 0) {
                state.nodes = state.nodes.concat(result.nodes);
                state.nextNodeId = result.nextId;
                saveState();
                requestRedraw();
                showNotification('Pasted', `Pasted ${result.nodes.length} nodes from clipboard!`, 'success');
            }
        });

        // Quick Node Search (Ctrl+F) & Auto-Arrange Shortcut (Ctrl+Shift+L)
        const canvasSearch = initCanvasSearch({
            dom,
            state,
            canvas,
            requestRedraw: () => requestRedraw()
        });
        const openCanvasSearch = canvasSearch ? canvasSearch.openCanvasSearch : () => {};

        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                openCanvasSearch();
            } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                autoArrangeTree();
            }
        });
        
        canvas.addEventListener('mousemove', (e) => {
            const pos = getMousePos(e);
            window.lastMousePos = screenToWorld(pos.x, pos.y);
        });

        });
