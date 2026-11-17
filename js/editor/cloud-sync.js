/**
 * 7System - Cloud Mind Map Sync & Authentication Module
 * Manages Firebase authentication session UI, cloud save/load modals,
 * project listing, renaming, deletion, and auto-load from session.
 */

import { showNotification } from '../shared/notifications.js';

export function initCloudSync({ state, dom, showConfirm, applyProjectData, saveState, requestRedraw }) {
    let sessionAuth = null;
    let lastCloudMapName = '';

    const updateAuthUI = () => {
        const cloudSave = document.getElementById('cloudSaveBtn') || (dom && dom.cloudSaveBtn);
        const cloudLoad = document.getElementById('cloudLoadBtn') || (dom && dom.cloudLoadBtn);
        const logout = document.getElementById('logoutBtn') || (dom && dom.logoutBtn);
        const portal = document.getElementById('portalBtn');
        const account = document.getElementById('accountBtn') || (dom && dom.accountBtn);

        if (sessionAuth) {
            if (cloudSave) cloudSave.classList.remove('hidden');
            if (cloudLoad) cloudLoad.classList.remove('hidden');
            if (logout) logout.classList.remove('hidden');
            if (portal) portal.classList.remove('hidden');
            if (account) account.classList.add('hidden');
        } else {
            if (cloudSave) cloudSave.classList.add('hidden');
            if (cloudLoad) cloudLoad.classList.add('hidden');
            if (logout) logout.classList.add('hidden');
            if (portal) portal.classList.add('hidden');
            if (account) account.classList.remove('hidden');
        }
    };

    // Restore cached session if available
    try {
        const savedAuth = localStorage.getItem('7systemSessionAuth');
        if (savedAuth) {
            const parsed = JSON.parse(savedAuth);
            sessionAuth = { username: parsed.username };
        }
    } catch (e) {
        sessionAuth = null;
    }
    updateAuthUI();

    // Wait for Firebase to initialize (loaded by api.js)
    let authRetries = 0;
    const waitForAuth = setInterval(() => {
        if (typeof window !== 'undefined' && window.firebaseAuth) {
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

    const showAccountModal = () => {
        const modal = document.getElementById('accountModal');
        if (!modal) return;
        modal.classList.remove('hidden');
        const usernameInput = document.getElementById('accountUsernameInput');
        const passwordInput = document.getElementById('accountPasswordInput');
        if (passwordInput) passwordInput.value = '';

        const statusEl = document.getElementById('accountStatus');
        if (sessionAuth) {
            if (usernameInput) usernameInput.value = sessionAuth.username;
            if (statusEl) {
                statusEl.textContent = `Logged in as: ${sessionAuth.username}`;
                statusEl.className = 'text-sm text-green-500 p-2 bg-green-500/10 rounded';
                statusEl.classList.remove('hidden');
            }
        } else {
            if (statusEl) statusEl.classList.add('hidden');
        }
        if (usernameInput) usernameInput.focus();
    };

    const hideAccountModal = () => {
        const modal = document.getElementById('accountModal');
        if (!modal) return;
        modal.classList.add('hidden');
        const usernameInput = document.getElementById('accountUsernameInput');
        const passwordInput = document.getElementById('accountPasswordInput');
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
        const statusEl = document.getElementById('accountStatus');
        if (statusEl) statusEl.classList.add('hidden');
    };

    const handleAccountLogin = async () => {
        const usernameInput = document.getElementById('accountUsernameInput');
        const passwordInput = document.getElementById('accountPasswordInput');
        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

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
            updateAuthUI();
            hideAccountModal();
            showNotification('Success', result.message, 'success');
        } else {
            showNotification('Error', result.message, 'error');
        }
    };

    const hideCloudModal = () => {
        const modal = document.getElementById('cloudModal');
        if (modal) modal.classList.add('hidden');
        const input = document.getElementById('mindmapNameInput');
        if (input) input.value = '';
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
            // Strip the internal _cachedText field from cloud saves
            nodes: state.nodes.map(({ _cachedText, ...rest }) => rest),
            metadata: {
                nextNodeId: state.nextNodeId,
                selectedNodeId: state.selectedNodeId,
                version: '1.0'
            }
        };

        const btn = document.getElementById('modalConfirm');
        const originalText = btn ? btn.textContent : 'Save';
        if (btn) {
            btn.textContent = 'Saving...';
            btn.disabled = true;
        }

        if (!window.firebaseUtils) {
            showNotification('Error', 'Service unavailable', 'error');
            if (btn) {
                btn.textContent = originalText;
                btn.disabled = false;
            }
            return;
        }

        const result = await window.firebaseUtils.saveMindMap(sessionAuth.username, null, mapName, dataPayload);
        if (btn) {
            btn.textContent = originalText;
            btn.disabled = false;
        }

        if (result.success) {
            lastCloudMapName = mapName;
            showNotification('Success', result.message, 'success');
            hideCloudModal();
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

        const titleEl = document.getElementById('modalTitle');
        const nameInput = document.getElementById('mindmapNameInput');
        const confirmBtn = document.getElementById('modalConfirm');
        const cloudModal = document.getElementById('cloudModal');

        if (titleEl) titleEl.textContent = 'Save to Cloud';
        if (nameInput) nameInput.value = lastCloudMapName;
        if (confirmBtn) confirmBtn.textContent = 'Save';
        if (cloudModal) cloudModal.classList.remove('hidden');
        if (nameInput) nameInput.focus();

        const listContainer = document.getElementById('cloudModalExistingListContainer');
        const listEl = document.getElementById('cloudModalExistingList');
        if (listContainer) listContainer.classList.add('hidden');

        if (!window.firebaseUtils) {
            showNotification('Error', 'Service unavailable', 'error');
            return;
        }
        const result = await window.firebaseUtils.getMindMapsList(sessionAuth.username, null);
        const existingMindMaps = result.success ? result.mindmaps : [];

        if (existingMindMaps.length > 0 && listContainer && listEl) {
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
                        if (nameInput) nameInput.value = m.name;
                        if (confirmBtn) confirmBtn.click();
                    };
                    listEl.appendChild(item);
                });
            };

            renderList(nameInput ? nameInput.value.trim() : '');

            if (nameInput) {
                const newListener = (e) => renderList(e.target.value.trim());
                if (nameInput._inputListener) nameInput.removeEventListener('input', nameInput._inputListener);
                nameInput.addEventListener('input', newListener);
                nameInput._inputListener = newListener;
            }
        }

        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                const mindmapName = nameInput ? nameInput.value.trim() : '';
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
                    if (cloudModal) cloudModal.classList.add('hidden');
                    const confirmed = await showConfirm(
                        'A project with this name already exists. Do you want to overwrite the existing one?',
                        'Override Existing?',
                        'Yes',
                        'No'
                    );
                    if (confirmed) {
                        performCloudSave(mindmapName, true);
                    } else if (cloudModal) {
                        cloudModal.classList.remove('hidden');
                    }
                } else {
                    performCloudSave(mindmapName, false);
                }
            };
        }
    };

    const showProjectListModal = (mindmaps) => {
        const content = document.getElementById('projectListContent');
        const modal = document.getElementById('projectListModal');
        if (!content || !modal) return;
        content.innerHTML = '';

        if (!Array.isArray(mindmaps) || mindmaps.length === 0) {
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
                        modal.classList.add('hidden');
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

        modal.classList.remove('hidden');
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

    const showCloudLoadModal = () => {
        if (!sessionAuth) {
            showNotification('Error', 'Please login first', 'error');
            showAccountModal();
            return;
        }
        loadProjectList();
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

    const handleLogout = async () => {
        if (window.firebaseAuth) {
            try {
                const { signOut } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js");
                await signOut(window.firebaseAuth);
            } catch (e) {
                console.warn('SignOut error:', e);
            }
        }
        sessionAuth = null;
        localStorage.removeItem('7systemSessionAuth');
        updateAuthUI();
        showNotification('Success', 'Logged out successfully', 'success');
    };

    // Global cloud map loader for openCloudMap
    if (typeof window !== 'undefined') {
        window.openCloudMap = (mapName) => {
            if (sessionAuth) {
                loadFromCloud(sessionAuth.username, null, mapName);
            }
        };
    }

    // Bind modal actions
    const modalCancel = document.getElementById('modalCancel');
    if (modalCancel) modalCancel.addEventListener('click', hideCloudModal);

    const projectListClose = document.getElementById('projectListClose');
    if (projectListClose) {
        projectListClose.addEventListener('click', () => {
            const modal = document.getElementById('projectListModal');
            if (modal) modal.classList.add('hidden');
        });
    }

    const accountCancel = document.getElementById('accountCancel');
    if (accountCancel) accountCancel.addEventListener('click', hideAccountModal);

    const accountLogin = document.getElementById('accountLogin');
    if (accountLogin) accountLogin.addEventListener('click', handleAccountLogin);

    const usernameInput = document.getElementById('accountUsernameInput');
    if (usernameInput) {
        usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const pw = document.getElementById('accountPasswordInput');
                if (pw) pw.focus();
            }
            if (e.key === 'Escape') hideAccountModal();
        });
    }

    const passwordInput = document.getElementById('accountPasswordInput');
    if (passwordInput) {
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAccountLogin();
            }
            if (e.key === 'Escape') hideAccountModal();
        });
    }

    const mindmapNameInput = document.getElementById('mindmapNameInput');
    if (mindmapNameInput) {
        mindmapNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const confirmBtn = document.getElementById('modalConfirm');
                if (confirmBtn) confirmBtn.click();
            }
            if (e.key === 'Escape') hideCloudModal();
        });
    }

    return {
        updateAuthUI,
        showAccountModal,
        hideAccountModal,
        handleAccountLogin,
        showCloudSaveModal,
        showCloudLoadModal,
        hideCloudModal,
        handleLogout,
        loadFromCloud,
        getSessionAuth: () => sessionAuth
    };
}
