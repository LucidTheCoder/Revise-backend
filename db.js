/**
 * Database Module — MongoDB via Mongoose
 *
 * Stores:
 *   - Users        (auth credentials, role, profile)
 *   - Progress     (per-user, per-topic learning data)
 *   - ForumThread  (community forum threads + replies)
 *   - ChatMessage  (real-time chat messages per channel)
 */

const mongoose = require("mongoose");

async function connectDB() {
  // Use mongoose readyState instead of a manual flag that never resets
  // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 2) {
    // Already connecting — wait for it
    await new Promise((res, rej) => {
      mongoose.connection.once("connected", res);
      mongoose.connection.once("error", rej);
    });
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in .env");

  await mongoose.connect(uri, {
    dbName: "revise",
    // Keep connection alive through Render's idle periods
    serverSelectionTimeoutMS: 10000, // fail fast if Atlas unreachable
    socketTimeoutMS: 45000, // close sockets after 45s of inactivity
    heartbeatFrequencyMS: 10000, // check server health every 10s
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  console.log("✅ MongoDB connected");

  // Reset flag on disconnect so we reconnect next request
  mongoose.connection.on("disconnected", () => {
    console.warn("⚠ MongoDB disconnected — will reconnect on next request");
  });
  mongoose.connection.on("reconnected", () => {
    console.log("✅ MongoDB reconnected");
  });
  mongoose.connection.on("error", (err) => {
    console.error("❌ MongoDB error:", err.message);
  });
}

// ============================================================================
// SCHEMA: User
// ============================================================================

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["student", "admin"], default: "student" },
    avatarUrl: { type: String, default: null },
    avatarPublicId: { type: String, default: null },
    banned: { type: Boolean, default: false },
    stats: {
      totalTopicsCompleted: { type: Number, default: 0 },
      totalQuizzesCompleted: { type: Number, default: 0 },
      averageQuizScore: { type: Number, default: 0 },
      streak: { type: Number, default: 0 },
      xp: { type: Number, default: 0 },
      totalMinutesStudied: { type: Number, default: 0 },
      lastActiveAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true },
);

// ============================================================================
// SCHEMA: Progress
// ============================================================================

const progressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    topicId: { type: String, required: true },
    subject: { type: String, required: true, trim: true },
    confidence: { type: Number, default: 0, min: 0, max: 5 },
    isComplete: { type: Boolean, default: false },
    quizScore: { type: Number, default: null, min: 0, max: 100 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

progressSchema.index({ userId: 1, topicId: 1 }, { unique: true });

// ============================================================================
// SCHEMA: ForumThread
// ============================================================================

const replySchema = new mongoose.Schema(
  {
    author: { type: String, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    body: { type: String, required: true },
    upvotes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const forumThreadSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 5000 },
    subject: { type: String, required: true, trim: true },
    author: { type: String, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    pinned: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    upvotes: { type: Number, default: 0 },
    upvoterIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    views: { type: Number, default: 0 },
    replies: [replySchema],
  },
  { timestamps: true },
);

// ============================================================================
// SCHEMA: ChatMessage
// ============================================================================

const chatMessageSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    author: { type: String, required: true },
    text: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true },
);

// ============================================================================
// SCHEMA: FriendRequest
// ============================================================================

const friendRequestSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true },
);
friendRequestSchema.index({ from: 1, to: 1 }, { unique: true });

// ============================================================================
// SCHEMA: GroupChat + GroupMessage
// ============================================================================

const groupChatSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const groupMessageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupChat",
      required: true,
      index: true,
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorName: { type: String, required: true },
    text: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true },
);

// ============================================================================
// SCHEMA: Curriculum (subjects metadata)
// ============================================================================

const curriculumSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true, unique: true, default: "subjects" },
    subjects: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

// ============================================================================
// MODELS
// ============================================================================

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Progress =
  mongoose.models.Progress || mongoose.model("Progress", progressSchema);
const ForumThread =
  mongoose.models.ForumThread ||
  mongoose.model("ForumThread", forumThreadSchema);
