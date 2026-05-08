# Development Commands

Read this file when running builds, dev servers, installs, or workspace commands.

| Command | Purpose |
|---|---|
| `npm run smart-reinstall` | Install deps if lockfile changed and build via Turborepo. |
| `npm run reinstall` | Clean install by wiping `node_modules` and reinstalling. |
| `npm run backend` | Start the backend server. |
| `npm run backend:dev` | Start backend with file watching. |
| `npm run build` | Build all compiled code via Turborepo. |
| `npm run frontend` | Build all compiled code sequentially. |
| `npm run frontend:dev` | Start frontend dev server with HMR on port 3090. |
| `npm run build:data-provider` | Rebuild `packages/data-provider` after changes. |

Runtime requirements:

- Node.js: v20.19.0+ or ^22.12.0 or >= 23.0.0.
- Database: MongoDB.
- Backend: `http://localhost:3080/`.
- Frontend dev server: `http://localhost:3090/`.
