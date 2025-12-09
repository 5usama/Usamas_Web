// Global variables
let currentBotLogs = '';
let logsInterval = null;

// Show specific section
function showSection(section) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(el => {
        el.style.display = 'none';
    });
    
    // Remove active class from all nav links
    document.querySelectorAll('.nav-link').forEach(el => {
        el.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(`${section}-section`).style.display = 'block';
    
    // Add active class to clicked nav link
    event.target.closest('.nav-link').classList.add('active');
    
    // Load data if needed
    if (section === 'bots' || section === 'dashboard') {
        loadBots();
    }
}

// Show deploy modal
function showDeployModal() {
    document.getElementById('deploy-modal').classList.add('active');
}

// Close deploy modal
function closeDeployModal() {
    document.getElementById('deploy-modal').classList.remove('active');
}

// Load all bots
async function loadBots() {
    try {
        const response = await fetch('/api/bots');
        const data = await response.json();
        
        if (data.success) {
            updateDashboard(data.bots);
            renderBots(data.bots);
            updateConsoleBotSelect(data.bots);
        }
    } catch (error) {
        console.error('Error loading bots:', error);
    }
}

// Update dashboard stats
function updateDashboard(bots) {
    const totalBots = bots.length;
    const runningBots = bots.filter(bot => bot.status === 'running').length;
    const stoppedBots = totalBots - runningBots;
    
    document.getElementById('total-bots').textContent = totalBots;
    document.getElementById('running-bots').textContent = runningBots;
    document.getElementById('stopped-bots').textContent = stoppedBots;
    
    // Show recent bots (last 3)
    const recentBots = bots.slice(-3).reverse();
    renderBotGrid('recent-bots', recentBots);
}

// Render bots in grid
function renderBots(bots) {
    renderBotGrid('all-bots', bots);
}

function renderBotGrid(containerId, bots) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = bots.map(bot => `
        <div class="bot-card">
            <div class="bot-header">
                <div class="bot-name">
                    <i class="fas fa-robot"></i> ${bot.name}
                </div>
                <div class="bot-status ${bot.status === 'running' ? 'status-running' : 'status-stopped'}">
                    ${bot.status === 'running' ? '🟢 Running' : '🔴 Stopped'}
                </div>
            </div>
            
            <div class="bot-info">
                <div><i class="far fa-calendar"></i> Created: ${new Date(bot.createdAt).toLocaleDateString()}</div>
                <div><i class="fas fa-terminal"></i> Command: ${bot.startupCommand || 'node index.js'}</div>
                ${bot.pid ? `<div><i class="fas fa-microchip"></i> PID: ${bot.pid}</div>` : ''}
            </div>
            
            <div class="bot-actions">
                ${bot.status === 'running' ? 
                    `<button class="btn btn-danger" onclick="stopBot('${bot.name}')">
                        <i class="fas fa-stop"></i> Stop
                    </button>` :
                    `<button class="btn btn-primary" onclick="startBot('${bot.name}')">
                        <i class="fas fa-play"></i> Start
                    </button>`
                }
                
                <button class="btn btn-secondary" onclick="viewBotLogs('${bot.name}')">
                    <i class="fas fa-terminal"></i> Logs
                </button>
                
                <button class="btn btn-danger" onclick="deleteBot('${bot.name}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Update console bot select
function updateConsoleBotSelect(bots) {
    const select = document.getElementById('console-bot-select');
    select.innerHTML = '<option value="">Select a bot</option>' +
        bots.map(bot => `<option value="${bot.name}">${bot.name} (${bot.status})</option>`).join('');
}

// Start a bot
async function startBot(botName) {
    try {
        const response = await fetch(`/api/bot/start/${botName}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            alert(`Bot "${botName}" started successfully!`);
            loadBots();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert('Failed to start bot: ' + error.message);
    }
}

// Stop a bot
async function stopBot(botName) {
    try {
        const response = await fetch(`/api/bot/stop/${botName}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            alert(`Bot "${botName}" stopped successfully!`);
            loadBots();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert('Failed to stop bot: ' + error.message);
    }
}

// Upload bot via modal
async function uploadBotViaModal() {
    const botName = document.getElementById('modal-bot-name').value;
    const startupCmd = document.getElementById('modal-startup-cmd').value;
    const fileInput = document.getElementById('modal-bot-file');
    
    if (!botName) {
        alert('Please enter a bot name');
        return;
    }
    
    if (!fileInput.files[0]) {
        alert('Please select a ZIP file');
        return;
    }
    
    await uploadBotFile(botName, startupCmd, fileInput.files[0]);
}

// Upload bot file
async function uploadBotFile(botName, startupCmd, file) {
    const formData = new FormData();
    formData.append('botName', botName);
    formData.append('startupCommand', startupCmd);
    formData.append('botFile', file);
    
    try {
        const response = await fetch('/api/upload-bot', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.success) {
            alert('Bot deployed successfully!');
            closeDeployModal();
            loadBots();
            showSection('bots');
        } else {
            alert(`Deployment failed: ${data.error}`);
        }
    } catch (error) {
        alert('Upload failed: ' + error.message);
    }
}

// View bot logs
function viewBotLogs(botName) {
    showSection('console');
    document.getElementById('console-bot-select').value = botName;
    loadBotLogs();
}

// Load bot logs
async function loadBotLogs() {
    const botName = document.getElementById('console-bot-select').value;
    if (!botName) return;
    
    try {
        const response = await fetch(`/api/bot/logs/${botName}`);
        const data = await response.json();
        
        if (data.success) {
            const consoleOutput = document.getElementById('console-output');
            consoleOutput.innerHTML = `<div class="log-entry">=== Logs for ${botName} ===</div>`;
            
            const logs = data.logs.split('\n');
            logs.forEach(log => {
                if (log.trim()) {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry';
                    logEntry.textContent = log;
                    consoleOutput.appendChild(logEntry);
                }
            });
            
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

// Delete bot
async function deleteBot(botName) {
    if (!confirm(`Are you sure you want to delete "${botName}"?`)) return;
    
    try {
        const response = await fetch(`/api/bot/${botName}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            alert('Bot deleted successfully!');
            loadBots();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert('Failed to delete bot: ' + error.message);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadBots();
    
    // Auto-refresh logs every 5 seconds if console is open
    setInterval(() => {
        if (document.getElementById('console-section').style.display !== 'none') {
            loadBotLogs();
        }
    }, 5000);
});