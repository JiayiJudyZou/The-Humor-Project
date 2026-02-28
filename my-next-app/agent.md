# Project Overview
- This is a Next.js application deployed on Vercel and backed by Supabase.
- The voting “agent” workflow is an authenticated caption voting flow: users view an image with a caption and cast a vote.

# Key Routes
- `/login`
- `/auth/callback` (exact path)
- `/crackd` (gallery)
- `/vote` (caption voting)

# Supabase Tables Used
- `captions`: `id` (uuid), `content`, `image_id`
- `images`: `id` (uuid), `url`
- `caption_votes`: `created_datetime_utc`, `modified_datetime_utc`, `vote_value` (1/-1), `profile_id` (uuid), `caption_id` (uuid)

Notes:
- Voting is one vote per user per caption.
- Vote changes update the same row (upsert), rather than creating additional rows.

# How Voting Is Recorded (Requirements Mapping)
- Upvote = `1`, Downvote = `-1`.
- Unique constraint on (`profile_id`, `caption_id`) (if present).
- Update-not-insert-twice behavior uses upsert with `onConflict: "profile_id,caption_id"`.
- `created_datetime_utc` is set on first vote.
- On first insert, `modified_datetime_utc` matches `created_datetime_utc`.
- On later vote changes, `modified_datetime_utc` updates.

# Local Dev Setup
1. Run `npm install`.
2. Set env vars in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL=https://secure.almostcrackd.ai`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
3. Restart dev server after env changes.
4. Run `npm run dev`.

# Deployment (Vercel)
- Configure the same env vars in Vercel Project Settings.
- Build command: `npm run build`.
- Vercel deploys the `main` branch.

# Troubleshooting
- Env mismatch symptoms: auth or data fetch/write behavior differs between local and deployed environments.
- Images unavailable: likely missing `images.url` data or broken `captions.image_id` → `images.id` mapping.
- Vote write fails: check `caption_votes` schema, including required timestamp columns.

# Repo Conventions for Agents
- Keep changes minimal.
- Do not add new dependencies unless needed.
- Run `npm run build` before pushing to avoid Vercel TypeScript/build failures.

# Week 5 Feature: Upload & Generate Captions (REST Pipeline)

## New Protected Route
- `/upload` is a protected route for authenticated users.
- User selects an image file.
- App calls the external REST pipeline at `https://api.almostcrackd.ai`.
- App uploads file bytes via presigned URL and then displays generated captions.
- App displays `cdnUrl` and `imageId` in the UI.
- App shows an uploaded image preview using `cdnUrl`.
- App includes a History drawer (top-right) with prior uploads + generated captions, stored in `localStorage` per user.

## API Call Sequence (Step 1-4)
Execute calls in this exact order:
1. `POST /pipeline/generate-presigned-url`
   - Header: `Authorization: Bearer <supabase access token>`
2. `PUT <presignedUrl>`
   - Header: `Content-Type: <image MIME type>`
   - Body: raw file bytes
3. `POST /pipeline/upload-image-from-url`
   - Body includes: `imageUrl = cdnUrl`, `isCommonUse = false`
4. `POST /pipeline/generate-captions`
   - Body includes: `imageId`

## Auth Requirements for Pipeline Calls
- Access token source: `supabase.auth.getSession().data.session.access_token`
- Required header format on protected pipeline endpoints:
  - `Authorization: Bearer <token>`

## Data Storage Constraint (No DB Schema Changes)
- Do not change existing auth routes: keep `/login` and `/auth/callback` unchanged.
- Do not change existing Supabase tables/queries used by prior assignments.
- Upload history for Week 5 is client-side only, stored in `localStorage` (per user), not in Supabase tables.

## Local Dev / Testing (Week 5)
1. Start app locally and navigate to `/upload`.
2. Choose an image file.
3. Run the pipeline and verify generated captions appear.
4. Verify `cdnUrl`, `imageId`, and image preview are shown.
5. Open the History drawer from the top-right and confirm prior uploads/captions are listed.
6. Close the drawer by clicking outside it.
