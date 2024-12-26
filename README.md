# OVapi Cloudflare Worker

Pre-processes information from [ovapi.nl](https://ovapi.nl) for desired lines and stopcodes for consumption 
by [rosmo/m5-ovstops](https://github.com/rosmo/m5paper-ovstops). Configure the lines and the stopcodes in 
[wrangler.toml](wrangler.toml) `LINES` environment variable. Login to Cloudflare and run `npx wrangler deploy`. 

## Testing locally

Remember to update to latest wrangler via `npm install wrangler@latest` first.

Run `npx wrangler dev --remote`. Test locally via browser or `curl localhost:8787`.

## Deploying

Set your Cloudflare tokens via `CLOUDFLARE_ACCOUNT_ID` (find it via Cloudflare dashboard, select Workers
and look in the right side for account ID) and `CLOUDFLARE_API_TOKEN` environment variables, 

Create the KV cache for weather: `npx wrangler kv namespace create ovstops-weather`

Now you can run `npx wrangler deploy`.

## Configuration

The worker is configured via environment variables via [`wranger.toml`](wranger.toml).

- `LINES`: Comma separated values for lines to fetch. Format for each line is `[company]_[linenumber]_[direction]=[stop_id]`.
  Company can be eg. `GVB`. Line number is something like `5` for tram 5. Direction is either `1` or `2`. Multipe stop IDs
  can be separated via a forward slash.
- `LINEADJUST`: Adjust line with a minute offset and stop name (eg. `GVB_48_2=2/Haparandaweg` to add 2 minutes and rename stop)
- `WEATHER_ID`: Weather station ID (see [station IDs](https://data.buienradar.nl/2.0/feed/json)).
- `WEATHER_LAT`: Latitude for fetching the weather. Please only use 2 fractional digits as otherwise you get redirected.
- `WEATHER_LON`: Longitude for the weather. Please only use 2 fractional digits as otherwise you get redirected.
- `NODE_TLS_REJECT_UNAUTHORIZED`: set to `0` to disable TLS cert verification.

## Finding out your stops

Trams and buses are generally in format `GVB_[Tram number or bus number]_[line direction - 1 or 2]` eg. `GVB_22_1` for bus 22
from Sloterdijk to Muiderpoortstation (or `GVB_22_2` to the other direction).

Once you know that, next you'll need your point of interest. Grab the details using:
```sh
curl 'http://v0.ovapi.nl/line/GVB_22_1' | python3 -mjson.tool
```

In the output, search for your stop name (eg. `Spaarndammerdijk`) and you'll find the `TimingPointCode` for
your stop (in this case, it'd be `30002061`). Note if the timing point name is missing and you see a gap in
the JSON keys, it might be due to a temporary stop that doesn't have a timing beacon attached to it (?). Your
best bet is to pick the previous stop in this case (It should be pretty easy to add another field to offset
the time by plus some minutes to account the journey from the previous stop).

You can also take any keys of the line that look like `[OPERATOR]_[DATE]_[LINE]_[JOURNEYID]_[DIRECTION]' and
get more information from it by calling:
```sh
curl 'http://v0.ovapi.nl/journey/GVB_20241008_5_96_0' | python3 -mjson.tool
```

Now you can configure the `LINES` environment variable to `GVB_22_1=30002061` to display information
of line 22 and your stop.




