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

// Teacher role: can edit topics but not admin functions
function requireTeacherOrAdmin(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'teacher') {
    return res.status(403).json({ success: false, error: 'Teacher or admin access required.' });
  }
  next();
}
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
  // Increase timeouts — Render free tier has slow responses on wake
  pingTimeout:       60000,   // wait 60s for pong before disconnecting
  pingInterval:      25000,   // send ping every 25s
  connectTimeout:    45000,   // allow 45s to establish connection
  transports:        ['websocket', 'polling'], // try WebSocket first, fall back to polling
  upgradeTimeout:    10000,
});

// Track connected users per channel (channelId -> Set of socket info)
const channelUsers = {};

io.on('connection', (socket) => {
  // Join a group chat room
  socket.on('join_group', ({ groupId }) => {
    socket.join(`group:${groupId}`);
  });
  socket.on('leave_group', ({ groupId }) => {
    socket.leave(`group:${groupId}`);
  });

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

// Trust Render's proxy so req.ip resolves to the real client IP
app.set('trust proxy', 1);

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
  // CSP: allow WebSocket/fetch to same origin, Google fonts, KaTeX CDN
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "connect-src 'self' wss: ws: https:",    // socket.io + fetch to any https
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "img-src 'self' data: https:",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  next();
});

// ── Simple in-memory rate limiter (no external package) ──────────────────
const _requestCounts = new Map();
setInterval(() => _requestCounts.clear(), 60_000); // reset every minute

function rateLimit(maxPerMinute) {
  return (req, res, next) => {
    // Use userId when authenticated (more accurate), else IP
    const userId = req.user?._id?.toString();
    const key = userId || req.ip || req.connection.remoteAddress || 'unknown';
    const count = (_requestCounts.get(key) || 0) + 1;
    _requestCounts.set(key, count);
    if (count > maxPerMinute) {
      return res.status(429).json({ success: false, error: 'Too many requests — try again in a minute.' });
    }
    next();
  };
}

// Apply global rate limit (300 req/min per IP — generous for a study app)
// Exempt health check and OPTIONS preflight
app.use((req, res, next) => {
  if (req.method === 'OPTIONS' || req.path === '/' || req.path === '/health') return next();
  return rateLimit(300)(req, res, next);
});

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
  // Only log API requests — suppress static file noise
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

let _dbReady = false;
async function initializeDatabase() {
  if (_dbReady && mongoose.connection.readyState === 1) return true;
  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('🔌 Connecting to MongoDB...');
      await db.connectDB();
    }
    _dbReady = true;
    console.log('✅ Database ready');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error; // let startServer handle it — don't exit mid-reconnect
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

function mergeSubjectsWithLocal(dbSubjects, fileSubjects) {
  const safeDb = Array.isArray(dbSubjects) ? dbSubjects : [];
  const safeFile = Array.isArray(fileSubjects) ? fileSubjects : [];
  const fileById = new Map(safeFile.map(s => [s.id, s]));

  return safeDb.map((subject) => {
    const fileSubject = fileById.get(subject?.id);
    if (!fileSubject || !Array.isArray(fileSubject.units)) return subject;

    const doneMap = new Map();
    for (const unit of subject.units || []) {
      for (const topic of unit.topics || []) doneMap.set(topic.id, !!topic.done);
    }

    return {
      ...subject,
      units: (fileSubject.units || []).map((unit) => ({
        ...unit,
        topics: (unit.topics || []).map((topic) => ({
          ...topic,
          done: doneMap.has(topic.id) ? doneMap.get(topic.id) : !!topic.done,
        })),
      })),
    };
  });
}

async function getSubjectsFromDb() {
  const fileData = await loadJsonFile('subjects.json');
  const fileSubjects = fileData.subjects || fileData;

  let dbSubjects = await db.getCurriculumSubjects();
  if (!Array.isArray(dbSubjects) || !dbSubjects.length) {
    await db.upsertCurriculumSubjects(fileSubjects);
    return fileSubjects;
  }

  const merged = mergeSubjectsWithLocal(dbSubjects, fileSubjects);
  await db.upsertCurriculumSubjects(merged);
  return merged;
}

// Health check endpoint for Render
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

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
    // Use same JWT format as auth.js (payload.sub = userId string)
    const signToken = (id) => require('jsonwebtoken').sign(
      { sub: id.toString() },
      process.env.JWT_SECRET || 'change-this-in-production',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    const token = signToken(user._id);

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

    const signToken2 = (id) => require('jsonwebtoken').sign(
      { sub: id.toString() },
      process.env.JWT_SECRET || 'change-this-in-production',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    const token = signToken2(user._id);

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
    const subjects = await getSubjectsFromDb();
    res.json({ success: true, data: subjects, count: subjects.length });
  } catch (error) { next(error); }
});

