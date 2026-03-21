/**
 * Database Module — MongoDB via Mongoose
 *
 * Stores:
 *   - Users        (auth credentials, role, profile)
 *   - Progress     (per-user, per-topic learning data)
 *   - ForumThread  (community forum threads + replies)
 *   - ChatMessage  (real-time chat messages per channel)
 */

const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in .env');
  await mongoose.connect(uri, { dbName: 'revise' });
  isConnected = true;
  console.log('✅ MongoDB connected');
}

// ============================================================================
// SCHEMA: User
// ============================================================================

const userSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  email:          { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:   { type: String, required: true },
  role:           { type: String, enum: ['student', 'admin'], default: 'student' },
  avatarUrl:      { type: String, default: null },
  avatarPublicId: { type: String, default: null },
  banned:         { type: Boolean, default: false },
  stats: {
    totalTopicsCompleted:  { type: Number, default: 0 },
    totalQuizzesCompleted: { type: Number, default: 0 },
    averageQuizScore:      { type: Number, default: 0 },
    streak:                { type: Number, default: 0 },
    xp:                    { type: Number, default: 0 },
    totalMinutesStudied:   { type: Number, default: 0 },
    lastActiveAt:          { type: Date,   default: Date.now },
  },
}, { timestamps: true });

// ============================================================================
// SCHEMA: Progress
// ============================================================================

const progressSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  topicId:     { type: String, required: true },
  subject:     { type: String, required: true, enum: ['chem', 'bio', 'phy'] },
  confidence:  { type: Number, default: 0, min: 0, max: 5 },
  isComplete:  { type: Boolean, default: false },
  quizScore:   { type: Number, default: null, min: 0, max: 100 },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

progressSchema.index({ userId: 1, topicId: 1 }, { unique: true });

// ============================================================================
// SCHEMA: ForumThread
// ============================================================================

