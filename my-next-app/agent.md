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
