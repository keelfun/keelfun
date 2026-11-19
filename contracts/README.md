# Keel contracts

Foundry project for the Keel launchpad on Base (Uniswap v4).

- `LaunchToken.sol`: fixed-supply ERC-20 minted once at construction, with optional ETH holder rewards.
- `LaunchFactory.sol`: deploys the token, initializes the ETH/token v4 pool, seeds 100% of the supply as liquidity (there is no remove path) and runs the optional first buy.
- `LaunchHook.sol`: v4 hook for trade fees (creator, holder or split routes plus the platform share), optional anti-snipe tax, and fee claims.
- `LaunchRouter.sol`: `buy`, `sell`, `quoteBuy` and `quoteSell`, with slippage and deadline checks.

```bash
forge test
forge script script/Deploy.s.sol --rpc-url <rpc> --broadcast --slow --private-key <key>
```

Deployed addresses are written to `deployments/<chainId>.json`. Base mainnet: [`deployments/8453.json`](deployments/8453.json).
