# Data Access Layer (DAL) Migration Tracker

## Objective
Transition all raw `db.query` calls in route handlers to a consolidated Data Access Layer (DAL) to prevent multi-tenancy bounds leaks and centralize database logic.

## Architecture
- Base DAL is located at `dal/BaseDal.js`. It enforces `user_id` on mutations.
- Create domain-specific DALs (e.g., `OverlayDal`, `EarningsDal`) that extend `BaseDal`.
- When touching any of the files below for feature work, migrate their database queries to the DAL and check them off this list.

## 1. Overlay & Canvas Editor
- [x] `routes/collections.js` *(Proof of Concept)*
- [ ] `routes/api/overlays.js`
- [ ] `routes/overlays.js`
- [ ] `routes/publicOverlays.js`
- [ ] `routes/publicOverlayServing.js`
- [ ] `routes/api/publicOverlays.js`
- [ ] `routes/api/overlayComponents.js`
- [ ] `routes/overlay/overlayComponents.js`
- [ ] `routes/widgetLibrary.js`
- [ ] `routes/widgets-loader.js`

## 2. Scrapbot & Live Engagement
- [ ] `routes/dashboardScrapbot.js`
- [ ] `routes/pollsApi.js`
- [ ] `routes/hypeTrainApi.js`
- [ ] `routes/highlightsApi.js`
- [ ] `routes/highlightSettingsApi.js`
- [ ] `routes/api/botLayer.js`
- [ ] `routes/api/botWidgetPreferences.js`
- [ ] `routes/api/ttsPanel.js`
- [ ] `routes/api/widgetToken.js`
- [ ] `routes/api/widgetTestFire.js`
- [ ] `routes/obsWidgetConfig.js`
- [ ] `routes/mediaRequestsApi.js`

## 3. Monetization & Marketplace
- [ ] `routes/earnings.js`
- [ ] `routes/marketplace.js`
- [ ] `routes/api/marketplace.js`
- [ ] `routes/api/stripeCheckout.js`
- [ ] `routes/sponsors.js`
- [ ] `routes/assets.js`
- [ ] `routes/contentPacksApi.js`

## 4. Creator Profiles & Auth
- [ ] `routes/profileApi.js`
- [ ] `routes/profile.js`
- [ ] `routes/profileViewModel.js`
- [ ] `routes/publicProfileApi.js`
- [ ] `routes/public.js`
- [ ] `routes/auth.js`
- [ ] `routes/account.js`
- [ ] `routes/profileAnalyticsApi.js`

## 5. External Integrations
- [ ] `routes/kickAuth.js`
- [ ] `routes/integrations/kick.js`
- [ ] `routes/integrations/discord.js`
- [ ] `routes/integrations/youtube_chat_debug.js`

## 6. Admin, Tools & Telemetry
- [ ] `routes/emailApi.js`
- [ ] `routes/trainingApi.js`
- [ ] `routes/insightsApi.js`
- [ ] `routes/dashboardMetrics.js`
- [ ] `routes/viewerCountPoller.js`
- [ ] `routes/generationApi.js`
- [ ] `routes/apiInternal.js`
