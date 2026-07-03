import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

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

const waitForAuth = setInterval(() => {
    if (window.firebaseAuth) {
        clearInterval(waitForAuth);
        onAuthStateChanged(window.firebaseAuth, (user) => {
            if (user) {
                sessionAuth = { username: user.email };
                initPortal();
            } else {
                window.location.replace('index.html');
            }
        });
    }
}, 50);

// Notifications
let notificationTimer = null;
function showNotification(title, message, type = 'success') {
    const notification = document.getElementById('notification');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const iconEl = document.getElementById('notificationIcon');
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    if (type === 'success') {
        iconEl.innerHTML = '<svg class="w-6 h-6 text-[var(--success)]"><use href="#icon-check"/></svg>';
    } else if (type === 'error') {
        iconEl.innerHTML = '<svg class="w-6 h-6 text-[var(--danger)]"><use href="#icon-x"/></svg>';
    }
    
    notification.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    notification.classList.add('translate-y-0', 'opacity-100');
    
    if (notificationTimer) clearTimeout(notificationTimer);

    notificationTimer = setTimeout(() => {
        notification.classList.remove('translate-y-0', 'opacity-100');
        notification.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
        notificationTimer = null;
    }, 3000);
}

// Theme Handling
const themeToggle = document.getElementById('themeToggle');
const iconLight = document.getElementById('theme-icon-light');
const iconDark = document.getElementById('theme-icon-dark');

function setTheme(isDark) {
    if (isDark) {
        document.documentElement.classList.add('dark');
        iconLight.classList.add('hidden');
        iconDark.classList.remove('hidden');
        localStorage.setItem('mindmap-theme', 'dark');
    } else {
        document.documentElement.classList.remove('dark');
        iconLight.classList.remove('hidden');
        iconDark.classList.add('hidden');
        localStorage.setItem('mindmap-theme', 'light');
    }
}

themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(!isDark);
});

const savedTheme = localStorage.getItem('mindmap-theme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    setTheme(true);
} else {
    setTheme(false);
}

// State
let mindMaps = [];
let selectedMapNames = new Set();
let renamingMapName = null;

// DOM Elements
const mindmapsGrid = document.getElementById('mindmapsGrid');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
const bulkExportBtn = document.getElementById('bulkExportBtn');
const bulkImportInput = document.getElementById('bulkImportInput');

const loadMindMaps = async () => {
    mindmapsGrid.innerHTML = '<p class="text-[var(--text-secondary)]">Loading mind maps...</p>';
    const result = await window.firebaseUtils.getMindMapsList(sessionAuth.username, null);
    
    if (result.success) {
        mindMaps = result.mindmaps || [];
        renderMindMaps();
    } else {
        mindmapsGrid.innerHTML = `<p class="text-[var(--danger)]">Failed to load mind maps: ${result.message}</p>`;
    }
};