app.get('/api/subjects/:subjectId', async (req, res, next) => {
  try {
    const subjects = await getSubjectsFromDb();
    const subject  = subjects.find(s => s.id === req.params.subjectId);
    if (!subject) return res.status(404).json({ success: false, error: 'Subject not found' });
    res.json({ success: true, data: subject });
  } catch (error) { next(error); }
});

app.get('/api/topics/search', async (req, res, next) => {
  try {
    const query = req.query.q?.toLowerCase();
    if (!query || query.length < 2) return res.status(400).json({ success: false, error: 'Query too short' });
    const subjects = await getSubjectsFromDb();
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
    let subject = req.query.subject;

    if (!subject) {
      const subjects = await getSubjectsFromDb();
      const match = subjects.find(s => (s.units || []).some(u => (u.topics || []).some(t => t.id === topicId)));
      subject = match?.id;
    }

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
    let { subject } = req.query;
    if (!subject) {
      const subjects = await getSubjectsFromDb();
      const match = subjects.find(s => (s.units || []).some(u => (u.topics || []).some(t => t.id === topicId)));
      subject = match?.id;
    }
    if (!subject || !['chem', 'bio', 'phy'].includes(subject)) return res.status(400).json({ success: false, error: 'subject param required' });
    const topic = await loadTopic(topicId, subject);
    res.json({ success: true, data: { topicId, topicName: topic.concept, quiz: topic.quiz || [] } });
  } catch (error) { next(error); }
});

