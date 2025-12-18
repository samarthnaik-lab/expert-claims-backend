# Requirements & Dependencies

## System Requirements

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Operating System**: Windows, macOS, or Linux
- **Database**: PostgreSQL (via Supabase)

## Node.js Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^5.1.0 | Web application framework |
| `@supabase/supabase-js` | ^2.86.0 | Supabase client library |
| `jsonwebtoken` | ^9.0.2 | JWT token generation and verification |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing middleware |
| `dotenv` | ^17.2.3 | Environment variable management |
| `multer` | ^2.0.2 | File upload handling |
| `axios` | ^1.13.2 | HTTP client for external API calls |
| `uuid` | ^13.0.0 | UUID generation |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `nodemon` | ^3.1.11 | Development server with auto-reload |

## Installation

### Install all dependencies:
```bash
npm install
```

### Install production dependencies only:
```bash
npm install --production
```

### Install development dependencies:
```bash
npm install --save-dev nodemon
```

## Environment Requirements

### Required Environment Variables

Create a `.env` file with the following variables:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# JWT Configuration
JWT_SECRET=your_secret_key_here_minimum_32_characters

# MSG91 SMS Service Configuration (for OTP - Widget API)
MSG91_WIDGET_ID=your_msg91_widget_id
MSG91_API_KEY=your_msg91_api_key
# Note: Widget API generates and sends OTP automatically. We store metadata (requestId) in database.

# Server Configuration (Optional)
PORT=3000
```

### Getting Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to Settings > API
4. Copy the following:
   - Project URL → `SUPABASE_URL`
   - anon/public key → `SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

### Generating JWT Secret

Generate a secure random string for JWT_SECRET:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32
```

## Database Requirements

### Required Tables

The following tables must exist in your Supabase database:

- `users` - User accounts
- `employees` - Employee details
- `partners` - Partner details
- `customers` - Customer details
- `admin` - Admin details
- `cases` - Case management
- `backlog` - Backlog items
- `user_session_details` - Session management
- `otp` - OTP storage
- `case_types` - Case type definitions
- `document_categories` - Document categories

### Database Schema

Refer to `all the table.txt` for complete database schema definitions.

## API Requirements

### Required Headers

Most endpoints require:
- `Content-Type: application/json`
- `Authorization: Bearer {jwt_token}`
- `session_id: {session_id}` (for some endpoints)
- `jwt_token: {jwt_token}` (for some endpoints)

### CORS Configuration

The API is configured to accept requests from:
- `http://localhost:8080` (Frontend)
- Any localhost origin
- All origins (for webhook endpoints)

## Security Requirements

1. **JWT Secret**: Must be at least 32 characters long
2. **Password Hashing**: Passwords must be bcrypt hashed before sending to API
3. **HTTPS**: Use HTTPS in production
4. **Environment Variables**: Never commit `.env` file to version control

## Performance Requirements

- **Response Time**: API should respond within 2 seconds for most requests
- **Concurrent Requests**: Supports multiple concurrent requests
- **Database Connections**: Uses connection pooling via Supabase

## Browser Support

The API is backend-only and works with any HTTP client:
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Postman
- cURL
- Any HTTP client library

## Optional Tools

### Development Tools
- **Postman** - API testing
- **VS Code** - Code editor
- **Git** - Version control

### Monitoring (Optional)
- Application monitoring tools
- Error tracking services
- Log aggregation services

## Version Compatibility

- **Node.js**: Compatible with Node.js 18.x, 20.x, and 22.x
- **npm**: Compatible with npm 9.x and 10.x
- **PostgreSQL**: Requires PostgreSQL 12+ (managed by Supabase)

## Troubleshooting

### Common Issues

1. **Module not found errors**
   - Run `npm install` to install dependencies

2. **Database connection errors**
   - Verify Supabase credentials in `.env`
   - Check Supabase project status

3. **JWT errors**
   - Ensure JWT_SECRET is set in `.env`
   - Verify JWT_SECRET matches across services

4. **Port already in use**
   - Change PORT in `.env` or kill the process using port 3000

## Update Dependencies

To update all dependencies to latest versions:
```bash
npm update
```

To update a specific package:
```bash
npm update package-name
```

## Check for Outdated Packages

```bash
npm outdated
```

