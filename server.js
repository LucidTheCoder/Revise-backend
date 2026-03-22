/**
 * Study Platform Backend Server
 * Express.js + Socket.io for real-time chat
 *
 * New in this version:
 *  - Socket.io real-time chat (channelId rooms)
 *  - Forum CRUD: create thread, reply, delete, upvote, pin, lock
 *  - Admin panel API: list users, promote/ban/delete, site stats
 *  - Chat message persistence in MongoDB
 */

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const dotenv     = require('dotenv');
const fs         = require('fs').promises;
const path       = require('path');
const { register, login, getMe, authenticateToken, requireAdmin, optionalAuth } = require('./auth');
const db         = require('./db');
const { handleUpload, uploadAvatar, uploadTopicImage, uploadPdf, deleteFile } = require('./uploads');

dotenv.config();

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5000;

// ============================================================================
// SOCKET.IO
// ============================================================================

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Track connected users per channel (channelId -> Set of socket info)
const channelUsers = {};

io.on('connection', (socket) => {
  console.log(`[Socket] connected: ${socket.id}`);

  // Join a channel room
  socket.on('join_channel', ({ channelId, user }) => {
    socket.join(channelId);
    socket.data.channelId = channelId;
    socket.data.user = user;
    if (!channelUsers[channelId]) channelUsers[channelId] = new Set();
    channelUsers[channelId].add(socket.id);
    io.to(channelId).emit('channel_users', channelUsers[channelId].size);
  });

  // Leave a channel
  socket.on('leave_channel', ({ channelId }) => {
    socket.leave(channelId);
    if (channelUsers[channelId]) {
      channelUsers[channelId].delete(socket.id);
      io.to(channelId).emit('channel_users', channelUsers[channelId].size);
    }
  });

  // Send a message
  socket.on('send_message', async ({ channelId, text, author, userId, token }) => {
    if (!text || !text.trim() || !channelId) return;

    // Basic auth check via token
    let verifiedAuthor = 'Anonymous';
    let verifiedUserId = null;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'change-this-in-production');
        const user = await db.findUserById(payload.sub);
        if (user && !user.banned) {
          verifiedAuthor = user.name;
          verifiedUserId = user._id;
        }
      } catch { /* invalid token, use anonymous */ }
    }

    const sanitized = text.trim().slice(0, 2000);
    const saved = await db.saveChatMessage({
      channelId,
      userId: verifiedUserId,
      author: verifiedAuthor,
      text: sanitized,
    });

    const messagePayload = {
      _id:       saved._id,
      channelId,
      author:    verifiedAuthor,
      text:      sanitized,
      createdAt: saved.createdAt,
    };

    io.to(channelId).emit('new_message', messagePayload);
  });

  // Typing indicator
  socket.on('typing', ({ channelId, author }) => {
    socket.to(channelId).emit('user_typing', { author });
  });

  socket.on('disconnect', () => {
    const cid = socket.data.channelId;
    if (cid && channelUsers[cid]) {
      channelUsers[cid].delete(socket.id);
      io.to(cid).emit('channel_users', channelUsers[cid].size);
    }
    console.log(`[Socket] disconnected: ${socket.id}`);
  });
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(express.static(path.join(__dirname)));

// ── Security headers (no external package needed) ─────────────────────────
app.use((req, res, next) => {
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Block clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Disable legacy XSS filter (can cause issues in modern browsers)
  res.setHeader('X-XSS-Protection', '0');
  // Only send referrer on same-origin requests
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Restrict powerful browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Basic CSP — tightened for API server (no inline scripts needed)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; frame-ancestors 'none';"
  );
  next();
});

// ── Simple in-memory rate limiter (no external package) ──────────────────
const _requestCounts = new Map();
setInterval(() => _requestCounts.clear(), 60_000); // reset every minute

function rateLimit(maxPerMinute) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const count = (_requestCounts.get(key) || 0) + 1;
    _requestCounts.set(key, count);
    if (count > maxPerMinute) {
      return res.status(429).json({ success: false, error: 'Too many requests — try again in a minute.' });
    }
    next();
  };
}

// Apply global rate limit (300 req/min per IP — generous for a study app)
app.use(rateLimit(300));

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests from the configured frontend URL, or any origin if not set
    const allowed = process.env.FRONTEND_URL;
    if (!allowed || !origin || origin === allowed) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' })); // reduced from 10mb — API payloads have no reason to be large

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

