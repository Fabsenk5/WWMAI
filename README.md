# Wer wird Millionär - Multiplayer Project

## Projektübersicht
Dieses Projekt ist eine web-basierte Mehrspieler-Version von "Wer wird Millionär". Es ermöglicht Spielern, ein Spiel zu erstellen oder einem bestehenden Spiel beizutreten. Die Fragen werden aus einer einfachen Datenbank abgerufen und sind in Kategorien und Schwierigkeitsstufen unterteilt.

## Projektstruktur
- **backend/**: Enthält die Serveranwendung, die mit Express.js entwickelt wurde.
  - **src/**: Quellcode der Backend-Anwendung.
    - **app.ts**: Einstiegspunkt der Anwendung.
    - **controllers/**: Enthält die Logik für die Spielsteuerung.
    - **models/**: Definiert die Datenmodelle, die mit der Datenbank interagieren.
    - **routes/**: Definiert die API-Endpunkte für Spielaktionen.
    - **database/**: Handhabt die Datenbankverbindung und Abfragen.
  - **package.json**: Konfigurationsdatei für Backend-Abhängigkeiten.
  - **tsconfig.json**: TypeScript-Konfigurationsdatei für das Backend.
  - **README.md**: Dokumentation für das Backend.

- **frontend/**: Enthält die Client-Anwendung, die mit React entwickelt wurde.
  - **public/**: Statische Dateien, einschließlich der Haupt-HTML-Datei.
  - **src/**: Quellcode der Frontend-Anwendung.
    - **components/**: Wiederverwendbare Komponenten für die Benutzeroberfläche.
    - **context/**: Kontext-Provider für die Verwaltung des Spielstatus.
    - **hooks/**: Benutzerdefinierte Hooks für Spiel-Logik.
    - **pages/**: Seitenkomponenten für die Navigation.
    - **styles/**: CSS-Stile für die Anwendung.
  - **package.json**: Konfigurationsdatei für Frontend-Abhängigkeiten.
  - **tsconfig.json**: TypeScript-Konfigurationsdatei für das Frontend.
  - **README.md**: Dokumentation für das Frontend.

- **docker-compose.yml**: Definiert die Dienste und Konfigurationen für die Ausführung der Anwendung mit Docker.

## Installation
1. Klone das Repository:
   ```
   git clone <repository-url>
   ```
2. Navigiere in das Backend-Verzeichnis und installiere die Abhängigkeiten:
   ```
   cd backend
   npm install
   ```
3. Navigiere in das Frontend-Verzeichnis und installiere die Abhängigkeiten:
   ```
   cd frontend
   npm install
   ```
4. Starte die Anwendung mit Docker:
   ```
   docker-compose up
   ```

## Nutzung
- Besuche die Frontend-Anwendung im Browser unter `http://localhost:3000`.
- Erstelle ein neues Spiel oder trete einem bestehenden Spiel bei, um zu beginnen.

## Lizenz
Dieses Projekt ist unter der MIT-Lizenz lizenziert.