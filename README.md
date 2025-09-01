# Gym Member Management - Backend API

Backend API server untuk sistem manajemen member gym menggunakan Express.js dan Prisma.

## 🚀 Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Setup database**
   ```bash
   npm run db:push
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Server akan berjalan di:** http://localhost:3000

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - Login admin

### Members
- `GET /api/members` - Get all members
- `POST /api/members` - Create new member
- `PUT /api/members/:id` - Update member
- `DELETE /api/members/:id` - Delete member

### Packages
- `GET /api/packages` - Get membership packages

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

## 🔐 Default Login
- Username: `admin`
- Password: `admin123`

## 🛠️ Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite with Prisma ORM
- **Authentication**: JWT + bcrypt
- **Environment**: dotenv

## 📁 Project Structure
```
gym-backend/
├── app.js              # Main application file
├── prisma.js           # Database configuration
├── package.json        # Dependencies and scripts
├── .env               # Environment variables
├── middleware/        # Express middlewares
│   └── auth.js       # JWT authentication
├── prisma/           # Database schema
│   └── schema.prisma
└── database/         # SQLite database file
    └── gym.db
```