app.get('/api/topics/:topicId/flashcards', async (req, res, next) => {
  try {
    const { topicId } = req.params;
    let { subject } = req.query;
    if (!subject) {
      const subjects = await getSubjectsFromDb();
      const match = subjects.find(s => (s.units || []).some(u => (u.topics || []).some(t => t.id === topicId)));
      subject = match?.id;
    }
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
    // Increment view count for each thread returned
    if (threads.length > 0) {
      await Promise.all(threads.map(t => db.ForumThread.updateOne({ _id: t._id }, { $inc: { views: 1 } }).catch(() => {})));
    }
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
    const updated = await db.upvoteThread(req.params.threadId, req.user._id);
    if (!updated) return res.status(404).json({ success: false, error: 'Thread not found' });
    res.json({ success: true, upvotes: updated.upvotes, hasUpvoted: updated.upvoterIds?.includes(req.user._id) });
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

app.post('/api/topics', authenticateToken, requireTeacherOrAdmin, async (req, res, next) => {
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

app.put('/api/topics/:topicId', authenticateToken, requireTeacherOrAdmin, async (req, res, next) => {
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
  const max    = parseInt(process.env.AI_RATE_LIMIT_PER_MIN || '20', 10);
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

// Keep a short cache of available OpenRouter free models to avoid fetching on every request.
const OPENROUTER_FREE_MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
const openRouterFreeModelCache = {
  fetchedAt: 0,
  models: [],
};

const OPENROUTER_PREFERRED_FREE_MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'google/gemini-flash-1.5-free',
  'qwen/qwen-2.5-7b-instruct:free',
  'microsoft/phi-3-mini-128k-instruct:free',
  'openchat/openchat-7b:free',
];

async function getOpenRouterFreeModels(apiKey) {
  const now = Date.now();
  if (openRouterFreeModelCache.models.length && (now - openRouterFreeModelCache.fetchedAt) < OPENROUTER_FREE_MODEL_CACHE_TTL_MS) {
    return openRouterFreeModelCache.models;
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const modelRes = await fetch('https://openrouter.ai/api/v1/models', { headers });
    if (!modelRes.ok) {
      console.warn(`[AI] Could not refresh OpenRouter models (HTTP ${modelRes.status})`);
      return openRouterFreeModelCache.models;
    }

    const modelData = await modelRes.json();
    const rows = Array.isArray(modelData?.data) ? modelData.data : [];
    const freeModels = [...new Set(
      rows
        .map(row => row?.id)
        .filter(id => typeof id === 'string' && id.endsWith(':free'))
    )];

    if (freeModels.length) {
      openRouterFreeModelCache.models = freeModels;
      openRouterFreeModelCache.fetchedAt = now;
    }

    return openRouterFreeModelCache.models;
  } catch (err) {
    console.warn(`[AI] Failed to refresh OpenRouter models: ${String(err?.message || err).slice(0, 120)}`);
    return openRouterFreeModelCache.models;
  }
}

function buildOpenRouterModelList(primaryModel, discoveredModels = []) {
  const normalizedPrimary = String(primaryModel || '').trim();
  const lowered = normalizedPrimary.toLowerCase();
  const isFreeAlias = lowered === 'openrouter/free' || lowered === 'openrouter/auto:free';
  const seed = isFreeAlias ? 'openrouter/auto:free' : normalizedPrimary;
  return [...new Set([
    seed,
    ...OPENROUTER_PREFERRED_FREE_MODELS,
    ...discoveredModels,
  ].filter(Boolean))];
}

// ============================================================================
// ROUTES: AI STUDY COACH
// ============================================================================

/**
 * GET /api/test-ai
 * Quick sanity-check: sends "Say hello" to a free OpenRouter model and returns the reply.
 * Use this to verify your OPENROUTER_API_KEY is working.
 */
app.get('/api/test-ai', async (req, res, next) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, error: 'OPENROUTER_API_KEY not set' });

    console.log(`[test-ai] API key present, length=${apiKey.length}`);
    const primaryModel = process.env.AI_MODEL || 'openrouter/auto:free';
    const discoveredFreeModels = await getOpenRouterFreeModels(apiKey);
    const modelsToTry = buildOpenRouterModelList(primaryModel, discoveredFreeModels);

    if (!modelsToTry.length) {
      return res.status(503).json({
        success: false,
        error: 'No OpenRouter free models available to test right now.',
      });
    }

    let lastError = null;
    for (const model of modelsToTry) {
      const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.FRONTEND_URL || 'https://asrevise.onrender.com',
          'X-Title': 'Revise AS Level Study Platform',
        },
        body: JSON.stringify({
          model,
          max_tokens: 100,
          messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
        }),
      });

      const data = await orRes.json().catch(() => ({}));
      console.log(`[test-ai] ${model} status=${orRes.status} body=${JSON.stringify(data).slice(0, 220)}`);

      if (!orRes.ok || data.error) {
        lastError = data?.error?.message || `HTTP ${orRes.status}`;
        continue;
      }

      const answer = data.choices?.[0]?.message?.content || '(empty)';
      return res.json({ success: true, model: data.model || model, answer });
    }

    return res.status(502).json({
      success: false,
      error: lastError || 'OpenRouter test failed on all free models.',
      triedModels: modelsToTry,
    });
  } catch (e) { next(e); }
});

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

    const provider = (process.env.AI_PROVIDER || 'openrouter').toLowerCase();

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
          model: process.env.AI_MODEL || 'claude-haiku-4-5',
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

      // Build Gemini contents — must be non-empty and start with 'user' role
      const contents = [];
      if (history.length) {
        history.filter(m => m.role === 'user' || m.role === 'assistant').forEach(m => {
          contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.text || '') }] });
        });
      }
      // Ensure final message is user (Gemini requires alternating, ending in user)
      if (contents.length && contents[contents.length - 1].role === 'model') {
        contents.push({ role: 'user', parts: [{ text: prompt }] });
      } else {
        contents.push({ role: 'user', parts: [{ text: prompt }] });
      }

      const model = process.env.AI_MODEL || 'gemini-2.0-flash';
      const geminiBody = {
        contents,
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        systemInstruction: { parts: [{ text: systemPrompt }] },
      };

      console.log(`[AI] Gemini request: model=${model}, messages=${contents.length}`);

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody),
        }
      );

      if (!geminiRes.ok) {
        const errBody = await geminiRes.text();
        console.error(`[AI] Gemini error ${geminiRes.status}:`, errBody.slice(0, 300));
        let errMsg = `Gemini API error ${geminiRes.status}`;
        try { errMsg = JSON.parse(errBody).error?.message || errMsg; } catch {}
        throw new Error(errMsg);
      }
      const geminiData = await geminiRes.json();
      console.log('[AI] Gemini response keys:', Object.keys(geminiData));
      answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!answer) {
        const finishReason = geminiData.candidates?.[0]?.finishReason;
        console.error('[AI] Gemini empty answer, finishReason:', finishReason, JSON.stringify(geminiData).slice(0, 300));
        throw new Error(finishReason === 'SAFETY' ? 'Response blocked by safety filters — try rephrasing.' : 'Empty response from Gemini');
      }
    }

    // ── OpenRouter ────────────────────────────────────────────────────
    else if (provider === 'openrouter') {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) return res.status(503).json({ success: false, error: 'AI not configured. Add OPENROUTER_API_KEY in Render environment variables.' });

      const primaryModel = process.env.AI_MODEL || 'openrouter/auto:free';
      const discoveredFreeModels = await getOpenRouterFreeModels(apiKey);
      const modelsToTry = buildOpenRouterModelList(primaryModel, discoveredFreeModels);

      if (!modelsToTry.length) {
        throw new Error('No OpenRouter free models are currently available.');
      }

      // Debug: log API key presence (never log the key itself)
      console.log(`[AI] OpenRouter API key present: ${!!apiKey}, length: ${apiKey?.length || 0}`);
      console.log(`[AI] Trying models: ${modelsToTry.join(' → ')}`);

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
          role: m.role,
          content: String(m.text || ''),
        })),
        { role: 'user', content: prompt },
      ];

      let lastError = null;
      for (const model of modelsToTry) {
        try {
          console.log(`[AI] Requesting: ${model}, messages: ${messages.length}`);
          const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': process.env.FRONTEND_URL || 'https://asrevise.onrender.com',
              'X-Title': 'Revise Study Platform',
            },
            body: JSON.stringify({
              model,
              max_tokens: 1600,
              messages,
              temperature: 0.6,
            }),
          });

          const orData = await orRes.json();

          // Check for errors in response
          if (orData.error) {
            const msg = orData.error?.message || JSON.stringify(orData.error);
            console.warn(`[AI] ${model} error:`, msg.slice(0, 200));
            if (orRes.status === 401) throw new Error('Invalid API key');
            lastError = msg;
            continue;
          }

          if (!orRes.ok) {
            console.warn(`[AI] HTTP ${orRes.status} from ${model}`);
            lastError = `HTTP ${orRes.status}`;
            continue;
          }

          const content = orData.choices?.[0]?.message?.content || '';
          if (content && content.trim()) {
            console.log(`[AI] Success with ${model} (${content.length} chars)`);
            answer = content.trim();
            break;
          } else {
            console.warn(`[AI] Empty content from ${model}`);
            lastError = 'Empty response';
          }
        } catch (fetchErr) {
          if (fetchErr.message.includes('Invalid API')) throw fetchErr;
          console.warn(`[AI] Error with ${model}:`, fetchErr.message.slice(0, 100));
          lastError = fetchErr.message;
        }
      }

      if (!answer?.trim()) {
        const detail = lastError ? ` Last OpenRouter error: ${lastError}` : '';
        throw new Error(`AI service temporarily unavailable — unable to find a working OpenRouter free model right now.${detail}`);
      }
    }

    else {
      return res.status(503).json({ success: false, error: `Unknown AI_PROVIDER "${provider}". Use "claude", "openai", "gemini", or "openrouter".` });
    }

    if (!answer) throw new Error('Empty response from AI provider');

    res.json({ success: true, answer: answer.trim() });
  } catch (error) {
    console.error('AI tutor error:', error.message);
    // Pass the real error to the client so it's debuggable
    const isConfigError = error.message.includes('API key') || error.message.includes('configured') || error.message.includes('not configured');
    const isQuotaEmpty  = error.message.includes('limit: 0') || (error.message.includes('RESOURCE_EXHAUSTED') && error.message.includes('free_tier'));
    const isRateLimit   = !isQuotaEmpty && (error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('quota exceeded') || error.message.toLowerCase().includes('rate limit exceeded'));
    const isSafety      = error.message.includes('safety') || error.message.includes('SAFETY');
    const clientMsg = isConfigError ? error.message
      : isQuotaEmpty ? 'Gemini API quota error — this usually means the free tier is not available in your region (UK/EU). Enable billing in Google AI Studio, or set AI_PROVIDER=openai / AI_PROVIDER=claude in Render environment variables.'
      : isRateLimit  ? 'AI rate limit reached — please wait a moment and try again.'
      : isSafety     ? error.message
      : `AI error: ${error.message}`;
    res.status(503).json({ success: false, error: clientMsg });
  }
});

