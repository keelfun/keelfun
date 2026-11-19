import { createConfig, http, type CreateConnectorFn, type Transport } from "wagmi";
import { injected } from "@wagmi/core";
import { walletConnect } from "@wagmi/connectors/walletConnect";
import { arbitrum, linea, mainnet, optimism } from "viem/chains";
import { BRAND, chain, RPC_URL, WC_PROJECT_ID } from "./config";

export const BRIDGE_CHAINS = [mainnet, arbitrum, optimism, linea] as const;

const connectors: CreateConnectorFn[] = [injected()];
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
  transports: { ...Object.fromEntries(BRIDGE_CHAINS.map((c) => [c.id, http()])), [chain.id]: http(RPC_URL) } as Record<number, Transport>,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
