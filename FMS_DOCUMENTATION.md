# FMS (Factory Management System) - Setup & Documentation

## Project Overview
The FMS is a comprehensive factory management system with three main modules:
1. **Expenses Module** - Track daily expenses across multiple categories
2. **Assets Module** - Manage company assets and depreciation
3. **Employee Module** - Manage company and contract employees

## Tech Stack
- **Backend**: Node.js, Express, PostgreSQL
- **Frontend**: React 19, React Router DOM, Tailwind CSS, Vite
- **Build Tool**: Vite
- **HTTP Client**: Axios
- **Database**: PostgreSQL

## Prerequisites
- Node.js (v18+)
- PostgreSQL (v12+)
- npm or yarn

## Installation & Setup

### 1. Database Setup

#### Create PostgreSQL Database
```bash
createdb fms_db
```

#### Run Database Initialization
```bash
psql -U postgres -d fms_db -f backend/db/init.sql
```

This will create all tables with default categories and types:
- **Expense Categories**: Daily Expenses, Petrol, WiFi, Electricity, Gas, Maintenance, Carriage, Staff Transportation, General Office Expense
- **Asset Categories**: Furniture, Machinery, Building, Moulds
- **Employee Types**: Company, Sub-contract

### 2. Backend Setup

#### Install Dependencies
```bash
cd backend
npm install
```

#### Environment Variables
Create `.env` file in backend directory:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/fms_db
PORT=5000
NODE_ENV=development
```

#### Start Backend Server
```bash
npm start
# Server runs on http://localhost:5000
```

### 3. Frontend Setup

#### Install Dependencies
```bash
cd frontend
npm install
```

#### Environment Variables
Create `.env` file in frontend directory:
```env
VITE_API_URL=http://localhost:5000/api
```

#### Run Development Server
```bash
npm run dev
# Frontend runs on http://localhost:5173
```

#### Build for Production
```bash
npm run build
npm run preview
```

## Project Structure

### Backend (`/backend`)
```
controllers/
  ├── ExpenseController.js      # Expense operations
  ├── AssetController.js        # Asset operations
  └── EmployeeController.js     # Employee operations

routes/
  ├── expenses.js              # Expense routes
  ├── assets.js                # Asset routes
  └── employees.js             # Employee routes

db/
  ├── pool.js                  # PostgreSQL connection pool
  └── init.sql                 # Database schema

server.js                        # Express server setup
```

### Frontend (`/frontend/src`)
```
components/
  ├── shared/
  │   └── UIComponents.jsx     # Reusable UI components
  ├── Expenses/
  │   ├── ExpenseList.jsx      # List & manage expenses
  │   └── ExpenseForm.jsx      # Create/edit form
  ├── Assets/
  │   ├── AssetList.jsx        # List & manage assets
  │   └── AssetForm.jsx        # Create/edit form
  ├── Employees/
  │   ├── EmployeeList.jsx     # List & manage employees
  │   └── EmployeeForm.jsx     # Create/edit form
  ├── Sidebar.jsx              # Navigation sidebar
  └── Layout.jsx               # Main layout wrapper

services/
  └── apiService.js            # API calls (axios)

App.jsx                         # Main app with routing
main.jsx                        # React entry point
```

## API Endpoints

### Expenses
- `GET /api/expenses` - Get all expenses (with pagination & filters)
- `GET /api/expenses/:id` - Get single expense
- `GET /api/expenses/categories` - Get expense categories
- `GET /api/expenses/summary` - Get expense summary by category
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense

### Assets
- `GET /api/assets` - Get all assets (with pagination & filters)
- `GET /api/assets/:id` - Get single asset
- `GET /api/assets/categories` - Get asset categories
- `GET /api/assets/summary` - Get asset summary by category
- `POST /api/assets` - Create asset
- `PUT /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset

### Employees
- `GET /api/employees` - Get all employees (with pagination & filters)
- `GET /api/employees/:id` - Get single employee
- `GET /api/employees/types` - Get employee types
- `GET /api/employees/summary` - Get employee summary by type
- `POST /api/employees` - Create employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee

## Features

