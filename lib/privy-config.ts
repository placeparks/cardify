import type { PrivyClientConfig } from '@privy-io/react-auth'

export const privyConfig: PrivyClientConfig = {
  embeddedWallets: {
    createOnLogin: 'users-without-wallets',
  },
  externalWallets: {
    walletConnect: {
      enabled: true,
    },
  },
  appearance: {
    walletList: ['metamask', 'wallet_connect'], // ✅ correct names
  },
}
