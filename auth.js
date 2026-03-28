/**
 * Authentication Module
 * Handles user registration, login, and JWT verification.
 * Uses MongoDB via db.js — no more in-memory store.
 *
 * Dependencies: bcryptjs, jsonwebtoken, mongoose (via db.js)
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

// ============================================================================
// JWT HELPERS
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || "change-this-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // throws if invalid / expired
}

// Strip the password hash before sending user data to the client
function sanitizeUser(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.passwordHash;
  return obj;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * authenticateToken
 * Reads the Authorization: Bearer <token> header, verifies it,
 * loads the user from MongoDB, and attaches it to req.user.
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Authentication required. Provide a Bearer token.",
    });
  }

  try {
    const payload = verifyToken(token);
    const user = await db.findUserById(payload.sub);

    if (!user) {
      return res.status(401).json({ success: false, error: "User not found." });
    }

    req.user = sanitizeUser(user);
    next();
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Token expired. Please log in again."
        : "Invalid token.";
    return res.status(401).json({ success: false, error: message });
  }
}

/**
 * requireAdmin — use after authenticateToken.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, error: "Admin access required." });
  }
  next();
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * POST /api/auth/register
 * Body: { name, email, password }
 */
async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({
          success: false,
          error: "name, email, and password are all required.",
        });
    }
    if (typeof email !== "string" || !email.includes("@")) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid email address." });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Password must be at least 8 characters.",
        });
    }

    const existing = await db.findUserByEmail(email);
    if (existing) {
      return res
        .status(409)
        .json({ success: false, error: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.createUser({ name, email, passwordHash });
    const token = signToken(user._id);

    return res
      .status(201)
      .json({
        success: true,
        message: "Account created.",
        token,
        user: sanitizeUser(user),
      });
  } catch (err) {
    console.error("Register error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Registration failed." });
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, error: "Email and password required." });
    }

    const user = await db.findUserByEmail(email);
    const DUMMY =
      "$2a$10$dummyhashtopreventtimingattacksonloginroute000000000000";
    const passwordMatch = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, DUMMY);

    if (!user || !passwordMatch) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid email or password." });
    }

    const token = signToken(user._id);
    return res.json({
      success: true,
      message: "Logged in.",
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, error: "Login failed." });
  }
}

/**
 * GET /api/auth/me — returns current user from token.
 */
function getMe(req, res) {
  return res.json({ success: true, user: req.user });
}

/**
 * optionalAuth — like authenticateToken but doesn't fail if no token.
 * Sets req.user if a valid token is present, otherwise leaves it undefined.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const user = await db.findUserById(payload.sub);
    if (user) req.user = sanitizeUser(user);
  } catch {
    /* ignore */
  }
  next();
}

module.exports = {
  register,
  login,
  getMe,
  authenticateToken,
  requireAdmin,
  optionalAuth,
};
