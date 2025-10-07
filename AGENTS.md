# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

This is a fork of Excalidraw that removes Firebase dependencies and adds support for custom backend storage. The project is a yarn monorepo with multiple packages and a demo app, built with React, TypeScript, and Vite.

**Important**: This fork's key architectural difference from upstream Excalidraw is the pluggable storage backend system that allows HTTP-based storage instead of requiring Firebase.

## Monorepo Structure

```
excalidraw-app/         # Demo application with collaboration features
packages/
  excalidraw/           # Core drawing engine (published as @excalidraw/excalidraw)
  utils/                # Shared utilities
  math/                 # Mathematical operations and geometry
examples/               # Integration examples
```

## Development Commands

**Always use yarn, not npm** - this is a yarn workspace monorepo.

```bash
# Install dependencies
yarn

# Start development server (runs with HTTPS on port 3000)
yarn start

# Build for production (Docker)
yarn build:app:docker

# Build the core package
yarn build:package

# Testing
yarn test              # Run tests in watch mode
yarn test:all          # Run all tests (typecheck, linting, tests)
yarn test:app          # Run Vitest tests only
yarn test:coverage     # Run tests with coverage report
yarn test:ui           # Run tests with Vitest UI
yarn test:update       # Update test snapshots

# Linting and formatting
yarn test:code         # ESLint check
yarn test:other        # Prettier check
yarn fix               # Auto-fix formatting and linting issues
yarn fix:code          # Auto-fix ESLint issues
yarn fix:other         # Auto-fix Prettier issues

# Type checking
yarn test:typecheck    # Run TypeScript type checking

# Cleanup
yarn rm:build          # Remove all build artifacts
yarn rm:node_modules   # Remove all node_modules
yarn clean-install     # Clean install (removes node_modules and reinstalls)
```

## Docker Setup

The application runs in Docker containers with the following services:

- **excalidraw** (port 3000): Main app running Vite dev server with HTTPS
- **excalidraw-storage-backend** (port 8080): HTTP storage backend (PostgreSQL-backed)
- **excalidraw-room** (port 5001): WebSocket server for real-time collaboration
- **postgres** (port 5432): Database for storage backend

### Important Docker Notes

- The dev server runs with **HTTPS** (via `basicSsl()` plugin in `vite.config.mts`)
- Access the app at `https://localhost:3000` (not `http://`)
- Self-signed certificate warnings are expected in development
- The Vite server binds to `0.0.0.0` (`host: true` in config) to work in containers

### Environment Configuration

Copy `.env.development` or `.env.production` to `.env` and configure:

```bash
VITE_APP_STORAGE_BACKEND=http                          # Backend type: "http" or "firebase"
VITE_APP_HTTP_STORAGE_BACKEND_URL=http://localhost:8080 # REST API URL for HTTP backend
VITE_APP_WS_SERVER_URL=http://localhost:5001           # WebSocket server for collaboration
```

## Architecture Overview

### Storage Backend System (Key Fork Feature)

The pluggable storage backend system is the main architectural difference from upstream Excalidraw:

- **StorageBackend interface** (`excalidraw-app/data/StorageBackend.ts`): Defines the contract
- **HTTP Backend** (`excalidraw-app/data/httpStorage.ts`): REST API implementation
- **Firebase Backend** (`excalidraw-app/data/firebase.ts`): Original upstream backend (optional)
- **Backend selection** (`excalidraw-app/data/config.ts`): Routes to backend via `VITE_APP_STORAGE_BACKEND` env var

All backends implement the same interface for:

- Scene storage (encrypted JSON with elements)
- File/image storage (binary data)
- Scene loading and sharing

### Collaboration System

Real-time collaboration uses Socket.IO with end-to-end encryption:

- **Portal** class (`excalidraw-app/collab/Portal.tsx`): Manages WebSocket connections and encrypted broadcasting
- **Collab** component (`excalidraw-app/collab/Collab.tsx`): Handles collaboration state, user tracking, scene synchronization
- Messages encrypted via `encryptData()` before transmission through `WS_EVENTS.SERVER`
- Scene reconciliation via `reconcileElements()` merges remote changes without data loss

**Important**: Collaboration requires HTTPS or localhost due to browser security requirements for encryption APIs.

### Element System