const ChatMessage =
  mongoose.models.ChatMessage ||
  mongoose.model("ChatMessage", chatMessageSchema);
const FriendRequest =
  mongoose.models.FriendRequest ||
  mongoose.model("FriendRequest", friendRequestSchema);
const GroupChat =
  mongoose.models.GroupChat || mongoose.model("GroupChat", groupChatSchema);
const GroupMessage =
  mongoose.models.GroupMessage ||
  mongoose.model("GroupMessage", groupMessageSchema);
const Curriculum =
  mongoose.models.Curriculum || mongoose.model("Curriculum", curriculumSchema);

// ============================================================================
// USER HELPERS
// ============================================================================

const findUserByEmail = (email) => User.findOne({ email: email.toLowerCase() });
const findUserById = (id) => User.findById(id);
const createUser = async ({ name, email, passwordHash, role = "student" }) => {
  const u = new User({ name, email, passwordHash, role });
  await u.save();
  return u;
};
const updateUserAvatar = (userId, { url, publicId }) =>
  User.findByIdAndUpdate(
    userId,
    { $set: { avatarUrl: url, avatarPublicId: publicId } },
    { new: true },
  );

const getAllUsers = () =>
  User.find({}, "-passwordHash").sort({ createdAt: -1 }).lean();
const setUserRole = (userId, role) =>
  User.findByIdAndUpdate(userId, { $set: { role } }, { new: true });
const banUser = (userId, banned) =>
  User.findByIdAndUpdate(userId, { $set: { banned } }, { new: true });
const deleteUser = (userId) => User.findByIdAndDelete(userId);

// ============================================================================
// PROGRESS HELPERS
// ============================================================================

