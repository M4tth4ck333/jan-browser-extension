# Chrome Extension Upgrade: Homepage Replacement & Chatbot Interface

## Overview
This guide will help you upgrade your existing Chrome extension to:
1. Replace the browser's new tab/homepage with a custom chatbot interface
2. Implement a persistent chatbot that can interact with users
3. Maintain security and performance best practices

## Architecture Changes

### 1. Manifest Permissions Update
Your extension will need additional permissions to:
- Override the new tab page
- Access storage for chat history
- Make API calls for AI responses

### 2. Core Components
- **New Tab Override**: Custom HTML/CSS/JS for the new tab page
- **Chat Interface**: Modern, responsive chat UI
- **AI Integration**: Connect to OpenAI, Claude, or local LLM
- **Data Persistence**: Store conversations locally

## Implementation Steps

### Step 1: Update manifest.json
```json
{
  "manifest_version": 3,
  "name": "AI Chat Home",
  "version": "2.0.0",
  "description": "Replace your new tab with an AI chat assistant",
  "permissions": [
    "storage",
    "activeTab"
  ],
  "chrome_url_overrides": {
    "newtab": "newtab.html"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "AI Chat Home"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; connect-src 'self' https://api.openai.com;"
  }
}
```

### Step 2: Create New Tab Interface (newtab.html)
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AI Chat Home</title>
  <link rel="stylesheet" href="styles.css">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <div class="container">
    <header>
      <h1>AI Assistant</h1>
      <div class="weather-widget" id="weather"></div>
    </header>
    
    <div class="chat-container">
      <div class="messages" id="messages">
        <div class="message ai-message">
          <div class="avatar">🤖</div>
          <div class="content">
            <p>Hello! I'm your AI assistant. How can I help you today?</p>
          </div>
        </div>
      </div>
      
      <div class="input-container">
        <textarea 
          id="messageInput" 
          placeholder="Ask me anything..." 
          rows="1"
        ></textarea>
        <button id="sendButton" type="button">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
    
    <div class="quick-actions">
      <button class="quick-btn" data-prompt="What's the weather today?">🌤️ Weather</button>
      <button class="quick-btn" data-prompt="Help me plan my day">📅 Plan Day</button>
      <button class="quick-btn" data-prompt="Latest tech news">📰 News</button>
      <button class="quick-btn" data-prompt="Motivational quote">✨ Inspire</button>
    </div>
  </div>
  
  <script src="newtab.js"></script>
</body>
</html>
```

### Step 3: Styling (styles.css)
```css
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #1a1a1a;
  --text-primary: #ffffff;
  --text-secondary: #a0a0a0;
  --accent: #06b6d4;
  --border: #333333;
  --success: #10b981;
  --warning: #f59e0b;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: linear-gradient(135deg, var(--bg-primary) 0%, #111827 100%);
  color: var(--text-primary);
  height: 100vh;
  overflow: hidden;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

h1 {
  font-size: 2rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent), #d946ef);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
}

.messages {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  display: flex;
  gap: 1rem;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), #d946ef);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.content {
  flex: 1;
}

.content p {
  line-height: 1.6;
  margin-bottom: 0.5rem;
}

.input-container {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  border-top: 1px solid var(--border);
}

#messageInput {
  flex: 1;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem;
  color: var(--text-primary);
  resize: none;
  font-family: inherit;
}

#messageInput:focus {
  outline: none;
  border-color: var(--accent);
}

#sendButton {
  background: linear-gradient(135deg, var(--accent), #d946ef);
  border: none;
  border-radius: 8px;
  padding: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

#sendButton:hover {
  transform: scale(1.05);
}

#sendButton svg {
  fill: white;
}

.quick-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.quick-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 0.5rem 1rem;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.875rem;
}

.quick-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

@media (max-width: 768px) {
  .container {
    padding: 1rem;
  }
  
  h1 {
    font-size: 1.5rem;
  }
}
```

### Step 4: JavaScript Functionality (newtab.js)
```javascript
class AIChatHome {
  constructor() {
    this.messagesContainer = document.getElementById('messages');
    this.messageInput = document.getElementById('messageInput');
    this.sendButton = document.getElementById('sendButton');
    this.isProcessing = false;
    
    this.init();
  }

  init() {
    this.loadChatHistory();
    this.setupEventListeners();
    this.setupQuickActions();
    this.loadWeather();
  }

  setupEventListeners() {
    this.sendButton.addEventListener('click', () => this.sendMessage());
    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    this.messageInput.addEventListener('input', () => {
      this.messageInput.style.height = 'auto';
      this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
    });
  }

