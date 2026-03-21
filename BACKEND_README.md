# Study Platform Backend

Production-ready Express.js backend for the Study Platform, fully optimized for deployment on Render.

## 📋 Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Deployment on Render](#deployment-on-render)
- [Database Configuration](#database-configuration)
- [Development](#development)

---

## ✨ Features

✅ **Express.js Server** - Fast, lightweight, and scalable  
✅ **CORS Enabled** - Secure communication with frontend  
✅ **Global Error Handling** - Consistent error responses  
✅ **Environment Configuration** - `.env` file support  
✅ **Comprehensive API Routes** - 20+ endpoints for all features  
✅ **Render Ready** - Zero-config deployment  
✅ **Production Logging** - Built-in request logging  
✅ **JSON & Database Support** - Works with JSON files or MongoDB/PostgreSQL  

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ ([Download](https://nodejs.org))
- npm or yarn
- Git

### Local Development

```bash
# 1. Clone or download the project
cd study-platform

# 2. Create .env file from template
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Start development server (with auto-reload)
npm run dev

# 5. Test the API
# GET http://localhost:5000/ → health check
# GET http://localhost:5000/api/test → test endpoint
```

The server will start on `http://localhost:5000`

### Production Build

```bash
# Install dependencies
npm install

# Start production server
npm start
```

---

## 📡 API Reference

### Health & Status

```http
GET /
Response: { status: "healthy", version: "1.0.0", timestamp: "..." }

GET /api/test
Response: { test: "success", message: "API is working correctly" }
```

### Subjects & Topics

```http
# Get all subjects
GET /api/subjects
Response: { success: true, data: [...], count: 3 }

# Get single subject
GET /api/subjects/:subjectId
Example: GET /api/subjects/chem
Response: { success: true, data: {...} }

# Get topic (requires ?subject query)
GET /api/topics/:topicId?subject=chem
Example: GET /api/topics/atomic-structure?subject=chem
Response: { success: true, data: {...} }

# Get topic quiz
GET /api/topics/:topicId/quiz?subject=chem
Response: { success: true, data: { topicId, quiz: [...] } }

# Get topic flashcards
GET /api/topics/:topicId/flashcards?subject=chem
Response: { success: true, data: { flashcards: [...], recall: [...] } }

# Search topics
GET /api/topics/search?q=atomic
Response: { success: true, query: "atomic", results: [...], count: 5 }
```

### Past Papers

```http
# Get all past papers (with optional filters)
GET /api/past-papers
GET /api/past-papers?subject=chem&year=2020&session=summer
Response: { success: true, data: [...], count: 42, filters: {...} }
```

### Community

```http
# Get forum threads
GET /api/community/forum
GET /api/community/forum?subject=chem&limit=10&sort=recent
Response: { success: true, data: [...], count: 8 }

# Get single forum thread
GET /api/community/forum/:threadId
Response: { success: true, data: {...} }

# Get chat channels
GET /api/community/chat/channels
Response: { success: true, data: [...], count: 5 }

# Get channel messages
GET /api/community/chat/:channelId/messages?limit=50
Response: { success: true, channelId: "...", data: [...], count: 50 }
```

### User Progress

```http
# Save user progress
POST /api/user/progress
Body: { topicId: "...", subject: "chem", confidence: 8, isComplete: true }
Response: { success: true, message: "Progress saved", data: {...} }

# Get user progress
GET /api/user/progress
Response: { success: true, data: {...} }
```

---

## 🚢 Deployment on Render

### Step 1: Push Code to GitHub

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit: Express backend with API routes"
git remote add origin https://github.com/YOUR_USERNAME/study-platform.git
git push -u origin main
```

### Step 2: Create Render Service

1. Go to [render.com](https://render.com) and sign up/login
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Fill in the details:

| Field | Value |
|-------|-------|
| **Name** | study-platform-api |
| **Environment** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | Free (or Starter for production) |

5. Click **Create Web Service**

### Step 3: Set Environment Variables

1. In Render dashboard, go to your service
2. Click **Environment** in the left sidebar
3. Add each variable from `.env.example`:

```
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://your-frontend-url.com
DATABASE_TYPE=json
```

4. Changes apply automatically

### Step 4: Monitor Deployment

- Go to **Logs** tab to see build and startup output
- Once it shows "listening on 0.0.0.0:5000", it's ready! ✅
- Your API URL will be: `https://study-platform-api.onrender.com`

### Step 5: Connect Frontend

Update your frontend's API calls:

```javascript
// Instead of:
const response = await fetch('http://localhost:5000/api/subjects');

// Use production URL:
const API_URL = process.env.REACT_APP_API_URL || 'https://study-platform-api.onrender.com';
const response = await fetch(`${API_URL}/api/subjects`);
```

### Auto-Deployment

Once connected to GitHub, every push to main automatically redeploys! 🎉

---

## 🗄️ Database Configuration

### Current Setup (JSON Files)

The backend currently loads data from JSON files in the `data/` directory:

```
data/
├── subjects.json
├── community.json
├── past-papers.json
└── topics/
    ├── chem/
    ├── bio/
    └── phy/
```

### Switching to MongoDB

1. Add MongoDB connection variable to `.env`:

```
MONGODB_URI=mongodb+srv://user:password@cluster0.mongodb.net/study-platform
```

2. Install MongoDB driver:

```bash
npm install mongoose
```

3. Update `server.js` database initialization:

```javascript
const mongoose = require('mongoose');

async function initializeDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}
```

4. Create schemas and models for data

5. Update route handlers to use Mongoose models instead of file loading

### Switching to PostgreSQL

1. Add PostgreSQL connection string to `.env`:

```
DATABASE_URL=postgresql://user:password@host:5432/study_platform
```

2. Install PostgreSQL driver:

```bash
npm install pg
```

3. Update `server.js` database initialization:

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initializeDatabase() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected');
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error);
    process.exit(1);
  }
}
```

4. Create database schema

5. Update routes to use SQL queries

---

## 💻 Development

### Project Structure

```
study-platform/
├── server.js              # Main server file with all routes
├── package.json           # Dependencies and scripts
├── .env.example          # Environment variables template
├── .env                  # (Local only, not committed)
├── data/                 # Local JSON data files
│   ├── subjects.json
│   ├── community.json
│   ├── past-papers.json
│   └── topics/
└── README.md             # This file
```

### Available Scripts

```bash
# Start production server
npm start

# Start development server with auto-reload
npm run dev

# Run tests (when configured)
npm test
```

### Making Changes

1. Edit `server.js` to add/modify routes
2. Changes auto-reload in development mode
3. Test with `curl` or Postman
4. Push to GitHub for automatic Render deployment

### Adding New Routes

```javascript
// Pattern: Define route with documentation
/**
 * GET /api/example
 * Description of what this endpoint does
 */
app.get('/api/example', async (req, res, next) => {
  try {
    // Route logic here
    res.json({ success: true, data: {...} });
  } catch (error) {
    next(error);
  }
});
```

---

## 🔒 Security Best Practices

1. **Never commit `.env`** - Add to `.gitignore` ✅
2. **Use strong JWT secrets** - Change default values
3. **Validate all inputs** - Sanitize user data
4. **Use HTTPS in production** - Render provides free SSL ✅
5. **Set CORS properly** - Restrict to your frontend domain
6. **Rotate secrets regularly** - Change passwords quarterly
7. **Monitor logs** - Check Render logs for errors

---

## 📞 Troubleshooting

### Port Already in Use

```bash
# Kill process on port 5000
# macOS/Linux:
kill -9 $(lsof -ti:5000)

# Windows (PowerShell):
Get-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess | Stop-Process -Force
```

### "Cannot find module" Error

```bash
# Reinstall node_modules
rm -rf node_modules package-lock.json
npm install
```

### Render Deployment Fails

1. Check **Logs** in Render dashboard
2. Verify all environment variables are set
3. Ensure `npm start` command is correct
4. Try pushing a fresh commit to trigger redeploy

### CORS Issues

Verify `FRONTEND_URL` is correctly set:

```bash
# In Render Environment variables:
FRONTEND_URL=https://your-frontend.com

# Not: http://localhost:3000 (changes for each environment)
```

---

## 📊 Monitoring

### Request Logging

All requests are logged to console with timestamp, method, and path:

```
[2024-03-21T10:30:45.000Z] GET /api/subjects
[2024-03-21T10:30:46.000Z] GET /api/topics/atomic-structure?subject=chem
```

### Error Logging

Errors include stack traces in development mode:

```
❌ Error: Failed to load atomic-structure.json
Stack: Error: ENOENT: no such file or directory...
```

### Health Checks

Render automatically pings `/` to ensure server is running. ✅

---

## 🎯 Next Steps

- [ ] Add authentication (JWT tokens)
- [ ] Implement database migration
- [ ] Add input validation (Joi/Yup)
- [ ] Create API rate limiting
- [ ] Add automated tests
- [ ] Setup CI/CD pipelines
- [ ] Configure database backups
- [ ] Monitor uptime and errors

---

## 📄 License

MIT License - Feel free to use and modify

---

## 🤝 Support

Need help? Check the [Troubleshooting](#troubleshooting) section or review the [Render Documentation](https://render.com/docs)
