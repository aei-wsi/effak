# EFFAK - Emergency Financial First Aid Kit

A secure, full-stack application for managing and sharing emergency financial documents with trusted contacts during crisis situations.

## Overview

EFFAK helps families organize critical documents and provide emergency access to trusted contacts when needed. Features include:

- **Multi-user Household Management**: Create households with multiple family members
- **Document Organization**: Sort documents by category and family member
- **Emergency Contact Sharing**: Grant granular permissions to trusted contacts
- **Secure Access Control**: JWT-based authentication with role-based permissions
- **Time-limited Access**: Emergency access links with configurable expiration
- **Audit Logging**: Track all document access and changes

## Tech Stack

### Backend
- **Node.js** with Express.js
- **PostgreSQL** for data persistence
- **JWT** for authentication
- **bcrypt** for password hashing
- **Nodemailer** for email notifications
- **Twilio** for SMS notifications (optional)
- **Winston** for logging

### Security Features
- Helmet.js for security headers
- CORS protection
- Rate limiting
- Input validation with express-validator
- SQL injection protection with parameterized queries

## Database Schema

The application uses 12 PostgreSQL tables:

1. **users** - User accounts and authentication
2. **households** - Family/household groups
3. **household_members** - Members within households
4. **document_categories** - Document classification
5. **documents** - Uploaded documents and metadata
6. **emergency_contacts** - Trusted emergency contacts
7. **emergency_contact_permissions** - Granular access permissions
8. **emergency_access_logs** - Audit trail for emergency access
9. **document_shares** - Document sharing between users
10. **activity_logs** - General activity tracking
11. **notifications** - User notifications
12. **sessions** - Session management

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 12
- npm >= 9.0.0

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd effak
```

### 2. Install dependencies

```bash
cd backend
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server
NODE_ENV=development
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=effak
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key_here
JWT_EXPIRE=30d

# Email (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password

# Twilio (optional, for SMS)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
```

### 4. Create PostgreSQL database

```bash
psql -U postgres
CREATE DATABASE effak;
\q
```

### 5. Run database migrations

```bash
npm run migrate
```

This will create all 12 tables with proper indexes and relationships.

### 6. Start the server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "token": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

#### Get Profile
```http
GET /api/auth/profile
Authorization: Bearer <token>
```

#### Update Profile
```http
PUT /api/auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "+1987654321"
}
```

#### Change Password
```http
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

#### Forgot Password
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Reset Password
```http
POST /api/auth/reset-password/:token
Content-Type: application/json

{
  "password": "newpassword123"
}
```

### Household Endpoints

#### Get All Households
```http
GET /api/households
Authorization: Bearer <token>
```

#### Create Household
```http
POST /api/households
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Smith Family"
}
```

#### Get Household by ID
```http
GET /api/households/:householdId
Authorization: Bearer <token>
```

#### Update Household
```http
PUT /api/households/:householdId
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Family Name"
}
```

#### Delete Household
```http
DELETE /api/households/:householdId
Authorization: Bearer <token>
```

#### Get Household Members
```http
GET /api/households/:householdId/members
Authorization: Bearer <token>
```

#### Add Member to Household
```http
POST /api/households/:householdId/members
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "member@example.com",
  "role": "member",
  "relationship": "spouse"
}
```

#### Update Member Role
```http
PUT /api/households/:householdId/members/:memberId
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "admin",
  "relationship": "parent"
}
```

#### Remove Member
```http
DELETE /api/households/:householdId/members/:memberId
Authorization: Bearer <token>
```

### Emergency Contact Endpoints

#### Get All Emergency Contacts
```http
GET /api/households/:householdId/emergency-contacts
Authorization: Bearer <token>
```

#### Get Emergency Contact by ID
```http
GET /api/households/:householdId/emergency-contacts/:contactId
Authorization: Bearer <token>
```

#### Create Emergency Contact
```http
POST /api/households/:householdId/emergency-contacts
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "phone": "+1234567890",
  "relationship": "sister",
  "isPrimary": false,
  "notes": "Call in case of emergency"
}
```

