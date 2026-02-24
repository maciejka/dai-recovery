import { getDefaultConfig } from 'connectkit';
import { createConfig, http } from 'wagmi';
import { networkConfig } from './network';

export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: 'Lost DAI Recovery',
    walletConnectProjectId: networkConfig.walletConnectProjectId,
    chains: [networkConfig.chain],
    transports: {
      [networkConfig.chain.id]: http(networkConfig.rpcUrl),
    },
  }),
);