  setupQuickActions() {
    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        this.messageInput.value = prompt;
        this.sendMessage();
      });
    });
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message || this.isProcessing) return;

    this.isProcessing = true;
    this.addMessage(message, 'user');
    this.messageInput.value = '';
    this.messageInput.style.height = 'auto';

    try {
      const response = await this.getAIResponse(message);
      this.addMessage(response, 'ai');
    } catch (error) {
      this.addMessage('Sorry, I encountered an error. Please try again.', 'ai');
    }

    this.isProcessing = false;
    this.saveChatHistory();
  }

  addMessage(content, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = sender === 'user' ? '👤' : '🤖';
    
    messageDiv.innerHTML = `
      <div class="avatar">${avatar}</div>
      <div class="content">
        <p>${content}</p>
      </div>
    `;

    this.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();
  }

  async getAIResponse(message) {
    // Option 1: Use OpenAI API (requires API key)
    return await this.callOpenAI(message);
    
    // Option 2: Use local fallback responses
    // return this.getLocalResponse(message);
  }

  async callOpenAI(message) {
    // You'll need to set up your API key in extension settings
    const apiKey = await this.getAPIKey();
    if (!apiKey) {
      return this.getLocalResponse(message);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: message }],
        max_tokens: 150
      })
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }

  getLocalResponse(message) {
    const responses = {
      'weather': 'I can help you check the weather! Try asking "What\'s the weather in [city]"',
      'news': 'Here are today\'s top tech headlines... [integrate news API]',
      'plan': 'Let\'s plan your day! What would you like to accomplish?',
      'inspire': 'Every great journey begins with a single step. What\'s your next step today?'
    };

    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('weather')) return responses.weather;
    if (lowerMessage.includes('news')) return responses.news;
    if (lowerMessage.includes('plan')) return responses.plan;
    
    return "I'm here to help! I can assist with weather, news, planning, or general questions.";
  }

  async loadWeather() {
    // Implement weather widget
    // You can use a free weather API like OpenWeatherMap
  }

  async getAPIKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['openai_api_key'], (result) => {
        resolve(result.openai_api_key);
      });
    });
  }

  loadChatHistory() {
    chrome.storage.local.get(['chat_history'], (result) => {
      if (result.chat_history) {
        this.messagesContainer.innerHTML = '';
        result.chat_history.forEach(msg => {
          this.addMessage(msg.content, msg.sender);
        });
      }
    });
  }

  saveChatHistory() {
    const messages = Array.from(this.messagesContainer.children).map(child => ({
      content: child.querySelector('.content p').textContent,
      sender: child.classList.contains('user-message') ? 'user' : 'ai'
    }));
    
    chrome.storage.local.set({ chat_history: messages });
  }

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new AIChatHome();
});
```

### Step 5: Settings Popup (popup.html)
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      width: 300px;
      padding: 1rem;
      font-family: Inter, sans-serif;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
    }
    input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    button {
      background: #06b6d4;
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h2>AI Chat Settings</h2>
  
  <div class="form-group">
    <label for="apiKey">OpenAI API Key:</label>
    <input type="password" id="apiKey" placeholder="sk-...">
  </div>
  
  <div class="form-group">
    <label for="model">AI Model:</label>
    <select id="model">
      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
      <option value="gpt-4">GPT-4</option>
    </select>
  </div>
  
  <button id="saveBtn">Save Settings</button>
  <button id="clearChat">Clear Chat History</button>

  <script src="popup.js"></script>
</body>
</html>
```

### Step 6: Popup JavaScript (popup.js)
```javascript
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('clearChat').addEventListener('click', clearChat);
});

function loadSettings() {
  chrome.storage.local.get(['openai_api_key', 'ai_model'], (result) => {
    document.getElementById('apiKey').value = result.openai_api_key || '';
    document.getElementById('model').value = result.ai_model || 'gpt-3.5-turbo';
  });
}

function saveSettings() {
  const apiKey = document.getElementById('apiKey').value;
  const model = document.getElementById('model').value;
  
  chrome.storage.local.set({
    openai_api_key: apiKey,
    ai_model: model
  }, () => {
    alert('Settings saved!');
  });
}

function clearChat() {
  chrome.storage.local.remove(['chat_history'], () => {
    alert('Chat history cleared!');
  });
}
```

## Installation & Testing

### 1. Load Extension in Chrome
1. Open Chrome → Extensions → Developer mode ON
2. Click "Load unpacked" → Select your extension folder
3. Open a new tab to see your AI chat interface

### 2. Setup API Key
1. Click the extension icon
2. Enter your OpenAI API key in settings
3. Save and refresh the new tab

### 3. Features to Add Later
- [ ] Weather integration
- [ ] News feed
- [ ] Todo list
- [ ] Calendar events
- [ ] Custom themes
- [ ] Voice input
- [ ] Export chat history

## Security Considerations
- Store API keys securely in chrome.storage
- Validate all user inputs
- Use HTTPS for API calls
- Implement rate limiting
- Clear sensitive data on uninstall

## Next Steps
1. Test the basic functionality
2. Add your API key in settings
3. Customize the UI colors/theme
4. Add more quick action buttons
5. Integrate additional APIs (weather, news, etc.)

## Troubleshooting
- **CSP errors**: Check manifest.json CSP settings
- **API failures**: Verify API key and network connectivity
- **Styling issues**: Use browser dev tools to debug CSS
- **Storage limits**: Chrome storage has 8KB limit per item

This upgrade transforms your extension into a full-featured AI chatbot that replaces the new tab page. The modular design allows easy addition of new features and services.