/**
 * GET /api/admin/openrouter-models
 * Admin-only debug endpoint to inspect currently discovered free OpenRouter models.
 */
app.get('/api/admin/openrouter-models', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(503).json({ success: false, error: 'OPENROUTER_API_KEY not set' });

    const configuredModel = process.env.AI_MODEL || 'openrouter/auto:free';
    const discoveredFreeModels = await getOpenRouterFreeModels(apiKey);
    const modelsToTry = buildOpenRouterModelList(configuredModel, discoveredFreeModels);

    res.json({
      success: true,
      configuredModel,
      defaultModelAlias: 'openrouter/auto:free',
      cache: {
        fetchedAt: openRouterFreeModelCache.fetchedAt,
        ageMs: Math.max(0, Date.now() - openRouterFreeModelCache.fetchedAt),
        ttlMs: OPENROUTER_FREE_MODEL_CACHE_TTL_MS,
        count: openRouterFreeModelCache.models.length,
      },
      discoveredFreeModels,
      modelsToTry,
    });
  } catch (err) {
    next(err);
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
    // Cloudinary raw files need fl_attachment to serve with correct Content-Type
    // Replace /upload/ with /upload/fl_attachment/ in the URL
    let url = req.file.path || '';
    if (url.includes('res.cloudinary.com') && url.includes('/raw/upload/')) {
      url = url.replace('/raw/upload/', '/raw/upload/fl_attachment/');
    }
    // Also ensure .pdf extension is present in the URL
    if (!url.endsWith('.pdf') && !url.includes('fl_attachment')) {
      url = url + '.pdf';
    }
    res.status(201).json({ success: true, data: { url, publicId: req.file.filename, metadata: { subject, year, session, title } } });
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

// GET /api/admin/users/export – download all users as CSV
app.get('/api/admin/users/export', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const users = await db.getAllUsers();
    const esc = (v) => {
      const s = String(v ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };

    const header = [
      'id', 'name', 'email', 'role', 'banned', 'createdAt', 'lastActiveAt',
      'xp', 'streak', 'totalQuizzes', 'averageScore', 'totalStudyMinutes',
    ];

    const rows = users.map((u) => [
      u._id,
      u.name,
      u.email,
      u.role,
      !!u.banned,
      u.createdAt ? new Date(u.createdAt).toISOString() : '',
      u.stats?.lastActiveAt ? new Date(u.stats.lastActiveAt).toISOString() : '',
      u.stats?.xp ?? 0,
      u.stats?.streak ?? 0,
      u.stats?.totalQuizzes ?? 0,
      u.stats?.averageScore ?? 0,
      u.stats?.totalStudyMinutes ?? 0,
    ]);

    const csv = [
      header.map(esc).join(','),
      ...rows.map((r) => r.map(esc).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="revise-users-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csv);
  } catch (error) { next(error); }
});

// PATCH /api/admin/users/:userId/role – promote/demote user
app.patch('/api/admin/users/:userId/role', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['student', 'admin', 'teacher'].includes(role)) return res.status(400).json({ success: false, error: 'role must be student or admin' });
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
// ROUTES: SOCIAL — public profiles, user search
// ============================================================================

// GET /api/social/search?q=... — search users by name (public, no email exposed)
app.get('/api/social/search', authenticateToken, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });
    await db.touchLastActive(req.user._id);
    const users = await db.searchUsers(q);
    res.json({ success: true, data: users });
  } catch (e) { next(e); }
});

