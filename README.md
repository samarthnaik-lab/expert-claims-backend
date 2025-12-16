# Expert Claims Backend API

Backend API server for Expert Claims management system built with Node.js and Express.js.

## 🚀 Features

- **User Management**: Create, read, update, and soft delete users (Admin, Employee, Partner, Customer)
- **Authentication**: JWT-based authentication with session management
- **Role-Based Access**: Support for multiple user roles (admin, employee, partner, customer)
- **Dashboard Statistics**: Admin dashboard with real-time statistics
- **Database Integration**: Supabase PostgreSQL database integration
- **File Upload**: Document upload support with Multer
- **RESTful API**: Clean REST API design

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- Supabase account and project
- PostgreSQL database (via Supabase)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd expert-claims-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   # Supabase Configuration
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   # JWT Configuration
   JWT_SECRET=your_jwt_secret_key

   # Server Configuration
   PORT=3000
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Start the production server**
   ```bash
   npm start
   ```

## 📁 Project Structure

```
expert-claims-backend/
├── config/
│   └── database.js          # Database configuration
├── controllers/
│   ├── adminController.js    # Admin operations
│   ├── authController.js     # Authentication
│   ├── customerController.js # Customer operations
│   ├── partnerController.js  # Partner operations
│   └── supportController.js  # Support operations
├── middleware/
│   ├── authMiddleware.js     # Authentication middleware
│   └── uploadMiddleware.js   # File upload middleware
├── models/
│   ├── UserModel.js          # User model
│   ├── PartnerModel.js       # Partner model
│   ├── CustomerModel.js      # Customer model
│   └── ...                   # Other models
├── routes/
│   ├── adminRoutes.js        # Admin routes
│   ├── authRoutes.js         # Auth routes
│   ├── customerRoutes.js     # Customer routes
│   ├── partnerRoutes.js      # Partner routes
│   └── supportRoutes.js      # Support routes
├── services/
│   └── authService.js        # Authentication service
├── utils/
│   ├── idGenerator.js        # ID generation utilities
│   └── validators.js          # Validation utilities
├── app.js                     # Main application file
├── package.json               # Dependencies
└── .env                       # Environment variables (not in git)
```

## 🔌 API Endpoints

### Admin Endpoints

#### Dashboard
- `GET /admin/admindashboard` - Get admin dashboard statistics

#### User Management
- `GET /admin/getusers?page={page}&size={size}` - Get all users (paginated)
- `GET /admin/getusers?id={id}&type=edit` - Get single user by ID for editing
- `POST /admin/createuser` - Create a new user
- `PATCH /admin/updateuser` - Update an existing user
- `DELETE /admin/deleteuser?user_id={user_id}` - Soft delete a user

### Authentication Endpoints
- `POST /api/login` - User login
- `POST /api/logout` - User logout

### Partner Endpoints
- Various partner-related endpoints under `/api`

### Customer Endpoints
- Various customer-related endpoints under `/customer`

### Support Endpoints
- Various support-related endpoints under `/support`

## 📝 API Documentation

### Create User Example

```bash
curl -X POST 'http://localhost:3000/admin/createuser' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer {token}' \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email_address": "john.doe@example.com",
    "password": "$2b$10$hashed_password",
    "username": "john.doe@example.com",
    "role": "employee",
    "mobile_number": "+1234567890",
    "designation": "senior_developer",
    "department": "engineering"
  }'
```

### Get Users Example

```bash
curl 'http://localhost:3000/admin/getusers?page=1&size=10' \
  -H 'Authorization: Bearer {token}'
```

### Delete User Example

```bash
curl -X DELETE 'http://localhost:3000/admin/deleteuser?user_id=1' \
  -H 'Authorization: Bearer {token}'
```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```http
Authorization: Bearer {jwt_token}
```

## 🗄️ Database

The application uses Supabase (PostgreSQL) as the database. Key tables include:

- `users` - User accounts
- `employees` - Employee details
- `partners` - Partner details
- `customers` - Customer details
- `admin` - Admin details
- `cases` - Case management
- `backlog` - Backlog items
- `user_session_details` - Session management

## 🧪 Testing

Run tests (when implemented):
```bash
npm test
```

## 📦 Dependencies

### Production Dependencies
- `express` - Web framework
- `@supabase/supabase-js` - Supabase client
- `jsonwebtoken` - JWT authentication
- `bcryptjs` - Password hashing
- `cors` - CORS middleware
- `dotenv` - Environment variables
- `multer` - File upload handling
- `axios` - HTTP client
- `uuid` - UUID generation

### Development Dependencies
- `nodemon` - Development server with auto-reload

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `JWT_SECRET` | Secret key for JWT signing | Yes |
| `PORT` | Server port (default: 3000) | No |

## 🚦 Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid request
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (e.g., duplicate email)
- `500 Internal Server Error` - Server error

## 📄 License

ISC

## 👥 Authors

Expert Claims Development Team

## 📞 Support

For support, email support@expertclaims.com or open an issue in the repository.

## 🔄 Version History

- **v1.0.0** - Initial release
  - User management (CRUD operations)
  - Admin dashboard
  - Authentication system
  - Role-based access control

