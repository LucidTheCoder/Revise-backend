# Admin Access Guide
### Revise. — Cambridge AS Level Study Platform

---

## How admin works

The platform uses **role-based access**. Every registered user has a `role` field in MongoDB, set to `"student"` by default. Admins have `role: "admin"`. The first admin must be set directly in MongoDB — after that, admins can promote others from the Admin Panel.

---

## Step 1 — Register an account

1. Open your deployed site (e.g. `https://revise-backend-yp6e.onrender.com`)
2. Click **Sign In** → **Create one** to switch to the register tab
3. Fill in your name, email, and a password (min 8 characters)
4. Click **Create Account**

You are now a `student`. Continue to Step 2 to promote yourself.

---

## Step 2 — Promote yourself to admin in MongoDB Atlas

You need to do this once. After this, you can promote others from inside the app.

### Option A — MongoDB Atlas UI (easiest)

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) and sign in
2. Click your cluster → **Browse Collections**
3. Select database **`revise`** → collection **`users`**
4. Find your user document (search by email if needed)
5. Click the **pencil icon** to edit the document
6. Change the `role` field from `"student"` to `"admin"`
7. Click **Update**

That's it — your account is now admin.

### Option B — MongoDB Atlas Shell

1. In Atlas, click **Connect** → **MongoDB Shell**
2. Paste and run this command (replace the email):

```js
use revise
db.users.updateOne(
  { email: "your@email.com" },
  { $set: { role: "admin" } }
)
```

You should see `{ acknowledged: true, matchedCount: 1, modifiedCount: 1 }`.

---

## Step 3 — Sign in and access the Admin Panel

1. Refresh your site
2. Sign in with the account you just promoted
3. A new **Admin** button will appear in the navigation bar (only visible to admins)
4. Click **Admin** to open the panel

---

## What you can do in the Admin Panel

### Dashboard tab
- See live stats: total users, forum threads, chat messages, admin count
- View the 5 most recently registered users
- View the 5 most recently created forum threads

### Users tab
- See every registered account with email, role, and join date
- **Make Admin** — promote any student to admin
- **Demote** — remove admin from another admin (you cannot demote yourself)
- **Ban** — prevent a user from sending chat messages (their token is rejected at the socket level)
- **Unban** — restore a banned user
- **Delete** — permanently remove a user and their data
- Use the search box to filter by name or email

### Forum tab
- See all threads with subject, author, reply count, and status
- **Pin** a thread — it will float to the top of the forum list with a 📌 badge
- **Unpin** — remove the pin
- **Lock** a thread — prevents new replies (only admins can still reply)
- **Unlock** — re-open the thread
- **Delete** — permanently remove a thread and all its replies
- Use the search box to filter by title or author

### Pages / Topics tab
- Select a subject (Chemistry, Biology, Physics) to see all topic files
- Each topic card shows the topic name, unit, and ID
- Click **Edit** to jump directly to that topic in the Topic Editor
- From the Editor you can edit the JSON, save it to the server, or delete it
- Saving requires admin login — the editor will call `PUT /api/topics/:id` automatically

### New Thread tab
- Create a forum thread as the admin (great for announcements)
- Check **Pin thread** to immediately pin it so all students see it first
- Choose the subject or leave it as **General**

---

## Promoting other users to admin

Once you are admin, you don't need MongoDB Atlas again. Just:

1. Go to **Admin → Users**
2. Find the user you want to promote
3. Click **Make Admin**

They will see the Admin button the next time they refresh.

---

## Security notes

| What | Why |
|---|---|
| The `requireAdmin` middleware on the server checks `req.user.role === 'admin'` on every admin API call | Even if someone guesses an admin URL, they can't use it without a valid admin JWT |
| Admin button is hidden client-side for non-admins | UX convenience only — the real protection is server-side |
| You cannot delete or demote yourself | Prevents accidentally locking yourself out |
| You cannot ban yourself | Same reason |
| JWT tokens expire after 7 days (set in `.env` as `JWT_EXPIRES_IN=7d`) | Short-lived tokens limit damage if a token leaks |
| Never commit your `.env` file | It contains your MongoDB URI and JWT secret — `.gitignore` already excludes it |

---

## Troubleshooting

**I don't see the Admin button after changing my role**
→ Sign out and sign back in. The JWT stores role at login time, so a re-login is needed after a role change.

**Atlas update ran but role still shows student**
→ Check you updated the correct database (`revise`) and collection (`users`). Also check the email matches exactly (all lowercase).

**"Admin access required" toast when clicking Admin**
→ Your token is from before the role change. Sign out and back in.

**The Admin panel loads but all tables say "Network error"**
→ Your Render server may be sleeping (free tier spins down after 15 min of inactivity). Wait ~30 seconds for it to wake up, then refresh.
