// server.js - Archivo principal del servidor

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const socketIo = require('socket.io');
const http = require('http');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const chatRoutes = require('./routes/chat');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/circulapp', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB conectado'))
.catch(err => console.error('❌ Error conectando a MongoDB:', err));

// Socket.io para chat en tiempo real
require('./socket/chatSocket')(io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/reviews', authMiddleware, reviewRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: '🌱 Circulapp API - Plataforma de Economía Circular',
        version: '1.0.0',
        documentation: '/api/docs',
        health: '/health'
    });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        message: 'Ruta no encontrada',
        path: req.originalUrl 
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`
🚀 Servidor Circulapp iniciado
📍 Puerto: ${PORT}
🌐 URL: http://localhost:${PORT}
🏥 Health: http://localhost:${PORT}/health
🔧 Entorno: ${process.env.NODE_ENV || 'development'}
⏰ Tiempo: ${new Date().toLocaleString()}
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Recibida señal SIGTERM, cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        mongoose.connection.close(false, () => {
        console.log('✅ Conexión MongoDB cerrada');
        process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('🛑 Recibida señal SIGINT, cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        mongoose.connection.close(false, () => {
        console.log('✅ Conexión MongoDB cerrada');
        process.exit(0);
        });
    });
});

module.exports = app;