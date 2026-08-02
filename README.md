# WWMAI - Wer Wird Millionär AI

A modern, feature-rich multiplayer trivia game based on "Who Wants to Be a Millionaire" with AI-powered question generation, real-time gameplay, user authentication, and internationalization support.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.1-blue)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13+-blue)](https://www.postgresql.org/)

## 🎮 Features

### Core Gameplay
- **🎯 Multiplayer Trivia**: Create or join game rooms with up to 10 players
- **💰 Progressive Difficulty**: 15 levels of questions, from $100 to $1,000,000
- **⏱️ Real-time Updates**: Live game state synchronization via WebSocket (Socket.IO)
- **🃏 Classic Lifelines**: 50:50, Phone-a-Friend, and Ask the Audience
- **🎵 Authentic Audio**: Full soundtrack from the original show for immersive gameplay
- **📊 Live Leaderboard**: Track player scores and rankings in real-time

### User Management
- **🔐 Authentication System**: Secure user registration and login with JWT
- **👤 User Profiles**: Track personal statistics, game history, and achievements
- **📈 Player Statistics**: Detailed analytics on wins, losses, accuracy, and more

### Advanced Features
- **🤖 AI Question Generation**: Dynamic question creation powered by Google's Gemini AI
- **👨‍💼 Admin Dashboard**: Comprehensive management interface for questions, users, and game settings
- **🌍 Internationalization**: Multi-language support (English, German, Spanish, and more)
- **💎 Premium Features**: Stripe integration for premium subscriptions
- **📱 Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **🔄 Auto-recovery**: Resilient connection handling with automatic retry logic

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 13+
- Docker and Docker Compose (optional, for containerized deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Fabsenk5/WWMAI.git
   cd WWMAI
   ```

2. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   # Database
   DB_USER=your_username
   DB_PASSWORD=your_password
   DB_HOST=localhost
   DB_NAME=wer_wird_millionaer
   DB_PORT=5432
   
   # Server
   PORT=5000
   NODE_ENV=development
   
   # JWT Authentication
   JWT_SECRET=your_jwt_secret_key
   
   # AI Question Generation (Optional)
   GEMINI_API_KEY=your_gemini_api_key
   
   # Payment Integration (Optional)
   STRIPE_SECRET_KEY=your_stripe_secret_key
   ```

3. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install backend dependencies
   cd backend
   npm install
   
   # Install frontend dependencies
   cd ../frontend
   npm install
   cd ..
   ```

4. **Set up the database**
   ```bash
   cd backend
   npm run dev   # auto-creates/syncs the schema on boot, then seeds if empty
   ```
   To fully reset the DB, run `backend/database/schema.sql` (destructive) and restart the backend — it re-seeds automatically.

### Running the Application

#### Option 1: Using Docker (Recommended)
```bash
docker-compose up
```
The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

#### Option 2: Manual Setup
```bash
# Terminal 1 - Start backend
cd backend
npm run dev

# Terminal 2 - Start frontend
cd frontend
npm start
```

## 📚 Documentation

- **[DOCUMENTATION.md](DOCUMENTATION.md)**: Comprehensive technical documentation
- **[DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)**: Development workflows and best practices
- **[AUDIO_ASSETS.md](AUDIO_ASSETS.md)**: Audio file licensing and attribution
- **[STYLE_GUIDE.md](STYLE_GUIDE.md)**: Code style and UI/UX guidelines

## 🏗️ Project Structure

```
WWMAI/
├── backend/              # Node.js/Express backend
│   ├── src/
│   │   ├── app.ts       # Application entry point
│   │   ├── controllers/ # Request handlers
│   │   ├── models/      # Database models
│   │   ├── routes/      # API routes
│   │   ├── services/    # Business logic (AI, Auth, etc.)
│   │   └── database/    # Database utilities and migrations
│   └── package.json
│
├── frontend/            # React frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── context/     # React context providers
│   │   ├── locales/     # i18n translation files
│   │   └── styles/      # CSS stylesheets
│   └── package.json
│
├── .github/
│   └── workflows/       # CI/CD and keep-alive workflows
│
└── docker-compose.yml   # Container orchestration
```

## 🛠️ Technology Stack

### Frontend
- **React 19.1** - UI framework
- **TypeScript 4.9** - Type safety
- **Socket.IO Client 4.0** - Real-time communication
- **Axios 1.9** - HTTP client
- **react-i18next 14.1** - Internationalization
- **Lucide React 0.560** - Icons

### Backend
- **Node.js** with **Express 4.17** - Server framework
- **TypeScript 5.0** - Type safety
- **Socket.IO 4.8** - WebSocket server
- **PostgreSQL 8** - Database with `pg` driver
- **JWT** - Authentication
- **Bcrypt 6.0** - Password hashing
- **Google Generative AI 0.24** - AI question generation
- **Stripe 20.0** - Payment processing
- **Express Rate Limit 8.2** - API rate limiting

### Infrastructure
- **Docker & Docker Compose** - Containerization
- **GitHub Actions** - CI/CD and keep-alive services
- **Neon/PostgreSQL** - Database hosting (production)

## 📜 Licenses and Attribution

### Project License
This project is licensed under the **MIT License** - see the root of the repository for details.

### Third-Party Licenses

#### Dependencies
All npm dependencies are used under their respective licenses:
- **React** (MIT License)
- **Express** (MIT License)
- **Socket.IO** (MIT License)
- **PostgreSQL `pg` driver** (MIT License)
- **TypeScript** (Apache License 2.0)
- And all other dependencies listed in `package.json` files

For a complete list of dependencies and their licenses, run:
```bash
npm list --depth=0
```

#### Code Attributions
Some code patterns were inspired by the following open-source projects:

**Bomber Trivia**
- Source: [github.com/iHaroon29/Bomber-Trivia](https://github.com/iHaroon29/Bomber-Trivia)
- License: MIT
- Usage: React scripts configuration and project structure patterns
- See [# Code Citations.md](# Code Citations.md) for detailed citations

#### Audio Assets
The game includes audio files from the "Who Wants to Be a Millionaire" television program:
- **All audio files** are properties of their respective copyright holders
- Audio files are used for **educational and non-commercial purposes only**
- See [AUDIO_ASSETS.md](AUDIO_ASSETS.md) for complete audio file documentation
- ⚠️ **Important**: If you fork this project for commercial use, you must obtain proper licensing for audio assets or replace them with royalty-free alternatives

> **Disclaimer**: "Who Wants to Be a Millionaire" is a registered trademark. This project is a fan-made educational implementation and is not affiliated with, endorsed by, or associated with the official franchise or copyright holders.

#### AI Services
- **Google Generative AI (Gemini)**: Used for dynamic question generation under Google's [Terms of Service](https://policies.google.com/terms)

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit your changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to the branch** (`git push origin feature/AmazingFeature`)
5. **Open a Pull Request**

Please ensure your code:
- Follows the existing code style (see [STYLE_GUIDE.md](STYLE_GUIDE.md))
- Includes appropriate tests
- Updates documentation as needed

## 🐛 Bug Reports and Feature Requests

Use the GitHub Issues tab to:
- Report bugs
- Suggest new features
- Ask questions

Or use the in-app **Feature Wishlist** (accessible from the navigation menu) to suggest features directly within the application.

## 🔒 Security

For security concerns, please **do not** open a public issue. Instead, contact the maintainers directly through GitHub.

## 📊 Development

### Running Tests
```bash
# Backend tests (from the repo root; jest config lives at the root)
npm test
```

### Database Management
```bash
# Seed questions if the table is empty (auto-seeds on backend boot too)
cd backend
npm run seed

# Full reset: run backend/database/schema.sql (destructive), then restart the backend
```

### Building for Production
```bash
# Build backend
cd backend
npm run build

# Build frontend
cd frontend
npm run build
```

## 🌐 Deployment

The project includes automated keep-alive workflows for:
- Frontend hosting on Render/Vercel
- Backend API hosting
- Database on Neon PostgreSQL

See `.github/workflows/` for CI/CD configurations.

### Environment Variables for Production
Ensure all environment variables are set in your hosting platform:
- Database credentials (Neon connection string)
- JWT secret
- Gemini API key (if using AI features)
- Stripe keys (if using premium features)

## 📱 Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 👥 Authors and Acknowledgments

- **Fabsenk5** - [GitHub](https://github.com/Fabsenk5)

Special thanks to:
- The Bomber Trivia project for structural inspiration
- The React and Node.js communities
- All contributors and testers

## 📞 Contact

- **GitHub Issues**: [github.com/Fabsenk5/WWMAI/issues](https://github.com/Fabsenk5/WWMAI/issues)
- **Project Repository**: [github.com/Fabsenk5/WWMAI](https://github.com/Fabsenk5/WWMAI)

## 🗺️ Roadmap

- [ ] Mobile native app (React Native)
- [ ] More joker types
- [ ] Tournament mode
- [ ] Custom question packs
- [ ] Improved analytics dashboard
- [ ] More language translations

---

**Enjoy the game!** 🎉 If you find this project useful, please consider giving it a ⭐ on GitHub!