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

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));

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

app.post('/api/auth/register', register);
app.post('/api/auth/login',    login);
app.get('/api/auth/me',        authenticateToken, getMe);

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

// GET  /api/community/forum          – list threads
app.get('/api/community/forum', async (req, res, next) => {
  try {
    const { subject, sort, limit } = req.query;
    const threads = await db.getForumThreads({ subject, sort, limit: parseInt(limit) || 50 });
    res.json({ success: true, data: threads, count: threads.length });
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

// ============================================================================
// CATCH-ALL / ERROR HANDLING
// ============================================================================

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API route not found', path: req.path });
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