async function initializeDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await db.connectDB();
    console.log('✅ Database ready');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function loadJsonFile(filename) {
  const filePath = path.join(__dirname, 'data', filename);
  let data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data.replace(/^\uFEFF/, ''));
}

async function loadTopic(topicId, subject) {
  const filePath = path.join(__dirname, 'data', 'topics', subject, `${topicId}.json`);
  let data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data.replace(/^\uFEFF/, ''));
}

// ============================================================================
// ROUTES: AUTH
// ============================================================================

// Auth routes — stricter rate limit (10 req/min per IP)
app.post('/api/auth/register', rateLimit(10), register);
app.post('/api/auth/login',    rateLimit(10), login);
app.get('/api/auth/me',        authenticateToken, getMe);

// POST /api/auth/google — exchange Google access_token for app JWT
app.post('/api/auth/google', async (req, res, next) => {
  try {
    const { access_token } = req.body;
    if (!access_token) return res.status(400).json({ success: false, error: 'access_token required' });

    // Fetch user profile from Google
    const gRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    if (!gRes.ok) return res.status(401).json({ success: false, error: 'Invalid Google token' });
    const gUser = await gRes.json();

    const { email, name, picture } = gUser;
    if (!email) return res.status(400).json({ success: false, error: 'No email returned from Google' });

    // Find or create the user
    let user = await db.findUserByEmail(email);
    if (!user) {
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(Math.random().toString(36), 10);
      user = await db.createUser({
        name:         name || email.split('@')[0],
        email,
        passwordHash,
        role:         'student',
      });
    }

    // Issue our own JWT
    const jwt  = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'revise-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        _id:       user._id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        avatarUrl: picture || user.avatarUrl || null,
      }
    });
  } catch (e) { next(e); }
});


