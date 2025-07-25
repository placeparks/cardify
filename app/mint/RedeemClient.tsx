'use client'
export const dynamic = 'force-dynamic'

import {
  ethers,
  keccak256,
  solidityPacked,
} from 'ethers'
import { usePrivy, useWallets }       from '@privy-io/react-auth'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState }        from 'react'

/* ───── chain constants ───── */
const WRITE_ABI = ['function redeemWithCode(string,string) payable']
const READ_ABI  = ['function usedHashes(bytes32) view returns (bool)']

const CHAIN_DEC = 84532
const CHAIN_HEX = '0x14A34'
const RPC_URL   = 'https://sepolia.base.org'
const EXPLORER  = 'https://sepolia.basescan.org'

/* ───── helpers ───── */
const ipfsToHttp = (url: string) =>
  url.replace(/^ipfs:\/\//, 'https://gateway.pinata.cloud/ipfs/')

function deriveURI(id: string | null, cid?: string) {
  if (!cid || !id) return null
  const n = Number(id)
  if (isNaN(n) || n <= 0) return null
  return `ipfs://${cid}/metadata/${n - 1}.json`
}

/* ───── component ───── */
export default function RedeemClient() {
  const { ready, authenticated, login, logout } = usePrivy()
  const { wallets }  = useWallets()
  const params       = useSearchParams()
  const router       = useRouter()

  /* collection fetched from /api/current-collection */
  const [{ address, cid }, setCurrent] =
    useState<{ address?: `0x${string}`; cid?: string }>({})

  useEffect(() => {
    fetch('/api/current-collection')
      .then(r => r.json())
      .then(setCurrent)
      .catch(() => setCurrent({}))
  }, [])

  /* ─── QR params and derived URI — DECLARED EARLY ─── */
  const code = (params.get('code') || '').trim()
  const id   = (params.get('id')   || '').trim()
  const uri  = deriveURI(id, cid)

  /* local UI state */
  const [status, setStatus] =
    useState<'idle' | 'switch' | 'claiming' | 'done' | 'error' | 'redeemed'>('idle')
  const [message,  setMessage ] = useState('')
  const [meta,     setMeta    ] =
    useState<{ name: string; description: string; image: string } | null>(null)
  const [redeemed, setRedeemed] = useState<boolean | null>(null)

  /* ① validate (runs whenever cid, code, id change) */
  useEffect(() => {
    if (cid === undefined) return                       // still loading
    if (!code || !id) { router.replace('/'); return }
    if (!uri)   { setStatus('error'); setMessage('Invalid QR code.'); }
  }, [cid, code, id, uri, router])

  /* ② clear banner once a valid uri appears */
  useEffect(() => {
    if (status === 'error' && uri) {
      setStatus('idle')
      setMessage('')
    }
  }, [status, uri])

  /* check if hash already redeemed */
  useEffect(() => {
    async function check() {
      if (!uri || !address) return
      const hash     = keccak256(solidityPacked(['string','string'], [code, uri]))
      const provider = new ethers.JsonRpcProvider(RPC_URL)
      const contract = new ethers.Contract(address, READ_ABI, provider)
      const used     = await contract.usedHashes(hash)
      setRedeemed(used)
      if (used) { setStatus('redeemed'); setMessage('Coupon already redeemed') }
    }
    check()
  }, [uri, code, address])


  /* ensure network ------------------------------------------ */
  async function ensureNetwork(wallet: any) {
    if (wallet.walletClientType === 'privy') await wallet.switchChain(CHAIN_DEC)
    else await switchInjectedWallet(await wallet.getEthereumProvider())
  }

  /* helper to switch MetaMask or other injected wallets */
async function switchInjectedWallet(eth: any) {
  const cur = await eth.request({ method: 'eth_chainId' })
  if (cur === CHAIN_HEX) return
  try {
    await eth.request({ method: 'wallet_switchEthereumChain',
                        params: [{ chainId: CHAIN_HEX }] })
  } catch (e: any) {
    if (e.code === 4902) {                        // chain not added yet
      await eth.request({
        method : 'wallet_addEthereumChain',
        params : [{
          chainId : CHAIN_HEX,
          chainName : 'Base Sepolia',
          rpcUrls : [RPC_URL],
          nativeCurrency : { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
          blockExplorerUrls : [EXPLORER],
        }],
      })
      await eth.request({ method: 'wallet_switchEthereumChain',
                          params: [{ chainId: CHAIN_HEX }] })
    } else {
      throw e
    }
  }
}


  /* claim --------------------------------------------------- */
  async function claim() {
    if (!ready || !authenticated || !wallets.length || !uri || !address) return
    const wallet = wallets[0]

    try {
      setStatus('switch');   setMessage('Switching to Base Sepolia…')
      await ensureNetwork(wallet)

      setStatus('claiming'); setMessage('Sending transaction…')

      const signer   = await new ethers.BrowserProvider(
        await wallet.getEthereumProvider()
      ).getSigner()

      const contract = new ethers.Contract(address, WRITE_ABI, signer)
      const tx       = await contract.redeemWithCode(code, uri)

      setMessage(`Tx sent: ${tx.hash.slice(0, 10)}…`)
      await tx.wait()

      const json = await fetch(ipfsToHttp(uri)).then(r => r.json())
      setMeta(json)

      setStatus('done'); setMessage('NFT claimed!')
    } catch (e: any) {
      setStatus('error'); setMessage(e?.reason || e?.message || 'Transaction failed')
    }
  }

  /* wait for collection ------------------------------------- */
  if (!address || !cid)
    return <div className="min-h-screen flex items-center justify-center text-white">Loading…</div>

  /* ------------------- JSX below unchanged ----------------- */
  const showConfetti = status === 'done'


return (
  <div className="relative min-h-screen flex items-center justify-center bg-black overflow-hidden">
    {/* ✨ CONFETTI ONLY WHEN CLAIM SUCCEEDS ✨ */}
    {showConfetti && (
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(40)].map((_, i) => (
          <span
            key={i}
            className="absolute w-1 h-2 rounded-sm opacity-0 animate-confetti"
            style={{
              backgroundColor: `hsl(${Math.random() * 360}deg 100% 60%)`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 4}s`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          />
        ))}
      </div>
    )}

    {/* CARD CONTAINER */}
    <div className="w-full max-w-sm mx-4 rounded-2xl p-0.5 bg-gradient-to-br from-fuchsia-600 via-purple-700 to-blue-600">
      <div className="rounded-[inherit] bg-zinc-950 text-zinc-100 px-6 py-8 relative overflow-hidden">

        {/* STATUS ICON */}
        {status === 'redeemed' ? (
          <div className="mx-auto mb-6 flex items-center justify-center h-20 w-20 rounded-full border-4 border-red-500">
            <svg viewBox="0 0 24 24" className="h-10 w-10 stroke-red-500 stroke-[3] fill-none">
              <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
            </svg>
          </div>
        ) : (
          <div className="mx-auto mb-6 flex items-center justify-center h-20 w-20 rounded-full border-4 border-green-400">
            <svg viewBox="0 0 24 24" className="h-10 w-10 stroke-green-400 stroke-[3] fill-none">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {/* HEADERS */}
        <h2 className={`text-center text-sm tracking-[0.2em] ${status === 'redeemed' ? 'text-red-500' : 'text-green-400'}`}>
          {status === 'redeemed' ? 'ALREADY CLAIMED' : 'AUTHENTICATED'}
        </h2>

        <h1 className="text-center text-4xl font-extrabold mt-1 mb-2 bg-gradient-to-r from-pink-500 via-purple-400 to-blue-500 bg-clip-text text-transparent">
          CARD #{id || '—'}
        </h1>

        {status !== 'redeemed' && (
          <p className="text-center text-xs text-pink-400 tracking-widest mb-6">
            ✧ LIMITED EDITION ✧
          </p>
        )}

        {/* MAIN BOX */}
        {status !== 'done' ? (
          <div className={`rounded-xl border p-4 mb-6 ${
            status === 'redeemed' ? 'border-red-500 bg-red-900/20' : 'border-zinc-700 bg-zinc-900/40'
          }`}>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-2">
              <span className={status === 'redeemed' ? 'text-red-400' : 'text-yellow-400'}>⚡</span>
              NFT Claiming
            </h3>
            <p className={`text-sm leading-relaxed ${status === 'redeemed' ? 'text-red-300' : 'text-zinc-400'}`}>
              {status === 'redeemed'
                ? 'This card’s NFT has already been claimed.'
                : 'You’re holding a genuine Cardify collectible.\nEach card unlocks a unique NFT.'}
            </p>
            {status === 'error' && (
              <p className="mt-3 text-center text-red-400 text-sm">{message}</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl p-4 mb-6 bg-zinc-900/40 border border-zinc-700">
            {meta && (
              <>
                <img src={ipfsToHttp(meta.image)} alt={meta.name} className="w-full rounded-lg mb-4" />
                <h3 className="text-lg font-semibold mb-1">{meta.name}</h3>
                <p className="text-sm text-zinc-400 mb-2">{meta.description}</p>
              </>
            )}
            <p className="text-green-400 text-center text-sm">{message}</p>
          </div>
        )}

        {/* CTA BUTTONS */}
{redeemed === false && status !== 'done' && (
  <>
    {!authenticated && (
      <button
        onClick={login}
        className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:opacity-90 font-semibold mb-3"
      >
        Connect Wallet
      </button>
    )}

    {authenticated && (
      <>
        <button
          onClick={claim}
          disabled={status === 'claiming'}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 font-semibold text-zinc-900 disabled:opacity-60"
        >
          {status === 'claiming' ? 'Claiming…' : 'Claim Now'}
        </button>

        <button
          onClick={logout}
          className="w-full mt-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs"
        >
          Disconnect
        </button>
      </>
    )}
  </>
)}


        {/* FOOTER */}
        <p className="mt-8 text-center text-[10px] text-zinc-500">
          Scan another QR code to verify more cards
        </p>
      </div>
    </div>

    {/* Confetti keyframes */}
    <style jsx global>{`
      @keyframes confetti-fall {
        0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
      }
      .animate-confetti {
        animation: confetti-fall 4s linear infinite;
      }
    `}</style>
  </div>
);

}
