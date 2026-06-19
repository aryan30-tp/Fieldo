# Fieldo

Fieldo is an Expo SDK 54 app for Android and iOS with a slim Expo Router setup.

## Run locally

```bash
npm install
npm run start
```

Use `npm run android` or `npm run ios` to open the native targets.

## Firebase Hosting

The app is configured for Firebase Hosting with Expo web output in `dist/`.

```bash
firebase deploy
```

The Hosting predeploy hook runs `npm run build:web` first, so each deploy publishes the latest web build.

## Project Structure

- `app/` contains route entry points only.
- `src/components/` contains reusable UI.
- `src/hooks/` contains shared hooks.
- `src/constants/` contains colors and app-wide values.
- `src/services/` is reserved for external integrations and native tasks.
- `src/utils/` is reserved for helper functions.
- `assets/` contains static images and brand files.
