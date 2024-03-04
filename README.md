# OVapi Cloudflare Worker

Pre-processes information from [ovapi.nl](https://ovapi.nl) for desired lines and stopcodes for consumption 
by [rosmo/m5-ovstops](https://github.com/rosmo/m5paper-ovstops). Configure the lines and the stopcodes in 
[wrangler.toml](wrangler.toml) `LINES` environment variable. Login to Cloudflare and run `npx wrangler deploy`. 

