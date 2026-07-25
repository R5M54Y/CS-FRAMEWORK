// Conversation Inbox JavaScript - Dark Theme UI
(function() {
    'use strict';
    
    // Global state
    let currentSessionId = '<%= session.id %>';
    let selectedParticipant = null;
    let socket = null;
    let messagesCache = {};
    
    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        initConversationInbox();
    });
    
    async function initConversationInbox() {
        // Initialize socket connection
        socket = io();
        socket.emit('join-session', currentSessionId);
        
        // Setup event listeners
        setupSocketEvents();
        setupUIEvents();
        
        // Load initial data
        await loadConversationsList();
        if (selectedParticipant) {
            await loadConversationMessages();
        }
        
        // Mark bot status
        await updateBotStatusUI();
    }
    
    function setupSocketEvents() {
        // Listen for new conversations/messages
        socket.on('session:message', (data) => {
            if (data.sessionId === currentSessionId) {
                if (selectedParticipant && data.user === selectedParticipant) {
                    showMessage(data, 'append');
                }
                showToast('New message received', 'info');
            }
            loadConversationsList(); // Refresh chat list
        });
        
        socket.on('session:sent', (data) => {
            if (data.sessionId === currentSessionId && selectedParticipant && data.user === selectedParticipant) {
                showMessage(data, 'append');
            }
        });
        
        socket.on('bot:state', (data) => {
            if (data.sessionId === currentSessionId && selectedParticipant) {
                updateBotStatusUI();
            }
        });
    }
    
    function setupUIEvents() {
        // Chat item clicks
        document.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const participant = e.currentTarget.dataset.participant;
                await selectConversation(participant);
            });
        });
        
        // Bot toggle
        document.querySelectorAll('.bot-toggle').forEach(toggle => {
            toggle.addEventListener('click', async () => {
                await toggleBotStatus();
            });
        });
        
        // Send message
        const replyForm = document.getElementById('reply-form');
        if (replyForm) {
            replyForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await sendMessage();
            });
        }
        
        // Search in chat list
        const searchInput = document.getElementById('chat-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                filterConversations(e.target.value);
            }, 300));
        }
    }
    
    async function loadConversationsList() {
        try {
            const response = await api.get(`/api/session/${currentSessionId}/conversations`);
            renderConversationsList(response);
            
            // If we already have a selected participant, update messages
            if (selectedParticipant) {
                await loadConversationMessages();
                await loadConversationStatus();
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
            showToast('Failed to load conversations', 'error');
        }
    }
    
    function renderConversationsList(conversations) {
        const container = document.querySelector('.chat-list-container');
        if (!container) return;
        
        if (conversations.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <h3>No Conversations</h3>
                    <p>No customer conversations yet</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = conversations.map(conv => {
            const avatarLetter = conv.name ? conv.name.charAt(0).toUpperCase() : '?';
            const unreadCount = conv.unread > 0 ? `
                <div class="chat-unread">${conv.unread}</div>
            ` : '';
            const statusBadge = conv.botPausedBy ? `
                <div class="status-badge ${conv.botPausedBy === 'human' ? 'human' : 'paused'}">
                    ${conv.botPausedBy === 'human' ? '👤' : '⏸'} ${conv.botPausedBy === 'human' ? 'HUMAN' : 'PAUSED'}
                </div>
            ` : `
                <div class="status-badge auto">
                    🤖 AUTO
                </div>
            `;
            
            return `
                <div class="chat-item ${selectedParticipant === conv.name ? 'selected' : ''}" data-participant="${conv.name}">
                    <div class="chat-avatar ${conv.avatar ? '' : 'offline'}">
                        ${conv.avatar ? `<img src="${conv.avatar}" alt="${conv.name}">` : avatarLetter}
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">
                            ${conv.name}
                            ${statusBadge}
                        </div>
                        <div class="chat-preview">
                            ${conv.lastMessage || '(No messages yet)'}
                        </div>
                        <div class="chat-meta">
                            <span class="chat-time">${formatTime(conv.timestamp)}</span>
                            ${unreadCount}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Re-attach event listeners for new chat items
        document.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const participant = e.currentTarget.dataset.participant;
                await selectConversation(participant);
            });
        });
    }
    
    async function selectConversation(participant) {
        selectedParticipant = participant;
        
        // Update UI
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.participant === participant);
        });
        
        // Load messages and status
        await loadConversationMessages();
        await loadConversationStatus();
        
        // Mark as read
        await markConversationAsRead(participant);
    }
    
    async function loadConversationMessages() {
        if (!selectedParticipant) return;
        
        try {
            const response = await api.get(`/api/session/${currentSessionId}/conversations/${selectedParticipant}/messages`);
            renderMessages(response);
        } catch (error) {
            console.error('Failed to load messages:', error);
            showToast('Failed to load messages', 'error');
        }
    }
    
    function renderMessages(messages) {
        const container = document.querySelector('.messages-container');
        if (!container) return;
        
        if (messages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <h3>No Messages</h3>
                    <p>Start a conversation with ${selectedParticipant}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = messages.map(msg => {
            const isOutgoing = msg.isOutgoing || msg.to === selectedParticipant;
            const isFromMe = msg.user === 'human' || msg.fromMe;
            const bubbleClass = isFromMe ? 'human' : (msg.user === 'bot' ? 'bot' : 'customer');
            const fromLabel = isFromMe ? 'You' : (msg.user || msg.from);
            
            return `
                <div class="message-wrapper ${isOutgoing ? 'right' : 'left'}">
                    <div class="message-bubble ${bubbleClass}">
                        <div class="message-header">
                            <span class="message-from">${fromLabel}</span>
                            <span class="message-time">${formatTime(msg.timestamp)}</span>
                        </div>
                        <div class="message-content">
                            ${escapeHtml(msg.content)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Scroll to bottom
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
    
    async function loadConversationStatus() {
        if (!selectedParticipant) return;
        
        try {
            const response = await api.get(`/api/session/${currentSessionId}/conversations/status?participant=${selectedParticipant}`);
            renderConversationStatus(response);
        } catch (error) {
            console.error('Failed to load conversation status:', error);
        }
    }
    
    function renderConversationStatus(status) {
        const botToggle = document.querySelector('.bot-toggle');
        const botLabel = document.querySelector('.bot-label');
        const botStatusDot = document.querySelector('.bot-status-dot');
        
        if (!botToggle) return;
        
        const isBotEnabled = status.botEnabled;
        const botPausedBy = status.botPausedBy;
        
        // Update bot toggle state
        botToggle.className = `bot-toggle ${isBotEnabled ? 'active' : 'inactive'}`;
        botLabel.textContent = isBotEnabled ? 'BOT' : 'BOT (PAUSED)';
        botStatusDot.className = `bot-status-dot ${isBotEnabled ? 'active' : 'inactive'}`;
        
        // Show pause reason if applicable
        if (botPausedBy === 'human') {
            botLabel.title = 'Bot paused by human agent';
        } else if (botPausedBy) {
            botLabel.title = `Bot paused (${botPausedBy})`;
        }
    }
    
    async function toggleBotStatus() {
        try {
            const action = document.querySelector('.bot-toggle.active') ? 'resume' : 'pause';
            const endpoint = action === 'pause' ? 'pause' : 'resume';
            
            await api.post(`/api/session/${currentSessionId}/bot/${endpoint}`, {});
            
            // Update UI immediately
            await updateBotStatusUI();
            showToast(`Bot ${action}ed successfully`, 'success');
        } catch (error) {
            console.error('Failed to toggle bot status:', error);
            showToast('Failed to toggle bot status', 'error');
        }
    }
    
    async function updateBotStatusUI() {
        try {
            const response = await api.get(`/api/session/${currentSessionId}/conversations/status?participant=${selectedParticipant}`);
            renderConversationStatus(response);
        } catch (error) {
            console.error('Failed to update bot status UI:', error);
        }
    }
    
    async function sendMessage() {
        const textarea = document.getElementById('reply-textarea');
        const content = textarea.value.trim();
        
        if (!content) return;
        
        try {
            // Disable send button
            const sendButton = document.querySelector('.reply-button');
            sendButton.disabled = true;
            sendButton.innerHTML = '<div class="loading-spinner"></div>';
            
            // Send message to backend
            await api.post(`/api/session/${currentSessionId}/conversations/reply`, {
                to: selectedParticipant + '@s.whatsapp.net',
                content: content
            });
            
            // Clear textarea
            textarea.value = '';
            textarea.style.height = '44px';
            
            showToast('Message sent', 'success');
        } catch (error) {
            console.error('Failed to send message:', error);
            showToast('Failed to send message', 'error');
        } finally {
            // Re-enable send button
            const sendButton = document.querySelector('.reply-button');
            sendButton.disabled = false;
            sendButton.innerHTML = '📨';
        }
    }
    
    async function markConversationAsRead(participant) {
        // Implementation would go here
        // In a real app, you'd update the server's read status
    }
    
    function filterConversations(searchTerm) {
        const items = document.querySelectorAll('.chat-item');
        const term = searchTerm.toLowerCase();
        
        items.forEach(item => {
            const name = item.dataset.participant.toLowerCase();
            const preview = item.querySelector('.chat-preview').textContent.toLowerCase();
            
            if (name.includes(term) || preview.includes(term)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    // Utility functions
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
        
        if (diffHours < 24) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffHours < 168) { // 7 days
            const days = Math.floor(diffHours / 24);
            return `${days} ${days === 1 ? 'd' : 'd'} ago`;
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function showMessage(message, position = 'append') {
        const container = document.querySelector('.messages-container');
        if (!container) return;
        
        const isOutgoing = message.isOutgoing || message.to === selectedParticipant;
        const isFromMe = message.user === 'human' || message.fromMe;
        const bubbleClass = isFromMe ? 'human' : (message.user === 'bot' ? 'bot' : 'customer');
        const fromLabel = isFromMe ? 'You' : (message.user || message.from);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-wrapper ${isOutgoing ? 'right' : 'left'}`;
        messageDiv.innerHTML = `
            <div class="message-bubble ${bubbleClass}">
                <div class="message-header">
                    <span class="message-from">${fromLabel}</span>
                    <span class="message-time">${formatTime(message.timestamp)}</span>
                </div>
                <div class="message-content">
                    ${escapeHtml(message.content)}
                </div>
            </div>
        `;
        
        if (position === 'append') {
            container.appendChild(messageDiv);
        } else {
            container.insertBefore(messageDiv, container.firstChild);
        }
        
        // Scroll to bottom for new messages
        if (isOutgoing || message.user === selectedParticipant) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 100);
        }
    }
    
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // Auto-resize textarea
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('reply-textarea')) {
            e.target.style.height = '44px';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
        }
    });
})();