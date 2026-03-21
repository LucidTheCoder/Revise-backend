# 🚀 Quick Start - Backend to Production

Complete workflow from setup to deployment.

## ⚡ 5-Minute Setup (Local Development)

### Terminal 1: Backend
```bash
cd study-platform
npm install
npm run dev
# Shows: 📦 Study Platform Backend Started on http://localhost:5000
```

### Terminal 2: Frontend
```bash
# Already running or start your web server
# Navigate to http://localhost:3000 (or your frontend URL)
```

Done! Backend is ready. Update `API_BASE_URL` in `app.js` to connect:

```javascript
const API_BASE_URL = 'http://localhost:5000';
```

---

## 📋 File Structure

```
study-platform/
├── server.js                 # Express backend (20+ API routes)
├── package.json              # Dependencies & scripts
├── .env.example              # Environment variables template
├── .env                       # Local .env (don't commit!)
├── .gitignore               # Ignore sensitive files
│
├── BACKEND_README.md        # Full backend documentation
├── BACKEND_INTEGRATION.md   # How to connect frontend
├── RENDER_DEPLOYMENT_GUIDE.md # Deploy on Render
│
├── data/
│   ├── subjects.json
│   ├── community.json
│   ├── past-papers.json
│   └── topics/
│       ├── chem/
│       ├── bio/
│       └── phy/
│
├── app.js                    # Frontend (updated with API support)
├── index.html
├── styles.css
└── ... other frontend files
```

---

## 🌐 API Routes Summary

**Health:**
```
GET /                    → Health check
GET /api/test            → Test endpoint
```

**Subjects & Topics:**
```
GET /api/subjects                           → All subjects
GET /api/subjects/:subjectId                → Single subject
GET /api/topics/:topicId?subject=:subject   → Full topic
GET /api/topics/:topicId/quiz?subject=      → Topic quiz
GET /api/topics/:topicId/flashcards?subject → Topic flashcards
GET /api/topics/search?q=:query             → Search topics
```

**Resources:**
```
GET /api/past-papers?subject=:s&year=:y    → Filtered past papers
```

**Community:**
```
GET /api/community/forum                    → Forum threads
GET /api/community/forum/:threadId          → Single thread
GET /api/community/chat/channels            → Chat channels
GET /api/community/chat/:channelId/messages → Channel messages
```

**User (Ready for Implementation):**
```
POST /api/user/progress    → Save progress
GET /api/user/progress     → Get progress
```

**Editor:**
```
POST /api/topics           → Create topic
PUT /api/topics/:topicId   → Update topic
DELETE /api/topics/:topicId → Delete topic
```

---

## 🔧 Configuration

### .env File Setup

Copy template:
```bash
cp .env.example .env
```

Edit for your environment:
```
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
DATABASE_TYPE=json
```

---

## 📊 Development Workflow

```bash
# Make changes to server.js
nano server.js

# Auto-reloads with nodemon
# npm run dev watches for changes

# Test in another terminal
curl http://localhost:5000/api/subjects

# Changes apply instantly! ✨
```

---

## 🚢 Deploy to Render (10 minutes)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "add backend"
   git push origin main
   ```

2. **Create Render Service**
   - go to render.com
   - New → Web Service
   - Connect GitHub repo
   - Build Command: `npm install`
   - Start Command: `npm start`

3. **Set Environment Variables** (in Render dashboard)
   ```
   PORT=5000
   NODE_ENV=production
   FRONTEND_URL=https://your-frontend.com
   DATABASE_TYPE=json
   ```

4. **Deploy** (automatic!)
   - Render builds and deploys
   - Your API URL: `https://your-service.onrender.com`
   - Every git push auto-redeploys

5. **Connect Frontend**
   ```javascript
   const API_BASE_URL = 'https://your-service.onrender.com';
   ```

---

## 🧪 Test Deployment

```bash
# Test backend health
curl https://your-service.onrender.com/

# Get data
curl https://your-service.onrender.com/api/subjects

# Check logs (Render dashboard → Logs tab)
```

---

## 🔗 Connect Frontend to Backend

### In app.js (Line ~18):

**Develop (local):**
```javascript
const API_BASE_URL = 'http://localhost:5000';
```

**Production (Render):**
```javascript
const API_BASE_URL = 'https://your-service.onrender.com';
```

**Auto-detect (Recommended):**
```javascript
const API_BASE_URL = 
  process.env.NODE_ENV === 'production'
    ? 'https://your-service.onrender.com'
    : 'http://localhost:5000';
```

The frontend automatically handles switching between local JSON and API calls! ✨

---

## 📈 Next Steps

### Short Term
- ✅ Deploy backend to Render
- ✅ Connect frontend to backend
- ✅ Test all API endpoints

### Medium Term
- 🔲 Add input validation
- 🔲 Implement rate limiting
- 🔲 Setup monitoring
- 🔲 Add error tracking (Sentry)

### Long Term
- 🔲 Switch to MongoDB/PostgreSQL
- 🔲 Add authentication (JWT)
- 🔲 Implement user accounts
- 🔲 Add real-time updates (WebSocket)

---

## 🆘 Common Issues

**Port 5000 already in use:**
```bash
# Kill the process
lsof -ti:5000 | xargs kill -9
```

**Backend won't start:**
```bash
npm install
npm run dev
# Check error message - fix, then rerun
```

**CORS errors:**
```javascript
// Check FRONTEND_URL in .env matches your frontend
FRONTEND_URL=http://localhost:3000
```

**API returns 404:**
```bash
# Check route exists in server.js
# Check query parameters (case-sensitive)
curl "http://localhost:5000/api/topics/atomic-structure?subject=chem"
```

---

## 📚 Full Documentation

- **Backend Details**: See [BACKEND_README.md](BACKEND_README.md)
- **Integration Guide**: See [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md)
- **Render Setup**: See [RENDER_DEPLOYMENT_GUIDE.md](RENDER_DEPLOYMENT_GUIDE.md)

---

## 🎯 You're Ready!

You now have:
✅ Production-ready Express backend
✅ 20+ API endpoints
✅ Automatic frontend integration
✅ Ready for Render deployment
✅ Database-ready architecture

**Next:** Connect your frontend by setting `API_BASE_URL` and deploy! 🚀
