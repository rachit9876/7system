import { showNotification } from "./shared/notifications.js";
        // Firebase auth is imported dynamically in waitForAuth() so the editor
        // keeps working fully offline instead of failing the whole module.

        let sessionAuth = null;
        let lastCloudMapName = '';

        const updateAuthUI = () => {
            if (sessionAuth) {
                document.getElementById('cloudSaveBtn').classList.remove('hidden');
                document.getElementById('cloudLoadBtn').classList.remove('hidden');
                document.getElementById('logoutBtn').classList.remove('hidden');
                document.getElementById('portalBtn').classList.remove('hidden');
                document.getElementById('accountBtn').classList.add('hidden');
            } else {
                document.getElementById('cloudSaveBtn').classList.add('hidden');
                document.getElementById('cloudLoadBtn').classList.add('hidden');
                document.getElementById('logoutBtn').classList.add('hidden');
                document.getElementById('portalBtn').classList.add('hidden');
                document.getElementById('accountBtn').classList.remove('hidden');
            }
        };

        try {
            const storedAuth = localStorage.getItem('7systemSessionAuth');
            if (storedAuth) {
                // Keep username just for UI if needed, but don't store password anymore
                const parsed = JSON.parse(storedAuth);
                sessionAuth = { username: parsed.username };
                localStorage.setItem('7systemSessionAuth', JSON.stringify(sessionAuth));
            }
        } catch(e) {}

        updateAuthUI();

        // Wait for Firebase to initialize (loaded by api.js)
        let authRetries = 0;
        const waitForAuth = setInterval(() => {
            if (window.firebaseAuth) {
                clearInterval(waitForAuth);
                import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js")
                    .then(({ onAuthStateChanged }) => {
                onAuthStateChanged(window.firebaseAuth, (user) => {
                    if (user) {
                        sessionAuth = { username: user.email, uid: user.uid };
                        const mapToLoad = sessionStorage.getItem('7systemLoadMap');
                        if (mapToLoad) {
                            sessionStorage.removeItem('7systemLoadMap');
                            let mapRetries = 0;
                            const checkDOM = setInterval(() => {
                                if (window.openCloudMap) {
                                    clearInterval(checkDOM);
                                    window.openCloudMap(mapToLoad);
                                } else if (++mapRetries > 200) {
                                    clearInterval(checkDOM);
                                }
                            }, 50);
                        }
                    } else {
                        sessionAuth = null;
                    }
                    updateAuthUI();
                });
                    })
                    .catch(() => {
                        // Offline / CDN blocked: stay in local-only mode.
                    });
            } else if (++authRetries > 200) {
                clearInterval(waitForAuth);
            }
        }, 50);

        // Notification system is loaded from shared module

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

            const FONT_SIZE = 16;
            const PADDING = 10;
            const BORDER_RADIUS = 5;

            // Global Keyboard Handler for Modals
            document.addEventListener('keydown', (e) => {
                const openModal = document.querySelector('div[role="dialog"]:not(.hidden)');
                if (!openModal) return;

                if (e.key === 'Escape') {
                    // Close the active modal
                    if (openModal.id === 'accountModal') hideAccountModal();
                    else if (openModal.id === 'cloudModal') hideCloudModal();
                    else if (openModal.id === 'projectListModal') openModal.classList.add('hidden');
                    // confirmModal handles its own Escape key
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

            const NODE_PADDING = 14;
            const EDITOR_EXTRA_PADDING = 24;

            // Cached CSS variables for performance (avoid getComputedStyle per frame)
            let cssVars = {};
            const refreshCssVars = () => {
                const style = getComputedStyle(document.documentElement);
                ['--bg', '--bg-secondary', '--surface', '--border', '--node-bg', '--node-border', '--node-text', '--node-shadow', '--line', '--link', '--selection', '--text-primary', '--text-secondary'].forEach(name => {
                    cssVars[name] = style.getPropertyValue(name).trim();
                });
            };
            const getCachedVar = (name) => cssVars[name] || getCssVar(name);

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
                
                // Draw dot grid
                ctx.save();
                ctx.translate(state.pan.x, state.pan.y);
                ctx.scale(state.zoom, state.zoom);
                
                if (state.showGrid) {
                    const dotSpacing = 30;
                    const effectiveSpacing = dotSpacing * state.zoom;
                    // Skip grid rendering if dots would be too dense
                    if (effectiveSpacing >= 8) {
                        const dotSize = 1.5;
                        const startX = Math.floor(-state.pan.x / state.zoom / dotSpacing) * dotSpacing;
                        const startY = Math.floor(-state.pan.y / state.zoom / dotSpacing) * dotSpacing;
                        const endX = startX + (canvas.clientWidth / state.zoom) + dotSpacing;
                        const endY = startY + (canvas.clientHeight / state.zoom) + dotSpacing;
                        
                        ctx.fillStyle = getCachedVar('--border');
                        ctx.globalAlpha = state.isDark ? 0.12 : 0.18;
                        ctx.beginPath();
                        for (let x = startX; x < endX; x += dotSpacing) {
                            for (let y = startY; y < endY; y += dotSpacing) {
                                ctx.rect(x - dotSize/2, y - dotSize/2, dotSize, dotSize);
                            }
                        }
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }
                }
                
                drawConnections();
                drawNodes();

                if (state.connecting && state.selectedNodeId) {
                    drawConnectionLineToCursor();
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

            const drawConnections = () => {
                ctx.strokeStyle = getCachedVar('--line');
                ctx.lineWidth = 2;
                for (const node of state.nodes) {
                    if (node.parentId) {
                        const parent = findNodeById(node.parentId);
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

            const drawConnectionLineToCursor = () => {
                const startNode = findNodeById(state.selectedNodeId);
                if (!startNode) return;

                const start = { x: startNode.x + startNode.width / 2, y: startNode.y + startNode.height / 2 };
                const end = screenToWorld(state.dragStart.x, state.dragStart.y);

                ctx.strokeStyle = getCachedVar('--selection');
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
                ctx.setLineDash([]);
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
                    const isDark = settings.theme === 'dark';
                    document.documentElement.classList.toggle('dark', isDark);
                    state.isDark = isDark;
                    dom.themeIconLight.classList.toggle('hidden', isDark);
                    dom.themeIconDark.classList.toggle('hidden', !isDark);
                    localStorage.setItem('mindmap-theme', settings.theme);
                    if (typeof refreshCssVars === 'function') refreshCssVars();
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

            const nodeEditorModal = document.getElementById('nodeEditorModal');
            const nodeEditorDoneBtn = document.getElementById('nodeEditorDoneBtn');
            const nodeEditorCancelBtn = document.getElementById('nodeEditorCancelBtn');
            const nodeEditorToolbar = document.getElementById('nodeEditorToolbar');

            const updateEditorSize = () => {
                if (nodeEditorModal) return;
                if (!state.editingNodeId) return;
                const node = findNodeById(state.editingNodeId);
                if (!node) return;
                
                const screenPos = worldToScreen(node.x, node.y);
                const effectiveZoom = state.zoom;
                const baseHeight = node.height * effectiveZoom + EDITOR_EXTRA_PADDING * effectiveZoom;

                const targetWidth = Math.min(window.innerWidth * 0.9, (node.width + 100) * effectiveZoom);
                nodeEditor.style.width = `${targetWidth}px`;

                nodeEditor.style.height = '1px';
                const neededHeight = nodeEditor.scrollHeight;

                let finalHeight = Math.max(neededHeight, baseHeight);
                const maxHeight = window.innerHeight * 0.7;
                finalHeight = Math.min(finalHeight, maxHeight);
                
                nodeEditor.style.height = `${finalHeight}px`;

                // Clamp position to viewport bounds
                let left = screenPos.x;
                let top = screenPos.y;
                
                if (left + targetWidth > window.innerWidth) {
                    left = window.innerWidth - targetWidth - 10;
                }
                if (top + finalHeight > window.innerHeight) {
                    top = window.innerHeight - finalHeight - 10;
                }
                left = Math.max(10, left);
                top = Math.max(10, top);

                nodeEditor.style.left = `${left}px`;
                nodeEditor.style.top = `${top}px`;
            };

            const startEditingNode = (nodeId) => {
                const node = findNodeById(nodeId);
                if (!node) return;

                state.editingNodeId = nodeId;
                state.editingOriginalText = node.text;
                
                nodeEditor.value = node.text;
                if (nodeEditorModal) {
                    nodeEditorModal.classList.remove('hidden');
                } else {
                    nodeEditor.classList.add('active');
                    updateEditorSize();
                }
                nodeEditor.focus();
                nodeEditor.select();
                requestRedraw();
            };

            const finishEditingNode = () => {
                if (state.cancelingEdit) return;
                if (!state.editingNodeId) return;
                const node = findNodeById(state.editingNodeId);
                if (node) {
                    if (state.editingOriginalText !== nodeEditor.value) {
                        node.text = nodeEditor.value;
                        updateNodeDimensions(node);
                        saveState();
                    }
                }
                hideNodeEditor();
                requestRedraw();
            };
            
            const hideNodeEditor = () => {
                state.editingNodeId = null;
                state.editingOriginalText = null;
                if (nodeEditorModal) {
                    nodeEditorModal.classList.add('hidden');
                }
                nodeEditor.classList.remove('active');
            };

            const cancelEditingNode = () => {
                state.cancelingEdit = true;
                if (state.editingNodeId) {
                    const node = findNodeById(state.editingNodeId);
                    if (node && state.editingOriginalText !== null) {
                        node.text = state.editingOriginalText;
                        updateNodeDimensions(node);
                    }
                }
                hideNodeEditor();
                requestRedraw();
                setTimeout(() => { state.cancelingEdit = false; }, 50);
            };

            // --- Event Handlers ---
            const setupEventListeners = () => {
                canvas.addEventListener('mousedown', onMouseDown);
                canvas.addEventListener('mousemove', onMouseMove);
                canvas.addEventListener('mouseup', onMouseUp);
                canvas.addEventListener('mouseleave', onMouseUp);
                canvas.addEventListener('wheel', onWheel);
                canvas.addEventListener('dblclick', onDoubleClick);
                canvas.addEventListener('contextmenu', onContextMenu);

                if (nodeEditorModal) {
                    nodeEditorModal.addEventListener('click', (e) => {
                        if (e.target === nodeEditorModal) finishEditingNode();
                    });
                }
                if (nodeEditorDoneBtn) nodeEditorDoneBtn.addEventListener('click', finishEditingNode);
                if (nodeEditorCancelBtn) nodeEditorCancelBtn.addEventListener('click', cancelEditingNode);

                if (nodeEditorToolbar) {
                    nodeEditorToolbar.addEventListener('click', (e) => {
                        const btn = e.target.closest('button[data-md]');
                        if (!btn) return;
                        const type = btn.dataset.md;
                        const start = nodeEditor.selectionStart;
                        const end = nodeEditor.selectionEnd;
                        const val = nodeEditor.value;
                        const sel = val.substring(start, end);
                        let insert = '';
                        let cursorOffset = 0;

                        if (type === 'bold') {
                            insert = `**${sel || 'bold text'}**`;
                            cursorOffset = sel ? insert.length : 2;
                        } else if (type === 'italic') {
                            insert = `*${sel || 'italic text'}*`;
                            cursorOffset = sel ? insert.length : 1;
                        } else if (type === 'strike') {
                            insert = `~~${sel || 'strikethrough'}~~`;
                            cursorOffset = sel ? insert.length : 2;
                        } else if (type === 'h1') {
                            insert = `# ${sel || 'Heading 1'}`;
                            cursorOffset = insert.length;
                        } else if (type === 'h2') {
                            insert = `## ${sel || 'Heading 2'}`;
                            cursorOffset = insert.length;
                        } else if (type === 'code') {
                            insert = `\`${sel || 'code'}\``;
                            cursorOffset = sel ? insert.length : 1;
                        } else if (type === 'link') {
                            insert = `[${sel || 'Link'}](https://)`;
                            cursorOffset = insert.length - 1;
                        } else if (type === 'list') {
                            insert = `- ${sel || 'List item'}`;
                            cursorOffset = insert.length;
                        } else if (type === 'task') {
                            insert = `- [ ] ${sel || 'Task item'}`;
                            cursorOffset = insert.length;
                        } else if (type === 'table') {
                            insert = `\n| Column 1 | Column 2 |\n| :--- | :--- |\n| Value 1 | Value 2 |\n`;
                            cursorOffset = insert.length;
                        } else if (type === 'mermaid') {
                            insert = `\n\`\`\`mermaid\ngraph TD\n  A[Start] --> B[End]\n\`\`\`\n`;
                            cursorOffset = insert.length;
                        }

                        nodeEditor.value = val.substring(0, start) + insert + val.substring(end);
                        nodeEditor.focus();
                        nodeEditor.selectionStart = nodeEditor.selectionEnd = start + cursorOffset;
                    });
                }

                nodeEditor.addEventListener('keydown', e => {
                    if (e.key === 'Enter' && e.shiftKey) {
                        e.preventDefault();
                        finishEditingNode();
                    }
                    if (e.key === 'Escape') cancelEditingNode();
                });
                
                const formatSmartPastedUrl = (rawUrl, selectedText) => {
                    if (selectedText) return `[${selectedText}](${rawUrl})`;
                    try {
                        const url = new URL(rawUrl);
                        const pathname = decodeURIComponent(url.pathname || '');
                        const lowerPath = pathname.toLowerCase();

                        if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(lowerPath)) {
                            const file = pathname.split('/').filter(Boolean).pop() || 'Image';
                            return `![${file}](${rawUrl})`;
                        }

                        if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt|md|zip)$/i.test(lowerPath)) {
                            const file = pathname.split('/').filter(Boolean).pop() || 'Document';
                            return `[${file}](${rawUrl})`;
                        }

                        const host = url.hostname.replace(/^www\./i, '').toLowerCase();
                        let label = host;

                        if (host === 'github.com') {
                            const parts = pathname.split('/').filter(Boolean);
                            label = parts.length >= 2 ? `GitHub: ${parts[0]}/${parts[1]}` : 'GitHub';
                        } else if (host === 'youtube.com' || host === 'youtu.be') {
                            label = 'YouTube';
                        } else if (host === 'docs.google.com') {
                            if (pathname.includes('/spreadsheets')) label = 'Google Sheet';
                            else if (pathname.includes('/presentation')) label = 'Google Slides';
                            else label = 'Google Doc';
                        } else if (host === 'drive.google.com') {
                            label = 'Google Drive';
                        } else if (host === 'figma.com') {
                            label = 'Figma';
                        } else if (host === 'notion.so' || host === 'notion.site') {
                            label = 'Notion';
                        } else if (host === 'x.com' || host === 'twitter.com') {
                            label = 'X';
                        } else if (host === 'reddit.com') {
                            label = 'Reddit';
                        } else if (host === 'stackoverflow.com') {
                            label = 'Stack Overflow';
                        } else if (host.endsWith('wikipedia.org')) {
                            label = 'Wikipedia';
                        }

                        return `[${label}](${rawUrl})`;
                    } catch (err) {
                        return `[Link](${rawUrl})`;
                    }
                };

                nodeEditor.addEventListener('paste', (e) => {
                    const pastedText = (e.clipboardData || window.clipboardData).getData('text').trim();
                    const urlRegex = /^(https?:\/\/[^\s]+)$/i;
                    
                    if (urlRegex.test(pastedText)) {
                        const start = nodeEditor.selectionStart;
                        const end = nodeEditor.selectionEnd;
                        const textBefore = nodeEditor.value.substring(0, start);
                        const textAfter = nodeEditor.value.substring(end);
                        const selectedText = nodeEditor.value.substring(start, end);
                        
                        // Check if it's already inside markdown links `](`, `<`, or `![`
                        if (!textBefore.endsWith('](') && !textBefore.endsWith('<')) {
                            e.preventDefault();
                            
                            const markdownLink = formatSmartPastedUrl(pastedText, selectedText);
                            nodeEditor.value = textBefore + markdownLink + textAfter;
                            nodeEditor.selectionStart = nodeEditor.selectionEnd = start + markdownLink.length;
                            updateEditorSize();
                        }
                    }
                });

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
                    lastCloudMapName = '';
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
                dom.themeToggle.addEventListener('click', toggleTheme);
                dom.importBtn.addEventListener('click', () => dom.fileInput.click());
                dom.exportBtn.addEventListener('click', exportAsJSON);
                dom.importMdBtn.addEventListener('click', pasteMarkdownTree);
                dom.exportMdBtn.addEventListener('click', copyMarkdownTree);
                dom.fileInput.addEventListener('change', importJSON);
                dom.cloudSaveBtn.addEventListener('click', showCloudSaveModal);
                dom.cloudLoadBtn.addEventListener('click', showCloudLoadModal);
                dom.lockBtn.addEventListener('click', toggleLock);
                dom.gridToggle.addEventListener('click', toggleGrid);
                dom.accountBtn.addEventListener('click', showAccountModal);
                dom.logoutBtn.addEventListener('click', async () => {
                    if (window.firebaseAuth) {
                        const { signOut } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js");
                        await signOut(window.firebaseAuth);
                    }
                    sessionAuth = null;
                    updateAuthUI();
                    localStorage.removeItem('7systemSessionAuth');
                    showNotification('Success', 'Logged out successfully', 'success');
                });

                let resizeTimeout;
                window.addEventListener('resize', () => {
                    clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(resizeCanvas, 100);
                });
                window.addEventListener('keydown', onKeyDown);
                document.addEventListener('click', () => hideContextMenu());
                
                // Cloud modal event listeners
                document.getElementById('modalCancel').addEventListener('click', hideCloudModal);
                document.getElementById('projectListClose').addEventListener('click', () => {
                    document.getElementById('projectListModal').classList.add('hidden');
                });
                
                // Account modal event listeners
                document.getElementById('accountCancel').addEventListener('click', hideAccountModal);
                document.getElementById('accountLogin').addEventListener('click', handleAccountLogin);
                document.getElementById('accountUsernameInput').addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        document.getElementById('accountPasswordInput').focus();
                    }
                    if (e.key === 'Escape') hideAccountModal();
                });
                document.getElementById('accountPasswordInput').addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAccountLogin();
                    }
                    if (e.key === 'Escape') hideAccountModal();
                });
                
                // Removed override modal event listeners in favor of showConfirm
                
                document.getElementById('mindmapNameInput').addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        document.getElementById('modalConfirm').click();
                    }
                    if (e.key === 'Escape') hideCloudModal();
                });
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

            const showAccountModal = () => {
                document.getElementById('accountModal').classList.remove('hidden');
                document.getElementById('accountUsernameInput').focus();
                document.getElementById('accountStatus').classList.add('hidden');
            };
            
            const hideAccountModal = () => {
                document.getElementById('accountModal').classList.add('hidden');
                document.getElementById('accountUsernameInput').value = '';
                document.getElementById('accountPasswordInput').value = '';
                document.getElementById('accountStatus').classList.add('hidden');
            };
            
            const handleAccountLogin = async () => {
                const username = document.getElementById('accountUsernameInput').value.trim();
                const password = document.getElementById('accountPasswordInput').value;
                
                if (!username || !password) {
                    showNotification('Error', 'Please enter an email address and password', 'error');
                    return;
                }
                
                if (!window.firebaseUtils) {
                    showNotification('Error', 'Service unavailable', 'error');
                    return;
                }
                const result = await window.firebaseUtils.loginRegister(username, password);
                if (result.success) {
                    sessionAuth = { username };
                    localStorage.setItem('7systemSessionAuth', JSON.stringify(sessionAuth));
                    hideAccountModal();
                    showNotification('Success', result.message, 'success');
                } else {
                    showNotification('Error', result.message, 'error');
                }
            };
            
            const showCloudSaveModal = async () => {
                if (!sessionAuth) {
                    showNotification('Error', 'Please login first', 'error');
                    showAccountModal();
                    return;
                }
                
                document.getElementById('modalTitle').textContent = 'Save to Cloud';
                document.getElementById('mindmapNameInput').value = lastCloudMapName;
                document.getElementById('modalConfirm').textContent = 'Save';
                document.getElementById('cloudModal').classList.remove('hidden');
                document.getElementById('mindmapNameInput').focus();
                
                const listContainer = document.getElementById('cloudModalExistingListContainer');
                const listEl = document.getElementById('cloudModalExistingList');
                listContainer.classList.add('hidden');
                
                // Fetch list
                if (!window.firebaseUtils) {
                    showNotification('Error', 'Service unavailable', 'error');
                    return;
                }
                const result = await window.firebaseUtils.getMindMapsList(sessionAuth.username, null);
                const existingMindMaps = result.success ? result.mindmaps : [];
                
                if (existingMindMaps.length > 0) {
                    listContainer.classList.remove('hidden');
                    
                    const renderList = (filterText) => {
                        listEl.innerHTML = '';
                        const filtered = existingMindMaps.filter(m => m.name.toLowerCase().includes(filterText.toLowerCase()));
                        if (filtered.length === 0) {
                            listEl.innerHTML = '<div class="text-sm text-[var(--text-secondary)] p-2">No matches</div>';
                            return;
                        }
                        filtered.forEach(m => {
                            const item = document.createElement('div');
                            item.className = 'p-2 hover:bg-[var(--border)] rounded cursor-pointer text-sm truncate';
                            item.textContent = m.name;
                            item.onclick = () => {
                                document.getElementById('mindmapNameInput').value = m.name;
                                document.getElementById('modalConfirm').click();
                            };
                            listEl.appendChild(item);
                        });
                    };
                    
                    renderList(document.getElementById('mindmapNameInput').value.trim());
                    
                    const inputEl = document.getElementById('mindmapNameInput');
                    const newListener = (e) => renderList(e.target.value.trim());
                    if (inputEl._inputListener) inputEl.removeEventListener('input', inputEl._inputListener);
                    inputEl.addEventListener('input', newListener);
                    inputEl._inputListener = newListener;
                }
                
                document.getElementById('modalConfirm').onclick = async () => {
                    const mindmapName = document.getElementById('mindmapNameInput').value.trim();
                    
                    if (!mindmapName) {
                        showNotification('Error', 'Please enter a name', 'error');
                        return;
                    }
                    if (/[.$#\[\]\/]/.test(mindmapName)) {
                        showNotification('Error', 'Map name contains invalid characters (. $ # [ ] /)', 'error');
                        return;
                    }
                    
                    const exists = existingMindMaps.some(m => m.name === mindmapName);
                    if (exists) {
                        document.getElementById('cloudModal').classList.add('hidden');
                        const confirmed = await showConfirm(
                            'A project with this name already exists. Do you want to overwrite the existing one?', 
                            'Override Existing?', 
                            'Yes', 
                            'No'
                        );
                        if (confirmed) {
                            performCloudSave(mindmapName, true);
                        } else {
                            document.getElementById('cloudModal').classList.remove('hidden');
                        }
                    } else {
                        performCloudSave(mindmapName, false);
                    }
                };
            };
            
            const showCloudLoadModal = () => {
                if (!sessionAuth) {
                    showNotification('Error', 'Please login first', 'error');
                    showAccountModal();
                    return;
                }
                
                loadProjectList();
            };
            
            const loadProjectList = async () => {
                if (!window.firebaseUtils) {
                    showNotification('Error', 'Service unavailable', 'error');
                    return;
                }
                const result = await window.firebaseUtils.getMindMapsList(sessionAuth.username, null);
                if (result.success) {
                    showProjectListModal(result.mindmaps);
                } else {
                    showNotification('Error', result.message, 'error');
                }
            };
            
            const showProjectListModal = (mindmaps) => {
                const content = document.getElementById('projectListContent');
                content.innerHTML = '';
                
                if (mindmaps.length === 0) {
                    content.innerHTML = '<p class="text-sm text-[var(--text-secondary)] p-4 text-center">No saved mind maps found</p>';
                } else {
                    mindmaps.forEach(mindmap => {
                        const item = document.createElement('div');
                        item.className = 'p-3 hover:bg-[var(--border)] rounded cursor-pointer flex justify-between items-center mb-2';
                        
                        const leftDiv = document.createElement('div');
                        leftDiv.className = 'flex-1';
                        leftDiv.onclick = async () => {
                            const loadRes = await window.firebaseUtils.loadMindMap(sessionAuth.username, null, mindmap.name, mindmap.key);
                            if (loadRes.success && loadRes.data) {
                                lastCloudMapName = mindmap.name;
                                applyProjectData(loadRes.data);
                                saveState();
                                requestRedraw();
                                document.getElementById('projectListModal').classList.add('hidden');
                            } else {
                                showNotification('Error', loadRes.message || 'Failed to load mind map.', 'error');
                            }
                        };
                        
                        const nameDiv = document.createElement('div');
                        nameDiv.className = 'font-medium';
                        nameDiv.textContent = mindmap.name;
                        
                        const dateDiv = document.createElement('div');
                        dateDiv.className = 'text-xs text-[var(--text-secondary)]';
                        dateDiv.textContent = new Date(mindmap.timestamp).toLocaleString();
                        
                        leftDiv.appendChild(nameDiv);
                        leftDiv.appendChild(dateDiv);
                        
                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'ml-2 text-red-500 hover:text-red-700 p-2';
                        deleteBtn.innerHTML = '<svg class="w-4 h-4"><use href="#icon-trash"/></svg>';
                        deleteBtn.onclick = async (e) => {
                            e.stopPropagation();
                            const confirmed = await showConfirm(`Delete "${mindmap.name}"?`);
                            if (confirmed) {
                                const result = await window.firebaseUtils.deleteMindMap(sessionAuth.username, null, mindmap.name, mindmap.key);
                                if (result.success) {
                                    showNotification('Success', result.message, 'success');
                                    const refreshResult = await window.firebaseUtils.getMindMapsList(sessionAuth.username, null);
                                    if (refreshResult.success) {
                                        showProjectListModal(refreshResult.mindmaps);
                                    }
                                } else {
                                    showNotification('Error', result.message, 'error');
                                }
                            }
                        };
                        
                        item.appendChild(leftDiv);
                        item.appendChild(deleteBtn);
                        content.appendChild(item);
                    });
                }
                
                document.getElementById('projectListModal').classList.remove('hidden');
            };
            
            const hideCloudModal = () => {
                document.getElementById('cloudModal').classList.add('hidden');
                document.getElementById('mindmapNameInput').value = '';
            };
            
            const performCloudSave = async (mapName, override) => {
                const dataPayload = {
                    timestamp: new Date().toISOString(),
                    settings: {
                        zoom: state.zoom,
                        pan: state.pan,
                        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                        showGrid: state.showGrid
                    },
                    // Strip the internal _cachedText field from cloud saves.
                    nodes: state.nodes.map(({ _cachedText, ...rest }) => rest),
                    metadata: {
                        nextNodeId: state.nextNodeId,
                        selectedNodeId: state.selectedNodeId,
                        version: '1.0'
                    }
                };
                
                const btn = document.getElementById('modalConfirm');
                const originalText = btn.textContent;
                btn.textContent = 'Saving...';
                btn.disabled = true;

                if (!window.firebaseUtils) {
                    showNotification('Error', 'Service unavailable', 'error');
                    btn.textContent = originalText;
                    btn.disabled = false;
                    return;
                }
                const result = await window.firebaseUtils.saveMindMap(sessionAuth.username, null, mapName, dataPayload);
                
                btn.textContent = originalText;
                btn.disabled = false;

                if (result.success) {
                    lastCloudMapName = mapName;
                    showNotification('Success', result.message, 'success');
                    hideCloudModal();
                } else {
                    showNotification('Error', result.message, 'error');
                }
            };
            
            const loadFromCloud = async (username, password, mindmapName, mindmapKey = mindmapName) => {
                if (!window.firebaseUtils) {
                    showNotification('Error', 'Service unavailable', 'error');
                    return;
                }
                showNotification('Info', 'Loading mind map...', 'info');
                const result = await window.firebaseUtils.loadMindMap(username, password, mindmapName, mindmapKey);
                if (result.success) {
                    try {
                        lastCloudMapName = mindmapName;
                        applyProjectData(result.data);
                        saveState();
                        requestRedraw();
                        showNotification('Success', result.message, 'success');
                    } catch (error) {
                        showNotification('Error', 'Failed to load data: Invalid format', 'error');
                    }
                } else {
                    showNotification('Error', result.message, 'error');
                }
            };

            window.openCloudMap = (mapName) => {
                loadFromCloud(sessionAuth.username, null, mapName);
            };

            
        const nodesToMarkdown = (nodes) => {
            let md = '';
            const roots = nodes.filter(n => !n.parentId || !nodes.find(pn => pn.id === n.parentId));
            
            const traverse = (node, depth, visited) => {
                // Guard against cyclic data so export can never hang.
                if (visited.has(node.id)) return;
                visited.add(node.id);
                const indent = '  '.repeat(depth);
                const safeText = node.text.replace(/\n/g, '<br>');
                md += `${indent}- ${safeText}\n`;
                const children = nodes.filter(n => n.parentId === node.id);
                // Sort children by Y coordinate to maintain visual order in markdown
                children.sort((a, b) => a.y - b.y).forEach(c => traverse(c, depth + 1, visited));
            };

            const visited = new Set();
            roots.sort((a, b) => a.y - b.y).forEach(r => traverse(r, 0, visited));
            return md.trim();
        };

        const markdownToNodes = (md, startX, startY) => {
            // Normalize newlines to \n to support Windows (\r\n) and Mac (\r)
            const normalizedMd = md.replace(/\r\n?/g, '\n');
            const lines = normalizedMd.split('\n');
            const newNodes = [];
            let currentId = state.nextNodeId;
            const stack = []; 
            
            // First pass: create all nodes and determine hierarchy
            lines.forEach(line => {
                if (!line.trim()) return;
                
                // Match bullets (-, *, +, or •)
                const match = line.match(/^(\s*)([-*+•]\s+)?(.*)$/);
                
                if (!match || !match[2]) {
                    // If line has no bullet, append it to the previous node (handles multiline text inside a node)
                    if (newNodes.length > 0) {
                        const prevNode = newNodes[newNodes.length - 1];
                        // Also replace <br> just in case it's in a multiline continuation
                        prevNode.text += '\n' + line.trim().replace(/<br>/gi, '\n');
                    }
                    return;
                }
                
                let spaces = match[1].replace(/\t/g, '  ').length;
                
                const depth = Math.floor(spaces / 2); 
                const text = match[3].replace(/<br>/gi, '\n').trim();
                
                while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
                    stack.pop();
                }
                const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
                
                const node = {
                    id: currentId++,
                    text: text,
                    x: 0, 
                    y: 0,     
                    parentId: parentId,
                    width: 200,
                    height: 100
                };
                
                newNodes.push(node);
                stack.push({ depth, id: node.id });
            });

            // Second pass: measure real node dimensions and apply vertical top-to-bottom layout
            newNodes.forEach(updateNodeDimensions);
            layoutNodeTree(newNodes, startX, startY);
            
            return { nodes: newNodes, nextId: currentId };
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
                document.documentElement.classList.toggle('dark');
                const isDark = document.documentElement.classList.contains('dark');
                state.isDark = isDark;
                if (window.mermaid) {
                    mermaid.initialize({
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
                        } : {}
                    });
                }
                dom.themeIconLight.classList.toggle('hidden', isDark);
                dom.themeIconDark.classList.toggle('hidden', !isDark);
                dom.themeToggle.classList.toggle('is-active', isDark);
                localStorage.setItem('mindmap-theme', isDark ? 'dark' : 'light');
                refreshCssVars();
                requestRedraw();
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

            const imageCache = new Map();
            const MAX_CACHE_SIZE = 50;
            
            const loadImage = (url) => {
                if (imageCache.has(url)) {
                    const img = imageCache.get(url);
                    imageCache.delete(url);
                    imageCache.set(url, img);
                    return img;
                }
                
                if (imageCache.size >= MAX_CACHE_SIZE) {
                    const firstKey = imageCache.keys().next().value;
                    imageCache.delete(firstKey);
                }
                
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    state.nodes.forEach(updateNodeDimensions);
                    requestRedraw();
                };
                img.src = url;
                imageCache.set(url, img);
                return img;
            };

            const getRenderedImageSize = (url) => {
                const maxWidth = 150;
                const maxHeight = 100;
                const img = imageCache.get(url);
                if (img && img.complete && img.naturalWidth > 0) {
                    const ratio = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);
                    return {
                        width: Math.round(img.naturalWidth * ratio),
                        height: Math.round(img.naturalHeight * ratio)
                    };
                }
                return { width: maxWidth, height: maxHeight };
            };
            
            const mermaidCache = new Map();
            let mermaidIdCounter = 0;
            const renderMermaidToImage = (code) => {
                // Mermaid is loaded from a CDN; degrade gracefully when it is
                // unavailable (offline) instead of throwing during rendering.
                if (typeof mermaid === 'undefined' || !mermaid.render) {
                    return { loading: false, img: null, error: true };
                }
                const isDark = document.documentElement.classList.contains('dark');
                const theme = isDark ? 'dark' : 'default';
                const cacheKey = `${theme}-${code}`;
                
                if (mermaidCache.has(cacheKey)) {
                    const cacheEntry = mermaidCache.get(cacheKey);
                    mermaidCache.delete(cacheKey);
                    mermaidCache.set(cacheKey, cacheEntry);
                    return cacheEntry;
                }
                
                if (mermaidCache.size >= MAX_CACHE_SIZE) {
                    const firstKey = mermaidCache.keys().next().value;
                    mermaidCache.delete(firstKey);
                }
                
                const id = `mermaid-${mermaidIdCounter++}`;
                mermaidCache.set(cacheKey, { loading: true, img: null });
                
                mermaid.render(id, code).then(result => {
                    const svgData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(result.svg);
                    const img = new Image();
                    img.onload = () => {
                        mermaidCache.set(cacheKey, { loading: false, img, width: img.naturalWidth || 300, height: img.naturalHeight || 200 });
                        state.nodes.forEach(updateNodeDimensions);
                        requestRedraw();
                    };
                    img.src = svgData;
                }).catch(e => {
                    console.error("Mermaid render error:", e);
                    mermaidCache.set(cacheKey, { loading: false, img: null, error: true });
                });
                
                return { loading: true, img: null };
            };

            const findLinkAtPosition = (text, x, y) => {
                const parts = getWrappedParts(ctx, text);
                let currentX = 0;
                let currentY = FONT_SIZE * 0.8;
                const lineHeight = FONT_SIZE * 1.4;
                let currentLineHeight = lineHeight;
                
                ctx.font = `500 ${FONT_SIZE}px sans-serif`;
                
                for (const part of parts) {
                    if (part.text === '\n') {
                        currentY += currentLineHeight;
                        currentX = 0;
                        currentLineHeight = lineHeight;
                        continue;
                    }
                    
                    if (part.image) {
                        const sz = getRenderedImageSize(part.image);
                        currentX += sz.width + 5;
                        currentLineHeight = Math.max(currentLineHeight, sz.height + 10);
                        continue;
                    }

                    if (part.table) {
                        if (currentX === 0 && currentY > y + FONT_SIZE) {
                            currentY += FONT_SIZE * 0.8;
                        }
                        const colWidths = [];
                        const measureCells = (cells) => {
                            cells.forEach((cellParts, colIndex) => {
                                let cellW = 0;
                                cellParts.forEach(cp => {
                                    if (cp.heading) ctx.font = `700 ${[24,20,18,16,14,12][cp.heading-1]||12}px sans-serif`;
                                    else ctx.font = `${cp.italic?'italic ':''}${cp.bold?'700':'500'} ${FONT_SIZE}px sans-serif`;
                                    cellW += ctx.measureText(cp.text).width;
                                });
                                colWidths[colIndex] = Math.max(colWidths[colIndex] || 0, cellW + 16);
                            });
                        };
                        measureCells(part.headers);
                        part.rows.forEach(r => measureCells(r));
                        const tableWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colWidths.length + 1) * 1;
                        const tableHeight = (1 + part.rows.length) * (lineHeight + 16);
                        
                        let startY = currentY - lineHeight * 0.8;
                        let rowHeight = lineHeight + 16;
                        
                        let linkFound = null;
                        const checkRow = (cells) => {
                            let startX = currentX;
                            cells.forEach((cellParts, colIndex) => {
                                const w = colWidths[colIndex];
                                let cellW = 0;
                                ctx.save();
                                cellParts.forEach(cp => {
                                    if (cp.heading) ctx.font = `700 ${[24,20,18,16,14,12][cp.heading-1]||12}px sans-serif`;
                                    else ctx.font = `${cp.italic?'italic ':''}${cp.bold?'700':'500'} ${FONT_SIZE}px sans-serif`;
                                    cellW += ctx.measureText(cp.text).width;
                                });
                                
                                let textX = startX + 8;
                                const align = part.alignments[colIndex] || 'left';
                                if (align === 'center') textX = startX + (w - cellW) / 2;
                                else if (align === 'right') textX = startX + w - cellW - 8;
                                
                                let textY = startY + rowHeight / 2 + FONT_SIZE * 0.3;
                                
                                cellParts.forEach(cp => {
                                    if (cp.heading) ctx.font = `700 ${[24,20,18,16,14,12][cp.heading-1]||12}px sans-serif`;
                                    else ctx.font = `${cp.italic?'italic ':''}${cp.bold?'700':'500'} ${FONT_SIZE}px sans-serif`;
                                    
                                    if (cp.link) {
                                        const textWidth = ctx.measureText(cp.text).width;
                                        if (x >= textX && x <= textX + textWidth &&
                                            y >= textY - FONT_SIZE * 0.8 && y <= textY + FONT_SIZE * 0.2) {
                                            linkFound = cp.link;
                                        }
                                    }
                                    textX += ctx.measureText(cp.text).width;
                                });
                                ctx.restore();
                                startX += w;
                            });
                            startY += rowHeight;
                        };
                        
                        checkRow(part.headers);
                        if (!linkFound) {
                            for (const r of part.rows) {
                                checkRow(r);
                                if (linkFound) break;
                            }
                        }
                        
                        if (linkFound) return linkFound;
                        
                        currentX += tableWidth + FONT_SIZE;
                        currentLineHeight = Math.max(currentLineHeight, tableHeight + FONT_SIZE);
                        continue;
                    }
                    
                    if (part.link) {
                        const textWidth = ctx.measureText(part.text).width;
                        if (x >= currentX && x <= currentX + textWidth && 
                            y >= currentY - FONT_SIZE * 0.2 && y <= currentY + FONT_SIZE * 0.8) {
                            return part.link;
                        }
                    }
                    if (part.heading) {
                        const headingSizes = [32, 26, 22, 18, 16, 14];
                        const headingSize = headingSizes[part.heading - 1] || 12;
                        ctx.font = `700 ${headingSize}px sans-serif`;
                        currentLineHeight = Math.max(currentLineHeight, headingSize * 1.5 + 10);
                    } else {
                        let fontWeight = part.bold ? '700' : '500';
                        let fontStyle = part.italic ? 'italic ' : '';
                        ctx.font = `${fontStyle}${fontWeight} ${FONT_SIZE}px sans-serif`;
                    }
                    
                    currentX += ctx.measureText(part.text).width;
                }
                
                return null;
            };

            const renderMarkdownText = (ctx, text, x, y) => {
                const parts = getWrappedParts(ctx, text);
                let currentX = x;
                let currentY = y + FONT_SIZE * 0.8;
                const lineHeight = FONT_SIZE * 1.4;
                let currentLineHeight = lineHeight;
                
                parts.forEach(part => {
                    if (part.text === '\n') {
                        currentY += currentLineHeight;
                        currentX = x;
                        currentLineHeight = lineHeight;
                        return;
                    }
                    
                    if (part.table) {
                        if (currentX === x && currentY > y + FONT_SIZE) {
                            currentY += FONT_SIZE * 0.8;
                        }
                        ctx.save();
                        const colWidths = [];
                        const measureCells = (cells) => {
                            cells.forEach((cellParts, colIndex) => {
                                let cellW = 0;
                                cellParts.forEach(cp => {
                                    if (cp.heading) ctx.font = `700 ${[24,20,18,16,14,12][cp.heading-1]||12}px sans-serif`;
                                    else ctx.font = `${cp.italic?'italic ':''}${cp.bold?'700':'500'} ${FONT_SIZE}px sans-serif`;
                                    cellW += ctx.measureText(cp.text).width;
                                });
                                colWidths[colIndex] = Math.max(colWidths[colIndex] || 0, cellW + 16);
                            });
                        };
                        measureCells(part.headers);
                        part.rows.forEach(r => measureCells(r));
                        const tableWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colWidths.length + 1) * 1;
                        const tableHeight = (1 + part.rows.length) * (lineHeight + 16);
                        
                        ctx.strokeStyle = getCachedVar('--node-border') || '#d1d5db';
                        ctx.lineWidth = 1;
                        
                        let startY = currentY - lineHeight * 0.8;
                        ctx.strokeRect(currentX, startY, tableWidth, tableHeight);
                        
                        let rowHeight = lineHeight + 16;
                        
                        const drawRow = (cells, isHeader) => {
                            let startX = currentX;
                            if (isHeader) {
                                ctx.fillStyle = getCachedVar('--bg-secondary') || '#f3f4f6';
                                ctx.fillRect(startX, startY, tableWidth, rowHeight);
                            }
                            
                            ctx.beginPath();
                            ctx.moveTo(startX, startY + rowHeight);
                            ctx.lineTo(startX + tableWidth, startY + rowHeight);
                            ctx.stroke();
                            
                            cells.forEach((cellParts, colIndex) => {
                                const w = colWidths[colIndex];
                                if (colIndex < colWidths.length - 1) {
                                    ctx.beginPath();
                                    ctx.moveTo(startX + w, startY);
                                    ctx.lineTo(startX + w, startY + rowHeight);
                                    ctx.stroke();
                                }
                                
                                let cellW = 0;
                                ctx.save();
                                cellParts.forEach(cp => {
                                    if (cp.heading) ctx.font = `700 ${[24,20,18,16,14,12][cp.heading-1]||12}px sans-serif`;
                                    else ctx.font = `${cp.italic?'italic ':''}${cp.bold?'700':'500'} ${FONT_SIZE}px sans-serif`;
                                    cellW += ctx.measureText(cp.text).width;
                                });
                                
                                let textX = startX + 8;
                                const align = part.alignments[colIndex] || 'left';
                                if (align === 'center') textX = startX + (w - cellW) / 2;
                                else if (align === 'right') textX = startX + w - cellW - 8;
                                
                                let textY = startY + rowHeight / 2 + FONT_SIZE * 0.3;
                                
                                cellParts.forEach(cp => {
                                    if (cp.heading) ctx.font = `700 ${[24,20,18,16,14,12][cp.heading-1]||12}px sans-serif`;
                                    else ctx.font = `${cp.italic?'italic ':''}${cp.bold?'700':'500'} ${FONT_SIZE}px sans-serif`;
                                    
                                    ctx.fillStyle = getCachedVar('--node-text');
                                    if (cp.code) { ctx.font = `500 ${FONT_SIZE}px monospace`; ctx.fillStyle = '#22c55e'; }
                                    if (cp.link) ctx.fillStyle = getCachedVar('--link');
                                    
                                    if (isHeader && !cp.code && !cp.link && !cp.heading) {
                                        ctx.font = `700 ${FONT_SIZE}px sans-serif`;
                                    }
                                    
                                    ctx.fillText(cp.text, textX, textY);
                                    
                                    if (cp.strikethrough) {
                                        const cpW = ctx.measureText(cp.text).width;
                                        ctx.strokeStyle = '#ef4444';
                                        ctx.lineWidth = 3;
                                        ctx.beginPath();
                                        ctx.moveTo(textX, textY - FONT_SIZE * 0.1);
                                        ctx.lineTo(textX + cpW, textY - FONT_SIZE * 0.1);
                                        ctx.stroke();
                                    }
                                    
                                    textX += ctx.measureText(cp.text).width;
                                });
                                ctx.restore();
                                startX += w;
                            });
                            startY += rowHeight;
                        };
                        
                        drawRow(part.headers, true);
                        part.rows.forEach(r => drawRow(r, false));
                        
                        ctx.restore();
                        
                        currentX += tableWidth + FONT_SIZE;
                        currentLineHeight = Math.max(currentLineHeight, tableHeight + FONT_SIZE);
                        return;
                    }

                    // Handle images
                    if (part.image) {
                        const img = loadImage(part.image);
                        if (img.complete && img.naturalWidth > 0) {
                            const maxWidth = 150;
                            const maxHeight = 100;
                            let { width, height } = img;
                            
                            if (width > maxWidth) {
                                height = (height * maxWidth) / width;
                                width = maxWidth;
                            }
                            if (height > maxHeight) {
                                width = (width * maxHeight) / height;
                                height = maxHeight;
                            }
                            
                            ctx.drawImage(img, currentX, currentY, width, height);
                            currentX += width + 5; // Add small spacing between inline images
                            currentLineHeight = Math.max(currentLineHeight, height + 10); // Adjust line height for images
                        }
                        return;
                    }

                    // Handle mermaid
                    if (part.mermaid) {
                        const m = renderMermaidToImage(part.text);
                        if (m.img) {
                            ctx.drawImage(m.img, currentX, currentY, m.width, m.height);
                            currentX += m.width + 20;
                            currentLineHeight = Math.max(currentLineHeight, m.height + 20);
                        } else if (m.loading) {
                            ctx.fillStyle = '#6b7280';
                            ctx.fillText("Rendering diagram...", currentX, currentY + FONT_SIZE);
                            currentX += 150;
                        } else if (m.error) {
                            ctx.fillStyle = '#ef4444';
                            ctx.fillText("Invalid diagram", currentX, currentY + FONT_SIZE);
                            currentX += 120;
                        }
                        return;
                    }
                    
                    ctx.save();
                    ctx.fillStyle = getCachedVar('--node-text');
                    
                    // Handle headings
                    if (part.heading) {
                        const headingSizes = [32, 26, 22, 18, 16, 14];
                        const headingSize = headingSizes[part.heading - 1] || 12;
                        ctx.font = `700 ${headingSize}px sans-serif`;
                        ctx.fillStyle = getCachedVar('--node-text');
                        currentLineHeight = Math.max(currentLineHeight, headingSize * 1.5 + 10);
                    }

                    // Handle regular formatting
                    else {
                        let fontWeight = '500';
                        let fontStyle = '';
                        
                        if (part.bold && part.italic) {
                            fontWeight = '700';
                            fontStyle = 'italic ';
                        } else if (part.bold) {
                            fontWeight = '700';
                        } else if (part.italic) {
                            fontStyle = 'italic ';
                        }
                        
                        ctx.font = `${fontStyle}${fontWeight} ${FONT_SIZE}px sans-serif`;
                        
                        if (part.code) {
                            ctx.font = `500 ${FONT_SIZE}px monospace`;
                            ctx.fillStyle = '#22c55e';
                        }

                        if (part.link) {
                            ctx.fillStyle = getCachedVar('--link');
                        }
                        if (part.blockquote) {
                            if (part.alertType === 'NOTE') ctx.fillStyle = '#3b82f6';
                            else if (part.alertType === 'TIP') ctx.fillStyle = '#22c55e';
                            else if (part.alertType === 'IMPORTANT') ctx.fillStyle = '#8b5cf6';
                            else if (part.alertType === 'WARNING') ctx.fillStyle = '#eab308';
                            else if (part.alertType === 'CAUTION') ctx.fillStyle = '#ef4444';
                            else ctx.fillStyle = '#ec4899';
                        }
                        if (part.hr) {
                            ctx.fillStyle = '#cccccc';
                        }
                    }
                    
                    ctx.fillText(part.text, currentX, currentY);
                    
                    // Handle strikethrough
                    if (part.strikethrough) {
                        const width = ctx.measureText(part.text).width;
                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(currentX, currentY - FONT_SIZE * 0.1);
                        ctx.lineTo(currentX + width, currentY - FONT_SIZE * 0.1);
                        ctx.stroke();
                    }
                    
                    if (part.link) {
                        const width = ctx.measureText(part.text).width;
                        const underlineY = currentY + FONT_SIZE * 0.55;
                        ctx.strokeStyle = getCachedVar('--link');
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(currentX, underlineY);
                        ctx.lineTo(currentX + width, underlineY);
                        ctx.stroke();
                    }
                    
                    currentX += ctx.measureText(part.text).width;
                    ctx.restore();
                });
            };

            const measureMarkdownText = (ctx, text) => {
                const parts = getWrappedParts(ctx, text);
                let maxWidth = 0;
                let totalHeight = 0;
                let currentLineWidth = 0;
                let currentLineHeight = FONT_SIZE * 1.4;
                const lineHeight = FONT_SIZE * 1.4;
                let currentLineMaxY = FONT_SIZE * 1.3;
                
                parts.forEach(part => {
                    if (part.text === '\n') {
                        maxWidth = Math.max(maxWidth, currentLineWidth);
                        currentLineWidth = 0;
                        totalHeight += currentLineHeight;
                        currentLineHeight = lineHeight;
                        currentLineMaxY = FONT_SIZE * 1.3;
                        return;
                    }
                    
                    if (part.table) {
                        if (currentLineWidth === 0 && totalHeight > 0) {
                            totalHeight += FONT_SIZE * 0.8;
                        }
                        ctx.save();
                        const colWidths = [];
                        const measureCells = (cells) => {
                            cells.forEach((cellParts, colIndex) => {
                                let cellW = 0;
                                cellParts.forEach(cp => {
                                    if (cp.heading) ctx.font = `700 ${[24,20,18,16,14,12][cp.heading-1]||12}px sans-serif`;
                                    else ctx.font = `${cp.italic?'italic ':''}${cp.bold?'700':'500'} ${FONT_SIZE}px sans-serif`;
                                    cellW += ctx.measureText(cp.text).width;
                                });
                                colWidths[colIndex] = Math.max(colWidths[colIndex] || 0, cellW + 16); // 16px padding
                            });
                        };
                        measureCells(part.headers);
                        part.rows.forEach(r => measureCells(r));
                        ctx.restore();
                        
                        const tableWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colWidths.length + 1) * 1; // Borders
                        const tableHeight = (1 + part.rows.length) * (lineHeight + 16); // Headers + rows
                        
                        part.colWidths = colWidths;
                        part.tableWidth = tableWidth;
                        part.tableHeight = tableHeight;
                        
                        maxWidth = Math.max(maxWidth, currentLineWidth + tableWidth);
                        currentLineWidth += tableWidth;
                        currentLineHeight = Math.max(currentLineHeight, tableHeight + FONT_SIZE);
                        currentLineMaxY = Math.max(currentLineMaxY, tableHeight - FONT_SIZE * 0.32);
                        return;
                    }

                    // Handle images
                    if (part.image) {
                        const sz = getRenderedImageSize(part.image);
                        currentLineWidth += sz.width + 5;
                        currentLineHeight = Math.max(currentLineHeight, sz.height + 10);
                        currentLineMaxY = Math.max(currentLineMaxY, FONT_SIZE * 0.8 + sz.height);
                        return;
                    }

                    if (part.mermaid) {
                        const m = renderMermaidToImage(part.text);
                        const w = m.img ? m.width : 300;
                        const h = m.img ? m.height : 200;
                        currentLineWidth += w + 20;
                        currentLineHeight = Math.max(currentLineHeight, h + 20);
                        currentLineMaxY = Math.max(currentLineMaxY, FONT_SIZE * 0.8 + h);
                        return;
                    }
                    
                    ctx.save();
                    
                    // Handle headings
                    if (part.heading) {
                        const headingSizes = [32, 26, 22, 18, 16, 14];
                        const headingSize = headingSizes[part.heading - 1] || 12;
                        ctx.font = `700 ${headingSize}px sans-serif`;
                        currentLineHeight = Math.max(currentLineHeight, headingSize * 1.5 + 10);
                        currentLineMaxY = Math.max(currentLineMaxY, FONT_SIZE * 0.8 + headingSize / 2);
                    }

                    // Handle regular formatting
                    else {
                        let fontWeight = '500';
                        let fontStyle = '';
                        
                        if (part.bold && part.italic) {
                            fontWeight = '700';
                            fontStyle = 'italic ';
                        } else if (part.bold) {
                            fontWeight = '700';
                        } else if (part.italic) {
                            fontStyle = 'italic ';
                        }
                        
                        if (part.code) {
                            ctx.font = `500 ${FONT_SIZE}px monospace`;
                        } else {
                            ctx.font = `${fontStyle}${fontWeight} ${FONT_SIZE}px sans-serif`;
                        }
                    }
                    
                    currentLineWidth += ctx.measureText(part.text).width;
                    ctx.restore();
                });
                
                maxWidth = Math.max(maxWidth, currentLineWidth, 80);
                totalHeight = totalHeight + currentLineMaxY;
                
                return { width: maxWidth, height: totalHeight };
            };

            const createTextPart = (text, styles = {}) => ({
                text,
                bold: false,
                italic: false,
                code: false,
                codeBlock: false,
                strikethrough: false,
                blockquote: false,
                ...styles
            });

            const appendInlinePart = (parts, text, styles = {}) => {
                if (!text) return;

                const part = createTextPart(text, styles);
                const previous = parts[parts.length - 1];
                const comparableKeys = ['bold', 'italic', 'code', 'codeBlock', 'strikethrough', 'blockquote', 'heading', 'link', 'list'];
                const canMerge = previous
                    && !previous.image
                    && comparableKeys.every(key => previous[key] === part[key]);

                if (canMerge) {
                    previous.text += text;
                } else {
                    parts.push(part);
                }
            };

            const parseInlineMarkdown = (text, baseStyles = {}) => {
                const parts = [];
                const styles = {
                    bold: Boolean(baseStyles.bold),
                    italic: Boolean(baseStyles.italic),
                    strikethrough: Boolean(baseStyles.strikethrough)
                };
                let plainText = '';
                let index = 0;

                const currentStyles = (extra = {}) => ({ ...baseStyles, ...styles, ...extra });
                const flushPlainText = () => {
                    appendInlinePart(parts, plainText, currentStyles());
                    plainText = '';
                };
                const hasClosingMarker = (marker, start) => text.indexOf(marker, start + marker.length) !== -1;

                while (index < text.length) {
                    if (text[index] === '\\' && index + 1 < text.length) {
                        plainText += text[index + 1];
                        index += 2;
                        continue;
                    }

                    if (text.startsWith('![', index)) {
                        const labelEnd = text.indexOf('](', index + 2);
                        const urlEnd = labelEnd === -1 ? -1 : text.indexOf(')', labelEnd + 2);
                        if (labelEnd !== -1 && urlEnd !== -1) {
                            flushPlainText();
                            parts.push({
                                ...createTextPart('', currentStyles()),
                                image: text.slice(labelEnd + 2, urlEnd),
                                alt: text.slice(index + 2, labelEnd)
                            });
                            index = urlEnd + 1;
                            continue;
                        }
                    }

                    if (text[index] === '[') {
                        const labelEnd = text.indexOf('](', index + 1);
                        const urlEnd = labelEnd === -1 ? -1 : text.indexOf(')', labelEnd + 2);
                        if (labelEnd !== -1 && urlEnd !== -1) {
                            flushPlainText();
                            appendInlinePart(
                                parts,
                                text.slice(index + 1, labelEnd),
                                currentStyles({ link: text.slice(labelEnd + 2, urlEnd) })
                            );
                            index = urlEnd + 1;
                            continue;
                        }
                    }

                    if (text[index] === '`') {
                        const closingIndex = text.indexOf('`', index + 1);
                        if (closingIndex !== -1) {
                            flushPlainText();
                            appendInlinePart(parts, text.slice(index + 1, closingIndex), currentStyles({ code: true }));
                            index = closingIndex + 1;
                            continue;
                        }
                    }

                    const markerRules = [
                        { marker: '***', active: () => styles.bold && styles.italic, toggle: () => { styles.bold = !styles.bold; styles.italic = !styles.italic; } },
                        { marker: '___', active: () => styles.bold && styles.italic, toggle: () => { styles.bold = !styles.bold; styles.italic = !styles.italic; } },
                        { marker: '**', active: () => styles.bold, toggle: () => { styles.bold = !styles.bold; } },
                        { marker: '__', active: () => styles.bold, toggle: () => { styles.bold = !styles.bold; } },
                        { marker: '~~', active: () => styles.strikethrough, toggle: () => { styles.strikethrough = !styles.strikethrough; } },
                        { marker: '*', active: () => styles.italic, toggle: () => { styles.italic = !styles.italic; } },
                        { marker: '_', active: () => styles.italic, toggle: () => { styles.italic = !styles.italic; } }
                    ];

                    const rule = markerRules.find(({ marker, active }) =>
                        text.startsWith(marker, index) && (active() || hasClosingMarker(marker, index))
                    );

                    if (rule) {
                        flushPlainText();
                        rule.toggle();
                        index += rule.marker.length;
                        continue;
                    }

                    plainText += text[index];
                    index++;
                }

                flushPlainText();
                return parts.length ? parts : [createTextPart(text, baseStyles)];
            };

            const parseMarkdown = (text) => {
                const source = typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
                const lines = source.split('\n');
                const parts = [];
                let inCodeBlock = false;
                let hasRenderedLine = false;

                const startLine = () => {
                    if (hasRenderedLine) parts.push(createTextPart('\n'));
                    hasRenderedLine = true;
                };

                const isTableSeparator = (str) => /^\|?\s*(?:-+|:-+|-+:|:-+:)(?:\s*\|\s*(?:-+|:-+|-+:|:-+:))+\s*\|?$/.test(str.trim());
                let inTable = false;
                let tableHeaders = [];
                let tableAlignments = [];
                let tableRows = [];

                const flushTable = () => {
                    if (inTable && tableHeaders.length > 0) {
                        parts.push({ table: true, headers: tableHeaders, alignments: tableAlignments, rows: tableRows });
                    }
                    inTable = false;
                    tableHeaders = [];
                    tableAlignments = [];
                    tableRows = [];
                };

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (inCodeBlock) {
                        if (/^\s*```\s*$/.test(line)) {
                            inCodeBlock = false;
                            continue;
                        }

                        startLine();
                        parts.push(createTextPart(line, { code: true, codeBlock: true }));
                        continue;
                    }

                    if (/^\s*```mermaid\s*$/.test(line)) {
                        flushTable();
                        let mermaidCode = '';
                        i++;
                        while(i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
                            mermaidCode += lines[i] + '\n';
                            i++;
                        }
                        startLine();
                        parts.push({ mermaid: true, text: mermaidCode.trim() });
                        continue;
                    }

                    if (/^\s*```[^`]*$/.test(line)) {
                        inCodeBlock = true;
                        flushTable();
                        continue;
                    }

                    if (!inTable && line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
                        startLine();
                        inTable = true;
                        const parseCells = (row) => row.split('|').map(s => s.trim()).filter((s, idx, arr) => !(s === '' && (idx === 0 || idx === arr.length - 1))).map(s => parseInlineMarkdown(s));
                        tableHeaders = parseCells(line);
                        
                        const seps = lines[i + 1].split('|').map(s => s.trim()).filter((s, idx, arr) => !(s === '' && (idx === 0 || idx === arr.length - 1)));
                        tableAlignments = seps.map(s => {
                            if (s.startsWith(':') && s.endsWith(':')) return 'center';
                            if (s.endsWith(':')) return 'right';
                            return 'left';
                        });
                        
                        i++; // skip separator
                        continue;
                    }

                    if (inTable) {
                        if (!line.includes('|')) {
                            flushTable();
                        } else {
                            const parseCells = (row) => row.split('|').map(s => s.trim()).filter((s, idx, arr) => !(s === '' && (idx === 0 || idx === arr.length - 1))).map(s => parseInlineMarkdown(s));
                            tableRows.push(parseCells(line));
                            continue;
                        }
                    }

                    startLine();

                    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
                    if (headingMatch) {
                        parts.push(...parseInlineMarkdown(headingMatch[2], { heading: headingMatch[1].length }));
                        continue;
                    }

                    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
                        parts.push(createTextPart('───────────────', { hr: true }));
                        continue;
                    }

                    const blockquoteMatch = line.match(/^(\s*)(>+)\s?(.*)$/);
                    if (blockquoteMatch) {
                        const level = blockquoteMatch[2].length;
                        const quoteText = blockquoteMatch[3];
                        const alertMatch = quoteText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i);
                        
                        if (alertMatch) {
                            const alertType = alertMatch[1].toUpperCase();
                            const icon = { NOTE: 'ℹ️', TIP: '💡', IMPORTANT: '🔥', WARNING: '⚠️', CAUTION: '🛑' }[alertType];
                            appendInlinePart(parts, `${blockquoteMatch[1]}${'  '.repeat(level - 1)}`, { blockquote: level, alertType });
                            parts.push(...parseInlineMarkdown(`${icon} ${alertType}`, { blockquote: level, alertType, bold: true }));
                        } else {
                            const isAlertText = parts.length > 0 && parts[parts.length - 1].alertType;
                            if (isAlertText) {
                                appendInlinePart(parts, `${blockquoteMatch[1]}${'  '.repeat(level - 1)}  `, { blockquote: level, alertType: parts[parts.length - 1].alertType });
                                parts.push(...parseInlineMarkdown(quoteText, { blockquote: level, alertType: parts[parts.length - 1].alertType }));
                            } else {
                                appendInlinePart(parts, `${blockquoteMatch[1]}${'  '.repeat(level - 1)}▎ `, { blockquote: level });
                                parts.push(...parseInlineMarkdown(quoteText, { blockquote: level }));
                            }
                        }
                        continue;
                    }

                    const unorderedListMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
                    if (unorderedListMatch) {
                        const indentStr = unorderedListMatch[1];
                        const indentLevel = Math.floor(indentStr.length / 2);
                        const bullets = ['•', '○', '■', '□'];
                        const bullet = bullets[indentLevel % bullets.length];
                        
                        const text = unorderedListMatch[2];
                        const taskMatch = text.match(/^\[([ xX])\]\s+(.*)$/);
                        if (taskMatch) {
                            const checked = taskMatch[1].toLowerCase() === 'x';
                            appendInlinePart(parts, `${indentStr}${checked ? '☑' : '☐'} `, { list: true, taskList: true, checked });
                            parts.push(...parseInlineMarkdown(taskMatch[2], { list: true }));
                        } else {
                            appendInlinePart(parts, `${indentStr}${bullet} `, { list: true });
                            parts.push(...parseInlineMarkdown(text, { list: true }));
                        }
                        continue;
                    }

                    const orderedListMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
                    if (orderedListMatch) {
                        appendInlinePart(parts, `${orderedListMatch[1]}${orderedListMatch[2]}. `, { list: true });
                        parts.push(...parseInlineMarkdown(orderedListMatch[3], { list: true }));
                        continue;
                    }

                    parts.push(...parseInlineMarkdown(line));
                }
                flushTable();

                return parts.length ? parts : [createTextPart('')];
            };

            const getWrappedParts = (ctx, text, maxWidth = 350) => {
                const parts = parseMarkdown(text);
                const wrappedParts = [];
                let currentLineWidth = 0;
                
                parts.forEach(part => {
                    if (part.text === '\n') {
                        currentLineWidth = 0;
                        wrappedParts.push(part);
                        return;
                    }
                    if (part.table || part.mermaid || part.image || part.heading) {
                        wrappedParts.push(part);
                        if (part.image) currentLineWidth += getRenderedImageSize(part.image).width + 5;
                        else currentLineWidth = 0;
                        return;
                    }
                    
                    let fontWeight = '500';
                    let fontStyle = '';
                    if (part.bold && part.italic) { fontWeight = '700'; fontStyle = 'italic '; }
                    else if (part.bold) fontWeight = '700';
                    else if (part.italic) fontStyle = 'italic ';
                    
                    if (part.code) ctx.font = `500 ${FONT_SIZE}px monospace`;
                    else ctx.font = `${fontStyle}${fontWeight} ${FONT_SIZE}px sans-serif`;
                    
                    const words = part.text.split(/(\s+)/);
                    let newText = '';
                    
                    for (let word of words) {
                        const wordWidth = ctx.measureText(word).width;
                        if (currentLineWidth + wordWidth > maxWidth && currentLineWidth > 0 && !word.match(/^\s+$/)) {
                            if (newText) {
                                wrappedParts.push({ ...part, text: newText });
                                newText = '';
                            }
                            wrappedParts.push(createTextPart('\n'));
                            currentLineWidth = 0;
                            if (word.match(/^\s+$/)) continue; 
                        }
                        newText += word;
                        currentLineWidth += wordWidth;
                    }
                    if (newText) {
                        wrappedParts.push({ ...part, text: newText });
                    }
                });
                return wrappedParts;
            };


            // --- Actions ---
            const zoom = (factor, pivot = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }) => {
                const newZoom = Math.max(0.1, Math.min(15, state.zoom * factor));
                const worldPos = screenToWorld(pivot.x, pivot.y);
                
                state.pan.x = pivot.x - worldPos.x * newZoom;
                state.pan.y = pivot.y - worldPos.y * newZoom;
                state.zoom = newZoom;
                
                dom.zoomIndicator.textContent = `${Math.round(state.zoom * 100)}%`;
                saveToLocalStorage();
                requestRedraw();
            };

            const fitView = () => {
                if (state.nodes.length === 0) return;

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                state.nodes.forEach(n => {
                    minX = Math.min(minX, n.x);
                    minY = Math.min(minY, n.y);
                    maxX = Math.max(maxX, n.x + n.width);
                    maxY = Math.max(maxY, n.y + n.height);
                });

                const padding = 50;
                const contentWidth = maxX - minX;
                const contentHeight = maxY - minY;
                
                const scaleX = (canvas.clientWidth - padding * 2) / contentWidth;
                const scaleY = (canvas.clientHeight - padding * 2) / contentHeight;
                state.zoom = Math.min(scaleX, scaleY, 1);

                const centerX = minX + contentWidth / 2;
                const centerY = minY + contentHeight / 2;

                state.pan.x = canvas.clientWidth / 2 - centerX * state.zoom;
                state.pan.y = canvas.clientHeight / 2 - centerY * state.zoom;
                
                dom.zoomIndicator.textContent = `${Math.round(state.zoom * 100)}%`;
                saveToLocalStorage();
                requestRedraw();
            };

            // --- Helpers ---
            const getMousePos = (e) => {
                const rect = canvas.getBoundingClientRect();
                return { x: e.clientX - rect.left, y: e.clientY - rect.top };
            };
            const screenToWorld = (x, y) => ({ x: (x - state.pan.x) / state.zoom, y: (y - state.pan.y) / state.zoom });
            const worldToScreen = (x, y) => ({ x: x * state.zoom + state.pan.x, y: y * state.zoom + state.pan.y });
            const findNodeById = (id) => state.nodes.find(n => n.id === id);
            const findNodeAt = (x, y) => {
                const worldPos = screenToWorld(x, y);
                return state.nodes.slice().reverse().find(n => 
                    worldPos.x >= n.x && worldPos.x <= n.x + n.width &&
                    worldPos.y >= n.y && worldPos.y <= n.y + n.height
                )?.id || null;
            };
            const getCssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            
            const fillRoundedRect = (c, x, y, w, h, r) => {
                c.beginPath(); c.moveTo(x+r, y); c.arcTo(x+w, y, x+w, y+h, r); c.arcTo(x+w, y+h, x, y+h, r); c.arcTo(x, y+h, x, y, r); c.arcTo(x, y, x+w, y, r); c.closePath(); c.fill();
            };
            const strokeRoundedRect = (c, x, y, w, h, r) => {
                c.beginPath(); c.moveTo(x+r, y); c.arcTo(x+w, y, x+w, y+h, r); c.arcTo(x+w, y+h, x, y+h, r); c.arcTo(x, y+h, x, y, r); c.arcTo(x, y, x+w, y, r); c.closePath(); c.stroke();
            };

            // --- Initialization ---
            const init = () => {
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
                            // Default to Dark Mode on first visit; only use Light Mode if explicitly saved.
                            const savedTheme = localStorage.getItem('mindmap-theme');
                            if (savedTheme === 'light') {
                                document.documentElement.classList.remove('dark');
                                state.isDark = false;
                            } else {
                                document.documentElement.classList.add('dark');
                                state.isDark = true;
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
                    // Load theme from localStorage
                    const savedTheme = localStorage.getItem('mindmap-theme');
                    if (savedTheme === 'dark') {
                        document.documentElement.classList.add('dark');
                    } else {
                        document.documentElement.classList.remove('dark');
                    }
                    const isDark = document.documentElement.classList.contains('dark');
                    dom.themeToggle.classList.toggle('is-active', isDark);
                    
                    const savedGrid = localStorage.getItem('mindmap-grid');
                    if (savedGrid) state.showGrid = savedGrid === 'on';
                    // Update UI to reflect loaded state
                    dom.zoomIndicator.textContent = `${Math.round(state.zoom * 100)}%`;
                    syncToggleControls();
                    refreshCssVars();
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
                if (window.mermaid) {
                    mermaid.initialize({
                        startOnLoad: false,
                        theme: state.isDark ? 'dark' : 'default',
                        themeVariables: state.isDark ? {
                            darkMode: true,
                            primaryTextColor: '#f3f4f6',
                            textColor: '#f3f4f6',
                            lineColor: '#d1d5db',
                            arrowheadColor: '#d1d5db',
                            edgeLabelBackground: '#1f2937',
                            mainBkg: '#1f2937',
                            nodeBorder: '#6b7280'
                        } : {}
                    });
                }
            };

            init();

        const layoutNodeTree = (nodes, startX = 100, startY = 100) => {
            if (!nodes || nodes.length === 0) return;
            const nodeIds = new Set(nodes.map(n => n.id));
            const roots = nodes.filter(n => !n.parentId || !nodeIds.has(n.parentId));
            if (roots.length === 0) return;

            const childrenMap = new Map();
            nodes.forEach(n => childrenMap.set(n.id, []));
            nodes.forEach(n => {
                if (n.parentId && childrenMap.has(n.parentId)) {
                    childrenMap.get(n.parentId).push(n);
                }
            });

            const getSize = (n) => ({ w: n.width || 200, h: n.height || 100 });
            const H_GAP = 24;
            const V_GAP = 48;

            // Compute max node height per depth level so rows align cleanly without overlap
            const levelHeights = new Map();
            const measureLevels = (id, depth, seen = new Set()) => {
                if (seen.has(id)) return;
                seen.add(id);
                const n = nodes.find(x => x.id === id);
                if (!n) return;
                const { h } = getSize(n);
                levelHeights.set(depth, Math.max(levelHeights.get(depth) || 0, h));
                (childrenMap.get(id) || []).forEach(c => measureLevels(c.id, depth + 1, seen));
            };
            roots.forEach(r => measureLevels(r.id, 0));

            const levelY = new Map();
            let accY = startY;
            const maxDepth = Math.max(0, ...levelHeights.keys());
            for (let d = 0; d <= maxDepth; d++) {
                levelY.set(d, accY);
                accY += (levelHeights.get(d) || 100) + V_GAP;
            }

            // Contour-packed Top-to-Bottom layout (Reingold-Tilford style)
            // Returns { relX: Map<id, x>, leftContour: number[], rightContour: number[] }
            const buildSubtree = (id, seen = new Set()) => {
                if (seen.has(id)) return { relX: new Map(), left: [], right: [] };
                seen.add(id);
                const n = nodes.find(x => x.id === id);
                const { w } = getSize(n);
                const ch = (childrenMap.get(id) || []).filter(c => !seen.has(c.id));

                if (ch.length === 0) {
                    const relX = new Map([[id, 0]]);
                    return { relX, left: [0], right: [w] };
                }

                const childTrees = ch.map(c => buildSubtree(c.id, new Set(seen)));
                const offsets = [0];
                let mergedRight = [...childTrees[0].right];
                let mergedLeft = [...childTrees[0].left];

                for (let i = 1; i < childTrees.length; i++) {
                    const ct = childTrees[i];
                    const sharedDepths = Math.min(mergedRight.length, ct.left.length);
                    let shift = 0;
                    for (let d = 0; d < sharedDepths; d++) {
                        shift = Math.max(shift, mergedRight[d] + H_GAP - ct.left[d]);
                    }
                    offsets.push(shift);
                    for (let d = 0; d < ct.right.length; d++) {
                        const rVal = ct.right[d] + shift;
                        const lVal = ct.left[d] + shift;
                        if (d < mergedRight.length) {
                            mergedRight[d] = Math.max(mergedRight[d], rVal);
                            mergedLeft[d] = Math.min(mergedLeft[d], lVal);
                        } else {
                            mergedRight.push(rVal);
                            mergedLeft.push(lVal);
                        }
                    }
                }

                const relX = new Map();
                childTrees.forEach((ct, i) => {
                    const off = offsets[i];
                    ct.relX.forEach((x, cid) => relX.set(cid, x + off));
                });

                const firstChildX = relX.get(ch[0].id);
                const lastChildX = relX.get(ch[ch.length - 1].id);
                const lastChildW = getSize(ch[ch.length - 1]).w;
                const parentX = (firstChildX + lastChildX + lastChildW) / 2 - w / 2;
                relX.set(id, parentX);

                return {
                    relX,
                    left: [parentX, ...mergedLeft],
                    right: [parentX + w, ...mergedRight]
                };
            };

            const assignPositions = (id, depth, offsetX, relX, seen = new Set()) => {
                if (seen.has(id)) return;
                seen.add(id);
                const n = nodes.find(x => x.id === id);
                if (!n) return;
                n.x = offsetX + (relX.get(id) || 0);
                n.y = levelY.get(depth) ?? startY;
                (childrenMap.get(id) || []).forEach(c => assignPositions(c.id, depth + 1, offsetX, relX, seen));
            };

            let curRootX = startX;
            roots.forEach(r => {
                const tree = buildSubtree(r.id);
                const minLeft = Math.min(...tree.left);
                const maxRight = Math.max(...tree.right);
                const shiftX = curRootX - minLeft;
                assignPositions(r.id, 0, shiftX, tree.relX);
                curRootX += (maxRight - minLeft) + H_GAP * 2;
            });
        };

        const autoArrangeTree = () => {
            if (state.nodes.length === 0) return;
            layoutNodeTree(state.nodes, 100, 100);
            saveState();
            fitView();
            showNotification('Auto-Arranged', `Vertical tree layout (${dom.zoomIndicator.textContent})`, 'success');
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
            requestRedraw();
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