// POST /api/auth/discord — exchange Discord auth code for app JWT
app.post('/api/auth/discord', async (req, res, next) => {
  try {
    const { code, redirectUri } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'code required' });

    const clientId     = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(501).json({ success: false, error: 'Discord OAuth not configured on server. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.' });
    }

    // Exchange code for access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(401).json({ success: false, error: `Discord token exchange failed: ${err}` });
    }
    const { access_token } = await tokenRes.json();

    // Fetch Discord user profile
    const dRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!dRes.ok) return res.status(401).json({ success: false, error: 'Failed to fetch Discord profile' });
    const dUser = await dRes.json();

    const { email, username, global_name, avatar, id: discordId } = dUser;
    if (!email) return res.status(400).json({ success: false, error: 'Discord account has no verified email. Please verify your email on Discord first.' });

    const name      = global_name || username || `Discord User`;
    const avatarUrl = avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png` : null;

    // Find or create user
    let user = await db.findUserByEmail(email);
    if (!user) {
      const bcrypt      = require('bcryptjs');
      const passwordHash = await bcrypt.hash(Math.random().toString(36) + discordId, 10);
      user = await db.createUser({ name, email, passwordHash, role: 'student' });
    }
    if (avatarUrl && !user.avatarUrl) {
      await db.updateUserStats(user._id, { avatarUrl });
    }

    const jwt   = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'revise-secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, avatarUrl: avatarUrl || user.avatarUrl || null },
    });
  } catch (e) { next(e); }
});

// ============================================================================
// ROUTES: SUBJECTS & TOPICS
// ============================================================================

app.get('/api/subjects', async (req, res, next) => {
  try {
    const data     = await loadJsonFile('subjects.json');
    const subjects = data.subjects || data;
    res.json({ success: true, data: subjects, count: subjects.length });
  } catch (error) { next(error); }
});

app.get('/api/subjects/:subjectId', async (req, res, next) => {
  try {
    const data     = await loadJsonFile('subjects.json');
    const subjects = data.subjects || data;
    const subject  = subjects.find(s => s.id === req.params.subjectId);
    if (!subject) return res.status(404).json({ success: false, error: 'Subject not found' });
    res.json({ success: true, data: subject });
  } catch (error) { next(error); }
});

app.get('/api/topics/search', async (req, res, next) => {
  try {
    const query = req.query.q?.toLowerCase();
    if (!query || query.length < 2) return res.status(400).json({ success: false, error: 'Query too short' });
    const data = await loadJsonFile('subjects.json');
    const subjects = data.subjects || data;
    const results = [];
    for (const subject of subjects) {
      for (const unit of subject.units || []) {
        for (const topic of unit.topics || []) {
          if (topic.name.toLowerCase().includes(query) || topic.id.toLowerCase().includes(query)) {
            results.push({ subjectId: subject.id, subjectName: subject.name, unitName: unit.name, topicId: topic.id, topicName: topic.name });
          }
        }
      }
    }
    res.json({ success: true, query, results, count: results.length });
  } catch (error) { next(error); }
});

app.get('/api/topics/:topicId', async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const { subject } = req.query;
    if (!subject || !['chem', 'bio', 'phy'].includes(subject)) {
      return res.status(400).json({ success: false, error: 'subject param required: chem, bio, or phy' });
    }
    const topic = await loadTopic(topicId, subject);
    res.json({ success: true, data: topic });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ success: false, error: 'Topic not found' });
    next(error);
  }
});

app.get('/api/topics/:topicId/quiz', async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const { subject } = req.query;
    if (!subject || !['chem', 'bio', 'phy'].includes(subject)) return res.status(400).json({ success: false, error: 'subject param required' });
    const topic = await loadTopic(topicId, subject);
    res.json({ success: true, data: { topicId, topicName: topic.concept, quiz: topic.quiz || [] } });
  } catch (error) { next(error); }
});

app.get('/api/topics/:topicId/flashcards', async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const { subject } = req.query;
    if (!subject || !['chem', 'bio', 'phy'].includes(subject)) return res.status(400).json({ success: false, error: 'subject param required' });
    const topic = await loadTopic(topicId, subject);
    res.json({ success: true, data: { topicId, topicName: topic.concept, flashcards: topic.flashcards || [], recall: topic.recall || [] } });
  } catch (error) { next(error); }
});

// ============================================================================
// ROUTES: PAST PAPERS
// ============================================================================

app.get('/api/past-papers', async (req, res, next) => {
  try {
    const data = await loadJsonFile('past-papers.json');
    let papers = data.papers || data;
    const { subject, year, session } = req.query;
    if (subject) papers = papers.filter(p => p.subject === subject);
    if (year)    papers = papers.filter(p => p.year === parseInt(year));
    if (session) papers = papers.filter(p => p.session === session);
    res.json({ success: true, data: papers, count: papers.length });
  } catch (error) { next(error); }
});

// ============================================================================
// ROUTES: COMMUNITY — CHAT (REST for history)
// ============================================================================

// Static channel list (could be moved to DB later)
const CHANNELS = [
  { id: 'general',      name: 'General',      description: 'General study chat' },
  { id: 'chem-help',    name: 'Chem Help',    description: 'Chemistry questions' },
  { id: 'bio-help',     name: 'Bio Help',     description: 'Biology questions' },
  { id: 'phy-help',     name: 'Phy Help',     description: 'Physics questions' },
  { id: 'exam-planning',name: 'Exam Planning',description: 'Timetables & strategies' },
];

app.get('/api/community', async (req, res, next) => {
  try {
    const threads = await db.getForumThreads({ sort: 'pinned', limit: 50 });
    res.json({
      success: true,
      data: {
        forumThreads: threads,
        chatChannels: CHANNELS,
      }
    });
  } catch (error) { next(error); }
});

app.get('/api/community/chat/channels', (req, res) => {
  res.json({ success: true, data: CHANNELS });
});

app.get('/api/community/chat/:channelId/messages', async (req, res, next) => {
  try {
    const { channelId } = req.params;
    if (!CHANNELS.find(c => c.id === channelId)) {
      return res.status(404).json({ success: false, error: 'Channel not found' });
    }
    const limit    = Math.min(parseInt(req.query.limit) || 100, 500);
    const messages = await db.getChatMessages(channelId, limit);
    res.json({ success: true, channelId, data: messages });
  } catch (error) { next(error); }
});

// Admin: delete a chat message
app.delete('/api/community/chat/messages/:messageId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    await db.deleteChatMessage(req.params.messageId);
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) { next(error); }
});

// ============================================================================
// ROUTES: FORUM
// ============================================================================

// GET  /api/community/forum          – list threads (paginated)
app.get('/api/community/forum', async (req, res, next) => {
  try {
    const { subject, sort, limit, page } = req.query;
    const pageNum   = Math.max(1, parseInt(page) || 1);
    const pageSize  = Math.min(parseInt(limit) || 20, 100);
    const threads   = await db.getForumThreads({ subject, sort, limit: pageSize, skip: (pageNum - 1) * pageSize });
    const total     = await db.countForumThreads(subject ? { subject } : {});
    res.json({ success: true, data: threads, count: threads.length, total, page: pageNum, pageSize });
  } catch (error) { next(error); }
});

// POST /api/community/forum          – create thread (auth required)
app.post('/api/community/forum', authenticateToken, async (req, res, next) => {
  try {
    const { title, body, subject } = req.body;
    if (!title || !body || !subject) {
      return res.status(400).json({ success: false, error: 'title, body, and subject are required' });
    }
    if (!['chem', 'bio', 'phy', 'general'].includes(subject)) {
      return res.status(400).json({ success: false, error: 'subject must be chem, bio, phy, or general' });
    }
    if (title.length > 200) return res.status(400).json({ success: false, error: 'Title too long (max 200 chars)' });
    if (body.length > 5000) return res.status(400).json({ success: false, error: 'Body too long (max 5000 chars)' });

    const thread = await db.createForumThread({
      title: title.trim(),
      body: body.trim(),
      subject,
      author: req.user.name,
      authorId: req.user._id,
    });
    res.status(201).json({ success: true, message: 'Thread created', data: thread });
  } catch (error) { next(error); }
});

// GET  /api/community/forum/:threadId – get single thread
app.get('/api/community/forum/:threadId', async (req, res, next) => {
  try {
    const thread = await db.getForumThread(req.params.threadId);
    if (!thread) return res.status(404).json({ success: false, error: 'Thread not found' });
    res.json({ success: true, data: thread });
  } catch (error) { next(error); }
});

// PUT  /api/community/forum/:threadId – update thread (admin or author)
app.put('/api/community/forum/:threadId', authenticateToken, async (req, res, next) => {
  try {
    const thread = await db.getForumThread(req.params.threadId);
    if (!thread) return res.status(404).json({ success: false, error: 'Thread not found' });

    const isAdmin  = req.user.role === 'admin';
    const isAuthor = thread.authorId?.toString() === req.user._id?.toString();
    if (!isAdmin && !isAuthor) return res.status(403).json({ success: false, error: 'Not authorized' });

    const allowedUpdates = {};
    if (req.body.title) allowedUpdates.title = req.body.title.trim().slice(0, 200);
    if (req.body.body)  allowedUpdates.body  = req.body.body.trim().slice(0, 5000);
    if (isAdmin) {
      if (req.body.pinned  !== undefined) allowedUpdates.pinned  = !!req.body.pinned;
      if (req.body.locked  !== undefined) allowedUpdates.locked  = !!req.body.locked;
      if (req.body.subject !== undefined) allowedUpdates.subject = req.body.subject;
    }
    const updated = await db.updateForumThread(req.params.threadId, allowedUpdates);
    res.json({ success: true, message: 'Thread updated', data: updated });
  } catch (error) { next(error); }
});

// DELETE /api/community/forum/:threadId – delete thread (admin or author)
app.delete('/api/community/forum/:threadId', authenticateToken, async (req, res, next) => {
  try {
    const thread = await db.getForumThread(req.params.threadId);
    if (!thread) return res.status(404).json({ success: false, error: 'Thread not found' });

    const isAdmin  = req.user.role === 'admin';
    const isAuthor = thread.authorId?.toString() === req.user._id?.toString();
    if (!isAdmin && !isAuthor) return res.status(403).json({ success: false, error: 'Not authorized' });

    await db.deleteForumThread(req.params.threadId);
    res.json({ success: true, message: 'Thread deleted' });
  } catch (error) { next(error); }
});

// POST /api/community/forum/:threadId/replies – add reply (auth required)
app.post('/api/community/forum/:threadId/replies', authenticateToken, async (req, res, next) => {
  try {
    const thread = await db.getForumThread(req.params.threadId);
    if (!thread) return res.status(404).json({ success: false, error: 'Thread not found' });
    if (thread.locked && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Thread is locked' });
    }
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ success: false, error: 'body is required' });
    if (body.length > 2000) return res.status(400).json({ success: false, error: 'Reply too long (max 2000 chars)' });

    const updated = await db.addForumReply(req.params.threadId, {
      author:   req.user.name,
      authorId: req.user._id,
      body:     body.trim(),
    });
    res.status(201).json({ success: true, message: 'Reply added', data: updated });
  } catch (error) { next(error); }
});

// DELETE /api/community/forum/:threadId/replies/:replyId
app.delete('/api/community/forum/:threadId/replies/:replyId', authenticateToken, async (req, res, next) => {
  try {
    const thread = await db.getForumThread(req.params.threadId);
    if (!thread) return res.status(404).json({ success: false, error: 'Thread not found' });
    const reply = thread.replies?.find(r => r._id.toString() === req.params.replyId);
    if (!reply) return res.status(404).json({ success: false, error: 'Reply not found' });

    const isAdmin  = req.user.role === 'admin';
    const isAuthor = reply.authorId?.toString() === req.user._id?.toString();
    if (!isAdmin && !isAuthor) return res.status(403).json({ success: false, error: 'Not authorized' });

    const updated = await db.deleteForumReply(req.params.threadId, req.params.replyId);
    res.json({ success: true, message: 'Reply deleted', data: updated });
  } catch (error) { next(error); }
});

// POST /api/community/forum/:threadId/upvote
app.post('/api/community/forum/:threadId/upvote', authenticateToken, async (req, res, next) => {
  try {
    const updated = await db.upvoteThread(req.params.threadId);
    if (!updated) return res.status(404).json({ success: false, error: 'Thread not found' });
    res.json({ success: true, upvotes: updated.upvotes });
  } catch (error) { next(error); }
});

// ============================================================================
// ROUTES: USER PROGRESS & STATS
// ============================================================================

app.post('/api/user/progress', authenticateToken, async (req, res, next) => {
  try {
    const { topicId, subject, confidence, isComplete, quizScore } = req.body;
    if (!topicId || !subject) return res.status(400).json({ success: false, error: 'topicId and subject required' });
    const progress = await db.upsertProgress(req.user._id, { topicId, subject, confidence, isComplete, quizScore });
    await db.recalculateStats(req.user._id);
    res.json({ success: true, message: 'Progress saved', data: progress });
  } catch (error) { next(error); }
});

app.get('/api/user/progress', authenticateToken, async (req, res, next) => {
  try {
    const progress = await db.getAllProgress(req.user._id);
    res.json({ success: true, data: { progress, totalProgressed: progress.length } });
  } catch (error) { next(error); }
});

app.get('/api/user/progress/:topicId', authenticateToken, async (req, res, next) => {
  try {
    const progress = await db.getProgress(req.user._id, req.params.topicId);
    if (!progress) return res.status(404).json({ success: false, error: 'No progress for this topic' });
    res.json({ success: true, data: progress });
  } catch (error) { next(error); }
});

app.get('/api/user/stats', authenticateToken, async (req, res, next) => {
  try {
    const user        = await db.findUserById(req.user._id);
    const allProgress = await db.getAllProgress(req.user._id);
    const weakTopics  = allProgress
      .filter(p => p.quizScore !== null && p.quizScore < 60)
      .map(p => ({ topicId: p.topicId, subject: p.subject, score: p.quizScore }))
      .sort((a, b) => a.score - b.score);
    const completed      = allProgress.filter(p => p.isComplete).length;
    const completionRate = allProgress.length ? Math.round((completed / allProgress.length) * 100) : 0;
    res.json({ success: true, data: { ...user.stats.toObject(), completionRate, weakTopics, topicsProgressed: allProgress.length } });
  } catch (error) { next(error); }
});

app.post('/api/user/stats/update', authenticateToken, async (req, res, next) => {
  try {
    const { xpGain, addToStreak, minutesStudied } = req.body;
    const user = await db.incrementStats(req.user._id, { xpGain, addToStreak, minutesStudied });
    res.json({ success: true, data: user.stats });
  } catch (error) { next(error); }
});

// ============================================================================
// ROUTES: TOPIC EDITOR (admin only)
// ============================================================================

app.post('/api/topics', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { topicId, subject, data } = req.body;
    if (!topicId || !subject || !data) return res.status(400).json({ success: false, error: 'topicId, subject, and data required' });
    if (!['chem', 'bio', 'phy'].includes(subject)) return res.status(400).json({ success: false, error: 'subject must be chem, bio, or phy' });
    const filePath = path.join(__dirname, 'data', 'topics', subject, `${topicId}.json`);
    try { await fs.access(filePath); return res.status(409).json({ success: false, error: 'Topic already exists' }); } catch {}
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    res.status(201).json({ success: true, message: 'Topic created', data: { topicId, subject } });
  } catch (error) { next(error); }
});

app.put('/api/topics/:topicId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const { subject, data } = req.body;
    if (!subject || !data) return res.status(400).json({ success: false, error: 'subject and data required' });
    if (!['chem', 'bio', 'phy'].includes(subject)) return res.status(400).json({ success: false, error: 'Invalid subject' });
    const filePath = path.join(__dirname, 'data', 'topics', subject, `${topicId}.json`);
    try { await fs.access(filePath); } catch { return res.status(404).json({ success: false, error: 'Topic not found' }); }
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ success: true, message: 'Topic updated', data: { topicId, subject } });
  } catch (error) { next(error); }
});

app.delete('/api/topics/:topicId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { topicId } = req.params;
    const { subject } = req.query;
    if (!subject || !['chem', 'bio', 'phy'].includes(subject)) return res.status(400).json({ success: false, error: 'subject query param required' });
    const filePath = path.join(__dirname, 'data', 'topics', subject, `${topicId}.json`);
    try { await fs.access(filePath); } catch { return res.status(404).json({ success: false, error: 'Topic not found' }); }
    await fs.unlink(filePath);
    res.json({ success: true, message: 'Topic deleted' });
  } catch (error) { next(error); }
});


// ============================================================================
// SIMPLE IN-MEMORY RATE LIMITER (no extra deps)
// ============================================================================

const aiRateLimiter = new Map(); // userId/ip -> { count, resetAt }

function checkAiRateLimit(key) {
  const now    = Date.now();
  const window = 60 * 1000; // 1-minute window
  const max    = parseInt(process.env.AI_RATE_LIMIT_PER_MIN || '10', 10);
  let entry    = aiRateLimiter.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + window };
    aiRateLimiter.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= max;
}

// Clean up rate limiter every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of aiRateLimiter.entries()) {
    if (now > v.resetAt) aiRateLimiter.delete(k);
  }
}, 5 * 60 * 1000);

// ============================================================================
// ROUTES: AI STUDY COACH
// ============================================================================

/**
 * POST /api/ai-tutor
 * Body: { topicId, topicTitle, subjectId, context, prompt, history }
 *
 * Supports three providers chosen by AI_PROVIDER env var:
 *   "openai"    → uses OPENAI_API_KEY
 *   "gemini"    → uses GEMINI_API_KEY
 *   "claude"    → uses ANTHROPIC_API_KEY   (default)
 *
 * Set AI_PROVIDER and the matching key in your Render environment variables.
 */
app.post('/api/ai-tutor', authenticateToken, async (req, res, next) => {
  try {
    const { topicTitle, subjectId, context, prompt, history = [] } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'prompt is required' });
    }

    // Rate limit per user
    const rateLimitKey = req.user._id.toString();
    if (!checkAiRateLimit(rateLimitKey)) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests — you can ask up to 10 questions per minute. Please wait a moment.',
      });
    }

    const provider = (process.env.AI_PROVIDER || 'claude').toLowerCase();

    // Build system prompt
    const systemPrompt = [
      `You are an expert Cambridge AS Level tutor specialising in ${subjectId === 'chem' ? 'Chemistry' : subjectId === 'bio' ? 'Biology' : subjectId === 'phy' ? 'Physics' : 'Science'}.`,
      `The student is currently studying: "${topicTitle}".`,
      context ? `Here is relevant content from the study notes:\n${context}` : '',
      'Guidelines:',
      '- Be clear, concise and accurate. Use Cambridge A Level terminology.',
      '- For equations use plain text notation (e.g. H2SO4, delta-H).',
      '- When giving exam tips, reference Cambridge mark scheme language.',
      '- If asked for questions, provide mark scheme answers too.',
      '- Keep responses focused and under 400 words unless a longer answer is genuinely needed.',
    ].filter(Boolean).join('\n');

    let answer = '';

    // ── Claude (Anthropic) ────────────────────────────────────────────
    if (provider === 'claude') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(503).json({ success: false, error: 'AI not configured. Add ANTHROPIC_API_KEY in Render environment variables.' });

      const messages = [
        ...history.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
          role: m.role,
          content: m.text,
        })),
        { role: 'user', content: prompt },
      ];

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        }),
      });

      if (!claudeRes.ok) {
        const err = await claudeRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic API error ${claudeRes.status}`);
      }
      const claudeData = await claudeRes.json();
      answer = claudeData.content?.[0]?.text || '';
    }

    // ── OpenAI ────────────────────────────────────────────────────────
    else if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(503).json({ success: false, error: 'AI not configured. Add OPENAI_API_KEY in Render environment variables.' });

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
          role: m.role,
          content: m.text,
        })),
        { role: 'user', content: prompt },
      ];

      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'gpt-4o-mini',
          max_tokens: 1024,
          messages,
        }),
      });

      if (!openaiRes.ok) {
        const err = await openaiRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI API error ${openaiRes.status}`);
      }
      const openaiData = await openaiRes.json();
      answer = openaiData.choices?.[0]?.message?.content || '';
    }

    // ── Gemini ────────────────────────────────────────────────────────
    else if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(503).json({ success: false, error: 'AI not configured. Add GEMINI_API_KEY in Render environment variables.' });

      // Build Gemini contents array (system goes in as first user turn)
      const contents = [];
      if (history.length) {
        history.filter(m => m.role === 'user' || m.role === 'assistant').forEach(m => {
          contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] });
        });
      }
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      const model = process.env.AI_MODEL || 'gemini-1.5-flash';
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { maxOutputTokens: 1024 },
          }),
        }
      );

      if (!geminiRes.ok) {
        const err = await geminiRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `Gemini API error ${geminiRes.status}`);
      }
      const geminiData = await geminiRes.json();
      answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    else {
      return res.status(503).json({ success: false, error: `Unknown AI_PROVIDER "${provider}". Use "claude", "openai", or "gemini".` });
    }

    if (!answer) throw new Error('Empty response from AI provider');

    res.json({ success: true, answer: answer.trim() });
  } catch (error) {
    console.error('AI tutor error:', error.message);
    // Return user-friendly error, not 500
    res.status(503).json({
      success: false,
      error: error.message.includes('API key') || error.message.includes('configured')
        ? error.message
        : 'The AI tutor is temporarily unavailable. Please try again in a moment.',
    });
  }
});

// ============================================================================
// ROUTES: FILE UPLOADS
// ============================================================================

app.post('/api/upload/avatar', authenticateToken, handleUpload(uploadAvatar), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const user = await db.findUserById(req.user._id);
    if (user.avatarPublicId) await deleteFile(user.avatarPublicId, 'image');
    await db.updateUserAvatar(req.user._id, { url: req.file.path, publicId: req.file.filename });
    res.json({ success: true, data: { url: req.file.path } });
  } catch (err) { next(err); }
});

app.post('/api/upload/pdf', authenticateToken, requireAdmin, handleUpload(uploadPdf), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const { subject, year, session, title } = req.body;
    res.status(201).json({ success: true, data: { url: req.file.path, publicId: req.file.filename, metadata: { subject, year, session, title } } });
  } catch (err) { next(err); }
});

app.delete('/api/upload/:publicId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    await deleteFile(req.params.publicId, req.query.type === 'raw' ? 'raw' : 'image');
    res.json({ success: true, message: 'File deleted' });
  } catch (err) { next(err); }
});

// ============================================================================
// ROUTES: ADMIN PANEL
// ============================================================================

// GET /api/admin/stats – site overview
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const stats = await db.getSiteStats();
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

// GET /api/admin/users – list all users
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const users = await db.getAllUsers();
    res.json({ success: true, data: users, count: users.length });
  } catch (error) { next(error); }
});

// PATCH /api/admin/users/:userId/role – promote/demote user
app.patch('/api/admin/users/:userId/role', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['student', 'admin'].includes(role)) return res.status(400).json({ success: false, error: 'role must be student or admin' });
    if (req.params.userId === req.user._id.toString()) return res.status(400).json({ success: false, error: 'Cannot change your own role' });
    const user = await db.setUserRole(req.params.userId, role);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, message: `User role set to ${role}`, data: { _id: user._id, role: user.role } });
  } catch (error) { next(error); }
});

// PATCH /api/admin/users/:userId/ban – ban/unban user
app.patch('/api/admin/users/:userId/ban', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { banned } = req.body;
    if (req.params.userId === req.user._id.toString()) return res.status(400).json({ success: false, error: 'Cannot ban yourself' });
    const user = await db.banUser(req.params.userId, !!banned);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, message: banned ? 'User banned' : 'User unbanned' });
  } catch (error) { next(error); }
});

// DELETE /api/admin/users/:userId
app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    if (req.params.userId === req.user._id.toString()) return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
    await db.deleteUser(req.params.userId);
    res.json({ success: true, message: 'User deleted' });
  } catch (error) { next(error); }
});

// GET /api/admin/forum – list all threads (admin view with full info)
app.get('/api/admin/forum', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const threads = await db.getForumThreads({ sort: 'recent', limit: 200 });
    res.json({ success: true, data: threads, count: threads.length });
  } catch (error) { next(error); }
});

// PATCH /api/admin/forum/:threadId/pin
app.patch('/api/admin/forum/:threadId/pin', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { pinned } = req.body;
    const t = await db.updateForumThread(req.params.threadId, { pinned: !!pinned });
    if (!t) return res.status(404).json({ success: false, error: 'Thread not found' });
    res.json({ success: true, message: pinned ? 'Thread pinned' : 'Thread unpinned' });
  } catch (error) { next(error); }
});

// PATCH /api/admin/forum/:threadId/lock
app.patch('/api/admin/forum/:threadId/lock', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { locked } = req.body;
    const t = await db.updateForumThread(req.params.threadId, { locked: !!locked });
    if (!t) return res.status(404).json({ success: false, error: 'Thread not found' });
    res.json({ success: true, message: locked ? 'Thread locked' : 'Thread unlocked' });
  } catch (error) { next(error); }
});

// DELETE /api/admin/forum/:threadId (admin shortcut, no authorship check)
app.delete('/api/admin/forum/:threadId', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    await db.deleteForumThread(req.params.threadId);
    res.json({ success: true, message: 'Thread deleted' });
  } catch (error) { next(error); }
});


// GET /api/user/spaced-rep
// Returns today's recommended topics using simple spaced repetition:
//   - no-idea / no confidence + not done recently = highest priority
//   - needs-practice + not done in >3 days = medium priority
//   - confident + not done in >7 days = low priority
app.get('/api/user/spaced-rep', authenticateToken, async (req, res, next) => {
  try {
    const userId    = req.user._id;
    const progress  = await db.getAllProgress(userId);
    const progressMap = new Map(progress.map(p => [p.topicId, p]));
    const now       = Date.now();
    const day       = 86400000;

    const recommendations = [];

    for (const [topicId, p] of progressMap.entries()) {
      const daysSince = p.completedAt ? (now - new Date(p.completedAt).getTime()) / day : 999;
      const score     = p.quizScore ?? null;
      const conf      = p.confidence ?? 0;

      let priority = 0;
      // Never studied / very low confidence
      if (conf <= 1 || score === null)            priority = 100;
      // Low score or needs practice, overdue
      else if ((score < 60 || conf === 2) && daysSince >= 3) priority = 80;
      // Medium confidence, 5+ days
      else if (conf === 3 && daysSince >= 5)      priority = 60;
      // Confident but 7+ days ago
      else if (conf >= 4 && daysSince >= 7)       priority = 30;

      if (priority > 0) {
        recommendations.push({ topicId, subject: p.subject, priority, daysSince: Math.round(daysSince), confidence: conf, quizScore: score });
      }
    }

    recommendations.sort((a, b) => b.priority - a.priority);

    res.json({ success: true, data: recommendations.slice(0, 10) });
  } catch (error) { next(error); }
});

// ============================================================================
// CATCH-ALL / ERROR HANDLING
// ============================================================================

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API route not found', path: req.path });
  }
  // Guard against open redirect via crafted URLs (express CVE-2024-29041)
  if (/^(https?:)?\/\//.test(req.path)) {
    return res.status(400).json({ success: false, error: 'Invalid path' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('❌ Error:', error.message);
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function startServer() {
  try {
    await initializeDatabase();
    server.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('╔════════════════════════════════════════╗');
      console.log('║   Revise Study Platform — Started      ║');
      console.log('╠════════════════════════════════════════╣');
      console.log(`║ HTTP+Socket.io: http://localhost:${PORT}   ║`);
      console.log(`║ Environment: ${(process.env.NODE_ENV || 'development').padEnd(26)}║`);
      console.log('╚════════════════════════════════════════╝');
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

process.on('SIGTERM', () => { console.log('SIGTERM: shutting down'); server.close(() => process.exit(0)); });

module.exports = app;