const upsertProgress = (
  userId,
  { topicId, subject, confidence, isComplete, quizScore },
) =>
  Progress.findOneAndUpdate(
    { userId, topicId },
    {
      $set: {
        subject,
        ...(confidence !== undefined && { confidence }),
        ...(isComplete !== undefined && { isComplete }),
        ...(quizScore !== undefined && { quizScore }),
        ...(isComplete && { completedAt: new Date() }),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

const getAllProgress = (userId) => Progress.find({ userId }).lean();
const getProgress = (userId, topicId) =>
  Progress.findOne({ userId, topicId }).lean();

// ============================================================================
// STATS HELPERS
// ============================================================================

async function recalculateStats(userId) {
  const all = await Progress.find({ userId }).lean();
  const completed = all.filter((p) => p.isComplete).length;
  const withScores = all.filter((p) => p.quizScore !== null);
  const avg = withScores.length
    ? withScores.reduce((s, p) => s + p.quizScore, 0) / withScores.length
    : 0;
  return User.findByIdAndUpdate(
    userId,
    {
      $set: {
        "stats.totalTopicsCompleted": completed,
        "stats.totalQuizzesCompleted": withScores.length,
        "stats.averageQuizScore": Math.round(avg * 10) / 10,
        "stats.lastActiveAt": new Date(),
      },
    },
    { new: true },
  );
}

async function incrementStats(
  userId,
  { xpGain = 0, addToStreak = false, minutesStudied = 0 },
) {
  const inc = {};
  if (xpGain) inc["stats.xp"] = xpGain;
  if (addToStreak) inc["stats.streak"] = 1;
  if (minutesStudied) inc["stats.totalMinutesStudied"] = minutesStudied;
  return User.findByIdAndUpdate(
    userId,
    { $inc: inc, $set: { "stats.lastActiveAt": new Date() } },
    { new: true },
  );
}

// ============================================================================
// FORUM HELPERS
// ============================================================================

async function getForumThreads({
  subject,
  sort = "recent",
  limit = 20,
  skip = 0,
} = {}) {
  const q = subject ? { subject } : {};
  const sortMap = {
    recent: { createdAt: -1 },
    popular: { upvotes: -1 },
    pinned: { pinned: -1, createdAt: -1 },
  };
  return ForumThread.find(q)
    .sort(sortMap[sort] || { createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

const countForumThreads = (query = {}) => ForumThread.countDocuments(query);

const getForumThread = async (threadId) => {
  await ForumThread.findByIdAndUpdate(threadId, { $inc: { views: 1 } });
  return ForumThread.findById(threadId).lean();
};

const createForumThread = async ({
  title,
  body,
  subject,
  author,
  authorId,
}) => {
  const t = new ForumThread({ title, body, subject, author, authorId });
  await t.save();
  return t;
};

const updateForumThread = (threadId, updates) =>
  ForumThread.findByIdAndUpdate(threadId, { $set: updates }, { new: true });

const deleteForumThread = (threadId) => ForumThread.findByIdAndDelete(threadId);

const addForumReply = (threadId, { author, authorId, body }) =>
  ForumThread.findByIdAndUpdate(
    threadId,
    { $push: { replies: { author, authorId, body } } },
    { new: true },
  );

const deleteForumReply = (threadId, replyId) =>
  ForumThread.findByIdAndUpdate(
    threadId,
    { $pull: { replies: { _id: replyId } } },
    { new: true },
  );

const upvoteThread = async (threadId, userId) => {
  const thread = await ForumThread.findById(threadId);
  if (!thread) return null;

  // Check if user already voted
  if (thread.upvoterIds?.includes(userId)) {
    // User already voted - toggle off (remove upvote)
    thread.upvotes = Math.max(0, thread.upvotes - 1);
    thread.upvoterIds = thread.upvoterIds.filter((id) => !id.equals(userId));
  } else {
    // User hasn't voted - add upvote
    thread.upvotes = (thread.upvotes || 0) + 1;
    thread.upvoterIds = [...(thread.upvoterIds || []), userId];
  }

  await thread.save();
  return thread;
};

// ============================================================================
// CHAT HELPERS
// ============================================================================

const getChatMessages = (channelId, limit = 100) =>
  ChatMessage.find({ channelId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .then((m) => m.reverse());

const saveChatMessage = async ({ channelId, userId, author, text }) => {
  const m = new ChatMessage({ channelId, userId, author, text });
  await m.save();
  return m;
};

const deleteChatMessage = (messageId) =>
  ChatMessage.findByIdAndDelete(messageId);

// ============================================================================
// ADMIN STATS
// ============================================================================

async function getSiteStats() {
  const [totalUsers, totalThreads, totalMessages, adminCount] =
    await Promise.all([
      User.countDocuments(),
      ForumThread.countDocuments(),
      ChatMessage.countDocuments(),
      User.countDocuments({ role: "admin" }),
    ]);
  const recentUsers = await User.find({}, "-passwordHash")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  const recentThreads = await ForumThread.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  return {
    totalUsers,
    totalThreads,
    totalMessages,
    adminCount,
    recentUsers,
    recentThreads,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// ── Social helpers ───────────────────────────────────────────────────────────
// Public profile — NEVER exposes email, passwordHash, or auth fields
const SAFE_FIELDS =
  "name avatarUrl stats.streak stats.xp stats.totalTopicsCompleted stats.totalQuizzesCompleted stats.averageQuizScore stats.lastActiveAt";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const getPublicProfile = (userId) =>
  User.findById(userId).select(SAFE_FIELDS).lean();
const searchUsers = (query) =>
  User.find(
    {
      name: { $regex: escapeRegex(query), $options: "i" },
      banned: { $ne: true },
    },
    SAFE_FIELDS,
  )
    .limit(20)
    .lean();
const touchLastActive = (userId) =>
  User.findByIdAndUpdate(userId, {
    $set: { "stats.lastActiveAt": new Date() },
  });

// Friend requests
const sendFriendRequest = (from, to) =>
  FriendRequest.findOneAndUpdate(
    { from, to },
    { from, to, status: "pending" },
    { upsert: true, new: true },
  );
const removeFriendship = (userA, userB) =>
  FriendRequest.deleteMany({
    $or: [
      { from: userA, to: userB },
      { from: userB, to: userA },
    ],
  });
const respondFriendRequest = (id, status) =>
  FriendRequest.findByIdAndUpdate(id, { status }, { new: true });
const getFriendRequests = (userId) =>
  FriendRequest.find({
    $or: [
      { to: userId, status: "pending" },
      { from: userId, status: "pending" },
    ],
  }).lean();
const getFriends = async (userId) => {
  const uid = mongoose.Types.ObjectId.createFromHexString
    ? mongoose.Types.ObjectId.createFromHexString(userId.toString())
    : new mongoose.Types.ObjectId(userId);
  const accepted = await FriendRequest.find({
    $or: [
      { from: uid, status: "accepted" },
      { to: uid, status: "accepted" },
    ],
  }).lean();
  const friendIds = accepted.map((r) =>
    r.from.toString() === userId.toString() ? r.to : r.from,
  );
  return User.find({ _id: { $in: friendIds } })
    .select(SAFE_FIELDS)
    .lean();
};

// Group chats
const createGroupChat = (name, creatorId, memberIds) =>
  GroupChat.create({
    name,
    createdBy: creatorId,
    members: [...new Set([creatorId, ...(Array.isArray(memberIds) ? memberIds : [])].map((id) => id.toString()))],
  });
const getUserGroupChats = (userId) =>
  GroupChat.find({ members: userId }).sort({ updatedAt: -1 }).lean();
const getGroupChatById = (chatId) => GroupChat.findById(chatId).lean();
const addMembersToGroupChat = (chatId, memberIds) =>
  GroupChat.findByIdAndUpdate(
    chatId,
    { $addToSet: { members: { $each: memberIds || [] } } },
    { new: true },
  ).lean();
const getGroupMessages = (chatId, limit = 50) =>
  GroupMessage.find({ chatId }).sort({ createdAt: -1 }).limit(limit).lean();
const addGroupMessage = (chatId, authorId, authorName, text) =>
  GroupMessage.create({ chatId, authorId, authorName, text });

const areUsersFriends = async (userA, userB) => {
  if (!userA || !userB) return false;
  const a = userA.toString();
  const b = userB.toString();
  if (a === b) return true;
  const relation = await FriendRequest.findOne({
    status: "accepted",
    $or: [
      { from: userA, to: userB },
      { from: userB, to: userA },
    ],
  })
    .select("_id")
    .lean();
  return !!relation;
};

// Curriculum subjects metadata
const getCurriculumSubjects = async () => {
  const doc = await Curriculum.findOne({ kind: "subjects" }).lean();
  return Array.isArray(doc?.subjects) ? doc.subjects : [];
};

const upsertCurriculumSubjects = (subjects) =>
  Curriculum.findOneAndUpdate(
    { kind: "subjects" },
    { $set: { subjects: Array.isArray(subjects) ? subjects : [] } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

module.exports = {
  connectDB,
  User,
  Progress,
  ForumThread,
  ChatMessage,
  FriendRequest,
  GroupChat,
  GroupMessage,
  Curriculum,
  findUserByEmail,
  findUserById,
  createUser,
  updateUserAvatar,
  getAllUsers,
  setUserRole,
  banUser,
  deleteUser,
  upsertProgress,
  getAllProgress,
  getProgress,
  recalculateStats,
  incrementStats,
  getForumThreads,
  countForumThreads,
  getForumThread,
  createForumThread,
  updateForumThread,
  deleteForumThread,
  addForumReply,
  deleteForumReply,
  upvoteThread,
  getChatMessages,
  saveChatMessage,
  deleteChatMessage,
  getSiteStats,
  getPublicProfile,
  searchUsers,
  touchLastActive,
  sendFriendRequest,
  removeFriendship,
  respondFriendRequest,
  getFriendRequests,
  getFriends,
  createGroupChat,
  getGroupChatById,
  addMembersToGroupChat,
  getUserGroupChats,
  getGroupMessages,
  addGroupMessage,
  areUsersFriends,
  getCurriculumSubjects,
  upsertCurriculumSubjects,
};
