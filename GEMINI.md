# Gemini Project Context: PaiAgent-One

PaiAgent-One is an AI Agent workflow platform that combines a visual workflow canvas with a robust backend for executing AI-driven tasks.

## Project Overview

- **Purpose:** A platform for designing and executing AI workflows (Input -> Model -> Audio -> End).
- **Architecture:** Decoupled Frontend (React) and Backend (Spring Boot).
- **Core Technologies:**
    - **Frontend:** React 18, TypeScript, React Flow (for the canvas), TailwindCSS, Vite.
    - **Backend:** Spring Boot 3.2, Java 21, MyBatis-Plus (ORM), H2 (Database), SSE (Server-Sent Events for real-time logs).
    - **AI Integration:** Supports OpenAI, DeepSeek, and Tongyi (aliyun) through service abstractions with mock support.

## Project Structure

```text
PaiAgent-One/
├── frontend/                # React frontend application
│   ├── src/                 # React source code
│   │   ├── App.tsx          # Main application component & Workflow canvas
│   │   └── main.tsx         # Frontend entry point
│   ├── tailwind.config.js   # TailwindCSS configuration
│   └── vite.config.ts       # Vite configuration
├── src/main/java/           # Spring Boot backend source code
│   └── com/paiagent/
│       ├── Application.java # Backend entry point
│       ├── controller/      # REST API Controllers (Auth, Workflow, etc.)
│       ├── service/         # Business logic (Workflow execution, AI Model integration)
│       └── mapper/          # MyBatis-Plus mappers for database access
├── src/main/resources/
│   ├── application.yml      # Backend configuration (DB, API Keys, Auth paths)
│   └── schema.sql           # Database schema for H2
├── data/                    # Local H2 database storage (generated at runtime)
├── pom.xml                  # Maven project configuration
└── README.md                # Project documentation
```

## Building and Running

### Prerequisites
- Java 21+
- Maven 3.9+
- Node.js 18+ (20+ recommended)

### Backend
- **Run:** `mvn spring-boot:run`
- **Build:** `mvn clean compile`
- **H2 Console:** Available at `http://localhost:8080/h2-console` (JDBC URL: `jdbc:h2:file:./data/paiagent`)

### Frontend
- **Install:** `cd frontend && npm install`
- **Dev:** `npm run dev` (Runs on `http://localhost:5173`)
- **Build:** `npm run build`

## Development Conventions

- **Authentication:** Custom token-based auth using `X-Auth-Token` header. Interceptors protect paths defined in `application.yml`.
- **API Pattern:** RESTful APIs for CRUD; SSE (`/api/workflow/execute/stream`) for long-running workflow executions.
- **Database:** MyBatis-Plus for repository patterns. Use `camelCase` in Java and `snake_case` in SQL (mapped automatically).
- **State Management:** Frontend uses React hooks and local state; workflow state is managed via React Flow.
- **Error Handling:** Global exception handling in the backend via `@RestControllerAdvice`.

## Key Files
- `src/main/resources/application.yml`: Central configuration for API keys and auth settings.
- `src/main/java/com/paiagent/service/WorkflowService.java`: Core engine for workflow execution.
- `frontend/src/App.tsx`: Main UI containing the React Flow canvas and debug drawer.
- `src/main/resources/schema.sql`: Initial database setup.
