# OmniLink

A website where anyone can pick a design, edit a link page, and publish it at their own address. It runs entirely on Cloudflare.

## What's where

- `public/index.html`: the builder and its designs (add more to `LOOKS`)
- `public/cloud.js`: connects the builder to the server
- `public/terms.html`: the rules people agree to when publishing
- `src/worker.js`: accounts, saving, and serving each published page at its own address
- `db/schema.sql`: the database tables
- `wrangler.jsonc`: the Cloudflare settings
- `examples/simple-page/`: the original standalone link page

## Updating the site

Push to `main` on GitHub, and Cloudflare deploys it if the Worker is connected to this repository.

## Take down a page

In Cloudflare, open Storage & Databases > D1 > `omnilink` > Console, and run this with the page's address:

```sql
UPDATE pages SET blocked = 1 WHERE slug = 'their-address';
```

It disappears within about a minute, and its owner can't undo this. People report pages through the link on `/terms`.

## Limits

- Each page can be up to 1.9 MB, including its images, because images are stored inside the page in the database.
- The free plan includes 5 GB of database storage, 5 million rows read a day, and 100,000 rows written a day. Past the daily limits, the database stops responding until midnight UTC.
- Passwords can't be reset by email yet, because the site has no email service.

## Run it on your computer

```bash
npx wrangler d1 execute omnilink --local --file db/schema.sql
```

```bash
npx wrangler dev
```