#### Update Emergency Contact
```http
PUT /api/households/:householdId/emergency-contacts/:contactId
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Jane",
  "phone": "+1987654321",
  "isPrimary": true
}
```

#### Delete Emergency Contact
```http
DELETE /api/households/:householdId/emergency-contacts/:contactId
Authorization: Bearer <token>
```

#### Grant Permission to Contact
```http
POST /api/households/:householdId/emergency-contacts/:contactId/permissions
Authorization: Bearer <token>
Content-Type: application/json

{
  "categoryId": 1,
  "canView": true,
  "canDownload": false,
  "expiresInHours": 72
}
```

#### Revoke Permission
```http
DELETE /api/households/:householdId/emergency-contacts/:contactId/permissions/:permissionId
Authorization: Bearer <token>
```

#### Send Emergency Access Link
```http
POST /api/households/:householdId/emergency-contacts/:contactId/send-access
Authorization: Bearer <token>
Content-Type: application/json

{
  "method": "email"
}
```

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "database": "connected"
}
```

## Authorization

Most endpoints require a valid JWT token. Include it in the Authorization header:

```
Authorization: Bearer <your_token_here>
```

## Role-Based Access Control

- **Admin**: Full access to household management, can add/remove members and emergency contacts
- **Member**: Can view household information and documents, limited modification rights

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": []  // Optional validation errors
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500` - Internal Server Error

## Rate Limiting

- API endpoints are rate-limited to 100 requests per 15 minutes per IP
- Authenticated users may have different limits

## Security Best Practices

1. **Passwords**: Minimum 8 characters, hashed with bcrypt
2. **JWT Tokens**: Should be stored securely, never in localStorage
3. **HTTPS**: Always use HTTPS in production
4. **Environment Variables**: Never commit `.env` file to version control
5. **Database**: Use strong database credentials
6. **Email**: Use app-specific passwords for Gmail

## Development

### Project Structure
```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # PostgreSQL configuration
│   ├── controllers/
│   │   ├── authController.js    # Authentication logic
│   │   ├── householdController.js
│   │   └── emergencyContactController.js
│   ├── middleware/
│   │   └── auth.js              # JWT verification
│   ├── routes/
│   │   └── api.js               # API route definitions
│   ├── utils/
│   │   ├── email.js             # Email and SMS utilities
│   │   └── logger.js            # Winston logger
│   ├── database/
│   │   └── migrate.js           # Database migrations
│   └── server.js                # Express server
├── logs/                        # Application logs
├── uploads/                     # Uploaded files
├── package.json
└── .env.example
```

### Available Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm run migrate    # Run database migrations
npm test           # Run tests
npm run lint       # Run ESLint
```

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## Logging

Logs are stored in the `logs/` directory:
- `error.log` - Error-level logs only
- `combined.log` - All logs

Log levels: error, warn, info, http, debug

## Deployment

### Production Checklist

1. Set `NODE_ENV=production` in `.env`
2. Use strong `JWT_SECRET`
3. Enable SSL for database connection
4. Configure CORS for your frontend domain
5. Set up HTTPS with SSL certificates
6. Configure email service (e.g., SendGrid, AWS SES)
7. Set up monitoring and alerts
8. Regular database backups
9. Update rate limiting for production traffic
10. Review and update security headers

### Environment Variables for Production

```env
NODE_ENV=production
PORT=5000
DB_SSL=true
CORS_ORIGIN=https://your-frontend-domain.com
JWT_SECRET=<strong-random-secret>
```

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running: `pg_isready`
- Check database credentials in `.env`
- Ensure database exists: `psql -U postgres -l`

### Email Not Sending
- Verify SMTP credentials
- For Gmail, use an app-specific password
- Check firewall settings for SMTP ports

### Port Already in Use
```bash
# Find process using port 5000
lsof -i :5000

# Kill the process
kill -9 <PID>
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License

## Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Email: support@effak.com

## Acknowledgments

Built with security and user privacy as top priorities.
