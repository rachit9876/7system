import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { showNotification } from "./shared/notifications.js";
import { initTheme, toggleTheme, setTheme } from "./shared/theme.js";
import { nodesToMarkdown, markdownToNodes } from "./shared/markdown-tree.js";

// Check Auth
let sessionAuth = null;
try {
    const storedAuth = localStorage.getItem('7systemSessionAuth');
    if (storedAuth) {
        sessionAuth = { username: JSON.parse(storedAuth).username };
    }
} catch(e) {}

// Wait for auth before loading mindmaps
const initPortal = () => {
    if (!sessionAuth) {
        window.location.replace('index.html');
        return;
    }
    loadMindMaps();
};

let authRetries = 0;
const waitForAuth = setInterval(() => {
    if (window.firebaseAuth) {
        clearInterval(waitForAuth);
        onAuthStateChanged(window.firebaseAuth, (user) => {
            if (user) {
                sessionAuth = { username: user.email, uid: user.uid };
                initPortal();
            } else {
                window.location.replace('index.html');
            }
        });
    } else if (++authRetries > 200) {
        clearInterval(waitForAuth);
        window.location.replace('index.html');
    }
}, 50);

// Notifications imported from shared module

// Initialize Theme (defaults to Dark Mode)
initTheme();

// State
let mindMaps = [];
let selectedMapNames = new Set();
let renamingMapName = null;
const PAGE_SIZE = 12;
let currentPage = 1;
let searchQuery = '';

// DOM Elements
const mindmapsGrid = document.getElementById('mindmapsGrid');
const mapSearchInput = document.getElementById('mapSearchInput');
const paginationControls = document.getElementById('paginationControls');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInfoText = document.getElementById('pageInfoText');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
const bulkExportBtn = document.getElementById('bulkExportBtn');
const bulkImportInput = document.getElementById('bulkImportInput');

const portalConfirmModal = document.getElementById('portalConfirmModal');
const portalConfirmTitle = document.getElementById('portalConfirmTitle');
const portalConfirmMessage = document.getElementById('portalConfirmMessage');
const portalConfirmCancel = document.getElementById('portalConfirmCancel');
const portalConfirmOk = document.getElementById('portalConfirmOk');

const showPortalConfirm = (message, title = 'Confirm', confirmText = 'Confirm', isDanger = false) => {
    return new Promise((resolve) => {
        portalConfirmTitle.textContent = title;
        portalConfirmMessage.textContent = message;
        portalConfirmOk.textContent = confirmText;
        portalConfirmOk.className = isDanger
            ? 'px-4 py-2 bg-[var(--danger)] text-white rounded-lg hover:bg-[#991b1b] transition-colors'
            : 'px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors';
        portalConfirmModal.classList.remove('hidden');

        const cleanup = () => {
            portalConfirmModal.classList.add('hidden');
            portalConfirmOk.removeEventListener('click', onOk);
            portalConfirmCancel.removeEventListener('click', onCancel);
            portalConfirmModal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onEsc);
        };
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        const onBackdrop = (e) => { if (e.target === portalConfirmModal) onCancel(); };
        const onEsc = (e) => { if (e.key === 'Escape') onCancel(); };

        portalConfirmOk.addEventListener('click', onOk);
        portalConfirmCancel.addEventListener('click', onCancel);
        portalConfirmModal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onEsc);
        portalConfirmOk.focus();
    });
};

const getFilteredMaps = () => {
    if (!searchQuery) return mindMaps;
    const q = searchQuery.toLowerCase();
    return mindMaps.filter(m => (m.name || '').toLowerCase().includes(q));
};

if (mapSearchInput) {
    mapSearchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        renderMindMaps();
    });
}

const updatePaginationUI = (filteredCount = mindMaps.length) => {
    if (!paginationControls) return;
    const totalPages = Math.ceil(filteredCount / PAGE_SIZE);
    if (totalPages <= 1) {
        paginationControls.classList.add('hidden');
        return;
    }
    paginationControls.classList.remove('hidden');
    pageInfoText.textContent = `Page ${currentPage} of ${totalPages} (${filteredCount} maps)`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
};

