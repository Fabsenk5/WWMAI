# Audio Assets Documentation

This document lists all audio files required for the **v2.1 Gameplay Audio** features.
All files must be placed in the following directory:

📂 **`frontend/public/assets/audio/`**

> **Note**: If a file is missing, the game will log a warning to the console but continue to function without that specific sound.

---

## 🎵 Global & UI Sounds

| Event | Filename | Description |
| :--- | :--- | :--- |
| **Lobby Music** | `01 Main Theme.mp3` | Loops indefinitely in the Lobby. |
| **Game Start** | `10 Let's Play.mp3` | Played when the host starts the game. |
| **Game Over** | `63 Closing Theme.mp3` | Played when the game ends (Win or Loss). |
| **Time Up** | `72 Time's Up.mp3` | played when the question timer reaches 0. |

---

## ❓ Question Background Loops
These tracks loop in the background while players are thinking. The music intensifies as the prize money increases.

| Level Range | Filename | Prize Tier |
| :--- | :--- | :--- |
| **Levels 1-5** | `11 $100-$1,000 Questions.mp3` | Low Stakes |
| **Level 6** | `14 $2,000 Question.mp3` | $2,000 |
| **Level 7** | `19 $4,000 Question.mp3` | $4,000 |
| **Level 8** | `24 $8,000 Question.mp3` | $8,000 |
| **Level 9** | `29 $16,000 Question.mp3` | $16,000 |
| **Level 10** | `34 $32,000 Question.mp3` | $32,000 (Milestone) |
| **Level 11** | `39 $64,000 Question.mp3` | $64,000 |
| **Level 12** | `44 $125,000 Question.mp3` | $125,000 |
| **Level 13** | `49 $250,000 Question.mp3` | $250,000 |
| **Level 14** | `54 $500,000 Question.mp3` | $500,000 |
| **Level 15** | `59 $1,000,000 Question.mp3` | $1,000,000 (Jackpot) |

---

## 🔊 Interaction Sounds (By Level)
Specific sounds played when an answer is submitted, and when the result is revealed.

| Level | Final Answer (Submit) | Win (Correct) | Lose (Incorrect) |
| :--- | :--- | :--- | :--- |
| **1-5** | `08 Four Answers in Order.mp3` * | `12 Win $1,000.mp3` | `16 $2,000 Lose.mp3` * |
| **6** | `15 $2,000 Final Answer-.mp3` | `17 $2,000 Win.mp3` | `16 $2,000 Lose.mp3` |
| **7** | `20 $4,000 Final Answer-.mp3` | `22 $4,000 Win.mp3` | `21 $4,000 Lose.mp3` |
| **8** | `25 $8,000 Final Answer-.mp3` | `27 $8,000 Win.mp3` | `26 $8,000 Lose.mp3` |
| **9** | `30 $16,000 Final Answer-.mp3` | `32 $16,000 Win.mp3` | `31 $16,000 Lose.mp3` |
| **10** | `35 $32,000 Final Answer-.mp3` | `37 $32,000 Win.mp3` | `36 $32,000 Lose.mp3` |
| **11** | `40 $64,000 Final Answer-.mp3` | `42 $64,000 Win.mp3` | `41 $64,000 Lose.mp3` |
| **12** | `45 $125,000 Final Answer-.mp3` | `47 $125,000 Win.mp3` | `46 $125,000 Lose.mp3` |
| **13** | `50 $250,000 Final Answer-.mp3` | `52 $250,000 Win.mp3` | `51 $250,000 Lose.mp3` |
| **14** | `55 $500,000 Final Answer-.mp3` | `57 $500,000 Win.mp3` | `56 $500,000 Lose.mp3` |
| **15** | `60 $1,000,000 Final Answer-.mp3` | `62 $1,000,000 Win.mp3` | `61 $1,000,000 Lose.mp3` |

*\* Denotes a generic fallback sound used for lower levels where specific files were not provided/assigned.*

---

## 🤡 Joker / Lifeline Sounds

| Joker Type | Filename |
| :--- | :--- |
| **50:50** | `67 50-50.mp3` |
| **Phone-A-Friend** | `66 Phone-A-Friend.mp3` |
| **Ask The Audience** | `68 Ask The Audience.mp3` |
