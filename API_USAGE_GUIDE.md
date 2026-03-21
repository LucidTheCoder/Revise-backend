# Backend API Usage Guide

Complete reference for all available API endpoints.

## User Progress Endpoints

### Save Topic Progress
```javascript
POST /api/user/progress

Headers: {
  'x-user-id': 'user-123' (optional, defaults to 'default-user')
}

Body: {
  topicId: 'atomic-structure',
  subject: 'chem',
  confidence: 85,        // 0-100
  isComplete: true,
  quizScore: 92         // 0-100, null if not taken
}

Response: {
  success: true,
  message: 'Progress saved',
  data: { topicId, subject, confidence, isComplete, quizScore, completedAt, updatedAt }
}
```

### Get All User Progress
```javascript
GET /api/user/progress

Headers: {
  'x-user-id': 'user-123' (optional)
}

Response: {
  success: true,
  data: {
    progress: { [topicId]: { ... } },
    stats: { totalTopicsCompleted, totalQuizzesCompleted, averageQuizScore, ... },
    totalProgressed: 45
  }
}
```

### Get Specific Topic Progress
```javascript
GET /api/user/progress/:topicId

Example: /api/user/progress/atomic-structure

Headers: {
  'x-user-id': 'user-123' (optional)
}

Response: {
  success: true,
  data: {
    topicId: 'atomic-structure',
    subject: 'chem',
    confidence: 85,
    isComplete: true,
    quizScore: 92,
    completedAt: '2026-03-21T10:30:00Z',
    updatedAt: '2026-03-21T10:30:00Z'
  }
}
```

## User Stats & Analytics Endpoints

### Get User Statistics
```javascript
GET /api/user/stats

Headers: {
  'x-user-id': 'user-123' (optional)
}

Response: {
  success: true,
  data: {
    totalTopicsCompleted: 12,
    totalQuizzesCompleted: 15,
    averageQuizScore: 78.5,
    streak: 5,
    xp: 2450,
    totalMinutesStudied: 1200,
    lastActiveAt: '2026-03-21T15:45:00Z',
    completionRate: 25,
    weakTopics: [
      { topicId: 'electrochemistry', subject: 'chem', score: 52, confidence: 60 }
    ],
    topicsProgressed: 48
  }
}
```

### Update User Stats
```javascript
POST /api/user/stats/update

Headers: {
  'x-user-id': 'user-123' (optional)
}

Body: {
  xpGain: 50,           // Add to total XP
  addToStreak: 1,       // Increment streak by 1
  minutesStudied: 45    // Add to total study time
}

Response: {
  success: true,
  message: 'Stats updated',
  data: { totalTopicsCompleted, xp, streak, totalMinutesStudied, ... }
}
```

### Get Detailed Learning Analytics
```javascript
GET /api/user/analytics

Headers: {
  'x-user-id': 'user-123' (optional)
}

Response: {
  success: true,
  data: {
    bySubject: {
      'chem': {
        subject: 'chem',
        topicsCompleted: 8,
        averageScore: 82,
        averageConfidence: 85,
        topics: [{ topicId, score, confidence }, ...]
      },
      'bio': { ... },
      'phy': { ... }
    },
    overallStats: { ... },
    learningInsights: {
      bestSubject: 'chem',
      needsWork: 'physics',
      confidenceLevel: 'Moderate'
    }
  }
}
```

## Advanced Search & Filtering

### Advanced Paper Filtering
```javascript
GET /api/papers/advanced?subject=chem&year=2025&session=May/June&difficulty=High&sortBy=year-desc&limit=20

Query Parameters:
- subject: 'chem' | 'bio' | 'phy'
- year: integer (e.g., 2025)
- session: 'May/June' | 'Oct/Nov'
- difficulty: 'Low' | 'Medium' | 'High'
- sortBy: 'year-asc' | 'year-desc' | 'difficulty'
- limit: 1-100 (default: 20)

Response: {
  success: true,
  data: [ { id, subject, code, year, session, paper, variant, title, difficulty, downloadUrl }, ... ],
  count: 12,
  totalAvailable: 45,
  filters: { subject, year, session, difficulty }
}
```

### Advanced Topic Search
```javascript
GET /api/topics/advanced-search?q=atomic&subject=chem&limit=10

Query Parameters:
- q: search query (minimum 2 characters)
- subject: 'chem' | 'bio' | 'phy' (optional, filters by subject)
- limit: 1-50 (default: 10)

Response: {
  success: true,
  query: 'atomic',
  data: [
    {
      subjectId: 'chem',
      subjectName: 'Chemistry',
      unitName: 'Physical Chemistry',
      topicId: 'atomic-structure',
      topicName: '1. Atomic Structure',
      topicFile: 'atomic-structure.json',
      relevance: 0.95
    }
  ],
  count: 5,
  totalMatches: 12
}
```

## Frontend Integration Examples

### Save Topic Progress After Quiz
```javascript
async function saveTopicProgress(topicId, quizScore) {
  const response = await fetch(`${API_BASE_URL}/api/user/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': localStorage.getItem('userId') || 'default-user'
    },
    body: JSON.stringify({
      topicId,
      subject: state.currentSubject,
      confidence: calculateConfidence(),
      isComplete: true,
      quizScore
    })
  });
  
  const result = await response.json();
  if (result.success) {
    console.log('✅ Progress saved');
    // Update UI with new stats
    loadUserStats();
  }
}
```

### Load User Statistics
```javascript
async function loadUserStats() {
  const response = await fetch(`${API_BASE_URL}/api/user/stats`, {
    headers: {
      'x-user-id': localStorage.getItem('userId') || 'default-user'
    }
  });
  
  const result = await response.json();
  if (result.success) {
    state.userStats = result.data;
    console.log(`Completed: ${result.data.totalTopicsCompleted} topics`);
    console.log(`Streak: ${result.data.streak} days`);
    console.log(`XP: ${result.data.xp}`);
  }
}
```

### Search Topics Advanced
```javascript
async function advancedSearch(query, subject = null) {
  const url = new URL(`${API_BASE_URL}/api/topics/advanced-search`);
  url.searchParams.set('q', query);
  if (subject) url.searchParams.set('subject', subject);
  url.searchParams.set('limit', 10);
  
  const response = await fetch(url);
  const result = await response.json();
  
  return result.data; // Returns array of topics with relevance ranking
}
```

## User ID System

By default, all endpoints use `'default-user'` if no `x-user-id` header is provided. To support multiple users:

```javascript
// Set user ID in localStorage
localStorage.setItem('userId', 'user-' + Date.now());

// Include in all requests
headers: {
  'x-user-id': localStorage.getItem('userId')
}
```

## Notes

- **User ID**: Pass via `x-user-id` header. Defaults to `'default-user'` if not provided
- **Data Persistence**: Currently stored in-memory (persists during server session)
- **Production**: For production, replace in-memory storage with database (MongoDB/PostgreSQL)
- **Authentication**: These endpoints are placeholder-ready for JWT authentication
- **CORS**: Enabled for all origins (configure `FRONTEND_URL` in `.env` for production)

## Next Steps

1. **Database Integration**: Replace in-memory storage with MongoDB Atlas or PostgreSQL
2. **JWT Authentication**: Add user authentication with token verification
3. **Admin Panel**: Protect topic editor endpoints with admin token validation
4. **Advanced Statistics**: Add more learning analytics and recommendations
