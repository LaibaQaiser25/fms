# 🚀 FMS Authentication Quick Start

## One-Command Setup

```bash
# 1. Load the complete database schema (pgdb.sql)
psql -U postgres -d fms_db -f backend/db/pgdb.sql

# 2. Initialize demo user for authentication
cd backend
node scripts/initAuth.js

# 3. Start backend server
npm start

# In another terminal:

# 4. Start frontend
cd frontend
npm run dev
```

## Login Immediately

Once both servers are running, open the app and click **Login**:

```
Username: admin
Password: password123
```

You'll be redirected to the dashboard! 🎉

## What Just Happened?

1. ✅ Loaded complete database schema (pgdb.sql) with all tables
2. ✅ Verified `users` table exists
3. ✅ Added demo user (admin) to the users table
4. ✅ Backend auth endpoints are ready
5. ✅ Frontend can now login
6. ✅ Protected routes work
7. ✅ Token is stored and auto-attached to requests

## Key URLs

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:5000
- **Login**: http://localhost:5173 (click Login button on home page)
- **Dashboard**: http://localhost:5173/dashboard (after login)

## Features Enabled

✅ User registration
✅ Secure JWT-based login
✅ Role-based access control (owner/manager)
✅ Protected dashboard routes
✅ User profile menu with logout
✅ Automatic token attachment to API calls
✅ Auto-logout on token expiration

## Create Additional Users

### Via Backend API
```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john",
    "email": "john@example.com",
    "password": "password123",
    "role": "manager"
  }'
```

## Troubleshooting

### "Users table does not exist"
```bash
# Run the database schema first
psql -U postgres -d fms_db -f backend/db/pgdb.sql
```

### "Database connection failed"
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Verify credentials: postgres:postgres-25

### Backend won't start
```bash
# Check if port 5000 is in use
# Kill process or use different port
PORT=5001 npm start
```

### Login doesn't work
- Check browser console for errors
- Verify backend is running
- Clear localStorage: `localStorage.clear()`
- Try demo credentials again

### "Cannot find module 'bcrypt'"
- Optional: `npm install bcrypt` for secure password hashing

## Database Credentials

Default credentials in `.env`:
```
DATABASE_URL=postgresql://postgres:postgres-25@localhost:8000/fms_db
```

Adjust as needed for your PostgreSQL setup.

## 📚 Detailed Docs

- See `AUTH_SETUP.md` for full documentation
- See `AUTH_IMPLEMENTATION.md` for architecture details

---

**Ready?** Load pgdb.sql, run initAuth.js, then login with admin/password123! 🔐