### Global Features Across All Modules
✅ **Search** - Full-text search across relevant fields
✅ **Filtering** - Filter by category, status, date range
✅ **Sorting** - Sort by amount, date, name, etc.
✅ **Pagination** - 10 items per page with navigation
✅ **CRUD Operations** - Create, Read, Update, Delete
✅ **Form Validation** - Client & server-side validation
✅ **Error Handling** - User-friendly error messages
✅ **Success Notifications** - Confirmation messages

### Expenses Module
- Track daily expenses by category
- View spending trends
- Filter by category, date range
- Search descriptions and notes
- Calculate total spending per category

### Assets Module
- Register and track company assets
- Monitor asset depreciation
- Track purchase and current value
- Filter by category and status
- View asset summary and totals

### Employees Module
- Manage company and contract employees
- Track salary information
- Monitor hiring dates
- Filter by employee type and status
- View employee summary and salary statistics

## Shared UI Components

### Button
Props: `type`, `variant` (primary|secondary|danger|success), `size` (sm|md|lg)

### Input
Props: `label`, `type`, `error`, `placeholder`

### Select
Props: `label`, `options`, `error`

### Table
Props: `columns`, `data`, `loading`, `onEdit`, `onDelete`

### Modal
Props: `isOpen`, `title`, `onClose`, `size` (sm|md|lg|xl)

### Pagination
Props: `currentPage`, `totalPages`, `onPageChange`

### FilterBar
Props: `filters`, `onFilterChange`

### Alert
Props: `type` (success|error|warning|info), `message`, `onClose`

## Styling
- **Tailwind CSS** for all styling
- **Color Scheme**: Blue (primary), Gray (secondary), Red (danger), Green (success)
- **Responsive Design**: Mobile-first approach
- **Dark Navigation**: Dark sidebar with light main content

## Query Parameters

### Pagination
```
page=1         # Page number (1-based)
limit=10       # Items per page
```

### Filtering
```
search=text              # Search term
categoryId=1             # Category ID
status=active            # Status filter
startDate=2024-01-01     # From date
endDate=2024-12-31       # To date
```

### Sorting
```
sortBy=date              # Sort column
order=ASC|DESC           # Sort direction
```

Example Request:
```
GET /api/expenses?categoryId=1&startDate=2024-01-01&endDate=2024-12-31&sortBy=amount&order=DESC&page=1&limit=10
```

## Database Schema

### Expenses Table
```sql
id SERIAL PRIMARY KEY
category_id INTEGER - Foreign key to expense_categories
description TEXT
amount DECIMAL(12,2)
date DATE
notes TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### Assets Table
```sql
id SERIAL PRIMARY KEY
category_id INTEGER - Foreign key to asset_categories
name VARCHAR(255)
description TEXT
purchase_date DATE
purchase_cost DECIMAL(12,2)
current_value DECIMAL(12,2)
depreciation_rate DECIMAL(5,2)
status VARCHAR(20)
location VARCHAR(255)
created_at TIMESTAMP
updated_at TIMESTAMP
```

### Employees Table
```sql
id SERIAL PRIMARY KEY
employee_type_id INTEGER - Foreign key to employee_types
first_name VARCHAR(100)
last_name VARCHAR(100)
email VARCHAR(100)
phone VARCHAR(20)
position VARCHAR(100)
salary DECIMAL(12,2)
hire_date DATE
status VARCHAR(20)
department VARCHAR(100)
created_at TIMESTAMP
updated_at TIMESTAMP
```

## Running the Application

### Development Mode
```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Access the application at `http://localhost:5173`

### Production Mode
```bash
# Build frontend
cd frontend
npm run build

# Run backend (ensure PostgreSQL is running)
cd backend
npm start
```

## Troubleshooting

### Database Connection Error
- Ensure PostgreSQL is running
- Check DATABASE_URL in .env
- Verify database exists: `psql -l`

### Port Already in Use
- Backend: Change PORT in .env (default 5000)
- Frontend: Vite will use next available port

### CORS Errors
- Backend has CORS enabled for all origins
- Check API_URL in frontend .env

### Module Not Found
- Run `npm install` in both backend and frontend
- Clear node_modules and reinstall if issues persist

## Contributing
When adding new features:
1. Create controllers in backend
2. Create routes in backend
3. Create API service methods in frontend
4. Create components using shared UI components
5. Update routing in App.jsx
6. Add navigation in Sidebar.jsx

## License
ISC
