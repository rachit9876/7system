let notificationTimer = null;

export function showNotification(title, message, type = 'success') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    const notificationTitle = document.getElementById('notificationTitle');
    const notificationMessage = document.getElementById('notificationMessage');
    const notificationIcon = document.getElementById('notificationIcon');
    
    if (notificationTitle) notificationTitle.textContent = title;
    if (notificationMessage) notificationMessage.textContent = message;
    
    if (notificationIcon) {
        if (type === 'success') {
            notificationIcon.innerHTML = '<svg class="w-6 h-6 text-green-500"><use href="#icon-check"/></svg>';
        } else if (type === 'error') {
            notificationIcon.innerHTML = '<svg class="w-6 h-6 text-red-500"><use href="#icon-x"/></svg>';
        } else if (type === 'info') {
            notificationIcon.innerHTML = '<svg class="w-6 h-6 text-blue-500"><use href="#icon-info"/></svg>';
        }
    }
    
    notification.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    notification.classList.add('translate-y-0');
    
    if (notificationTimer) {
        clearTimeout(notificationTimer);
    }

    notificationTimer = setTimeout(() => {
        notification.classList.remove('translate-y-0');
        notification.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
        notificationTimer = null;
    }, 3000);
}

// Attach to window for non-module scripts or inline event handlers
window.showNotification = showNotification;