- **ExcalidrawElement** types represent all drawable objects (rectangle, ellipse, diamond, arrow, line, freedraw, text, image)
- **Never mutate elements directly** - always use `newElementWith()` for immutability
- **Scene versioning** via `getSceneVersion()` enables change detection for synchronization
- **Reconciliation** (`reconcileElements()`) merges local and remote changes

### State Management

- **Jotai** atoms for global state (collaboration, app state)
- **LocalData** class (`excalidraw-app/data/LocalData.ts`): IndexedDB persistence
- **AppState vs UIAppState**: Persistent state vs transient UI state

### File Handling

- **FileManager** (`excalidraw-app/data/FileManager.ts`): Handles binary file uploads/downloads
- Files stored separately from scene data for performance
- **BinaryFileData** includes dataURL, mimeType, and metadata

## Testing

### Test Setup

- **Vitest** with jsdom environment
- **Test utilities**: `packages/excalidraw/tests/test-utils.ts`
- **Helper classes**: `API`, `Keyboard`, `Pointer`, `UI` for simulating interactions
- **Snapshot testing** for element state verification
- **Canvas mocking** via `vitest-canvas-mock`

### Test Patterns

```typescript
// Use checkpoint() in regression tests for detailed snapshots
import { render, checkpoint } from "./test-utils";

// Mock browser APIs in setupTests.ts if missing
// Canvas operations automatically mocked
```

### Running Specific Tests

```bash
# Run tests matching pattern
yarn test <pattern>

# Run specific test file
yarn test packages/excalidraw/components/App.test.tsx

# Update snapshots after intentional changes
yarn test:update
```

## Common Development Tasks

### Adding a New Storage Backend

1. Create a new file implementing `StorageBackend` interface
2. Add to `storageBackends` Map in `excalidraw-app/data/config.ts`
3. Add environment variable for backend URL if needed
4. Update `.env.development` and `.env.production` examples

### Working with Collaboration Features

1. Ensure HTTPS is enabled (already configured in dev)
2. Check WebSocket connection in browser dev tools (Network → WS)
3. Debug encryption/decryption in `Portal._broadcastSocketData()`
4. Monitor scene reconciliation in `Collab._reconcileElements()`
5. Verify storage backend selection in `getStorageBackend()`

### Extending Element Types

1. Add type to `ExcalidrawElementType` union in `packages/excalidraw/element/types.ts`
2. Implement rendering in `packages/excalidraw/renderer/` directory
3. Add creation logic in element-specific files
4. Update tests with new element patterns
5. Ensure immutability using `newElementWith()`

## Build System

### Vite Configuration

- Main config: `excalidraw-app/vite.config.mts`
- **HTTPS enabled** via `@vitejs/plugin-basic-ssl` for collaboration
- Port 3000 by default (configurable via `VITE_APP_PORT`)
- Host binds to `0.0.0.0` (`host: true`) for Docker compatibility
- Path aliases resolve to local packages for monorepo development

### Package Build Scripts

Each package has standardized scripts:

- `build:esm` - Build ES modules
- `build:dev` - Development build with sourcemaps
- `build:prod` - Production build, minified

## Performance Considerations

- **Scene rendering** optimized via static/interactive canvas split
- **Throttled operations**: `queueBroadcastAllElements()`, storage saves
- **Lazy loading** for collaboration features and heavy dependencies
- **Asset optimization** via Vite plugins for fonts and code splitting

## Localization

- Translations via `i18n.ts` with `t()` function
- Locale files in `packages/excalidraw/locales/`
- Dynamic loading based on browser language
- Coverage reports: `yarn locales-coverage`

## Key Files to Know

- `excalidraw-app/App.tsx` - Main application entry
- `packages/excalidraw/index.tsx` - Core package entry
- `excalidraw-app/data/config.ts` - Storage backend configuration
- `excalidraw-app/collab/Collab.tsx` - Collaboration orchestrator
- `excalidraw-app/collab/Portal.tsx` - WebSocket communication
- `packages/excalidraw/data/reconcile.ts` - Conflict resolution logic
- `packages/excalidraw/element/mutateElement.ts` - Element mutation helpers
- `setupTests.ts` - Test environment configuration

## Git Workflow

- Main branch: `master`
- Husky pre-commit hooks run linting and formatting
- lint-staged ensures only staged files are checked
