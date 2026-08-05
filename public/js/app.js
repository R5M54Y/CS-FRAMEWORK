// Main client-side JavaScript
// Shared utilities for all pages

(function() {
    'use strict';
    
    // Global socket
    window.socket = io();
    
    // Show toast notification
    window.showToast = function(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };
    
    // Format uptime
    window.formatUptime = function(seconds) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const parts = [];
        if (d > 0) parts.push(`${d}d`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        parts.push(`${s}s`);
        return parts.join(' ');
    };
    
    // Format date
    window.formatDate = function(dateString) {
        return new Date(dateString).toLocaleString();
    };
    
    // API helper
    window.api = {
        get: (url) => fetch(url).then(r => r.json()),
        post: (url, data) => fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(r => r.json()),
        put: (url, data) => fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(r => r.json()),
        del: (url) => fetch(url, { method: 'DELETE' }).then(r => r.json())
    };
    
    // Global error handler
    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled rejection:', e.reason);
    });
    
    // Update uptime displays periodically
    setInterval(() => {
        document.querySelectorAll('[data-uptime-start]').forEach(el => {
            const startStr = el.dataset.uptimeStart;
            if (!startStr || startStr === 'null') {
                el.textContent = '0s';
                return;
            }
            const start = new Date(startStr).getTime();
            if (isNaN(start)) {
                el.textContent = '0s';
                return;
            }
            const now = Date.now();
            const seconds = Math.floor((now - start) / 1000);
            el.textContent = formatUptime(seconds);
        });
    }, 1000);
    
})();