if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderMindMaps();
        }
    });
}

if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(getFilteredMaps().length / PAGE_SIZE);
        if (currentPage < totalPages) {
            currentPage++;
            renderMindMaps();
        }
    });
}

const loadMindMaps = async () => {
    mindmapsGrid.innerHTML = '<p class="text-[var(--text-secondary)]">Loading mind maps...</p>';
    if (paginationControls) paginationControls.classList.add('hidden');
    if (!window.firebaseUtils) {
        mindmapsGrid.innerHTML = `<p class="text-[var(--danger)]">Service unavailable.</p>`;
        return;
    }
    const result = await window.firebaseUtils.getMindMapsList();
    
    if (result.success) {
        mindMaps = result.mindmaps || [];
        renderMindMaps();
    } else {
        const p = document.createElement('p');
        p.className = 'text-[var(--danger)]';
        p.textContent = `Failed to load mind maps: ${result.message}`;
        mindmapsGrid.innerHTML = '';
        mindmapsGrid.appendChild(p);
    }
};

const renderMindMaps = () => {
    const filteredMaps = getFilteredMaps();
    if (filteredMaps.length === 0) {
        mindmapsGrid.innerHTML = searchQuery
            ? '<p class="text-[var(--text-secondary)]">No mind maps match your search.</p>'
            : '<p class="text-[var(--text-secondary)]">No mind maps found. Create one in the editor!</p>';
        updatePaginationUI(0);
        updateSelectionState();
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredMaps.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageMaps = filteredMaps.slice(startIdx, startIdx + PAGE_SIZE);

    mindmapsGrid.innerHTML = '';
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    pageMaps.forEach(map => {
        const editedDate = map.timestamp ? new Date(map.timestamp).toLocaleDateString() : '—';
        const createdDate = map.createdAt ? new Date(map.createdAt).toLocaleDateString() : editedDate;
        
        const card = document.createElement('div');
        card.className = 'map-card';
        const isPublic = map.isPublic ? true : false;
        
        const safeName = escapeHtml(map.name);
        
        card.innerHTML = `
            <input type="checkbox" class="map-checkbox" data-name="${safeName}">
            <h3 title="${safeName}" class="flex items-center gap-2">
                ${safeName} 
                ${isPublic ? '<span class="text-[10px] uppercase tracking-wider bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-0.5 rounded-full font-bold border border-[var(--accent)]">Public</span>' : ''}
            </h3>
            <p>Created: ${createdDate} · Edited: ${editedDate}</p>
            <div class="grid grid-cols-2 gap-2 mt-2">
                <button class="btn btn-secondary btn-text text-xs py-1 rename-btn" data-name="${safeName}">Rename</button>
                <button class="btn btn-secondary btn-text text-xs py-1 open-btn" data-name="${safeName}">Open</button>
                <button class="btn btn-secondary btn-text text-xs py-1 copy-link-btn" data-name="${safeName}">Copy Link</button>
                <button class="btn btn-danger btn-text text-xs py-1 delete-btn" data-name="${safeName}">Delete</button>
            </div>
            <div class="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
                <span class="text-sm text-[var(--text-secondary)] font-medium">Public Access</span>
                <div class="toggle public-toggle ${isPublic ? 'active' : ''}" role="switch" aria-checked="${isPublic ? 'true' : 'false'}" tabindex="0" data-name="${safeName}">
                    <div class="toggle-knob"></div>
                </div>
            </div>
        `;
        
        const checkbox = card.querySelector('.map-checkbox');
        checkbox.checked = selectedMapNames.has(map.name);
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) selectedMapNames.add(map.name);
            else selectedMapNames.delete(map.name);
            updateSelectionState();
        });

        card.querySelector('.rename-btn').addEventListener('click', () => openRenameModal(map.name));
        card.querySelector('.delete-btn').addEventListener('click', () => singleDelete(map.name));
        card.querySelector('.open-btn').addEventListener('click', () => {
            sessionStorage.setItem('7systemLoadMap', map.name);
            window.location.href = 'index.html';
        });
        card.querySelector('.copy-link-btn').addEventListener('click', () => {
            if (!map.isPublic) {
                showNotification('Error', 'This mind map is private. Enable Public Access first.', 'error');
                return;
            }
            const url = new URL('mobile.html', window.location.origin + window.location.pathname.replace('portal.html', ''));
            url.searchParams.set('u', sessionAuth.uid || window.firebaseAuth?.currentUser?.uid);
            url.searchParams.set('m', map.name);
            navigator.clipboard.writeText(url.toString()).then(() => {
                showNotification('Success', 'Public link copied to clipboard!', 'success');
            }).catch(() => {
                showNotification('Error', 'Failed to copy link', 'error');
            });
        });
        
        const toggleBtn = card.querySelector('.public-toggle');
        
        const handleToggle = async () => {
            if (toggleBtn.classList.contains('disabled')) return;
            
            const makePublic = !toggleBtn.classList.contains('active');
            
            if (makePublic) {
                const ok = await showPortalConfirm(
                    'Are you sure you want to make this mind map public? Anyone with the link will be able to view it.',
                    'Enable Public Access',
                    'Make Public'
                );
                if (!ok) return;
            }
            
            toggleBtn.classList.toggle('active');
            toggleBtn.setAttribute('aria-checked', String(makePublic));
            toggleBtn.classList.add('disabled', 'opacity-50', 'pointer-events-none');
            
            if (!window.firebaseUtils) {
                showNotification('Error', 'Service unavailable', 'error');
                toggleBtn.classList.remove('disabled', 'opacity-50', 'pointer-events-none');
                toggleBtn.classList.toggle('active');
                toggleBtn.setAttribute('aria-checked', String(!makePublic));
                return;
            }
            const res = await window.firebaseUtils.togglePublicMindMap(map.name, makePublic);
            
            toggleBtn.classList.remove('disabled', 'opacity-50', 'pointer-events-none');
            
            if (res.success) {
                showNotification('Success', makePublic ? 'Mind map is now public!' : 'Mind map is now private.');
                map.isPublic = makePublic;
                renderMindMaps();
            } else {
                toggleBtn.classList.toggle('active');
                toggleBtn.setAttribute('aria-checked', String(!makePublic));
                showNotification('Error', res.message, 'error');
            }
        };

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleToggle();
        });

        toggleBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggle();
            }
        });

        mindmapsGrid.appendChild(card);
    });
    
    updatePaginationUI(filteredMaps.length);
    updateSelectionState();
};

