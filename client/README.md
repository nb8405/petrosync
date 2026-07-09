# Petrol Pump Management Frontend

The frontend uses React with Vite. It was migrated away from CRA/react-scripts to reduce transitive dependency risk while preserving the existing scripts and `build` output folder.

## Scripts

- `npm start`: starts the Vite development server.
- `npm run dev`: starts the Vite development server.
- `npm run build`: creates a production build in `build/`.
- `npm run preview`: previews the production build.
- `npm test`: runs Vitest with the React test setup.

## Environment

Use either variable for the backend API base URL:

- `VITE_API_BASE_URL`
- `REACT_APP_API_BASE_URL`

`REACT_APP_API_BASE_URL` remains supported for compatibility with the previous CRA configuration.
