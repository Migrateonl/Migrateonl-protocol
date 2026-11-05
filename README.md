# MIGRATE

**Follow the flow. Move first.**

[![Live site](https://img.shields.io/badge/live-migrate.onl-blueviolet)](https://migrate.onl)
[![Chain](https://img.shields.io/badge/chain-Solana-blueviolet)](https://solana.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

| | |
|---|---|
| Chain | Solana |
| Contract address | _pending_ |
| Site | [migrate.onl](https://migrate.onl) |

## Overview

MIGRATE is a live window onto the busiest corner of Solana. The page ranks trending tokens by 24h volume, refreshes on its own, and keeps the first row of the board reserved for the MIGRATE coin. Until a contract address is confirmed that row shows the brand mark and a quiet placeholder; once the address is recorded it fills itself with live price, change, volume and depth.

## Features

- Live market board: top Solana tokens by volume, with logo, price, 24h change, volume, depth and a copy-address button.
- Ticker driven by the same feed, skeleton loaders, count-up numbers and change flashes.
- Pinned own-token row, driven only by the contract address record.
- Contract address slot at the top of the page: large, full address, click to copy, inert until stated.
- One register for every outside fact (`src/register.json`). Each record is `stated`, `absent` or `unconfirmed`; anything not stated renders inert and carries no value or link.
- Resilient polling: 60s cadence, exponential backoff, pause while the tab is hidden, last good data kept on failure.
- Respects `prefers-reduced-motion`; every animation has an instant fallback.

## Links

- Website: <https://migrate.onl>
- X: _pending_
- GitHub: _pending_

## Develop

```bash
npm install
npm run build     # writes dist/ (the folder to deploy)
npm run gates     # static and browser checks, exit 0 when all pass
npm run measure   # layout measurements at 360 / 390 / 430 / 1366 / 1440
```

Recording a fact means editing `src/register.json`: set `state` to `stated` and add `value` (contract address) or `url` (X, GitHub). Handles are derived from the stored URL.

## License

MIT. See [LICENSE](LICENSE).
