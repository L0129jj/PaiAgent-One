# PaiAgent-One

PaiAgent-One is an AI Agent workflow project with a React + Vite frontend and a Spring Boot backend.

It includes:
- Visual workflow canvas (input -> model -> audio -> end)
- Debug drawer with real-time workflow execution logs (SSE)
- Audio playback output
- User auth (register/login)
- Text input persistence with MyBatis-Plus

## Tech Stack

- Frontend: React, TypeScript, React Flow, TailwindCSS, Vite
- Backend: Spring Boot 3, Java 21, MyBatis-Plus, H2

## Project Structure

- `frontend/` Frontend app
- `src/main/java/` Spring Boot source code
- `src/main/resources/` Backend configuration and SQL schema

## Prerequisites

- Java 21+
- Maven 3.9+
- Node.js 18+ (recommended 20+)

## Quick Start

### 1) Start Backend

From project root:

```bash
mvn spring-boot:run
```

Backend default URL:
- `http://localhost:8080`

### 2) Start Frontend

From `frontend` folder:

```bash
npm install
npm run dev
```

Frontend default URL:
- `http://localhost:5173`

## Authentication and Workflow Usage

1. Open the debug drawer on the frontend.
2. Register a new account.
3. Login and get local session state.
4. Input text and optionally save it.
5. Execute workflow and view node logs + audio result.

## Notes

- Backend enables H2 file database by default.
- Auth-protected APIs require `X-Auth-Token`.
- Workflow debug uses SSE endpoint for streaming events.

## Build

Backend:

```bash
mvn -DskipTests compile
```

Frontend:

```bash
cd frontend
npm run build
```

## License

This project is licensed under the MIT License.
# PaiAgent-One
