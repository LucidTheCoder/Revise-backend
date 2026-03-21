/**
 * Database Module — MongoDB via Mongoose
 *
 * Stores:
 *   - Users        (auth credentials, role, profile)
 *   - Progress     (per-user, per-topic learning data)
 *
 * Topics, subjects, and past papers stay as JSON files — they are
 * static content that doesn't need a database.
 *
 * Install: npm install mongoose
 */

const mongoose = require('mongoose');

// ============================================================================
// CONNECTION
// ============================================================================

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Add it to your .env file.\n' +
      'Example: MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/revise'
    );
  }

  await mongoose.connect(uri, {
    dbName: 'revise', // database name inside your cluster
  });

  isConnected = true;
  console.log('✅ MongoDB connected');
}

// ============================================================================
// SCHEMA: User
// ============================================================================

const userSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role:         { type: String, enum: ['student', 'admin'], default: 'student' },
    avatarUrl:      { type: String, default: null },
    avatarPublicId: { type: String, default: null },
    stats: {
      totalTopicsCompleted:  { type: Number, default: 0 },
      totalQuizzesCompleted: { type: Number, default: 0 },
      averageQuizScore:      { type: Number, default: 0 },
      streak:                { type: Number, default: 0 },
      xp:                    { type: Number, default: 0 },
      totalMinutesStudied:   { type: Number, default: 0 },
      lastActiveAt:          { type: Date,   default: Date.now },
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt automatically
  }
);

// ============================================================================
// SCHEMA: Progress
// One document per user-topic pair.
// ============================================================================

const progressSchema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    topicId:    { type: String, required: true },
    subject:    { type: String, required: true, enum: ['chem', 'bio', 'phy'] },
    confidence: { type: Number, default: 0, min: 0, max: 5 },
    isComplete: { type: Boolean, default: false },
    quizScore:  { type: Number, default: null, min: 0, max: 100 },
    completedAt:{ type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Unique index: one progress record per user per topic
progressSchema.index({ userId: 1, topicId: 1 }, { unique: true });

// ============================================================================
// MODELS
// ============================================================================

const User     = mongoose.models.User     || mongoose.model('User',     userSchema);
const Progress = mongoose.models.Progress || mongoose.model('Progress', progressSchema);

// ============================================================================
// USER HELPERS
// These replace the in-memory userStore functions in auth.js
// ============================================================================

async function findUserByEmail(email) {
  return User.findOne({ email: email.toLowerCase() });
}

async function findUserById(id) {
  return User.findById(id);
}

async function createUser({ name, email, passwordHash, role = 'student' }) {
  const user = new User({ name, email, passwordHash, role });
  await user.save();
  return user;
}

async function updateUserAvatar(userId, { url, publicId }) {
  return User.findByIdAndUpdate(
    userId,
    { $set: { avatarUrl: url, avatarPublicId: publicId } },
    { new: true }
  );
}

// ============================================================================
// PROGRESS HELPERS
// ============================================================================

/**
 * Upsert a progress record for a user+topic pair.
 * Creates a new document or updates an existing one.
 */
async function upsertProgress(userId, { topicId, subject, confidence, isComplete, quizScore }) {
  const update = {
    subject,
    ...(confidence  !== undefined && { confidence }),
    ...(isComplete  !== undefined && { isComplete }),
    ...(quizScore   !== undefined && { quizScore }),
    ...(isComplete  && { completedAt: new Date() }),
  };

  const doc = await Progress.findOneAndUpdate(
    { userId, topicId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
}

/**
 * Get all progress records for a user.
 */
async function getAllProgress(userId) {
  return Progress.find({ userId }).lean();
}

/**
 * Get a single progress record.
 */
async function getProgress(userId, topicId) {
  return Progress.findOne({ userId, topicId }).lean();
}

// ============================================================================
// STATS HELPERS
// ============================================================================

/**
 * Recalculate and persist a user's stats from their progress records.
 * Call this after saving progress or updating quiz scores.
 */
async function recalculateStats(userId) {
  const allProgress = await Progress.find({ userId }).lean();

  const completed  = allProgress.filter(p => p.isComplete).length;
  const withScores = allProgress.filter(p => p.quizScore !== null);
  const avgScore   = withScores.length > 0
    ? withScores.reduce((sum, p) => sum + p.quizScore, 0) / withScores.length
    : 0;

  const update = {
    'stats.totalTopicsCompleted':  completed,
    'stats.totalQuizzesCompleted': withScores.length,
    'stats.averageQuizScore':      Math.round(avgScore * 10) / 10,
    'stats.lastActiveAt':          new Date(),
  };

  return User.findByIdAndUpdate(userId, { $set: update }, { new: true });
}

/**
 * Increment simple stat fields (XP, streak, study time).
 */
async function incrementStats(userId, { xpGain = 0, addToStreak = false, minutesStudied = 0 }) {
  const inc = {};
  if (xpGain)          inc['stats.xp']                  = xpGain;
  if (addToStreak)     inc['stats.streak']               = 1;
  if (minutesStudied)  inc['stats.totalMinutesStudied']  = minutesStudied;

  return User.findByIdAndUpdate(
    userId,
    { $inc: inc, $set: { 'stats.lastActiveAt': new Date() } },
    { new: true }
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  connectDB,
  User,
  Progress,
  // User helpers
  findUserByEmail,
  findUserById,
  createUser,
  updateUserAvatar,
  // Progress helpers
  upsertProgress,
  getAllProgress,
  getProgress,
  // Stats helpers
  recalculateStats,
  incrementStats,
};
