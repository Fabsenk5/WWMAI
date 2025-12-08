# Wer Wird Millionär (Who Wants to Be a Millionaire) Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Project Structure](#project-structure)
3. [Game Flow and Lifecycle](#game-flow-and-lifecycle)
4. [Key Components](#key-components)
5. [Backend API Documentation](#backend-api-documentation)
6. [Frontend Components](#frontend-components)
7. [Socket Events](#socket-events)
8. [Database Schema](#database-schema)
9. [Maintenance Tasks](#maintenance-tasks)
10. [Troubleshooting](#troubleshooting)
11. [Attributions and Citations](#attributions-and-citations)

## System Overview

This is a multiplayer trivia game based on "Who Wants to Be a Millionaire" implemented as a web application with a React frontend and Node.js/Express backend. The game allows users to create game rooms, join existing rooms, and participate in a series of increasingly difficult trivia questions, with each question worth a higher prize amount.

### Technology Stack
- **Frontend**: React 18, TypeScript, Socket.IO Client
- **Backend**: Node.js, Express, TypeScript, Socket.IO
- **Database**: PostgreSQL
- **Containerization**: Docker, Docker Compose

## Project Structure

The project is organized into two main directories:

### Backend
- `src/app.ts`: Entry point for the backend application
- `src/controllers/`: Contains the controllers for handling HTTP requests
- `src/models/`: Contains the data models for interacting with the database
- `src/routes/`: Defines the API routes
- `src/database/`: Database connection and management
- `src/socketSetup.ts`: Socket.IO initialization and configuration

### Frontend
- `src/App.tsx`: Main React component
- `src/pages/`: Page components for different views
- `src/components/`: Reusable UI components
- `src/context/`: React context providers
- `src/styles/`: CSS files for styling
- `src/utils/`: Utility functions

## Game Flow and Lifecycle

### Game Lifecycle

1. **Game Creation**:
   - Host navigates to the Create Game page
   - Host provides a game name and player count
   - System generates a unique room code
   - Game is stored in the database with status "pending"

2. **Player Joining**:
   - Players navigate to the Join Game page
   - Players enter the room code and their name
   - System validates the room code and assigns a unique userId
   - Players are redirected to the Lobby page

3. **Game Start**:
   - Host clicks "Start Game" button
   - System fetches the first question (level 1)
   - Game status is updated to "started"
   - All players receive the first question via WebSocket
   - The current_question_id and current_level are updated in the database

4. **Question Round**:
   - Question is displayed to all players with multiple-choice options
   - Players select and submit their answers
   - System records each player's answer and whether it's correct
   - When all players have answered (or time expires):
     - System reveals the correct answer to all players
     - System updates player scores
     - System schedules the next question after a delay

5. **Level Progression**:
   - After each question, the current_level is incremented
   - System fetches the next question for the new level
   - Questions increase in difficulty and prize value with each level
   - Players who answer incorrectly lose a life
   - Players with no lives remaining are eliminated

6. **Game End**:
   - Game ends when:
     - All players are eliminated, or
     - All levels are completed, or
     - The game has been inactive for 5+ minutes
   - Final scores are displayed
   - Game status is updated to "ended"

### Data Flow

The game maintains state both on the server and client:

- **Server State** (Database):
  - Game details (name, room code, status, current level, current question)
  - Player information (userId, name, score, lives)
  - Player answers

- **Client State** (React Context):
  - Current game data
  - Current question
  - Player's own answers and score

- **State Synchronization**:
  - HTTP requests for initial loading and explicit actions
  - Real-time updates via Socket.IO for game events

## Key Components

### Backend Components

#### GameController
Handles all game-related actions including:
- Creating and joining games
- Starting games
- Processing player answers
- Advancing to the next question
- Revealing answers

#### QuestionModel
Manages question data:
- Fetching questions by level or difficulty
- Retrieving question details
- Getting answer options

#### Socket.IO Integration
Enables real-time communication:
- Notifying players of game events
- Broadcasting new questions
- Revealing answers to all players
- Handling player join events

### Frontend Components

#### GameContext
React context that provides:
- Current game data
- Methods for interacting with the game
- Loading and error states

#### LobbyPage
The main game view for players:
- Displays current question
- Shows player list and scores
- Handles answer submission
- Shows answer reveal and results

#### GamePage
Host's view of the game:
- Controls game flow
- Shows all players and their status
- Displays current question with correct answer

## Backend API Documentation

### Game Management

#### `POST /api/games/create`
Creates a new game.
- **Request Body**: `{ gameName: string, playerCount: number }`
- **Response**: `{ message: string, gameId: number, roomCode: string }`

#### `POST /api/games/join`
Joins an existing game.
- **Request Body**: `{ roomCode: string, userName: string }`
- **Response**: `{ userId: string }`

#### `GET /api/games/:id`
Gets game details by room code or game ID.
- **Response**: Game object with players array

#### `POST /api/games/:roomCode/start`
Starts a game.
- **Response**: `{ message: string, firstQuestion: object }`

### Question Management

#### `GET /api/games/:roomCode/current-question`
Gets the current question for a game.
- **Query Params**: `userId` (optional)
- **Response**: Question object with options and user answer if provided

#### `POST /api/games/:roomCode/submit-answer`
Submits a player's answer.
- **Request Body**: `{ userId: string, answer: string }`
- **Response**: `{ message: string, isCorrect: boolean }`

## Socket Events

### Server to Client

#### `gameStarted`
Emitted when a game starts.
- **Payload**: `{ message: string }`

#### `newQuestion`
Emitted when a new question is available.
- **Payload**: Question object with options

#### `revealAnswers`
Emitted when all players have answered a question.
- **Payload**: `{ correctAnswer: string, playerAnswers: array, timeToNextQuestion: number, currentLevel: number }`

#### `gameEnded`
Emitted when a game ends.
- **Payload**: `{ message: string }`

### Client to Server

#### `joinRoom`
Emitted by client to join a game room.
- **Payload**: `{ roomCode: string, userId: string, playerName: string }`

## Database Schema

### Tables

#### `games`
- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR)
- `player_count` (INT)
- `created_at` (TIMESTAMP)
- `room_code` (VARCHAR)
- `current_question_id` (INT)
- `status` (VARCHAR): 'pending', 'started', or 'ended'
- `current_level` (INT)
- `last_active` (TIMESTAMP)

#### `questions`
- `question_id` (SERIAL PRIMARY KEY)
- `category` (VARCHAR)
- `difficulty` (VARCHAR)
- `question` (TEXT)
- `correct_answer` (TEXT)
- `incorrect_answers` (TEXT[])

#### `players`
- `userId` (VARCHAR)
- `room_code` (VARCHAR)
- `name` (VARCHAR)
- `score` (INT)
- `lives` (INT)
- PRIMARY KEY (userId, room_code)

#### `player_answers`
- `id` (SERIAL PRIMARY KEY)
- `user_id` (VARCHAR)
- `room_code` (VARCHAR)
- `game_id` (INT)
- `question_id` (INT)
- `answer` (TEXT)
- `is_correct` (BOOLEAN)

## Maintenance Tasks

### Room Cleanup Process
The system automatically cleans up inactive game rooms to prevent database clutter:
- Runs every 5 minutes (configurable in `app.ts`)
- Identifies games with `last_active` timestamp older than 5 minutes
- Only removes games with status 'pending' or 'started' (preserves completed games)
- Logs the number of active and removed rooms

To manually trigger cleanup:
```
npm run cleanup
```

### Database Reset
To reset the database schema:
```
npm run reset-db
```
This script:
1. Terminates existing connections
2. Drops all tables
3. Creates tables according to `schema.sql`

## Troubleshooting

### Common Issues

#### Socket Connection Issues
- Check that frontend is properly configured to connect to backend Socket.IO server
- Verify that `roomCode` and `userId` are correct when joining a room
- Check browser console for socket connection errors

#### Question Display Issues
- Verify that questions are properly loaded in the database
- Check that `current_question_id` is being updated in the database
- Ensure `newQuestion` socket event is being emitted and received

#### Player Answer Processing
- Verify that answer submission API is working correctly
- Check that all players' answers are being recorded
- Ensure `revealAnswers` event is triggered after all players answer

## Attributions and Citations

Some parts of this project were inspired by or adapted from other open-source projects:

### Bomber Trivia
- **Source**: [Bomber Trivia on GitHub](https://github.com/iHaroon29/Bomber-Trivia)
- **License**: MIT
- **Components Used**:
  - React scripts configuration in package.json
  - Basic project structure inspiration
  - Script configurations for build, test, and deployment

```json
"scripts": {
  "start": "react-scripts start",
  "build": "react-scripts build",
  "test": "react-scripts test",
  "eject": "react-scripts eject"
}
```

These script definitions are standard for React applications created with Create React App and are used under the MIT license as noted in the original project.