// GET /api/social/profile/:userId — get a public profile (no email/auth data)
app.get('/api/social/profile/:userId', authenticateToken, async (req, res, next) => {
  try {
    await db.touchLastActive(req.user._id);
    const profile = await db.getPublicProfile(req.params.userId);
    if (!profile) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: profile });
  } catch (e) { next(e); }
});

// ── Friends ──────────────────────────────────────────────────────────────────

// POST /api/social/friends/request — send friend request
app.post('/api/social/friends/request', authenticateToken, async (req, res, next) => {
  try {
    const { toUserId } = req.body;
    if (!toUserId) return res.status(400).json({ success: false, error: 'toUserId required' });
    if (toUserId === req.user._id.toString()) return res.status(400).json({ success: false, error: 'Cannot friend yourself' });
    await db.touchLastActive(req.user._id);
    const req2 = await db.sendFriendRequest(req.user._id, toUserId);
    res.json({ success: true, data: req2 });
  } catch (e) { next(e); }
});

// PATCH /api/social/friends/respond — accept or reject a request
app.patch('/api/social/friends/respond', authenticateToken, async (req, res, next) => {
  try {
    const { requestId, status } = req.body;
    if (!['accepted','rejected'].includes(status)) return res.status(400).json({ success: false, error: 'status must be accepted or rejected' });
    await db.touchLastActive(req.user._id);
    const fr = await db.respondFriendRequest(requestId, status);
    res.json({ success: true, data: fr });
  } catch (e) { next(e); }
});

// GET /api/social/friends — get friend list + pending requests
app.get('/api/social/friends', authenticateToken, async (req, res, next) => {
  try {
    await db.touchLastActive(req.user._id);
    const [friends, requests] = await Promise.all([
      db.getFriends(req.user._id),
      db.getFriendRequests(req.user._id),
    ]);

    // Enrich pending requests with sender name (schema only stores ObjectIds)
    const myId = req.user._id.toString();
    const enriched = await Promise.all(requests.map(async r => {
      const fromId = r.from?.toString();
      const toId   = r.to?.toString();
      // Attach fromName for the recipient; attach toName for the sender
      if (toId === myId && fromId) {
        const sender = await db.getPublicProfile(fromId).catch(() => null);
        return { ...r, fromName: sender?.name || 'Unknown user', fromId };
      }
      if (fromId === myId && toId) {
        const recipient = await db.getPublicProfile(toId).catch(() => null);
        return { ...r, toName: recipient?.name || 'Unknown user', toId };
      }
      return r;
    }));

    res.json({ success: true, data: { friends, requests: enriched } });
  } catch (e) { next(e); }
});