const replySchema = new mongoose.Schema({
  author:   { type: String, required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  body:     { type: String, required: true },
  upvotes:  { type: Number, default: 0 },
}, { timestamps: true });

const forumThreadSchema = new mongoose.Schema({
  title:    { type: String, required: true, trim: true, maxlength: 200 },
  body:     { type: String, required: true, maxlength: 5000 },
  subject:  { type: String, required: true, enum: ['chem', 'bio', 'phy', 'general'] },
  author:   { type: String, required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  pinned:   { type: Boolean, default: false },
  locked:   { type: Boolean, default: false },
  upvotes:  { type: Number, default: 0 },
  views:    { type: Number, default: 0 },
  replies:  [replySchema],
}, { timestamps: true });

// ============================================================================
// SCHEMA: ChatMessage
// ============================================================================

const chatMessageSchema = new mongoose.Schema({
  channelId: { type: String, required: true, index: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  author:    { type: String, required: true },
  text:      { type: String, required: true, maxlength: 2000 },
}, { timestamps: true });

// ============================================================================
// MODELS
// ============================================================================

const User        = mongoose.models.User        || mongoose.model('User',        userSchema);
const Progress    = mongoose.models.Progress    || mongoose.model('Progress',    progressSchema);
const ForumThread = mongoose.models.ForumThread || mongoose.model('ForumThread', forumThreadSchema);
const ChatMessage = mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);

// ============================================================================
// USER HELPERS
// ============================================================================

const findUserByEmail = (email) => User.findOne({ email: email.toLowerCase() });
const findUserById    = (id)    => User.findById(id);
const createUser      = async ({ name, email, passwordHash, role = 'student' }) => {
  const u = new User({ name, email, passwordHash, role });
  await u.save();
  return u;
};
const updateUserAvatar = (userId, { url, publicId }) =>
  User.findByIdAndUpdate(userId, { $set: { avatarUrl: url, avatarPublicId: publicId } }, { new: true });

const getAllUsers  = () => User.find({}, '-passwordHash').sort({ createdAt: -1 }).lean();
const setUserRole = (userId, role) => User.findByIdAndUpdate(userId, { $set: { role } }, { new: true });
const banUser     = (userId, banned) => User.findByIdAndUpdate(userId, { $set: { banned } }, { new: true });
const deleteUser  = (userId) => User.findByIdAndDelete(userId);

// ============================================================================
// PROGRESS HELPERS
// ============================================================================

const upsertProgress = (userId, { topicId, subject, confidence, isComplete, quizScore }) =>
  Progress.findOneAndUpdate(
    { userId, topicId },
    { $set: {
      subject,
      ...(confidence  !== undefined && { confidence }),
      ...(isComplete  !== undefined && { isComplete }),
      ...(quizScore   !== undefined && { quizScore }),
      ...(isComplete  && { completedAt: new Date() }),
    }},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

const getAllProgress = (userId) => Progress.find({ userId }).lean();
const getProgress   = (userId, topicId) => Progress.findOne({ userId, topicId }).lean();

// ============================================================================
// STATS HELPERS
// ============================================================================

async function recalculateStats(userId) {
  const all = await Progress.find({ userId }).lean();
  const completed  = all.filter(p => p.isComplete).length;
  const withScores = all.filter(p => p.quizScore !== null);
  const avg = withScores.length ? withScores.reduce((s, p) => s + p.quizScore, 0) / withScores.length : 0;
  return User.findByIdAndUpdate(userId, { $set: {
    'stats.totalTopicsCompleted':  completed,
    'stats.totalQuizzesCompleted': withScores.length,
    'stats.averageQuizScore':      Math.round(avg * 10) / 10,
    'stats.lastActiveAt':          new Date(),
  }}, { new: true });
}

async function incrementStats(userId, { xpGain = 0, addToStreak = false, minutesStudied = 0 }) {
  const inc = {};
  if (xpGain)         inc['stats.xp']                 = xpGain;
  if (addToStreak)    inc['stats.streak']              = 1;
  if (minutesStudied) inc['stats.totalMinutesStudied'] = minutesStudied;
  return User.findByIdAndUpdate(userId, { $inc: inc, $set: { 'stats.lastActiveAt': new Date() } }, { new: true });
}

// ============================================================================
// FORUM HELPERS
// ============================================================================

async function getForumThreads({ subject, sort = 'recent', limit = 20, skip = 0 } = {}) {
  const q = subject ? { subject } : {};
  const sortMap = { recent: { createdAt: -1 }, popular: { upvotes: -1 }, pinned: { pinned: -1, createdAt: -1 } };
  return ForumThread.find(q).sort(sortMap[sort] || { createdAt: -1 }).skip(skip).limit(limit).lean();
}

const countForumThreads = (query = {}) => ForumThread.countDocuments(query);

const getForumThread = async (threadId) => {
  await ForumThread.findByIdAndUpdate(threadId, { $inc: { views: 1 } });
  return ForumThread.findById(threadId).lean();
};

const createForumThread = async ({ title, body, subject, author, authorId }) => {
  const t = new ForumThread({ title, body, subject, author, authorId });
  await t.save();
  return t;
};

const updateForumThread = (threadId, updates) =>
  ForumThread.findByIdAndUpdate(threadId, { $set: updates }, { new: true });

const deleteForumThread = (threadId) => ForumThread.findByIdAndDelete(threadId);

const addForumReply = (threadId, { author, authorId, body }) =>
  ForumThread.findByIdAndUpdate(threadId, { $push: { replies: { author, authorId, body } } }, { new: true });

const deleteForumReply = (threadId, replyId) =>
  ForumThread.findByIdAndUpdate(threadId, { $pull: { replies: { _id: replyId } } }, { new: true });

const upvoteThread = (threadId) =>
  ForumThread.findByIdAndUpdate(threadId, { $inc: { upvotes: 1 } }, { new: true });

// ============================================================================
// CHAT HELPERS
// ============================================================================

const getChatMessages = (channelId, limit = 100) =>
  ChatMessage.find({ channelId }).sort({ createdAt: -1 }).limit(limit).lean().then(m => m.reverse());

const saveChatMessage = async ({ channelId, userId, author, text }) => {
  const m = new ChatMessage({ channelId, userId, author, text });
  await m.save();
  return m;
};

const deleteChatMessage = (messageId) => ChatMessage.findByIdAndDelete(messageId);

// ============================================================================
// ADMIN STATS
// ============================================================================

async function getSiteStats() {
  const [totalUsers, totalThreads, totalMessages, adminCount] = await Promise.all([
    User.countDocuments(),
    ForumThread.countDocuments(),
    ChatMessage.countDocuments(),
    User.countDocuments({ role: 'admin' }),
  ]);
  const recentUsers   = await User.find({}, '-passwordHash').sort({ createdAt: -1 }).limit(5).lean();
  const recentThreads = await ForumThread.find().sort({ createdAt: -1 }).limit(5).lean();
  return { totalUsers, totalThreads, totalMessages, adminCount, recentUsers, recentThreads };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  connectDB,
  User, Progress, ForumThread, ChatMessage,
  findUserByEmail, findUserById, createUser, updateUserAvatar,
  getAllUsers, setUserRole, banUser, deleteUser,
  upsertProgress, getAllProgress, getProgress,
  recalculateStats, incrementStats,
  getForumThreads, countForumThreads, getForumThread, createForumThread, updateForumThread,
  deleteForumThread, addForumReply, deleteForumReply, upvoteThread,
  getChatMessages, saveChatMessage, deleteChatMessage,
  getSiteStats,
};
