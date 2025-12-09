const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const unzipper = require('unzipper');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));

const BOTS_DIR = path.join(__dirname, 'bots');

// Ensure bots directory exists
if (!fs.existsSync(BOTS_DIR)) {
    fs.mkdirSync(BOTS_DIR, { recursive: true });
}

// API: Get all bots
app.get('/api/bots', (req, res) => {
    try {
        const bots = [];
        const botFolders = fs.readdirSync(BOTS_DIR);
        
        botFolders.forEach(folder => {
            const botPath = path.join(BOTS_DIR, folder);
            if (fs.statSync(botPath).isDirectory()) {
                const configPath = path.join(botPath, 'bot-config.json');
                let config = { name: folder, status: 'stopped' };
                
                if (fs.existsSync(configPath)) {
                    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                }
                
                // Check if bot is running
                const pidPath = path.join(botPath, 'bot.pid');
                if (fs.existsSync(pidPath)) {
                    const pid = fs.readFileSync(pidPath, 'utf8');
                    try {
                        process.kill(pid, 0);
                        config.status = 'running';
                    } catch {
                        config.status = 'stopped';
                    }
                }
                
                bots.push(config);
            }
        });
        
        res.json({ success: true, bots });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Upload bot ZIP
app.post('/api/upload-bot', (req, res) => {
    if (!req.files || !req.files.botFile) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    const botFile = req.files.botFile;
    const botName = req.body.botName || `bot-${Date.now()}`;
    const botPath = path.join(BOTS_DIR, botName);
    
    // Create bot directory
    if (!fs.existsSync(botPath)) {
        fs.mkdirSync(botPath, { recursive: true });
    }
    
    // Save uploaded file
    const zipPath = path.join(botPath, 'uploaded.zip');
    botFile.mv(zipPath, async (err) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        
        try {
            // Extract ZIP
            await fs.createReadStream(zipPath)
                .pipe(unzipper.Extract({ path: botPath }))
                .promise();
            
            // Delete ZIP after extraction
            fs.unlinkSync(zipPath);
            
            // Create default config
            const config = {
                name: botName,
                status: 'stopped',
                createdAt: new Date().toISOString(),
                startupCommand: 'node index.js',
                port: 3000 + Math.floor(Math.random() * 1000)
            };
            
            fs.writeFileSync(
                path.join(botPath, 'bot-config.json'),
                JSON.stringify(config, null, 2)
            );
            
            res.json({ 
                success: true, 
                message: 'Bot uploaded successfully',
                bot: config
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// API: Start bot
app.post('/api/bot/start/:botName', (req, res) => {
    const botName = req.params.botName;
    const botPath = path.join(BOTS_DIR, botName);
    
    if (!fs.existsSync(botPath)) {
        return res.status(404).json({ success: false, error: 'Bot not found' });
    }
    
    const configPath = path.join(botPath, 'bot-config.json');
    if (!fs.existsSync(configPath)) {
        return res.status(400).json({ success: false, error: 'Bot config missing' });
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Change to bot directory and start
    const botProcess = spawn(config.startupCommand.split(' ')[0], 
        config.startupCommand.split(' ').slice(1), {
            cwd: botPath,
            stdio: ['pipe', 'pipe', 'pipe']
        });
    
    // Save PID
    const pidPath = path.join(botPath, 'bot.pid');
    fs.writeFileSync(pidPath, botProcess.pid.toString());
    
    // Update config
    config.status = 'running';
    config.pid = botProcess.pid;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    // Log file
    const logPath = path.join(botPath, 'logs.txt');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    
    botProcess.stdout.on('data', (data) => {
        logStream.write(`[${new Date().toISOString()}] ${data}`);
    });
    
    botProcess.stderr.on('data', (data) => {
        logStream.write(`[${new Date().toISOString()}] ERROR: ${data}`);
    });
    
    res.json({ 
        success: true, 
        message: 'Bot started successfully',
        pid: botProcess.pid
    });
});

// API: Stop bot
app.post('/api/bot/stop/:botName', (req, res) => {
    const botName = req.params.botName;
    const botPath = path.join(BOTS_DIR, botName);
    const pidPath = path.join(botPath, 'bot.pid');
    
    if (!fs.existsSync(pidPath)) {
        return res.status(400).json({ success: false, error: 'Bot is not running' });
    }
    
    try {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf8'));
        process.kill(pid, 'SIGTERM');
        
        // Update config
        const configPath = path.join(botPath, 'bot-config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config.status = 'stopped';
        delete config.pid;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        // Remove PID file
        fs.unlinkSync(pidPath);
        
        res.json({ success: true, message: 'Bot stopped successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get bot logs
app.get('/api/bot/logs/:botName', (req, res) => {
    const botName = req.params.botName;
    const botPath = path.join(BOTS_DIR, botName);
    const logPath = path.join(botPath, 'logs.txt');
    
    if (fs.existsSync(logPath)) {
        const logs = fs.readFileSync(logPath, 'utf8');
        res.json({ success: true, logs });
    } else {
        res.json({ success: true, logs: 'No logs available' });
    }
});

// API: Delete bot
app.delete('/api/bot/:botName', (req, res) => {
    const botName = req.params.botName;
    const botPath = path.join(BOTS_DIR, botName);
    
    // Stop if running
    const pidPath = path.join(botPath, 'bot.pid');
    if (fs.existsSync(pidPath)) {
        try {
            const pid = parseInt(fs.readFileSync(pidPath, 'utf8'));
            process.kill(pid, 'SIGTERM');
        } catch (error) {
            // Ignore if process not found
        }
    }
    
    // Delete folder
    if (fs.existsSync(botPath)) {
        fs.rmSync(botPath, { recursive: true, force: true });
        res.json({ success: true, message: 'Bot deleted successfully' });
    } else {
        res.status(404).json({ success: false, error: 'Bot not found' });
    }
});

// API: Update bot config
app.put('/api/bot/config/:botName', (req, res) => {
    const botName = req.params.botName;
    const botPath = path.join(BOTS_DIR, botName);
    const configPath = path.join(botPath, 'bot-config.json');
    
    if (!fs.existsSync(configPath)) {
        return res.status(404).json({ success: false, error: 'Config not found' });
    }
    
    const oldConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const newConfig = { ...oldConfig, ...req.body };
    
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    
    res.json({ success: true, config: newConfig });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp Bot Panel running on http://localhost:${PORT}`);
});