// ── Group chats ──────────────────────────────────────────────────────────────

// GET /api/social/groups — list groups the user is in
app.get('/api/social/groups', authenticateToken, async (req, res, next) => {
  try {
    await db.touchLastActive(req.user._id);
    const groups = await db.getUserGroupChats(req.user._id);
    res.json({ success: true, data: groups });
  } catch (e) { next(e); }
});

// POST /api/social/groups — create a group chat
app.post('/api/social/groups', authenticateToken, async (req, res, next) => {
  try {
    let { name, memberIds } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'name required' });
    memberIds = Array.isArray(memberIds) ? memberIds : [];
    await db.touchLastActive(req.user._id);
    const group = await db.createGroupChat(name.trim(), req.user._id, memberIds);
    res.status(201).json({ success: true, data: group });
  } catch (e) { next(e); }
});

// GET /api/social/groups/:groupId/messages — get messages
app.get('/api/social/groups/:groupId/messages', authenticateToken, async (req, res, next) => {
  try {
    const group = await db.GroupChat.findById(req.params.groupId).lean();
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    const isMember = group.members.map(String).includes(req.user._id.toString());
    if (!isMember) return res.status(403).json({ success: false, error: 'Not a member of this group' });
    await db.touchLastActive(req.user._id);
    const msgs = await db.getGroupMessages(req.params.groupId, 80);
    res.json({ success: true, data: msgs.reverse() }); // chronological
  } catch (e) { next(e); }
});

// POST /api/social/groups/:groupId/messages — send a message
app.post('/api/social/groups/:groupId/messages', authenticateToken, async (req, res, next) => {
  try {
    const group = await db.GroupChat.findById(req.params.groupId).lean();
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    const isMember = group.members.map(String).includes(req.user._id.toString());
    if (!isMember) return res.status(403).json({ success: false, error: 'Not a member' });
    const text = (req.body.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ success: false, error: 'text required' });
    await db.touchLastActive(req.user._id);
    const msg = await db.addGroupMessage(req.params.groupId, req.user._id, req.user.name, text);
    // Emit to socket room
    io.to(`group:${req.params.groupId}`).emit('group_message', msg);
    res.status(201).json({ success: true, data: msg });
  } catch (e) { next(e); }
});

// ── Touch lastActive on any authenticated API call ───────────────────────────
// (Light-touch middleware — only runs on /api/user/* to avoid touching on every request)
app.use('/api/user', authenticateToken, (req, res, next) => {
  db.touchLastActive(req.user._id).catch(() => {});
  next();
});

// Middleware: lightweight DB health check before API routes.
// Uses mongoose readyState directly — no async reconnect per request.
// Reconnection is handled automatically by Mongoose's built-in reconnect logic.
const mongoose = require('mongoose');
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const state = mongoose.connection.readyState;
  // 1 = connected, 2 = connecting (let it through — query will queue)
  if (state === 0 || state === 3) {
    // disconnected or disconnecting — try to reconnect in background
    db.connectDB().catch(err => console.error('DB reconnect error:', err.message));
    return res.status(503).json({ success: false, error: 'Database reconnecting — please retry in a moment.' });
  }
  next();
});



// ── Past Papers admin CRUD ────────────────────────────────────────────────

// POST /api/past-papers — add a paper (admin/teacher)
app.post('/api/past-papers', authenticateToken, requireTeacherOrAdmin, async (req, res, next) => {
  try {
    const { id, subject, code, year, session, paper, variant, title, difficulty, downloadUrl, msUrl } = req.body;
    if (!subject || !year || !session || !paper || !variant) {
      return res.status(400).json({ success: false, error: 'subject, year, session, paper, variant are required' });
    }
    if (!['chem','bio','phy'].includes(subject)) {
      return res.status(400).json({ success: false, error: 'subject must be chem, bio, or phy' });
    }
    const data  = await loadJsonFile('past-papers.json');
    const papers = data.papers || data;
    const newId  = id || `${subject}-${code||'0000'}-${year}-${session.includes('June') ? 's' : session.includes('Nov') ? 'w' : 'x'}-p${variant}`;
    if (papers.find(p => p.id === newId)) {
      return res.status(409).json({ success: false, error: `Paper with id "${newId}" already exists` });
    }
    const newPaper = { id: newId, subject, code: code||'', year: parseInt(year), session, paper, variant: String(variant), title: title||'', difficulty: difficulty||'Medium', downloadUrl: downloadUrl||'', msUrl: msUrl||'' };
    papers.unshift(newPaper);
    const filePath = path.join(__dirname, 'data', 'past-papers.json');
    await fs.writeFile(filePath, JSON.stringify({ papers }, null, 2), 'utf-8');
    res.status(201).json({ success: true, data: newPaper });
  } catch (e) { next(e); }
});

