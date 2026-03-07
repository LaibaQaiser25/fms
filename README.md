# FMS (Factory Management System)

A complete, production-ready Factory Management System with three integrated business modules: Expenses, Assets, and Employees. Built with React, Node.js, Express, and PostgreSQL.

## 🎯 Project Status: COMPLETE ✅

**All features implemented and ready to use!**

## 📚 Documentation

- **[QUICKSTART.md](QUICKSTART.md)** ⭐ Start here for 30-second setup
- **[FMS_DOCUMENTATION.md](FMS_DOCUMENTATION.md)** - Complete technical guide
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - What's included

## 🚀 Quick Start

### 1. Database Setup
```bash
createdb fms_db
psql -U postgres -d fms_db -f backend/db/init.sql
```

### 2. Backend
```bash
cd backend
npm install
# Create .env file with DATABASE_URL
npm start
```

### 3. Frontend
```bash
cd frontend
npm install
# Create .env file with VITE_API_URL
npm run dev
```

Visit: http://localhost:5173

## ✨ Features

### Three Complete Business Modules

#### 💰 Expenses Module
- Track daily operational expenses
- 9 predefined categories (Petrol, Electricity, WiFi, etc.)
- Search, filter, sort, paginate
- Expense summary reports

#### 🏢 Assets Module
- Manage company assets (Furniture, Machinery, Building, Moulds)
- Track purchase cost and depreciation
- Asset lifecycle management
- Asset summary reports

#### 👥 Employees Module
- Employee database with 2 types (Company, Sub-contract)
- Salary and hire date tracking
- Payroll summary reports
- Employee search and filtering

### Global Features
✅ Advanced search across all fields
✅ Multi-criteria filtering
✅ Date range filtering
✅ Sorting (ascending/descending)
✅ Pagination (10 items per page)
✅ CRUD operations
✅ Modal forms
✅ Error handling & alerts
✅ Responsive design

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express 5.2.1 |
| Frontend | React 19, Vite 7.3 |
| Database | PostgreSQL |
| HTTP | Axios |
| Styling | Tailwind CSS 4.2 |
| Routing | React Router DOM 7.13 |

## 📊 Database

6 tables with proper relationships:
- expense_categories, expenses
- asset_categories, assets
- employee_types, employees

All pre-loaded with default categories and types.

## 🧩 UI Components

9 production-ready reusable components:
- Button, Input, Select
- Card, Modal, Table
- Pagination, FilterBar, Alert

## 📡 API

21 endpoints (7 per module):
- GET (list with filters)
- GET/:id (single item)
- POST (create)
- PUT/:id (update)
- DELETE/:id (delete)
- GET/categories or /types
- GET/summary (reports)

## 📁 What's Included

✅ Complete PostgreSQL schema
✅ 3 Full controllers with CRUD
✅ 3 Route handlers
✅ React components with routing
✅ Shared UI component library
✅ Axios API service layer
✅ Comprehensive documentation
✅ Environment templates
✅ Production-ready code

## 🔧 Configuration

### Backend (.env)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/fms_db
PORT=5000
NODE_ENV=development
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000/api
```

See `.env.example` files for templates.

## 🧪 Testing

```bash
# Create expense
curl -X POST http://localhost:5000/api/expenses \
  -H "Content-Type: application/json" \
  -d '{"categoryId":1,"description":"Test","amount":100,"date":"2024-12-01"}'

# Get all expenses with filters
curl "http://localhost:5000/api/expenses?categoryId=1&sortBy=amount&order=DESC"

# Update expense
curl -X PUT http://localhost:5000/api/expenses/1 \
  -H "Content-Type: application/json" \
  -d '{"categoryId":2,"description":"Updated","amount":200,"date":"2024-12-01"}'

# Delete expense
curl -X DELETE http://localhost:5000/api/expenses/1
```

## 📋 Project Structure

```
backend/
  ├── controllers/ (Expense, Asset, Employee)
  ├── routes/ (expenses, assets, employees)
  ├── db/
  │   └── init.sql
  ├── server.js
  └── .env.example

frontend/
  ├── src/
  │   ├── services/apiService.js
  │   ├── components/
  │   │   ├── shared/UIComponents.jsx
  │   │   ├── Expenses/
  │   │   ├── Assets/
  │   │   ├── Employees/
  │   │   ├── Sidebar.jsx
  │   │   └── Layout.jsx
  │   └── App.jsx
  └── .env.example
```

## 🎓 Key Features

- **Modular Code** - Easy to extend and maintain
- **Security** - Parameterized queries, CORS enabled
- **Performance** - Database indexing, pagination
- **UX** - Responsive design, smooth interactions
- **Error Handling** - User-friendly messages
- **Validation** - Client and server-side

## 🔄 Data Flow

```
User Action → React Component → Axios API → Express Route 
→ Controller → PostgreSQL → Response → UI Update
```

## 🚦 Troubleshooting

**Database Connection Error**
- Ensure PostgreSQL is running
- Check DATABASE_URL in backend/.env
- Verify database exists: `psql -l`

**Port Already in Use**
- Change PORT in backend/.env
- Frontend will use next available port

**CORS Errors**
- Check VITE_API_URL in frontend/.env
- Ensure backend server is running

**Modules Not Loading**
- Run `npm install` in both directories
- Restart dev servers
- Check browser console for errors

## 📖 Next Steps

1. Read [QUICKSTART.md](QUICKSTART.md) for setup
2. Review [FMS_DOCUMENTATION.md](FMS_DOCUMENTATION.md) for details
3. Check [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for code details
4. Start the application
5. Test the modules

## 🚀 Deployment

Frontend can be deployed to Vercel, Netlify, etc.
Backend can be deployed to Heroku, Railway, AWS, etc.

Build frontend:
```bash
cd frontend
npm run build
```

## 📈 Performance

- Database indexes on frequently queried columns
- Pagination prevents large data transfers
- Efficient filtering and sorting
- Optimized React components
- Fast Vite build times

## ✅ Quality Checklist

- [x] All modules fully implemented
- [x] Complete CRUD operations
- [x] Advanced search and filtering
- [x] Pagination and sorting
- [x] Error handling
- [x] Responsive UI
- [x] Documentation
- [x] Environment configuration
- [x] Production-ready code

## 📄 License

ISC

## 👥 Authors

Built as a complete FYP (Final Year Project) solution - 2026

---

**Ready to use!** Start with [QUICKSTART.md](QUICKSTART.md)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
