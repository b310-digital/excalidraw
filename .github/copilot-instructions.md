# Excalidraw Copilot Instructions

## Project Overview

This is a fork of Excalidraw that removes Firebase dependencies and adds support for custom backend storage. The project is a monorepo with three main packages and a demo app, built with React, TypeScript, and Vite.

## Architecture & Key Components

### Monorepo Structure

- **`excalidraw-app/`** - Demo application and collaboration features
- **`packages/excalidraw/`** - Core drawing engine (published as @excalidraw/excalidraw)
- **`packages/utils/`** - Shared utilities
- **`packages/math/`** - Mathematical operations and geometry

### Collaboration System

Real-time collaboration works through Socket.IO with end-to-end encryption:

- **`Portal`** class handles WebSocket connections and encrypted message broadcasting
- **`Collab`** component manages collaboration state, user tracking, and scene synchronization
- Messages are encrypted using `encryptData()` before transmission via `WS_EVENTS.SERVER`
- Scene reconciliation happens via `reconcileElements()` to merge remote changes

### Storage Backends (Key Architectural Decision)

This fork supports multiple storage backends via the **StorageBackend interface**:

- **Firebase** (`data/firebase.ts`) - Original backend (optional)
- **HTTP** (`data/httpStorage.ts`) - Custom REST API backend
- Backend selection via `VITE_APP_STORAGE_BACKEND` env var
- All backends implement the same interface for scene/file storage

### Environment Configuration

Critical environment variables (`.env.production`):

```bash
VITE_APP_STORAGE_BACKEND=http                    # Backend type
VITE_APP_HTTP_STORAGE_BACKEND_URL=http://...     # REST API URL
VITE_APP_WS_SERVER_URL=http://localhost:5012     # WebSocket server
```

## Development Workflows

### Build System

```bash
# Install dependencies (use yarn, not npm)
yarn install

# Development server with HTTPS (required for collaboration)
yarn start

# Build packages (required before testing integrations)
yarn build:package

# Run all tests with coverage
yarn test:all
```

### Testing Patterns

- **Vitest** for unit tests with jsdom environment
- **Test utilities** in `packages/excalidraw/tests/test-utils.ts`
- **Helper classes**: `API`, `Keyboard`, `Pointer`, `UI` for test interactions
- **Snapshot testing** for element state and render calls
- **Setup**: `setupTests.ts` mocks Canvas API, fonts, and browser APIs

### Package Scripts Convention

Each package has standardized scripts:

- `build:esm` - Build ES modules
- `build:dev` - Development build with sourcemaps
- `build:prod` - Production build, minified

## Project-Specific Patterns

### Element System

- **ExcalidrawElement** types represent all drawable objects
- **Mutate elements** via `newElementWith()` - never modify directly
- **Scene version** tracking via `getSceneVersion()` for synchronization
- **Reconciliation** merges local/remote changes without data loss

### State Management

- **Jotai** for global state atoms (collaboration, app state)
- **LocalData** class manages IndexedDB persistence
- **AppState** vs **UIAppState** distinction (persistent vs transient)

### File Handling

- **FileManager** handles binary file uploads/downloads
- Files stored separately from scene data for performance
- **BinaryFileData** includes dataURL, mimeType, and metadata

### Localization

- `i18n.ts` with `t()` function for translations
- Locale files in `packages/excalidraw/locales/`
- Dynamic loading based on browser language

### Key Constants & Utilities

- **Element types**: `rectangle`, `ellipse`, `diamond`, `arrow`, `line`, `freedraw`, `text`, `image`
- **Keyboard shortcuts** via `KEYS` object and `matchKey()` function
- **Math utilities**: `@excalidraw/math` for vector operations and geometry

## Common Debugging Approaches

### Collaboration Issues

1. Check WebSocket connection in browser dev tools
2. Verify encryption/decryption in `Portal._broadcastSocketData()`
3. Monitor scene reconciliation in `Collab._reconcileElements()`
4. Check storage backend selection in `getStorageBackend()`

### Build Issues

- Ensure Vite aliases match package structure
- Check esbuild configuration for package builds
- Verify environment variable parsing in `env.cjs`

### Test Failures

- Use `checkpoint()` in regression tests for detailed snapshots
- Mock browser APIs in `setupTests.ts` if missing
- Canvas operations require `vitest-canvas-mock`

## Integration Points

### Adding New Storage Backends

1. Implement `StorageBackend` interface
2. Add to `storageBackends` Map in `data/config.ts`
3. Update environment variable documentation

### Extending Element Types

1. Add type to `ExcalidrawElementType` union
2. Implement rendering in `renderer/` directory
3. Add creation logic in element-specific files
4. Update tests with new element patterns

## Performance Considerations

- **Scene rendering** optimized via static/interactive canvas split
- **Throttled operations**: `queueBroadcastAllElements()`, `queueSaveToFirebase()`
- **Lazy loading** for collaboration features and heavy dependencies
- **Asset optimization** via Vite plugins for fonts and chunks
