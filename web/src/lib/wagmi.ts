import { createConfig, fallback, http, type CreateConnectorFn, type Transport } from "wagmi";
import { injected } from "@wagmi/core";
import { walletConnect } from "@wagmi/connectors/walletConnect";
import { coinbaseWallet } from "@wagmi/connectors/coinbaseWallet";
import { arbitrum, linea, mainnet, optimism } from "viem/chains";
import { BRAND, chain, RPC_URL, WC_PROJECT_ID } from "./config";

const BASE_RPCS = ["https://base-rpc.publicnode.com", "https://base.drpc.org", "https://gateway.tenderly.co/public/base", "https://base.llamarpc.com"];

export const BRIDGE_CHAINS = [mainnet, arbitrum, optimism, linea] as const;

const connectors: CreateConnectorFn[] = [
  injected(),
  coinbaseWallet({ appName: BRAND, appLogoUrl: "https://keelfun.app/icon.png", preference: { options: "all" } }),
];
if (WC_PROJECT_ID) {
  connectors.push(
    walletConnect({
      projectId: WC_PROJECT_ID,
      showQrModal: true,
      metadata: {
        name: BRAND,
        description: "Fair launches on Base",
        url: "https://keelfun.app",
        icons: ["https://keelfun.app/icon.png"],
      },
      qrModalOptions: { themeMode: "dark", themeVariables: { "--wcm-accent-color": "#3d7bff", "--wcm-z-index": "1000" } },
    }),
  );
}

export const wagmiConfig = createConfig({
  chains: [chain, ...BRIDGE_CHAINS],
  connectors,
  transports: { ...Object.fromEntries(BRIDGE_CHAINS.map((c) => [c.id, http()])), [chain.id]: chain.id === 8453 ? fallback([...BASE_RPCS.map((u) => http(u)), http(RPC_URL)]) : http(RPC_URL) } as Record<number, Transport>,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
