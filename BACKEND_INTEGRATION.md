# 🔗 Backend Integration Guide

This guide explains how to connect your Study Platform frontend to the Express.js backend.

## 🔄 Two Modes of Operation

### Mode 1: Local Development (Default)
✅ No backend server needed
✅ Works offline
✅ Uses local JSON files from `data/` folder
❌ No real-time data persistence
❌ No user authentication

**Current Status:** Active

### Mode 2: Backend API (Production)
✅ Real-time server
✅ Persistent data storage
✅ User authentication ready
✅ Scalable to thousands of users
❌ Requires running backend server

---

## 🚀 Switch to Backend Mode

### Step 1: Set API_BASE_URL in app.js

Open `app.js` and find this line (near the top):

```javascript
const API_BASE_URL = ''; // Change to your backend URL for production
```

**For local development:**
```javascript
const API_BASE_URL = 'http://localhost:5000';
```

**For Render production:**
```javascript
const API_BASE_URL = 'https://study-platform-api.onrender.com';
```

**For custom domain:**
```javascript
const API_BASE_URL = 'https://api.yourdomain.com';
```

### Step 2: Start Backend Server

```bash
# Terminal 1: Backend
cd study-platform
npm install
npm run dev

# Should show:
# 📦 Study Platform Backend Started
# Server: http://localhost:5000
```

### Step 3: Update Frontend URL (if needed)

```bash
# Terminal 2: Frontend
# The frontend continues to serve from wherever it's running
# (e.g., http://localhost:3000 via HTTP server)
```

### Step 4: Test Integration

Visit your frontend and check the browser console:

```javascript
✅ Data loaded from Backend API: http://localhost:5000
✅ Data loaded successfully (70 topics, 3 subjects)
```

If you see errors, check:
1. Backend is running (`npm run dev`)
2. `API_BASE_URL` is set correctly
3. Backend port matches (default: 5000)
4. No CORS errors in browser console

---

## 📊 How It Works

### API Call Flow

**Local Mode (Default):**
```
App.js → fetch("data/subjects.json") → Browser reads local file → Data displayed
```

**Backend Mode:**
```
App.js → 
  USE_BACKEND = true,
  API_BASE_URL = "http://localhost:5000"
  ↓
fetchJson("data/subjects.json") → Converted to "http://localhost:5000/api/subjects"
  ↓
Backend receives request → Loads data/subjects.json → Returns API response
  ↓
Frontend receives API response → Data displayed
```

### Automatic Path Conversion

The `fetchJson()` function automatically converts local paths to API endpoints:

| Local Path | API Endpoint |
|-----------|-------------|
| `data/subjects.json` | `/api/subjects` |
| `data/past-papers.json` | `/api/past-papers` |
| `data/community.json` | `/api/community/forum` |
| `data/topics/chem/atomic-structure.json` | `/api/topics/atomic-structure?subject=chem` |

---

## 🔍 Debugging

### Check What Mode You're In

Open browser DevTools (F12) → Console and see:

```javascript
// Local mode
📚 Loading data from Local JSON files...

// Backend mode
📚 Loading data from Backend API: http://localhost:5000
```

### Test API Endpoints

Use curl or Postman:

```bash
# Test backend health
curl http://localhost:5000/

# Get subjects list
curl http://localhost:5000/api/subjects

# Get specific topic
curl "http://localhost:5000/api/topics/atomic-structure?subject=chem"

# Search topics
curl "http://localhost:5000/api/topics/search?q=atomic"
```

### CORS Issues

If you see CORS errors like:
```
Access to fetch at 'http://localhost:5000/api/subjects' 
from origin 'http://localhost:3000' has been blocked by CORS policy
```

**Solution:** Ensure backend has CORS enabled (it does by default in server.js)

Verify CORS is configured:
```javascript
// In server.js, this should exist:
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
```

---

## 🌐 Production Deployment

### Frontend & Backend on Same Domain (Recommended)

If both run on the same domain:

```javascript
// Backend API at same domain, /api path
const API_BASE_URL = `${window.location.origin}`;

// Requests go to: your-domain.com/api/subjects
```

Configure your reverse proxy (nginx/Apache):
```nginx
# Route API to backend
location /api {
  proxy_pass http://backend-server:5000;
}

# Route everything else to frontend
location / {
  proxy_pass http://frontend-server:3000;
}
```

