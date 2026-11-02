# Link in Bio

A static link-in-bio page. There is no build step: open `index.html` or host the folder anywhere.

## Update your links

Edit `config.js`. It holds your name, bio, avatar, colors, links and icons.

## See your stats

Add `?stats` to the end of the page URL. Counts are stored in each visitor's own browser, so this panel only shows activity from the browser you're viewing it in. To collect totals from all visitors, set `analytics.endpoint` in `config.js` to a URL that accepts POST requests.

## Link previews

Edit the title and description tags at the top of `index.html`. Social apps read those tags directly and don't run the page's scripts.
