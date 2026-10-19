# Deployment notes

Current contract: see `studionet.json` (the address is also the value of `NEXT_PUBLIC_CONTRACT_ADDRESS` for the frontend).

## Superseded contracts (kept only so old explorer links can be recognised; do not use)

| Address | Replaced on | Why |
|---|---|---|
| `0x19A938d1A7d10f98C07e54Cf4Da6944028074F47` | 2026-10-18 | First version: no evidence snapshot, unfenced statements/appeal text, inconclusive-on-inconclusive appeal paid the bond to a non-winner. Replaced by the hardened contract. |
| `0x72A5063875Bb25f8CF450eFe3710671de5bEF0aE` | 2026-10-19 | Second version, returned by the stewards with "More information requested": appeal timeout voided a valid ruling (risk-free escape), `_items()` used substring membership, free-text agreement only, 2,000-char excerpt validated loosely, ACCEPTED treated as success in the UI, guessed case ids, unbounded registry scans. Replaced by the contract in `studionet.json`. |