const updateSelectionState = () => {
    const hasSelection = selectedMapNames.size > 0;
    bulkDeleteBtn.disabled = !hasSelection;
    bulkExportBtn.disabled = !hasSelection;
    
    selectAllCheckbox.checked = mindMaps.length > 0 && selectedMapNames.size === mindMaps.length;
    selectAllCheckbox.indeterminate = selectedMapNames.size > 0 && selectedMapNames.size < mindMaps.length;
};

selectAllCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
        mindMaps.forEach(m => selectedMapNames.add(m.name));
    } else {
        selectedMapNames.clear();
    }
    renderMindMaps();
});

// Single Actions
const singleDelete = async (name) => {
    const ok = await showPortalConfirm(
        `Are you sure you want to delete "${name}"? This cannot be undone.`,
        'Delete Mind Map',
        'Delete',
        true
    );
    if (!ok) return;
    
    if (!window.firebaseUtils) {
        showNotification('Error', 'Service unavailable', 'error');
        return;
    }
    const result = await window.firebaseUtils.deleteMindMap(name);
    if (result.success) {
        showNotification('Success', `Deleted ${name}`);
        selectedMapNames.delete(name);
        mindMaps = mindMaps.filter(m => m.name !== name);
        renderMindMaps();
    } else {
        showNotification('Error', result.message, 'error');
    }
};