### Frontend & Backend on Different Domains

```javascript
// Explicitly set backend API
const API_BASE_URL = 'https://api.yourdomain.com';

// Or use environment variable
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.yourdomain.com';
```

Update CORS in backend:
```javascript
// In server.js
app.use(cors({
  origin: 'https://www.yourdomain.com',
  credentials: true,
}));
```

---

## 📝 Code Examples

### Example 1: Load All Subjects

**Frontend automatically handles this:**
```javascript
// app.js internal call
const subjectsData = await fetchJson("data/subjects.json");
// Automatically converts to: GET /api/subjects
```

### Example 2: Manual API Call from Frontend

If you need to make custom API calls:

```javascript
async function customApiCall() {
  if (!API_BASE_URL) {
    console.error('Backend API not configured');
    return;
  }
  
  const response = await fetch(`${API_BASE_URL}/api/topics/search?q=atomic`);
  const data = await response.json();
  console.log('Search results:', data.results);
}
```

### Example 3: Search from Editor

```javascript
// In editor, search topics via API
async function searchTopics(query) {
  const url = USE_BACKEND 
    ? `${API_BASE_URL}/api/topics/search?q=${query}`
    : null; // Falls back to local search
  
  if (url) {
    const response = await fetch(url);
    const data = await response.json();
    return data.results;
  }
}
```

---

## 🔄 Dev to Production Checklist

- [ ] Backend deployed on Render (or your hosting)
- [ ] Environment variables set (FRONTEND_URL, DATABASE_URL, etc.)
- [ ] Update `API_BASE_URL` to production URL in app.js
- [ ] Test by accessing all major features
- [ ] Check browser console for errors
- [ ] Monitor backend logs for issues
- [ ] Verify all API endpoints respond correctly
- [ ] Test CORS on different domains

---

## 🧪 Testing Without Backend

To temporarily disable backend and test local mode:

```javascript
// In app.js
const API_BASE_URL = ''; // Empty string = local mode
```

You can toggle between modes instantly without restarting!

---

## 💾 Database Integration

### Switch from JSON to MongoDB

See BACKEND_README.md for database configuration.

### User Progress Sync

The backend is ready for user progress saving:

```javascript
// This endpoint exists and is ready
POST /api/user/progress
Body: {
  topicId: "atomic-structure",
  subject: "chem",
  confidence: 8,
  isComplete: true,
  quizScore: 85
}
```

Implement frontend call:
```javascript
async function saveTopicProgress(topicId, subject, confidence) {
  if (!API_BASE_URL) return; // Only works with backend
  
  await fetch(`${API_BASE_URL}/api/user/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topicId,
      subject,
      confidence,
      isComplete: confidence >= 8,
    })
  });
}
```

---

## 🚨 Troubleshooting

### "Failed to load data from API"
- ✅ Backend running? Check: `npm run dev`
- ✅ Port correct? Check: `http://localhost:5000`
- ✅ API_BASE_URL set? Check: app.js line ~18

### 404 on API endpoints
- ✅ Topic ID correct? Topics are kebab-case: `atomic-structure`
- ✅ Subject parameter supplied? `?subject=chem`
- ✅ Path case-sensitive? Yes, use lowercase

### No data displayed
- Check console error messages
- Verify backend responds: `curl http://localhost:5000/api/subjects`
- Check network tab in DevTools
- See full request/response

### CORS blocked
- Backend has CORS enabled by default
- Check browser console for full error
- Verify `FRONTEND_URL` in backend `.env`

---

## 📚 Next Steps

1. **Deploy Frontend** - Host on Vercel, Netlify, etc.
2. **Deploy Backend** - Deploy on Render (see RENDER_DEPLOYMENT_GUIDE.md)
3. **Add Authentication** - Implement JWT or OAuth
4. **Setup Database** - Replace JSON with MongoDB/PostgreSQL
5. **Monitor** - Setup error tracking and uptime monitoring

---

Need help? Check:
- backend server logs: `npm run dev` terminal
- Browser console: F12 → Console tab
- Network Tab: F12 → Network tab (see all API calls)
- BACKEND_README.md for server documentation
