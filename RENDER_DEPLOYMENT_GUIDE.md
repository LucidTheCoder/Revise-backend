# 🚀 Render Deployment Checklist

Complete step-by-step guide to deploy your Study Platform backend on Render in under 10 minutes.

## ✅ Pre-Deployment Checklist

- [ ] Node.js 18+ installed locally
- [ ] Git repository created
- [ ] Code pushed to GitHub
- [ ] Created Render account (free at render.com)
- [ ] `.env.example` created with all variables
- [ ] `.gitignore` includes `.env` 

## 🔧 Step 1: Prepare Code (Local)

```bash
# 1. Create .env file from template (local development only)
cp .env.example .env

# 2. Edit .env with your values
nano .env
# Set: FRONTEND_URL=http://localhost:3000 (for dev)

# 3. Test locally
npm install
npm run dev

# 4. Verify endpoints work
# In another terminal:
curl http://localhost:5000/
# Should return: { status: "healthy", ... }
```

## 📦 Step 2: Push to GitHub

```bash
# Initialize git if needed
git init
git add .
git commit -m "feat: add Express backend with API routes"

# Create repo on GitHub (github.com/new)
git remote add origin https://github.com/your-username/study-platform.git
git branch -M main
git push -u origin main
```

**IMPORTANT:** Verify `.gitignore` includes:
```
.env
node_modules/
package-lock.json
```

Show `.env` file is NOT in git:
```bash
git status
# Should NOT show .env in changes
```

## 🎯 Step 3: Create Render Service

1. **Login to Render**
   - Go to [render.com](https://render.com)
   - Click Dashboard → New +

2. **Create Web Service**
   - Select "Web Service"
   - Choose GitHub (check "Connect account" if needed)
   - Select your repository
   - Click "Connect"

3. **Configure Service**

   | Setting | Value |
   |---------|-------|
   | Name | `study-platform-api` |
   | Environment | `Node` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Plan | **Free** (or Starter for production) |
   | Region | *closest to your users* |

4. **Click "Create Web Service"**

## 🔐 Step 4: Set Environment Variables

In Render Dashboard:

1. Go to your service → **Settings**
2. Scroll to **Environment**
3. Add each variable:

```
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.com
DATABASE_TYPE=json
```

| Variable | Value | Example |
|----------|-------|---------|
| `PORT` | Leave blank or 5000 | Render sets automatically |
| `NODE_ENV` | `production` | Always production |
| `FRONTEND_URL` | Your frontend URL | `https://example.com` |
| `DATABASE_TYPE` | `json` | Change later if using DB |

**⚠️ IMPORTANT:** 
- Don't use `http://localhost:...` in production
- Use full HTTPS domain for CORS to work
- Save each variable individually

## 📊 Step 5: Monitor Deployment

1. Click the service
2. Go to **Logs** tab
3. Watch for messages:

```
✅ Building Docker image...
✅ Discovering dependencies...
✅ Installing dependencies...
✅ Running build command...
✅ Starting services...
📦 Study Platform Backend Started
   Server: http://localhost:5000
   Environment: production
```

**Wait until you see:** "listening on 0.0.0.0:5000" ✅

## 🔗 Step 6: Test Deployment

Your API is now live! Find your URL:

1. In Render Dashboard, go to your service
2. At the top, copy the URL (e.g., `https://study-platform-api.onrender.com`)
3. Test endpoints:

```bash
# Health check
curl https://study-platform-api.onrender.com/

# Get subjects
curl https://study-platform-api.onrender.com/api/subjects

# Search topics
curl "https://study-platform-api.onrender.com/api/topics/search?q=atomic"
```

All should return JSON responses! ✅

## 🔄 Step 7: Connect Frontend

Update your frontend to use the backend:

**In your `app.js`:**
```javascript
// Add at the top of your file
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

// When fetching data:
async function loadSubjects() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/subjects`);
    const data = await response.json();
    state.topics = new Map();
    
    // Process the data...
    return data.data;
  } catch (error) {
    console.error('Failed to load subjects:', error);
  }
}
```

## 🔄 Auto-Deployment

Every push to GitHub automatically redeploys! 🎉

```bash
# Make a change
echo "// Updated" >> server.js

# Commit and push
git add server.js
git commit -m "Update: fix API response format"
git push origin main

# Render automatically redeploys in ~2 minutes
# Check logs to see the new deployment
```

## 🆘 Troubleshooting

### Service won't start
- ❌ `npm start` not in package.json
  - **Fix:** Check package.json has `"start": "node server.js"`
- ❌ Missing environment variables
  - **Fix:** Add all vars from `.env.example` to Render Settings
- ❌ Syntax error in server.js
  - **Fix:** Test locally with `npm run dev`

### CORS errors in browser
- ❌ `FRONTEND_URL` not set or wrong
  - **Fix:** Set in Render Environment with full HTTPS domain
- ❌ Frontend calls `localhost:5000`
  - **Fix:** Use `${API_BASE_URL}` variable instead

### API returns 404
- ❌ Wrong endpoint path
  - **Fix:** Check route in `server.js` (case-sensitive)
- ❌ `?subject=` parameter missing
  - **Fix:** Pass `subject=chem` query for topic endpoints

### Slow response time
- ✅ Free plan has ~15 second spindown
  - **Solution:** Upgrade to Starter plan for production
- ✅ First request after idle is slow
  - **Normal:** Free plan pauses unused services

## 📈 Going to Production

For a real application:

1. **Upgrade Plan**
   - Free → Starter ($7/month)
   - Better performance, no cold starts

2. **Add Database**
   - MongoDB Atlas (free tier)
   - PostgreSQL on Render (paid)
   - See BACKEND_README.md for setup

3. **Enable Monitoring**
   - Setup error tracking (Sentry)
   - Monitor uptime (StatusPage)
   - Log analysis

4. **Security Hardening**
   - Add authentication (JWT)
   - Rate limiting
   - Input validation
   - HTTPS enforced (Render does this automatically)

5. **Setup CI/CD**
   - Run tests before deploy
   - Automated backup schedule
   - Database migrations

## 💬 Quick Commands Reference

```bash
# Local development
npm install
npm run dev

# Test locally
curl http://localhost:5000/api/subjects

# Deploy new version
git push origin main

# View logs (Render)
# Go to dashboard → Logs tab in browser
```

## 🎉 Success!

Your backend is now:
- ✅ Live on the internet
- ✅ Auto-deploys on every push
- ✅ Accessible to your frontend
- ✅ Ready for production users

**Next:** Update frontend to call backend APIs instead of loading local JSON files.

---

**Need help?**
- Render Docs: https://render.com/docs
- Express Docs: https://expressjs.com
- Common Issues: See BACKEND_README.md#troubleshooting