const downloadJson = (filename, data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

// Bulk Actions
bulkDeleteBtn.addEventListener('click', async () => {
    const ok = await showPortalConfirm(
        `Are you sure you want to delete ${selectedMapNames.size} mind maps? This cannot be undone.`,
        'Delete Selected Maps',
        'Delete All',
        true
    );
    if (!ok) return;
    
    bulkDeleteBtn.disabled = true;
    bulkDeleteBtn.textContent = 'Deleting...';
    
    if (!window.firebaseUtils) {
        showNotification('Error', 'Service unavailable', 'error');
        bulkDeleteBtn.disabled = false;
        bulkDeleteBtn.textContent = 'Delete Selected';
        return;
    }
    const results = await Promise.allSettled(
        [...selectedMapNames].map(name => 
            window.firebaseUtils.deleteMindMap(name)
        )
    );
    
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failCount = results.length - successCount;
    
    showNotification('Bulk Delete Complete', `Deleted ${successCount}, Failed ${failCount}`, failCount > 0 ? 'info' : 'success');
    selectedMapNames.clear();
    bulkDeleteBtn.textContent = 'Delete Selected';
    await loadMindMaps();
});

bulkExportBtn.addEventListener('click', async () => {
    bulkExportBtn.disabled = true;
    bulkExportBtn.textContent = 'Exporting...';
    
    if (!window.firebaseUtils) {
        showNotification('Error', 'Service unavailable', 'error');
        bulkExportBtn.disabled = false;
        bulkExportBtn.textContent = 'Export Selected';
        return;
    }
    try {
        const result = await window.firebaseUtils.getMindMapsList();
        if (result.success && result.mindmaps) {
            let count = 0;
            for (const map of result.mindmaps) {
                if (selectedMapNames.has(map.name)) {
                    const mapRes = await window.firebaseUtils.loadMindMap(map.key);
                    if (mapRes.success) {
                        const exportPayload = mapRes.data && Array.isArray(mapRes.data.nodes)
                            ? { markdown: nodesToMarkdown(mapRes.data.nodes) }
                            : mapRes.data;
                        downloadJson(map.name, exportPayload);
                        count++;
                    }
                }
            }
            showNotification('Success', `Exported ${count} mind maps`);
        } else {
            showNotification('Error', 'Failed to fetch maps for export', 'error');
        }
    } catch (err) {
        showNotification('Error', 'Export failed', 'error');
    } finally {
        bulkExportBtn.disabled = false;
        bulkExportBtn.textContent = 'Export Selected';
    }
});

// Bulk Import
bulkImportInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    
    let successCount = 0;
    let failCount = 0;
    
    for (const file of files) {
        try {
            const text = await file.text();
            let data = JSON.parse(text);
            if (data && typeof data.markdown === 'string') {
                const parsed = markdownToNodes(data.markdown);
                data = { nodes: parsed.nodes, metadata: { nextNodeId: parsed.nextId } };
            }
            if (!data || !Array.isArray(data.nodes)) {
                throw new Error('Invalid mind map file');
            }
            const name = file.name.replace(/\.json$/i, '');
            
            if (!window.firebaseUtils) {
                showNotification('Error', 'Service unavailable', 'error');
                return;
            }
            const res = await window.firebaseUtils.saveMindMap(name, data);
            if (res.success) successCount++;
            else failCount++;
        } catch (err) {
            failCount++;
        }
    }
    
    showNotification('Import Complete', `Imported ${successCount}, Failed ${failCount}`, failCount > 0 ? 'info' : 'success');
    bulkImportInput.value = '';
    await loadMindMaps();
});

// Rename Modal
const renameModal = document.getElementById('renameModal');
const newMapNameInput = document.getElementById('newMapNameInput');
const renameConfirm = document.getElementById('renameConfirm');
const renameCancel = document.getElementById('renameCancel');

const openRenameModal = (name) => {
    renamingMapName = name;
    newMapNameInput.value = name;
    renameModal.classList.remove('hidden');
    newMapNameInput.focus();
};

const closeRenameModal = () => {
    renameModal.classList.add('hidden');
    renamingMapName = null;
};

