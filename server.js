/**
 * Study Platform Backend Server
 * Production-ready Express.js server for Render deployment
 * 
 * Features:
 * - CORS enabled for frontend communication
 * - Global error handling
 * - Database connection placeholder
 * - Comprehensive API routes for topics, subjects, community, and user data
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Serve static files (CSS, JS, HTML, images, etc.)
app.use(express.static(path.join(__dirname)));

// CORS configuration for frontend origin
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON request bodies
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// DATABASE CONNECTION (Placeholder)
// ============================================================================

/**
 * Initialize database connection
 * Currently loads JSON files from disk; can be replaced with MongoDB/PostgreSQL
 */
async function initializeDatabase() {
  try {
    console.log('📦 Loading data files...');
    
    // In production, replace this with actual database connection
    // Example MongoDB:
    // const mongoose = require('mongoose');
    // await mongoose.connect(process.env.MONGODB_URI);
    
    // Example PostgreSQL:
    // const { Pool } = require('pg');
    // const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    console.log('✅ Database ready (using JSON files)');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Load JSON file from data directory
 * @param {string} filename - Name of the JSON file
 * @returns {Promise<object>} Parsed JSON data
 */
async function loadJsonFile(filename) {
  try {
    const filePath = path.join(__dirname, 'data', filename);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to load ${filename}: ${error.message}`);
  }
}

/**
 * Load a topic file from the topics directory
 * @param {string} topicId - Topic identifier (e.g., 'atomic-structure')
 * @param {string} subject - Subject name (chem, bio, phy)
 * @returns {Promise<object>} Full topic data
 */
async function loadTopic(topicId, subject) {
  const filename = `${topicId}.json`;
  const filePath = path.join(__dirname, 'data', 'topics', subject, filename);
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

// ============================================================================
// ============================================================================
// ROUTES: SUBJECTS & TOPICS
// ============================================================================

/**
 * GET /api/subjects
 * Get all subjects with units and topics
 */
app.get('/api/subjects', async (req, res, next) => {
  try {
    const subjects = await loadJsonFile('subjects.json');
    res.json({
      success: true,
      data: subjects,
      count: subjects.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subjects/:subjectId
 * Get single subject with all topics
 */
app.get('/api/subjects/:subjectId', async (req, res, next) => {
  try {
    const subjects = await loadJsonFile('subjects.json');
    const subject = subjects.find(s => s.id === req.params.subjectId);
    
    if (!subject) {
      return res.status(404).json({
        success: false,
        error: 'Subject not found',
        subjectId: req.params.subjectId
      });
    }
    
    res.json({
      success: true,
      data: subject
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/topics/:topicId
 * Get complete topic data
 * Query params: ?subject=chem|bio|phy (required for file location)
 */
app.get('/api/topics/:topicId', async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const { subject } = req.query;
    
    if (!subject || !['chem', 'bio', 'phy'].includes(subject)) {
      return res.status(400).json({
        success: false,
        error: 'Subject parameter required: chem, bio, or phy'
      });
    }
    
    const topic = await loadTopic(topicId, subject);
    res.json({
      success: true,
      data: topic
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({
        success: false,
        error: 'Topic not found',
        topicId: req.params.topicId
      });
    } else {
      next(error);
    }
  }
});

/**
 * GET /api/topics/:topicId/quiz
 * Get just the quiz section of a topic
 */
app.get('/api/topics/:topicId/quiz', async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const { subject } = req.query;
    
    if (!subject || !['chem', 'bio', 'phy'].includes(subject)) {
      return res.status(400).json({
        success: false,
        error: 'Subject parameter required'
      });
    }
    
    const topic = await loadTopic(topicId, subject);
    res.json({
      success: true,
      data: {
        topicId,
        topicName: topic.concept,
        quiz: topic.quiz || []
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/topics/:topicId/flashcards
 * Get flashcard data for a topic
 */
app.get('/api/topics/:topicId/flashcards', async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const { subject } = req.query;
    
    if (!subject || !['chem', 'bio', 'phy'].includes(subject)) {
      return res.status(400).json({
        success: false,
        error: 'Subject parameter required'
      });
    }
    
    const topic = await loadTopic(topicId, subject);
    res.json({
      success: true,
      data: {
        topicId,
        topicName: topic.concept,
        flashcards: topic.flashcards || [],
        recall: topic.recall || []
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/topics/search
 * Search topics by keyword across all subjects
 * Query: ?q=keyword
 */
app.get('/api/topics/search', async (req, res, next) => {
  try {
    const query = req.query.q?.toLowerCase();
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }
    
    const subjects = await loadJsonFile('subjects.json');
    const results = [];
    
    // Search through topics in subjects
    for (const subject of subjects) {
      for (const unit of subject.units || []) {
        for (const topic of unit.topics || []) {
          if (topic.name.toLowerCase().includes(query) ||
              topic.id.toLowerCase().includes(query)) {
            results.push({
              subjectId: subject.id,
              subjectName: subject.name,
              unitName: unit.name,
              topicId: topic.id,
              topicName: topic.name
            });
          }
        }
      }
    }
    
    res.json({
      success: true,
      query,
      results,
      count: results.length
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ROUTES: PAST PAPERS
// ============================================================================

/**
 * GET /api/past-papers
 * Get past papers with optional filtering
 * Query: ?subject=chem&year=2020&session=summer
 */
app.get('/api/past-papers', async (req, res, next) => {
  try {
    let papers = await loadJsonFile('past-papers.json');
    const { subject, year, session } = req.query;
    
    // Apply filters
    if (subject) {
      papers = papers.filter(p => p.subject === subject);
    }
    if (year) {
      papers = papers.filter(p => p.year === parseInt(year));
    }
    if (session) {
      papers = papers.filter(p => p.session === session);
    }
    
    res.json({
      success: true,
      data: papers,
      count: papers.length,
      filters: { subject, year, session }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ROUTES: COMMUNITY
// ============================================================================

/**
 * GET /api/community
 * Get complete community data (forum threads + chat channels)
 */
app.get('/api/community', async (req, res, next) => {
  try {
    const community = await loadJsonFile('community.json');
    res.json({
      success: true,
      data: {
        forumThreads: community.forumThreads || [],
        chatChannels: community.chatChannels || []
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/community/forum
 * Get all forum threads with optional filtering
 * Query: ?subject=chem&limit=10&sort=recent
 */
app.get('/api/community/forum', async (req, res, next) => {
  try {
    const community = await loadJsonFile('community.json');
    let threads = community.forumThreads || [];
    
    const { subject, limit, sort } = req.query;
    
    // Filter by subject
    if (subject) {
      threads = threads.filter(t => t.subject === subject);
    }
    
    // Sort
    if (sort === 'recent') {
      threads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'popular') {
      threads.sort((a, b) => b.replyCount - a.replyCount);
    }
    
    // Limit results
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    threads = threads.slice(0, limitNum);
    
    res.json({
      success: true,
      data: threads,
      count: threads.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/community/forum/:threadId
 * Get single forum thread with replies
 */
app.get('/api/community/forum/:threadId', async (req, res, next) => {
  try {
    const community = await loadJsonFile('community.json');
    const thread = community.forumThreads?.find(t => t.id === req.params.threadId);
    
    if (!thread) {
      return res.status(404).json({
        success: false,
        error: 'Thread not found'
      });
    }
    
    res.json({
      success: true,
      data: thread
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/community/chat/channels
 * Get all chat channels
 */
app.get('/api/community/chat/channels', async (req, res, next) => {
  try {
    const community = await loadJsonFile('community.json');
    const channels = community.chatChannels || [];
    
    res.json({
      success: true,
      data: channels.map(c => ({
        id: c.id,
        name: c.name,
        messageCount: c.messages?.length || 0
      })),
      count: channels.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/community/chat/:channelId/messages
 * Get messages from specific channel
 */
app.get('/api/community/chat/:channelId/messages', async (req, res, next) => {
  try {
    const community = await loadJsonFile('community.json');
    const channel = community.chatChannels?.find(c => c.id === req.params.channelId);
    
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found'
      });
    }
    
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const messages = (channel.messages || []).slice(-limit);
    
    res.json({
      success: true,
      channelId: req.params.channelId,
      channelName: channel.name,
      data: messages,
      count: messages.length
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ROUTES: USER PROGRESS (Placeholder for future database)
// ============================================================================

/**
 * POST /api/user/progress
 * Save user progress (requires authentication in production)
 */
app.post('/api/user/progress', async (req, res, next) => {
  try {
    const { topicId, subject, confidence, isComplete, quizScore } = req.body;
    
    // TODO: Save to database
    // In production, validate user token and save to DB
    
    res.json({
      success: true,
      message: 'Progress saved',
      data: {
        topicId,
        subject,
        confidence,
        isComplete,
        quizScore,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/user/progress
 * Get user's learning progress (requires authentication)
 */
app.get('/api/user/progress', async (req, res, next) => {
  try {
    // TODO: Retrieve from database for authenticated user
    res.json({
      success: true,
      data: {
        message: 'User progress endpoint - database integration required'
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ROUTES: EDITOR (for topic creation/editing)
// ============================================================================

/**
 * POST /api/topics
 * Create new topic (requires authentication and validation)
 */
app.post('/api/topics', async (req, res, next) => {
  try {
    const { topicId, subject, data } = req.body;
    
    // TODO: Validate user permissions
    // TODO: Save to database and file system
    
    res.status(201).json({
      success: true,
      message: 'Topic created',
      data: {
        topicId,
        subject,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/topics/:topicId
 * Update existing topic (requires authentication)
 */
app.put('/api/topics/:topicId', async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const { subject, data } = req.body;
    
    // TODO: Validate user permissions
    // TODO: Update in database and file system
    
    res.json({
      success: true,
      message: 'Topic updated',
      data: {
        topicId,
        subject,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/topics/:topicId
 * Delete topic (requires authentication and admin role)
 */
app.delete('/api/topics/:topicId', async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const { subject } = req.query;
    
    // TODO: Verify admin permissions
    // TODO: Delete from database and file system
    
    res.json({
      success: true,
      message: 'Topic deleted',
      data: {
        topicId,
        subject
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Catch-all handler for frontend routing
 * Serves index.html for non-API routes (supports SPA routing)
 */
app.get('*', (req, res) => {
  // If it's an API route, return 404
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: 'API route not found',
      path: req.path,
      method: req.method
    });
  }
  
  // Serve index.html for all other routes (frontend SPA routing)
  res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * Global Error Handler
 * Catches all errors and returns appropriate response
 */
app.use((error, req, res, next) => {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
  
  // Default to 500 server error
  const statusCode = error.statusCode || 500;
  
  res.status(statusCode).json({
    success: false,
    error: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

/**
 * Start the server
 * Bind to 0.0.0.0 for Render and cloud deployments
 */
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Start listening
    app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('╔════════════════════════════════════════╗');
      console.log('║   Study Platform Backend Started       ║');
      console.log('╠════════════════════════════════════════╣');
      console.log(`║ Server: http://localhost:${PORT}${' '.repeat(22 - PORT.toString().length)}║`);
      console.log(`║ Environment: ${process.env.NODE_ENV || 'development'}${' '.repeat(24)}║`);
      console.log(`║ Database: ${process.env.DATABASE_TYPE || 'JSON Files'}${' '.repeat(26)}║`);
      console.log('╚════════════════════════════════════════╝');
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

module.exports = app;
