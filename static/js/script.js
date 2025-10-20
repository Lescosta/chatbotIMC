class ChatbotRAG {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.checkSystemStatus();
        this.autoResizeTextarea();
    }

    initializeElements() {
        // Status elements
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.documentCount = document.getElementById('documentCount');
        this.chunkCount = document.getElementById('chunkCount');
        this.fileCount = document.getElementById('fileCount');
        this.refreshBtn = document.getElementById('refreshBtn');

        // Chat elements
        this.welcomeMessage = document.getElementById('welcomeMessage');
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.loadingIndicator = document.getElementById('loadingIndicator');

        // Modal elements
        this.errorModal = document.getElementById('errorModal');
        this.errorMessage = document.getElementById('errorMessage');
        this.closeModal = document.getElementById('closeModal');

        // State
        this.isLoading = false;
        this.systemReady = false;
    }

    bindEvents() {
        // Send button click
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // Enter key in textarea
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Input change to enable/disable send button
        this.messageInput.addEventListener('input', () => {
            this.updateSendButton();
            this.autoResizeTextarea();
        });

        // Refresh button
        this.refreshBtn.addEventListener('click', () => this.processDocuments());

        // Example question buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('example-btn')) {
                const question = e.target.getAttribute('data-question');
                this.messageInput.value = question;
                this.updateSendButton();
                this.sendMessage();
            }
        });

        // Modal close
        this.closeModal.addEventListener('click', () => this.hideModal());
        this.errorModal.addEventListener('click', (e) => {
            if (e.target === this.errorModal) {
                this.hideModal();
            }
        });

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.errorModal.style.display !== 'none') {
                this.hideModal();
            }
        });
    }

    autoResizeTextarea() {
        const textarea = this.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    updateSendButton() {
        const hasText = this.messageInput.value.trim().length > 0;
        this.sendBtn.disabled = !hasText || this.isLoading || !this.systemReady;
    }

    async checkSystemStatus() {
        try {
            const response = await fetch('/status');
            const data = await response.json();

            this.updateStatusDisplay(data);
            this.systemReady = data.processed && data.document_count > 0;
            this.updateSendButton();

            if (!this.systemReady) {
                this.showStatusMessage('Sistema não está pronto. Clique em "Reprocessar Documentos" para começar.', 'warning');
            } else {
                this.showStatusMessage('Sistema pronto para uso', 'success');
            }

        } catch (error) {
            console.error('Erro ao verificar status:', error);
            this.showStatusMessage('Erro ao conectar com o servidor', 'error');
            this.systemReady = false;
            this.updateSendButton();
        }
    }

    updateStatusDisplay(data) {
        this.documentCount.textContent = data.document_count || '0';
        this.chunkCount.textContent = data.chunk_count || '0';
        this.fileCount.textContent = data.files_in_folder ? data.files_in_folder.length : '0';

        // Update status indicator
        if (data.processed && data.document_count > 0) {
            this.statusDot.className = 'status-dot online';
        } else {
            this.statusDot.className = 'status-dot offline';
        }
    }

    showStatusMessage(message, type) {
        this.statusText.textContent = message;
        this.statusText.className = `status-${type}`;
    }

    async processDocuments() {
        this.setRefreshLoading(true);
        
        try {
            const response = await fetch('/process_documents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                this.showStatusMessage(`Processados ${data.document_count} documentos com sucesso`, 'success');
                await this.checkSystemStatus();
            } else {
                this.showError(data.message || 'Erro ao processar documentos');
            }

        } catch (error) {
            console.error('Erro ao processar documentos:', error);
            this.showError('Erro ao conectar com o servidor');
        } finally {
            this.setRefreshLoading(false);
        }
    }

    setRefreshLoading(loading) {
        this.refreshBtn.disabled = loading;
        if (loading) {
            this.refreshBtn.classList.add('loading');
        } else {
            this.refreshBtn.classList.remove('loading');
        }
    }

    async sendMessage() {
        if (this.isLoading || !this.systemReady) return;

        const message = this.messageInput.value.trim();
        if (!message) return;

        // Hide welcome message if visible
        if (this.welcomeMessage.style.display !== 'none') {
            this.welcomeMessage.style.display = 'none';
        }

        // Add user message to chat
        this.addMessage(message, 'user');

        // Clear input and disable send button
        this.messageInput.value = '';
        this.autoResizeTextarea();
        this.updateSendButton();

        // Show loading indicator
        this.setLoading(true);

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question: message })
            });

            const data = await response.json();

            if (data.success) {
                this.addMessage(data.answer, 'assistant', data.sources);
            } else {
                this.showError(data.message || 'Erro ao processar pergunta');
            }

        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            this.showError('Erro ao conectar com o servidor');
        } finally {
            this.setLoading(false);
        }
    }

    addMessage(text, sender, sources = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = sender === 'user' ? 'U' : 'A';

        const content = document.createElement('div');
        content.className = 'message-content';

        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.textContent = text;

        content.appendChild(messageText);

        // Add sources if available
        if (sources && sources.length > 0) {
            const sourcesDiv = document.createElement('div');
            sourcesDiv.className = 'message-sources';

            const sourcesTitle = document.createElement('div');
            sourcesTitle.className = 'sources-title';
            sourcesTitle.textContent = 'Fontes consultadas:';

            sourcesDiv.appendChild(sourcesTitle);

            sources.forEach(source => {
                const sourceItem = document.createElement('div');
                sourceItem.className = 'source-item';
                sourceItem.textContent = source;
                sourcesDiv.appendChild(sourceItem);
            });

            content.appendChild(sourcesDiv);
        }

        // Add timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'message-time';
        timestamp.textContent = new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        content.appendChild(timestamp);

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    setLoading(loading) {
        this.isLoading = loading;
        this.loadingIndicator.style.display = loading ? 'flex' : 'none';
        this.updateSendButton();

        if (loading) {
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }, 100);
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorModal.style.display = 'flex';
    }

    hideModal() {
        this.errorModal.style.display = 'none';
    }

    // Utility method to format text with basic markdown-like formatting
    formatText(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }
}

// Initialize the chatbot when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ChatbotRAG();
});

// Add some utility functions for better UX
window.addEventListener('beforeunload', (e) => {
    // Warn user if they're about to leave while loading
    const chatbot = window.chatbot;
    if (chatbot && chatbot.isLoading) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Handle online/offline status
window.addEventListener('online', () => {
    console.log('Conexão restaurada');
});

window.addEventListener('offline', () => {
    console.log('Conexão perdida');
});