renameCancel.addEventListener('click', closeRenameModal);

renameConfirm.addEventListener('click', async () => {
    const newName = newMapNameInput.value.trim();
    if (!newName || newName === renamingMapName) {
        closeRenameModal();
        return;
    }
    if (/[.$#\[\]\/]/.test(newName)) {
        showNotification('Error', 'Name contains invalid characters (. $ # [ ] /)', 'error');
        return;
    }
    
    renameConfirm.disabled = true;
    if (!window.firebaseUtils) {
        showNotification('Error', 'Service unavailable', 'error');
        renameConfirm.disabled = false;
        return;
    }
    const res = await window.firebaseUtils.renameMindMap(renamingMapName, newName);
    renameConfirm.disabled = false;
    
    if (res.success) {
        showNotification('Success', `Renamed to ${newName}`);
        
        if (selectedMapNames.has(renamingMapName)) {
            selectedMapNames.delete(renamingMapName);
            selectedMapNames.add(newName);
        }
        
        const mapObj = mindMaps.find(m => m.name === renamingMapName);
        if (mapObj) {
            mapObj.name = newName;
            mapObj.timestamp = new Date().toISOString();
        }
        
        closeRenameModal();
        renderMindMaps();
    } else {
        showNotification('Error', res.message, 'error');
    }
});

// Close modals with the Escape key
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!renameModal.classList.contains('hidden')) closeRenameModal();
    if (!deleteAccountModal.classList.contains('hidden')) deleteAccountModal.classList.add('hidden');
});

newMapNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        renameConfirm.click();
    }
});

// Account Settings
document.getElementById('changePasswordBtn').addEventListener('click', async () => {
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    
    if (!oldPassword || !newPassword || !confirmNewPassword) {
        showNotification('Error', 'Please fill all password fields', 'error');
        return;
    }
    if (newPassword !== confirmNewPassword) {
        showNotification('Error', 'New passwords do not match', 'error');
        return;
    }
    
    const btn = document.getElementById('changePasswordBtn');
    btn.disabled = true;
    if (!window.firebaseUtils) {
        showNotification('Error', 'Service unavailable', 'error');
        btn.disabled = false;
        return;
    }
    const res = await window.firebaseUtils.changePassword(oldPassword, newPassword);
    btn.disabled = false;
    
    if (res.success) {
        showNotification('Success', 'Password updated successfully');
        document.getElementById('changePasswordForm').reset();
    } else {
        showNotification('Error', res.message, 'error');
    }
});

// Delete Account Modal
const deleteAccountModal = document.getElementById('deleteAccountModal');
const deleteAccountPassword = document.getElementById('deleteAccountPassword');
const triggerDeleteAccountBtn = document.getElementById('triggerDeleteAccountBtn');
const deleteAccountConfirm = document.getElementById('deleteAccountConfirm');
const deleteAccountCancel = document.getElementById('deleteAccountCancel');

triggerDeleteAccountBtn.addEventListener('click', () => {
    deleteAccountPassword.value = '';
    deleteAccountModal.classList.remove('hidden');
    deleteAccountPassword.focus();
});

deleteAccountCancel.addEventListener('click', () => {
    deleteAccountModal.classList.add('hidden');
});

deleteAccountConfirm.addEventListener('click', async () => {
    const pwd = deleteAccountPassword.value;
    if (!pwd) {
        showNotification('Error', 'Password is required', 'error');
        return;
    }
    
    deleteAccountConfirm.disabled = true;
    if (!window.firebaseUtils) {
        showNotification('Error', 'Service unavailable', 'error');
        deleteAccountConfirm.disabled = false;
        return;
    }
    const res = await window.firebaseUtils.deleteAccount(pwd);
    deleteAccountConfirm.disabled = false;
    
    if (res.success) {
        localStorage.removeItem('7systemSessionAuth');
        window.location.replace('index.html');
    } else {
        showNotification('Error', res.message, 'error');
        deleteAccountModal.classList.add('hidden');
    }
});


// Init
// loadMindMaps() is called via initPortal() once auth is verified.
