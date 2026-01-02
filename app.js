const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./server/routes/auth');
const userRoutes = require('./server/routes/users');
const recipeRoutes = require('./server/routes/recipes');
const { initializeDatabase } = require('./server/database/init');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (uploaded videos and images)
app.use('/uploads', express.static(path.join(__dirname, 'server/uploads')));

// Serve React build files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
}

// Initialize database
initializeDatabase();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/recipes', recipeRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ message: 'Receipegram API is running!', status: 'ok' });
});

// Root endpoint for basic connectivity test
app.get('/', (req, res) => {
  if (process.env.NODE_ENV === 'production' && require('fs').existsSync(path.join(__dirname, 'client/build/index.html'))) {
    res.sendFile(path.join(__dirname, 'client/build/index.html'));
  } else {
    res.json({
      message: 'Receipegram - Recipe Sharing Platform',
      status: 'running',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth',
        users: '/api/users',
        recipes: '/api/recipes'
      }
    });
  }
});

// Catch-all handler for React SPA in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    if (require('fs').existsSync(path.join(__dirname, 'client/build/index.html'))) {
      res.sendFile(path.join(__dirname, 'client/build/index.html'));
    } else {
      res.status(404).json({ message: 'React build not found. Run npm run build first.' });
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Receipegram server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});
