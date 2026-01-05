# Receipegram - Recipe Sharing Platform

A full-stack recipe sharing application similar to Instagram, where users can share recipe videos with friends or publicly, search for recipes, and interact with the community.

## Features

- **User Authentication**: Register, login, and profile management
- **Recipe Sharing**: Upload recipe videos with images, ingredients, instructions
- **Privacy Controls**: Share recipes publicly or with friends only
- **Search & Discovery**: Search recipes by keywords, ingredients, tags, and difficulty
- **Social Features**: Follow users, like and comment on recipes
- **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

### Backend
- Node.js with Express.js
- SQLite database
- JWT authentication
- Multer for file uploads
- bcryptjs for password hashing

### Frontend
- React with TypeScript
- Tailwind CSS for styling
- React Router for navigation
- Axios for API calls
- Context API for state management

## Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### 1. Clone the repository
```bash
git clone <repository-url>
cd receipegram
```

### 2. Install dependencies
```bash
# Install root dependencies
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Go back to root
cd ..
```

### 3. Environment Setup
```bash
# The server/.env file is already configured with development settings
# For production, make sure to change the JWT_SECRET
```

### 4. Start the application
```bash
# From the root directory, start both server and client
npm run dev
```

This will start:
- Backend server on `http://localhost:5000`
- Frontend React app on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get current user profile
- `PUT /api/auth/profile` - Update user profile

### Users
- `GET /api/users/:username` - Get user profile by username
- `POST /api/users/:userId/follow` - Follow/unfollow user
- `GET /api/users/:userId/following-status` - Check if following user
- `GET /api/users/search/:query` - Search users

### Recipes
- `POST /api/recipes` - Create new recipe (with file upload)
- `GET /api/recipes` - Get recipes (with filtering and pagination)
- `GET /api/recipes/:id` - Get single recipe
- `PUT /api/recipes/:id` - Update recipe
- `DELETE /api/recipes/:id` - Delete recipe
- `POST /api/recipes/:id/like` - Like/unlike recipe
- `POST /api/recipes/:id/comments` - Add comment
- `GET /api/recipes/:id/comments` - Get recipe comments

## Usage

1. **Register/Login**: Create an account or login to existing account
2. **Create Recipe**: Click "Create" to share a new recipe with video/image upload
3. **Browse Recipes**: View public recipes on the home feed
4. **Search**: Use the search functionality to find recipes by ingredients or tags
5. **Follow Users**: Follow your favorite chefs to see their recipes in your feed
6. **Interact**: Like and comment on recipes you enjoy

## Privacy Features

- **Public Recipes**: Visible to all users, appear in public feed and search
- **Friends Only**: Only visible to users who follow you
- **User Profiles**: View user profiles with their recipe collections

## File Structure

```
receipegram/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── contexts/      # React contexts
│   │   ├── services/      # API services
│   │   └── types/         # TypeScript types
├── server/                # Express backend
│   ├── routes/            # API routes
│   ├── middleware/        # Custom middleware
│   ├── database/          # Database setup
│   └── uploads/           # Uploaded files
└── README.md
```

## Development

### Adding New Features
1. Add API endpoints in `/server/routes/`
2. Update TypeScript types in `/client/src/types/`
3. Create API service functions in `/client/src/services/api.ts`
4. Implement UI components in `/client/src/components/` or `/client/src/pages/`

### Database
The application uses SQLite for simplicity. The database file (`receipegram.db`) will be created automatically when you first run the server.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test your changes
5. Submit a pull request

## Deployment

This project includes automated deployment to AWS Lightsail using GitHub Actions.

### Quick Deployment Setup

1. **Run the AWS setup script:**
   ```bash
   ./scripts/setup-aws-deployment.sh
   ```

2. **Add GitHub Secret:**
   - Go to your repository settings → Secrets and variables → Actions
   - Add `AWS_ROLE_ARN` with the value provided by the setup script

3. **Deploy:**
   - Push to `main` or `master` branch to trigger automatic deployment
   - Or manually trigger via GitHub Actions tab

### Deployment Features

- **Automatic CI/CD**: Deploys on every push to main/master
- **Containerized**: Uses Docker for consistent deployments
- **Scalable**: AWS Lightsail container service with auto-scaling
- **Secure**: Uses AWS OIDC for secure authentication
- **Health Checks**: Automatic health monitoring
- **Cost-Effective**: ~$7-15/month for small applications

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## License

This project is licensed under the MIT License.
