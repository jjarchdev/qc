/**
 * One-time Supabase Storage setup (Dashboard → Storage → New bucket)
 * OR run via SQL if you use storage helpers.
 *
 * Bucket name: scenario-images
 * Public: yes (employees need to load images)
 *
 * Suggested policy (Dashboard → Storage → scenario-images → Policies):
 * - Public read for all
 * - Upload/update/delete only via service role (server uses secret key; no anon writes needed)
 */
