# API Documentation

## Endpoints

### 1. Create Game
**POST** `/api/games/create`

**Request Body:**
```json
{
  "gameName": "string",
  "playerCount": "number"
}
```

**Response:**
- **201 Created**
```json
{
  "message": "Game created successfully",
  "gameId": "number"
}
```
- **400 Bad Request**
```json
{
  "error": "Invalid game name or player count"
}
```
- **500 Internal Server Error**
```json
{
  "error": "Failed to create game due to server error"
}
```

### 2. Join Game
**POST** `/api/games/join`

**Request Body:**
```json
{
  "roomCode": "string",
  "playerName": "string"
}
```

**Response:**
- **200 OK**
```json
{
  "message": "Joined game successfully"
}
```
- **400 Bad Request**
```json
{
  "error": "Room code and player name are required"
}
```
- **500 Internal Server Error**
```json
{
  "error": "Failed to join game due to server error"
}
```

### 3. Start Game
**POST** `/api/games/start`

**Request Body:**
```json
{
  "roomCode": "string"
}
```

**Response:**
- **200 OK**
```json
{
  "message": "Game started successfully"
}
```
- **400 Bad Request**
```json
{
  "error": "Room code is required"
}
```
- **404 Not Found**
```json
{
  "error": "Game not found"
}
```
- **500 Internal Server Error**
```json
{
  "error": "Failed to start game due to server error"
}
```

### 4. Fetch Questions
**GET** `/api/questions`

**Response:**
- **200 OK**
```json
[
  {
    "id": "number",
    "category": "string",
    "difficulty": "string",
    "question": "string",
    "correct_answer": "string",
    "incorrect_answers": ["string"]
  }
]
```
- **500 Internal Server Error**
```json
{
  "error": "Failed to fetch questions due to server error"
}
```