# Backend for "Wer wird Millionär" Game

This backend application serves as the server-side component for the "Wer wird Millionär" multiplayer game. It is built using Node.js and Express, and it interacts with a database to manage game sessions and questions.

## Features

- **Game Management**: Create and join game sessions.
- **Question Retrieval**: Fetch questions from the database based on categories and difficulty levels.
- **Player Interaction**: Handle player answers and manage game state.

## Project Structure

- **src/app.ts**: Entry point of the application, initializes the Express app and connects to the database.
- **src/controllers/gameController.ts**: Contains the `GameController` class for managing game logic.
- **src/models/questionModel.ts**: Defines the `QuestionModel` class for database interactions related to questions.
- **src/routes/gameRoutes.ts**: Sets up API endpoints for game-related actions.
- **src/database/db.ts**: Manages database connections and queries.

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   ```
2. Navigate to the backend directory:
   ```
   cd wer-wird-millionaer/backend
   ```
3. Install dependencies:
   ```
   npm install
   ```

## Running the Application

To start the backend server, run:
```
npm start
```

## API Endpoints

- `POST /api/game/create`: Create a new game session.
- `POST /api/game/join`: Join an existing game session.
- `GET /api/questions`: Retrieve questions from the database.

## Database

Ensure that your database is set up and configured correctly in `src/database/db.ts`.

## License

This project is licensed under the MIT License.