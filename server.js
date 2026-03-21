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
    let data = await fs.readFile(filePath, 'utf-8');
    // Remove BOM if present
    data = data.replace(/^\uFEFF/, '');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to load ${filename}: ${error.message}`);
  }
}

/**
 * Load a topic file from the topics directory
 * @param {string} topicId} - Topic identifier (e.g., 'atomic-structure')
 * @param {string} subject - Subject name (chem, bio, phy)
 * @returns {Promise<object>} Full topic data
 */
async function loadTopic(topicId, subject) {
  const filename = `${topicId}.json`;
  const filePath = path.join(__dirname, 'data', 'topics', subject, filename);
  let data = await fs.readFile(filePath, 'utf-8');
  // Remove BOM if present
  data = data.replace(/^\uFEFF/, '');
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
    const data = await loadJsonFile('subjects.json');
    const subjects = data.subjects || data;
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
    const data = await loadJsonFile('subjects.json');
    const subjects = data.subjects || data;
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
    
    const data = await loadJsonFile('subjects.json');
    const subjects = data.subjects || data;
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
    const data = await loadJsonFile('past-papers.json');
    let papers = data.papers || data;
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
// IN-MEMORY USER DATA STORE
// ============================================================================

/**
 * In-memory user data storage
 * In production, this would be a database with persistent storage
 * For now, data persists during the server session
 */
const users = {};

function getOrCreateUser(userId = 'default-user') {
  if (!users[userId]) {
    users[userId] = {
      userId,
      createdAt: new Date().toISOString(),
      progress: {}, // { topicId: { subject, confidence, isComplete, quizScore, completedAt } }
      stats: {
        totalTopicsCompleted: 0,
        totalQuizzesCompleted: 0,
        averageQuizScore: 0,
        streak: 0,
        xp: 0,
        totalMinutesStudied: 0,
        lastActiveAt: new Date().toISOString()
      },
      weakTopics: [], // Topics with low scores
      learningPath: [] // Recommended topics based on performance
    };
  }
  return users[userId];
}

// ============================================================================
// ROUTES: USER PROGRESS
// ============================================================================

/**
 * POST /api/user/progress
 * Save/update user progress for a topic
 * Body: { topicId, subject, confidence, isComplete, quizScore }
 */
app.post('/api/user/progress', async (req, res, next) => {
  try {
    const { topicId, subject, confidence, isComplete, quizScore } = req.body;
    const userId = req.headers['x-user-id'] || 'default-user';
    
    if (!topicId || !subject) {
      return res.status(400).json({
        success: false,
        error: 'topicId and subject are required'
      });
    }
    
    const user = getOrCreateUser(userId);
    
    // Save progress
    user.progress[topicId] = {
      topicId,
      subject,
      confidence: confidence ?? 0,
      isComplete: isComplete ?? false,
      quizScore: quizScore ?? null,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Update stats if topic is complete
    if (isComplete) {
      if (!user.progress[topicId].wasComplete) {
        user.stats.totalTopicsCompleted++;
      }
    }
    
    if (quizScore !== null && quizScore !== undefined) {
      user.stats.totalQuizzesCompleted++;
      // Update average score
      const totalScore = Object.values(user.progress)
        .filter(p => p.quizScore !== null)
        .reduce((sum, p) => sum + p.quizScore, 0);
      const count = Object.values(user.progress).filter(p => p.quizScore !== null).length;
      user.stats.averageQuizScore = count > 0 ? totalScore / count : 0;
    }
    
    user.stats.lastActiveAt = new Date().toISOString();
    
    res.json({
      success: true,
      message: 'Progress saved',
      data: user.progress[topicId]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/user/progress
 * Get all user progress
 */
app.get('/api/user/progress', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || 'default-user';
    const user = getOrCreateUser(userId);
    
    res.json({
      success: true,
      data: {
        progress: user.progress,
        stats: user.stats,
        totalProgressed: Object.keys(user.progress).length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/user/progress/:topicId
 * Get progress for specific topic
 */
app.get('/api/user/progress/:topicId', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || 'default-user';
    const { topicId } = req.params;
    const user = getOrCreateUser(userId);
    
    const progress = user.progress[topicId];
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'No progress found for this topic',
        topicId
      });
    }
    
    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ROUTES: USER STATS & ANALYTICS
// ============================================================================

/**
 * GET /api/user/stats
 * Get user statistics and learning metrics
 */
app.get('/api/user/stats', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || 'default-user';
    const user = getOrCreateUser(userId);
    
    // Calculate weak topics (average score < 60%)
    const weakTopics = Object.entries(user.progress)
      .filter(([_, p]) => p.quizScore !== null && p.quizScore < 60)
      .map(([id, p]) => ({
        topicId: id,
        subject: p.subject,
        score: p.quizScore,
        confidence: p.confidence
      }))
      .sort((a, b) => a.score - b.score);
    
    // Calculate completion rate
    const completionRate = Object.keys(user.progress).length > 0
      ? (Object.values(user.progress).filter(p => p.isComplete).length / Object.keys(user.progress).length) * 100
      : 0;
    
    res.json({
      success: true,
      data: {
        ...user.stats,
        completionRate: Math.round(completionRate),
        weakTopics,
        topicsProgressed: Object.keys(user.progress).length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/user/stats/update
 * Update user stats (XP, streak, study time)
 * Body: { xpGain, addToStreak, minutesStudied }
 */
app.post('/api/user/stats/update', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || 'default-user';
    const { xpGain, addToStreak, minutesStudied } = req.body;
    const user = getOrCreateUser(userId);
    
    if (xpGain) user.stats.xp += xpGain;
    if (addToStreak) user.stats.streak += 1;
    if (minutesStudied) user.stats.totalMinutesStudied += minutesStudied;
    
    user.stats.lastActiveAt = new Date().toISOString();
    
    res.json({
      success: true,
      message: 'Stats updated',
      data: user.stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/user/analytics
 * Get detailed learning analytics
 */
app.get('/api/user/analytics', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || 'default-user';
    const user = getOrCreateUser(userId);
    
    // Group progress by subject
    const bySubject = {};
    Object.values(user.progress).forEach(p => {
      if (!bySubject[p.subject]) {
        bySubject[p.subject] = {
          subject: p.subject,
          topicsCompleted: 0,
          averageScore: 0,
          averageConfidence: 0,
          topics: []
        };
      }
      if (p.isComplete) bySubject[p.subject].topicsCompleted++;
      bySubject[p.subject].topics.push({
        topicId: p.topicId,
        score: p.quizScore,
        confidence: p.confidence
      });
    });
    
    // Calculate averages by subject
    Object.values(bySubject).forEach(subject => {
      const scores = subject.topics.filter(t => t.score !== null).map(t => t.score);
      const confidences = subject.topics.map(t => t.confidence);
      subject.averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      subject.averageConfidence = confidences.length > 0 ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;
    });
    
    res.json({
      success: true,
      data: {
        bySubject,
        overallStats: user.stats,
        learningInsights: {
          bestSubject: Object.entries(bySubject).sort((a, b) => b[1].averageScore - a[1].averageScore)[0]?.[0] || null,
          needsWork: Object.entries(bySubject).sort((a, b) => a[1].averageScore - b[1].averageScore)[0]?.[0] || null,
          confidenceLevel: user.stats.totalQuizzesCompleted > 0 ? 'Moderate' : 'Low'
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ROUTES: ADVANCED SEARCH & FILTERING
// ============================================================================

/**
 * GET /api/papers/advanced
 * Advanced filtering for past papers
 * Query: ?subject=chem&year=2025&session=May/June&difficulty=High&limit=20
 */
app.get('/api/papers/advanced', async (req, res, next) => {
  try {
    const data = await loadJsonFile('past-papers.json');
    let papers = data.papers || data;
    const { subject, year, session, difficulty, limit, sortBy } = req.query;
    
    // Apply filters
    if (subject) papers = papers.filter(p => p.subject === subject);
    if (year) papers = papers.filter(p => p.year === parseInt(year));
    if (session) papers = papers.filter(p => p.session === session);
    if (difficulty) papers = papers.filter(p => p.difficulty === difficulty);
    
    // Sort
    if (sortBy === 'year-desc') {
      papers.sort((a, b) => b.year - a.year);
    } else if (sortBy === 'year-asc') {
      papers.sort((a, b) => a.year - b.year);
    } else if (sortBy === 'difficulty') {
      const difficultyOrder = { 'Low': 1, 'Medium': 2, 'High': 3 };
      papers.sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]);
    }
    
    // Limit results
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const paginated = papers.slice(0, limitNum);
    
    res.json({
      success: true,
      data: paginated,
      count: paginated.length,
      totalAvailable: papers.length,
      filters: { subject, year, session, difficulty }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/topics/advanced-search
 * Advanced search with multiple filters
 * Query: ?q=atomic&subject=chem&difficulty=medium&includeNotes=true&limit=10
 */
app.get('/api/topics/advanced-search', async (req, res, next) => {
  try {
    const { q, subject, limit } = req.query;
    const query = q?.toLowerCase();
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }
    
    const data = await loadJsonFile('subjects.json');
    const subjects = data.subjects || data;
    const results = [];
    
    // Advanced search through all topics
    for (const subj of subjects) {
      if (subject && subj.id !== subject) continue;
      
      for (const unit of subj.units || []) {
        for (const topic of unit.topics || []) {
          const matchesQuery = topic.name.toLowerCase().includes(query) ||
                              topic.id.toLowerCase().includes(query);
          
          if (matchesQuery) {
            results.push({
              subjectId: subj.id,
              subjectName: subj.name,
              unitName: unit.name,
              topicId: topic.id,
              topicName: topic.name,
              topicFile: topic.file,
              relevance: query.length / Math.max(topic.name.length, topic.id.length)
            });
          }
        }
      }
    }
    
    // Sort by relevance
    results.sort((a, b) => b.relevance - a.relevance);
    
    // Limit results
    const limitNum = Math.min(parseInt(limit) || 10, 50);
    const paginated = results.slice(0, limitNum);
    
    res.json({
      success: true,
      query,
      data: paginated,
      count: paginated.length,
      totalMatches: results.length
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
