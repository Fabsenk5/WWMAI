# Wer wird Millionär - Frontend Documentation

## Overview
This project is a web-based multiplayer game inspired by "Wer wird Millionär". It allows players to create or join games and answer questions from various categories and difficulty levels.

## Project Structure
The frontend of the application is built using React and follows a component-based architecture. Below is a brief overview of the key directories and files:

- **public/index.html**: The main HTML file that serves as the entry point for the React application.
- **src/App.tsx**: The main component that sets up routing and renders the main layout of the application.
- **src/components/**: Contains reusable components:
  - **GameLobby.tsx**: Component for creating or joining a game lobby.
  - **QuestionDisplay.tsx**: Displays the current question and answer options.
  - **Scoreboard.tsx**: Shows the current scores and lives of the players.
- **src/context/GameContext.tsx**: Provides context for managing the game state across components.
- **src/hooks/useGame.ts**: Custom hook for encapsulating game-related logic.
- **src/pages/**: Contains page components:
  - **HomePage.tsx**: The home page of the application.
  - **JoinGamePage.tsx**: Allows players to join an existing game using a room number.
  - **CreateGamePage.tsx**: Allows players to create a new game.
- **src/styles/App.css**: CSS styles for the frontend application.

## Getting Started
To get started with the frontend application, follow these steps:

1. **Clone the repository**:
   ```
   git clone <repository-url>
   cd wer-wird-millionaer/frontend
   ```

2. **Install dependencies**:
   ```
   npm install
   ```

3. **Run the application**:
   ```
   npm start
   ```

The application will be available at `http://localhost:3000`.

## Contributing
Contributions are welcome! Please feel free to submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.