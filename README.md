# OmniLink

A website where anyone can pick a design, edit a link page, and publish it at their own address.

## What's where

- `public/index.html`: the builder and its designs (add more to `LOOKS`)
- `public/cloud.js`: sign-in and saving
- `public/config.js`: your Supabase address and public key
- `public/terms.html`: the rules people agree to when publishing
- `functions/[slug].js`: serves each published page at its own address
- `supabase/schema.sql`: the database and its access rules
- `examples/simple-page/`: the original standalone link page

## Set it up

1. **Database:** create a Supabase project, then paste `supabase/schema.sql` into the SQL Editor and run it.
2. **Sign-ups:** in Authentication > Sign In / Providers > Email, turn off **Confirm email** while you're starting out. Supabase's built-in email service only sends a few messages an hour, so connect your own email service before you open sign-ups widely. Password reset emails use the same service.
3. **Keys:** copy the Project URL and the anon public key from Project Settings > API into `public/config.js`, then push the change. Never use the `service_role` key here.
4. **Hosting:** in Cloudflare, go to Workers & Pages, create a Pages project connected to this GitHub repository, leave the build command empty, and set the output directory to `public`.
5. **Links:** in Supabase, go to Authentication > URL Configuration and set the Site URL to your Cloudflare address, so password reset links return to your site.

Until step 3 is done, the builder falls back to its download-and-host-it-yourself steps.

## Take down a page

In Supabase, open Table Editor > `profiles`, find the page's `slug`, and set `blocked` to `true`. It disappears within about a minute, and its owner can't undo this. People report pages through the link on `/terms`.

## Limits

Each page can be up to 2 MB, including its images, because images are stored inside the page in the database. Watch your database size in Supabase as you grow.
