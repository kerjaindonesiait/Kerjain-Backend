# Kerjain Backend

Express API for KerjaIn. This repo is the **source of truth** for backend behavior.

## Documentation

### Guides

- [Migration from KerjaIn-frontend `backend/`](docs/migration-from-frontend-backend.md) — diff vs the legacy embedded API
- [Feature documentation framework](docs/feature-documentation.md) — how to write `docs/*.md` for new features

### Features

- [Authentication](docs/authentication.md)
- [Reviews](docs/reviews.md)
- [Admin](docs/admin.md)
- [App config](docs/app.md)

## Development

```bash
npm install
cp .env.example .env   # when .env.example exists
npm run dev
```

API default: `http://localhost:3000`