// DELETE /api/past-papers/:id — remove a paper (admin only)
app.delete('/api/past-papers/:id', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const data   = await loadJsonFile('past-papers.json');
    const papers  = data.papers || data;
    const before  = papers.length;
    const filtered = papers.filter(p => p.id !== req.params.id);
    if (filtered.length === before) return res.status(404).json({ success: false, error: 'Paper not found' });
    const filePath = path.join(__dirname, 'data', 'past-papers.json');
    await fs.writeFile(filePath, JSON.stringify({ papers: filtered }, null, 2), 'utf-8');
    res.json({ success: true, message: 'Paper deleted' });
  } catch (e) { next(e); }
});


// Build alternate mirror URLs for known past-paper hosts.
// Expects `primaryUrl` to be FULLY DECODED (spaces not %20) — the
// pdf-proxy route decodes iteratively before calling this.
function _buildAlternateUrls(primaryUrl) {
  const urls = [primaryUrl];
  let filename;
  try {
    filename = new URL(primaryUrl).pathname.split('/').pop();
  } catch (_) {
    filename = primaryUrl.split('/').pop();
  }
  if (!filename) return urls;

  // gceguide.xyz → papacambridge + xtremepape.rs as fallbacks
  if (primaryUrl.includes('gceguide.xyz')) {
    // Match decoded path: "A Levels/Chemistry (9701)/2024/..."
    const gcMatch = primaryUrl.match(/A Levels\/([^/]+)\/(\d{4})\//);
    if (gcMatch) {
      const [, subjectFolder, year] = gcMatch;
      const subjectDecode = decodeURIComponent(subjectFolder);

      // papacambridge: "Chemistry (9701)" → "Chemistry-9701"
      const papaCambSubj = subjectDecode.replace(/\s*\((\d+)\)/, '-$1');
      urls.push(`https://pastpapers.papacambridge.com/directories/CAIE/AS%20and%20A%20Level/${encodeURIComponent(papaCambSubj)}/${year}/${encodeURIComponent(filename)}`);

      // xtremepape.rs: "Chemistry (9701)" → "Chemistry - 9701"
      const xtrSubj = subjectDecode.replace(/\s*\((\d+)\)/, ' - $1');
      urls.push(`https://papers.xtremepape.rs/CAIE/AS%20%26%20A%20Level/${encodeURIComponent(xtrSubj)}/${year}/${encodeURIComponent(filename)}`);
    }
  }
  return urls;
}

app.get('/api/pdf-proxy', async (req, res, next) => {
  try {
    // ── Step 1: Decode the URL parameter ────────────────────────────────────
    // Express already decodes %25 → % once, but the frontend may have called
    // encodeURIComponent on an already-encoded URL (producing %2520 for a space).
    // We decode repeatedly until the result stabilises to get the real URL.
    let rawParam = req.query.url;
    if (!rawParam) return res.status(400).json({ error: 'url query param required' });

    let url = rawParam;
    // Iterative decode: keeps decoding until stable (handles double-encoding like %2520 → %20 → space)
    try {
      let prev;
      do {
        prev = url;
        url = decodeURIComponent(url);
      } while (url !== prev);
    } catch (_) {
      url = rawParam; // if decoding fails, use as-is
    }

    console.log(`[PDF Proxy] raw param: ${rawParam.slice(0, 100)}`);
    console.log(`[PDF Proxy] decoded URL: ${url.slice(0, 200)}`);

    // ── Step 2: Validate ────────────────────────────────────────────────────
    const isLocal = url.startsWith('/papers/');
    const isHttps = url.startsWith('https://');
    const looksLikePdf = url.includes('.pdf') || url.includes('/pdf/') || url.includes('res.cloudinary.com');

    if (!isLocal && (!isHttps || !looksLikePdf)) {
      return res.status(403).json({ error: 'Only HTTPS PDF URLs are allowed' });
    }

    // ── Step 3: Serve local files ────────────────────────────────────────────
    if (isLocal) {
      const filePath = path.join(__dirname, url);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="paper.pdf"');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(filePath, err => {
        if (err) res.status(404).json({ error: 'File not found' });
      });
    }

    // ── Step 4: Proxy external PDF ───────────────────────────────────────────
    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/pdf,application/octet-stream,*/*',
      'Accept-Language': 'en-GB,en;q=0.9',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
    };

    // Get the safe filename for Content-Disposition
    function safeFilename(u) {
      try {
        const seg = new URL(u).pathname.split('/').pop();
        return seg && seg.endsWith('.pdf') ? seg : 'paper.pdf';
      } catch (_) { return 'paper.pdf'; }
    }

    // Build list of URLs to try (primary + mirrors)
    const urlsToTry = _buildAlternateUrls(url);
    let lastStatus = 0;
    let lastError  = '';

    for (const tryUrl of urlsToTry) {
      try {
        console.log(`[PDF Proxy] fetching: ${tryUrl}`);
        const response = await fetch(tryUrl, {
          headers: {
            ...browserHeaders,
            'Referer': new URL(tryUrl).origin + '/',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(12000),
        });

        if (!response.ok) {
          console.warn(`[PDF Proxy] HTTP ${response.status} from: ${tryUrl}`);
          lastStatus = response.status;
          lastError  = `HTTP ${response.status} from source`;
          continue;
        }

        // ── Success: set correct headers then stream ──────────────────────
        const filename = safeFilename(tryUrl);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Allow browsers to display PDF inline (important for <iframe> embedding)
        res.setHeader('Access-Control-Allow-Origin', '*');

        const contentLength = response.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);

        console.log(`[PDF Proxy] streaming ${filename} (${contentLength || '?'} bytes)`);

        // Use arrayBuffer → Buffer for reliable streaming in Node's fetch API
        const buf = await response.arrayBuffer();
        return res.send(Buffer.from(buf));

      } catch (fetchErr) {
        console.warn(`[PDF Proxy] fetch error for ${tryUrl}:`, fetchErr.message);
        lastError = fetchErr.message;
        lastStatus = 0;
      }
    }

    // ── All sources failed ────────────────────────────────────────────────
    console.warn(`[PDF Proxy] all sources failed. last status=${lastStatus}, error=${lastError}`);
    return res.status(502).json({
      error: 'Could not retrieve PDF',
      detail: lastError || `HTTP ${lastStatus}`,
      tried: urlsToTry.length,
    });

  } catch (e) { next(e); }
});

// ── Tenor GIF search proxy (keeps API key server-side) ───────────────────
app.get('/api/tenor/search', optionalAuth, async (req, res, next) => {
  try {
    const apiKey = process.env.TENOR_API_KEY;
    if (!apiKey) return res.json({ success: true, data: [] }); // graceful degradation
    const q     = (req.query.q || '').trim().slice(0, 100);
    const limit = Math.min(parseInt(req.query.limit) || 16, 32);
    const url   = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${apiKey}&limit=${limit}&media_filter=gif,tinygif&contentfilter=medium`;
    const r     = await fetch(url);
    if (!r.ok) return res.json({ success: true, data: [] });
    const d     = await r.json();
    const gifs  = (d.results || []).map(g => ({
      id:       g.id,
      title:    g.title,
      url:      g.media_formats?.gif?.url      || '',
      preview:  g.media_formats?.tinygif?.url  || g.media_formats?.gif?.url || '',
      width:    g.media_formats?.gif?.dims?.[0] || 200,
      height:   g.media_formats?.gif?.dims?.[1] || 200,
    }));
    res.json({ success: true, data: gifs });
  } catch (e) { res.json({ success: true, data: [] }); }
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
  // 1. Bind port synchronously — Render health check sees it immediately
  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║   Revise Study Platform — Started      ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║ Port: ${PORT.toString().padEnd(33)}║`);
    console.log(`║ Environment: ${(process.env.NODE_ENV || 'development').padEnd(26)}║`);
    console.log('╚════════════════════════════════════════╝');
    console.log('');
  });

  server.once('error', (err) => {
    console.error('Failed to bind port:', err.message);
    process.exit(1);
  });

  // 2. Connect to MongoDB completely asynchronously — never blocks startup
  //    The DB readyState middleware handles requests arriving before DB is ready
  initializeDatabase().then(() => {
    console.log('✅ Ready to serve requests');
  }).catch(err => {
    // Log but don't exit — Mongoose will keep retrying automatically
    console.error('⚠ MongoDB connection failed on startup (will retry):', err.message);
  });
}

startServer();

process.on('SIGTERM', () => { console.log('SIGTERM: shutting down'); server.close(() => process.exit(0)); });

module.exports = app;
