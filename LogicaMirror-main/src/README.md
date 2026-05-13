# Source Layout

Implementation code for the local prototype lives here.

## Planned Folders

- `app/`: app shell, routes, layout composition
- `core/`: domain logic independent of UI and providers
- `features/`: reserved for larger user-facing workflow modules
- `infrastructure/`: persistence, AI providers, imports, exports
- `shared/`: shared UI, utilities, types, language resources

The first prototype keeps the UI in `src/app/App.js` until feature modules are worth splitting out.