const renderMindMaps = () => {
    if (mindMaps.length === 0) {
        mindmapsGrid.innerHTML = '<p class="text-[var(--text-secondary)]">No mind maps found. Create one in the editor!</p>';
        return;
    }

    mindmapsGrid.innerHTML = '';
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    mindMaps.forEach(map => {
        const date = new Date(map.timestamp).toLocaleDateString();
        
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
            <p>Last edited: ${date}</p>
            <div class="grid grid-cols-2 gap-2 mt-2">
                <button class="btn btn-secondary btn-text text-xs py-1 rename-btn" data-name="${safeName}">Rename</button>
                <button class="btn btn-secondary btn-text text-xs py-1 export-btn" data-name="${safeName}">Export</button>
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
        card.querySelector('.export-btn').addEventListener('click', () => singleExport(map.name));
        card.querySelector('.copy-link-btn').addEventListener('click', () => {
            const url = new URL('mobile.html', window.location.origin + window.location.pathname.replace('portal.html', ''));
            url.searchParams.set('u', sessionAuth.username);
            url.searchParams.set('m', map.name);
            navigator.clipboard.writeText(url.toString()).then(() => {
                showNotification('Success', 'Public link copied to clipboard!');
            }).catch(() => {
                showNotification('Error', 'Failed to copy link', 'error');
            });
        });
        
        const toggleBtn = card.querySelector('.public-toggle');
        
        const handleToggle = async () => {
            if (toggleBtn.classList.contains('disabled')) return;
            
            const makePublic = !toggleBtn.classList.contains('active');
            
            if (makePublic) {
                if (!confirm('Are you sure you want to make this mind map public? Anyone with the link will be able to view it.')) {
                    return;
                }
            }
            
            toggleBtn.classList.toggle('active');
            toggleBtn.setAttribute('aria-checked', makePublic);
            toggleBtn.classList.add('disabled', 'opacity-50', 'pointer-events-none');
            
            const res = await window.firebaseUtils.togglePublicMindMap(sessionAuth.username, null, map.name, makePublic);
            
            toggleBtn.classList.remove('disabled', 'opacity-50', 'pointer-events-none');
            
            if (res.success) {
                showNotification('Success', makePublic ? 'Mind map is now public!' : 'Mind map is now private.');
                loadMindMaps(); 
            } else {
                toggleBtn.classList.toggle('active');
                toggleBtn.setAttribute('aria-checked', !makePublic);
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
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    
    const result = await window.firebaseUtils.deleteMindMap(sessionAuth.username, null, name);
    if (result.success) {
        showNotification('Success', `Deleted ${name}`);
        selectedMapNames.delete(name);
        await loadMindMaps();
    } else {
        showNotification('Error', result.message, 'error');
    }
};

const singleExport = async (name) => {
    const result = await window.firebaseUtils.loadMindMap(sessionAuth.username, null, name);
    
    if (result.success && result.data) {
        downloadJson(name, result.data);
    } else {
        showNotification('Error', 'Failed to fetch map data for export', 'error');
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
    if (!confirm(`Are you sure you want to delete ${selectedMapNames.size} mind maps?`)) return;
    
    bulkDeleteBtn.disabled = true;
    bulkDeleteBtn.textContent = 'Deleting...';
    
    const results = await Promise.allSettled(
        [...selectedMapNames].map(name => 
            window.firebaseUtils.deleteMindMap(sessionAuth.username, null, name)
        )
    );
    
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failCount = results.length - successCount;
    
    showNotification('Bulk Delete Complete', `Deleted ${successCount}, Failed ${failCount}`);
    selectedMapNames.clear();
    bulkDeleteBtn.textContent = 'Delete Selected';
    await loadMindMaps();
});

bulkExportBtn.addEventListener('click', async () => {
    bulkExportBtn.disabled = true;
    bulkExportBtn.textContent = 'Exporting...';
    
    try {
        const result = await window.firebaseUtils.getMindMapsList(sessionAuth.username, null);
        if (result.success && result.mindmaps) {
            let count = 0;
            for (const map of result.mindmaps) {
                if (selectedMapNames.has(map.name)) {
                    const mapRes = await window.firebaseUtils.loadMindMap(sessionAuth.username, null, map.name);
                    if (mapRes.success) {
                        downloadJson(map.name, mapRes.data);
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
            const data = JSON.parse(text);
            const name = file.name.replace(/\.json$/i, '');
            
            const res = await window.firebaseUtils.saveMindMap(sessionAuth.username, null, name, data);
            if (res.success) successCount++;
            else failCount++;
        } catch (err) {
            failCount++;
        }
    }
    
    showNotification('Import Complete', `Imported ${successCount}, Failed ${failCount}`);
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
    
    renameConfirm.disabled = true;
    const res = await window.firebaseUtils.renameMindMap(sessionAuth.username, null, renamingMapName, newName);
    renameConfirm.disabled = false;
    
    if (res.success) {
        showNotification('Success', `Renamed to ${newName}`);
        
        if (selectedMapNames.has(renamingMapName)) {
            selectedMapNames.delete(renamingMapName);
            selectedMapNames.add(newName);
        }
        
        closeRenameModal();
        await loadMindMaps();
    } else {
        showNotification('Error', res.message, 'error');
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
    const res = await window.firebaseUtils.changePassword(sessionAuth.username, null, oldPassword, newPassword);
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
    const res = await window.firebaseUtils.deleteAccount(sessionAuth.username, pwd);
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
