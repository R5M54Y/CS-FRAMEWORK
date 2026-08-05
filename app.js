'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs-extra');
const dotenv = require('dotenv');

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

const config = require('./config');
const { logger } = require('./utils/logger');
const sessionManager = require('./core/session-manager');
const { migrateAll } = require('./core/db-migrate');
const { setupSocketIO } = require('./services/socket');
const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');
const { errorHandler, requestLogger, corsHandler } = require('./middleware');

// Create Express app
const app = express();
const server = http.createServer(app);

// Setup Socket.IO
const io = setupSocketIO(server);

// View engine
app.set('view engine', 'ejs');
app.set('views', config.viewsPath);

// Trust proxy
app.set('trust proxy', true);

// Middleware
app.use(corsHandler);
app.use(requestLogger);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (must be BEFORE routes)
app.use(express.static(config.publicPath, { maxAge: '1h' }));
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist')));
// Dropzone.js static files
app.use('/node_modules/dropzone/dist/min', express.static(path.join(__dirname, 'node_modules', 'dropzone', 'dist', 'min')));

// Routes
app.use('/api', apiRoutes);
app.use('/', webRoutes);

// Error handling
app.use(errorHandler);

// Health check (before routes)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        sessions: sessionManager.getAllSessions().length
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Not Found',
        message: 'The page you are looking for does not exist.',
        status: 404
    });
});

// Graceful shutdown
async function shutdown() {
    logger.info('Shutting down...');
    
    // Disconnect all sessions
    await sessionManager.shutdown();
    
    // Close HTTP server
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
    
    // Force exit after 10s
    setTimeout(() => {
        logger.error('Force exit after timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`);
    shutdown();
});
process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
});

// Start server
async function start() {
    try {
        // Ensure all directories exist
        const dirs = [
            config.dataPath,
            config.sessionsPath,
            config.logsPath,
            config.tempPath,
            path.join(config.dataPath, 'profiles'),
            path.join(config.dataPath, 'personas'),
            path.join(config.dataPath, 'products'),
            path.join(config.dataPath, 'knowledge'),
            path.join(config.dataPath, 'settings'),
            path.join(config.dataPath, 'sessions'),
            path.join(config.viewsPath, 'partials'),
            config.publicPath,
            path.join(config.publicPath, 'css'),
            path.join(config.publicPath, 'js')
        ];
        
        for (const dir of dirs) {
            fs.ensureDirSync(dir);
        }

        server.listen(config.port, config.host, async () => {
            logger.info(`
╔═══════════════════════════════════════════════════════════╗
║  WhatsApp CS Framework v1.0.0                             ║
║  Running on http://${config.host}:${config.port}                            ║
║  Environment: ${config.nodeEnv}                                    ║
╚═══════════════════════════════════════════════════════════╝
            `);
            
            // Run database migration (idempotent)
            await migrateAll();
            logger.info('Database migration completed');

            // Auto-connect sessions if configured
            sessionManager.autoConnectAll().catch(err => {
              logger.warn(`Auto-connect failed: ${err.message}`);
            });
        });
    } catch (err) {
        logger.error(`Failed to start: ${err.message}`);
        process.exit(1);
    }
}

start();