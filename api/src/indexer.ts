import { DurableObject } from "cloudflare:workers";
import { parseEventLogs, verifyMessage } from "viem";
import { launchFactoryAbi, launchHookAbi, launchTokenAbi } from "./abis";
import { Rpc, type RpcLog } from "./rpc";
import type { Env } from "./index";

const DEAD = "0x000000000000000000000000000000000000dead";
const ZERO = "0x0000000000000000000000000000000000000000";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BASE_SUPPLY = 1_000_000_000;
const TICKS_PER_10X = 23_000;
const MAX_SPAN = 20_000;
const SYNC_MS = 3_000;
const MAX_UPLOAD = 1_000_000;

const eventAbi = [...launchFactoryAbi, ...launchHookAbi];
// Pair assets the factory allows, with their launch start tick (1B supply) and decimals.
const PAIRS: Record<string, { symbol: string; decimals: number; tick: number }> = {
  [ZERO]: { symbol: "ETH", decimals: 18, tick: 200_200 },
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6, tick: 402_000 },
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": { symbol: "cbBTC", decimals: 8, tick: 466_200 },
  "0xb2000000000000000000008501b13360000cb2ec": { symbol: "cbZEC", decimals: 8, tick: 423800 },
  "0xb200000000000000000000451d033a5000cb479e": { symbol: "cbHYPE", decimals: 18, tick: 167400 },
  "0x311935cd80b76769bf2ecc9d8ab7635b2139cf82": { symbol: "SOL", decimals: 9, tick: 375600 },
  "0xb20000000000000000000016e38fd364d271ba28": { symbol: "ANTC", decimals: 8, tick: 401200 },
  "0xb2000000000000000000002d0ba3164cc74f58b7": { symbol: "GOOGLC", decimals: 8, tick: 412000 },
  "0xb20000000000000000000078ee7ce2fe4908108c": { symbol: "NVDAC", decimals: 8, tick: 405600 },
  "0xb2000000000000000000008bc8786b856e61707c": { symbol: "METAC", decimals: 8, tick: 419800 },
  "0xbbcb0356bb9e6b3faa5cbf9e5f36185d53403ac9": { symbol: "BCOIN", decimals: 18, tick: 173000 },
  "0xb2000000000000000000007b9fcbd005511acbd5": { symbol: "SPCXC", decimals: 8, tick: 405000 },
  "0xb200000000000000000000397293cb8cda9a10c5": { symbol: "SNDKC", decimals: 8, tick: 422000 },
  "0xb2000000000000000000001e800a7f5189430cd0": { symbol: "TSLAC", decimals: 8, tick: 415000 },
  "0xb200000000000000000000d9192b6b456483c2e8": { symbol: "AMZNC", decimals: 8, tick: 411400 },
  "0xb200000000000000000000c2e324d24d7eecd1fb": { symbol: "AAPLC", decimals: 8, tick: 414600 },
  "0xb2000000000000000000004884b426556b92883d": { symbol: "MSTRC", decimals: 8, tick: 400600 },
  "0x92ecf64fdb76e60b76d78a29ad4bf9d38b7b1b97": { symbol: "NVDA", decimals: 18, tick: 175400 },
  "0xc445d35f74f8cd24a596d4db8228840d0a938f6d": { symbol: "SATA", decimals: 18, tick: 170400 },
  "0xb200000000000000000000ab99cfa739e253872b": { symbol: "MSFTC", decimals: 8, tick: 418000 },
  "0xca47fa9f4c55a8c2c83bfb872fd18d3c656795cf": { symbol: "STRC", decimals: 18, tick: 171200 },
  "0xb200000000000000000000fd2f87532b90095211": { symbol: "MUC", decimals: 8, tick: 421200 },
  "0x5de98c65a9a3c414550e6663666bc725c23c2e7b": { symbol: "MSTR", decimals: 18, tick: 170200 },
  "0x74ed07d83999bc5db0ffd850da0a6bd782abd39c": { symbol: "TSLA", decimals: 18, tick: 184800 },
  "0xb2000000000000000000000d8ce462e99ee7a47b": { symbol: "AMDC", decimals: 8, tick: 417600 },
  "0xcc7cef3de42be48110e1fb753e4a314cf6a574f2": { symbol: "ASST", decimals: 18, tick: 154000 },
  "0x2f11eeee0bf21e7661a22dbbbb9068f4ad191b86": { symbol: "BNIU", decimals: 18, tick: 137200 },
  "0xb20000000000000000000058b8c947e44011dfe6": { symbol: "NFLXC", decimals: 8, tick: 396600 },
  "0xb2000000000000000000007d16372840df4dabbe": { symbol: "PLTRC", decimals: 8, tick: 406200 },
  "0xb200000000000000000000fc737aea6196ab5a4c": { symbol: "AVGOC", decimals: 8, tick: 414200 },
  "0x1a4dfa04a5c8f85ecad6ffd3c211051f8a43e280": { symbol: "GOOGL", decimals: 18, tick: 181800 },
  "0xb200000000000000000000f720c26062bc3067da": { symbol: "TTWOC", decimals: 8, tick: 409400 },
  "0xb200000000000000000000347afba223d7b6b63c": { symbol: "ORCLC", decimals: 8, tick: 402800 },
  "0x41f7a63713e76c0ab800be03bae9f17b8a356348": { symbol: "AAPL", decimals: 18, tick: 184200 },
  "0xb200000000000000000000187f7071d6e321a7d2": { symbol: "SKHYC", decimals: 8, tick: 403800 },
  "0xb20000000000000000000016f9dfe862feba122b": { symbol: "BEC", decimals: 8, tick: 406800 },
  "0x5cda0e1ca4ce2af96315f7f8963c85399c172204": { symbol: "WTCOIN", decimals: 18, tick: 172400 },
  "0x0f6c508ef7257c4b99bd1bc8aef750da64840813": { symbol: "AVGO", decimals: 18, tick: 184000 },
  "0x6aed8b1acfb04f4e0e6db580f12ff41438a394e5": { symbol: "WTFGI", decimals: 18, tick: 143400 },
  "0xb200000000000000000000f1a0f91e34892e4718": { symbol: "LLYC", decimals: 8, tick: 428000 },
  "0xaaf450456949eb5fc77987f619653e77383a8170": { symbol: "AMD", decimals: 18, tick: 187200 },
  "0xb20000000000000000000024170488e788cbbcb4": { symbol: "BRK.BC", decimals: 8, tick: 419800 },
  "0xb20000000000000000000019f6e7c675b73c2e4d": { symbol: "CRCLC", decimals: 8, tick: 395400 },
  "0xb2000000000000000000008fde21a1f5c69fec0b": { symbol: "WDCC", decimals: 8, tick: 412600 },
};
const pairOf = (a: unknown) => PAIRS[lc(String(a ?? ZERO))] ?? PAIRS[ZERO];
const wei = (v: bigint) => Number(v) / 1e18;
const lc = (s: string) => s.toLowerCase();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

type Row = Record<string, SqlStorageValue>;

async function sha256(buf: ArrayBuffer | Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class Indexer extends DurableObject<Env> {
  private sql: SqlStorage;
  private rpc: Rpc;
  private syncing: Promise<void> | null = null;
  private lastSync = 0;
  private startTick: number;
  private poolManager: string;
  private excluded: string[];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.rpc = new Rpc(env.RPC_URL);
    this.startTick = Number(env.START_TICK || "200200");
    this.poolManager = lc(env.POOL_MANAGER || "0x498581ff718922c3f8e6a244956af099b2652b2b");
    this.excluded = [this.poolManager, DEAD, ZERO, lc(env.FACTORY), lc(env.HOOK)];
    this.migrate();
    ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.getAlarm()) == null) await ctx.storage.setAlarm(Date.now() + 1000);
    });
  }

  private migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS tokens (
        address TEXT PRIMARY KEY, creator TEXT, pool_id TEXT, name TEXT, symbol TEXT, metadata_uri TEXT,
        description TEXT, image TEXT, website TEXT, x TEXT, telegram TEXT,
        discord TEXT, supply REAL DEFAULT 1000000000, fee_bps INTEGER DEFAULT 100, holders_route INTEGER DEFAULT 0,
        anti_snipe INTEGER DEFAULT 0, recipients TEXT DEFAULT '[]', route_fees REAL DEFAULT 0, platform_fees REAL DEFAULT 0,
        launch_block INTEGER, launch_ts INTEGER, launch_tx TEXT,
        burned REAL DEFAULT 0, net_sold REAL DEFAULT 0,
        price REAL, pool_eth REAL DEFAULT 0, volume REAL DEFAULT 0, trade_count INTEGER DEFAULT 0,
        last_trade_ts INTEGER DEFAULT 0, pair TEXT DEFAULT '0x0000000000000000000000000000000000000000',
        buy_bps INTEGER DEFAULT 100, sell_bps INTEGER DEFAULT 100, creator_bps INTEGER DEFAULT 10000,
        holders_bps INTEGER DEFAULT 0, burn_bps INTEGER DEFAULT 0, editable INTEGER DEFAULT 0, buyback_burned REAL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY, token TEXT, trader TEXT, is_buy INTEGER, eth REAL, tokens REAL, fee REAL,
        price REAL, net_sold REAL, ts INTEGER, block INTEGER, tx TEXT
      );
      CREATE INDEX IF NOT EXISTS trades_token_ts ON trades(token, ts);
      CREATE INDEX IF NOT EXISTS trades_trader ON trades(trader);
      CREATE TABLE IF NOT EXISTS balances (token TEXT, holder TEXT, amount TEXT, PRIMARY KEY (token, holder));
      CREATE INDEX IF NOT EXISTS balances_holder ON balances(holder);
      CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, mime TEXT, data BLOB, created INTEGER);
      CREATE TABLE IF NOT EXISTS metadata (id TEXT PRIMARY KEY, body TEXT, created INTEGER);
      CREATE TABLE IF NOT EXISTS builders (
        code TEXT PRIMARY KEY, name TEXT, url TEXT, kind TEXT, description TEXT, payout TEXT, signature TEXT,
        approved INTEGER DEFAULT 0, created INTEGER
      );
    `);
    try {
      this.sql.exec("ALTER TABLE tokens ADD COLUMN meta_tries INTEGER DEFAULT 0");
    } catch {}
    try {
      this.sql.exec("ALTER TABLE tokens ADD COLUMN builder TEXT");
    } catch {}
  }

  /** Opening price in pair units per token. */
  private startPriceFor(supply: number, pair: unknown = ZERO) {
    const p = pairOf(pair);
    const tick = p.tick + TICKS_PER_10X * Math.round(Math.log10(supply / BASE_SUPPLY));
    return Math.pow(1.0001, -tick) * 10 ** (18 - p.decimals);
  }

  /** ETH value of one unit of the pair asset (0 while a price is unknown). */
  private pairEth(pair: unknown) {
    const sym = pairOf(pair).symbol;
    if (sym === "ETH") return 1;
    const eth = this.ethUsd();
    if (!eth) return 0;
    if (sym === "USDC") return 1 / eth;
    if (sym === "cbBTC") return Number(this.meta("btc_usd") ?? 0) / eth;
    return Number(this.meta(`px_${lc(String(pair))}`) ?? 0) / eth;
  }

  private meta(key: string): string | null {
    const r = this.sql.exec("SELECT value FROM meta WHERE key = ?", key).toArray()[0];
    return r ? String(r.value) : null;
  }

  private setMeta(key: string, value: string) {
    this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  }

  async alarm() {
    try {
      await this.sync();
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + SYNC_MS);
    }
  }

  sync(): Promise<void> {
    if (!this.syncing) {
      this.syncing = this.doSync()
        .then(() => this.setMeta("last_error", ""))
        .catch((e) => {
          console.error("sync failed", e);
          this.setMeta("last_error", String(e).slice(0, 300));
        })
        .finally(() => {
          this.syncing = null;
          this.lastSync = Date.now();
        });
    }
    return this.syncing;
  }

  private async doSync() {
    await this.refreshEthUsd();
    if (this.env.FACTORY === ZERO) return;
    const head = await this.rpc.blockNumber();
    let cursor = Number(this.meta("cursor") ?? Number(this.env.START_BLOCK) - 1);
    let span = Number(this.env.LOG_SPAN || MAX_SPAN);
    while (cursor < head) {
      const from = cursor + 1;
      const to = Math.min(head, cursor + span);
      try {
        await this.indexRange(from, to);
      } catch (e) {
        if (span > 100) {
          span = Math.floor(span / 2);
          continue;
        }
        throw e;
      }
      cursor = to;
      this.setMeta("cursor", String(cursor));
    }
    this.setMeta("head", String(head));
    await this.retryMetadata();
  }

  // Metadata hosts can be briefly unreachable when a launch is indexed; retry a few times.
  private async retryMetadata() {
    const rows = this.sql
      .exec(
        `SELECT address, metadata_uri FROM tokens
         WHERE metadata_uri != '' AND description IS NULL AND image IS NULL AND meta_tries < 5 LIMIT 5`,
      )
      .toArray();
    for (const r of rows) {
      const m = await this.resolveMetadata(String(r.metadata_uri));
      if (m) {
        this.sql.exec(
          "UPDATE tokens SET description = ?, image = ?, website = ?, x = ?, telegram = ?, discord = ?, meta_tries = 5 WHERE address = ?",
          str(m.description), str(m.image), str(m.website), str(m.x), str(m.telegram), str(m.discord), r.address,
        );
      } else {
        this.sql.exec("UPDATE tokens SET meta_tries = meta_tries + 1 WHERE address = ?", r.address);
      }
    }
  }

  /** ETH and BTC from Coinbase, stock-pair prices from DexScreener (CoinGecko rate-limits Cloudflare egress). */
  private async refreshEthUsd() {
    const at = Number(this.meta("eth_usd_at") ?? 0);
    if (Date.now() - at < 60_000) return;
    const get = async (url: string) => {
      const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "keel-indexer" }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`${url} ${r.status}`);
      return r.json();
    };
    try {
      for (const [sym, key] of [["ETH", "eth_usd"], ["BTC", "btc_usd"]] as const) {
        const j = (await get(`https://api.coinbase.com/v2/prices/${sym}-USD/spot`)) as { data?: { amount?: string } };
        const v = Number(j.data?.amount);
        if (v > 0) this.setMeta(key, String(v));
      }
      this.setMeta("eth_usd_at", String(Date.now()));
    } catch (e) {
      console.error("eth price", e);
    }
    const stocks = Object.keys(PAIRS).filter((a) => !["ETH", "USDC", "cbBTC"].includes(PAIRS[a].symbol));
    for (let i = 0; i < stocks.length; i += 30) {
      try {
        const chunk = stocks.slice(i, i + 30);
        const j = (await get(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`)) as {
          pairs?: { chainId: string; baseToken: { address: string }; priceUsd?: string; liquidity?: { usd?: number } }[];
        };
        const best = new Map<string, { px: number; liq: number }>();
        for (const pr of j.pairs ?? []) {
          const a = lc(pr.baseToken.address);
          const liq = pr.liquidity?.usd ?? 0;
          if (pr.chainId !== "base" || !chunk.includes(a) || !(Number(pr.priceUsd) > 0)) continue;
          if (!best.has(a) || best.get(a)!.liq < liq) best.set(a, { px: Number(pr.priceUsd), liq });
        }
        for (const [a, v] of best) this.setMeta(`px_${a}`, String(v.px));
      } catch (e) {
        console.error("stock prices", e);
      }
    }
  }

  private async indexRange(from: number, to: number) {
    const coreLogs = await this.rpc.getLogs({ address: [this.env.FACTORY, this.env.HOOK], fromBlock: from, toBlock: to });
    const core = parseEventLogs({ abi: eventAbi, logs: coreLogs.map(toViemLog), strict: false });

    const known = this.sql.exec("SELECT address FROM tokens").toArray().map((r) => String(r.address));
    const launched = core.filter((l) => l.eventName === "TokenLaunched").map((l) => lc((l.args as { token: string }).token));
    const tokens = [...new Set([...known, ...launched])];

    const transferLogs: RpcLog[] = [];
    for (let i = 0; i < tokens.length; i += 100) {
      transferLogs.push(
        ...(await this.rpc.getLogs({ address: tokens.slice(i, i + 100), fromBlock: from, toBlock: to, topics: [TRANSFER_TOPIC] })),
      );
    }
    const transfers = parseEventLogs({ abi: launchTokenAbi, logs: transferLogs.map(toViemLog), eventName: "Transfer", strict: false });

    const timed = core.filter((l) => l.eventName === "TokenLaunched" || l.eventName === "Trade");
    const blocks = [...new Set([...timed, ...transfers].map((l) => Number(l.blockNumber)))];
    const ts = await this.rpc.blockTimestamps(blocks);

    const metas = new Map<string, Row>();
    for (const l of core) {
      if (l.eventName !== "TokenLaunched" && l.eventName !== "MetadataUpdated") continue;
      const uri = String((l.args as { metadataURI?: string }).metadataURI ?? "");
      const m = await this.resolveMetadata(uri);
      if (m) metas.set(uri, m);
    }

    const order = (l: { blockNumber: bigint | null; logIndex: number | null }) =>
      Number(l.blockNumber) * 1e6 + Number(l.logIndex);
    // TokenLaunched is emitted after the launch buy's Trade in the same tx, so register launches first.
    const launches = core.filter((l) => l.eventName === "TokenLaunched");
    const rest = [...core.filter((l) => l.eventName !== "TokenLaunched"), ...transfers].sort((a, b) => order(a) - order(b));

    this.ctx.storage.transactionSync(() => {
      for (const l of launches) {
        const a = l.args as {
          token: string; creator: string; poolId: string; name: string; symbol: string; metadataURI: string;
          supply: bigint; pair: string; buyBps: number; sellBps: number; creatorBps: number; holdersBps: number;
          burnBps: number; antiSnipe: boolean; editable: boolean;
        };
        const m = metas.get(a.metadataURI) ?? {};
        const supply = wei(a.supply);
        this.sql.exec(
          `INSERT OR IGNORE INTO tokens (address, creator, pool_id, name, symbol, metadata_uri, description, image, website, x, telegram,
            discord, supply, fee_bps, holders_route, anti_snipe, launch_block, launch_ts, launch_tx, burned, price,
            pair, buy_bps, sell_bps, creator_bps, holders_bps, burn_bps, editable)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          lc(a.token), lc(a.creator), a.poolId, a.name, a.symbol, a.metadataURI,
          str(m.description), str(m.image), str(m.website), str(m.x), str(m.telegram), str(m.discord),
          supply, Number(a.buyBps), Number(a.holdersBps) > 0 && Number(a.creatorBps) === 0 ? 1 : 0, a.antiSnipe ? 1 : 0,
          Number(l.blockNumber), ts.get(Number(l.blockNumber)) ?? 0, l.transactionHash,
          0, this.startPriceFor(supply, a.pair),
          lc(a.pair), Number(a.buyBps), Number(a.sellBps), Number(a.creatorBps), Number(a.holdersBps), Number(a.burnBps),
          a.editable ? 1 : 0,
        );
      }
      for (const l of rest) {
        const block = Number(l.blockNumber);
        const time = ts.get(block) ?? 0;
        if (l.eventName === "Transfer") {
          const a = l.args as { from: string; to: string; amount?: bigint; value?: bigint };
          const v = a.amount ?? a.value ?? 0n;
          const token = lc(l.address);
          if (lc(a.from) !== ZERO) this.addBalance(token, lc(a.from), -v);
          this.addBalance(token, lc(a.to), v);
        } else if (l.eventName === "Trade") {
          const a = l.args as {
            token: string; trader: string; isBuy: boolean; pairAmount: bigint; tokenAmount: bigint;
            platformFee: bigint; creatorFee: bigint; sqrtPriceX96: bigint;
          };
          const token = lc(a.token);
          const pd = pairOf(this.sql.exec("SELECT pair FROM tokens WHERE address = ?", token).toArray()[0]?.pair).decimals;
          const unit = (v: bigint) => Number(v) / 10 ** pd;
          const fee = unit(a.platformFee + a.creatorFee);
          const eth = unit(a.pairAmount);
          const sq = Number(a.sqrtPriceX96) / 2 ** 96;
          const price = (1 / (sq * sq)) * 10 ** (18 - pd);
          const poolDelta = a.isBuy ? eth - fee : -(eth + fee);
          const tokens = wei(a.tokenAmount);
          const prevSold = Number(this.sql.exec("SELECT net_sold FROM tokens WHERE address = ?", token).toArray()[0]?.net_sold ?? 0);
          const netSold = Math.max(0, prevSold + (a.isBuy ? tokens : -tokens));
          this.sql.exec(
            `INSERT OR IGNORE INTO trades (id, token, trader, is_buy, eth, tokens, fee, price, net_sold, ts, block, tx)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            `${l.transactionHash}:${l.logIndex}`, token, lc(a.trader), a.isBuy ? 1 : 0, eth, wei(a.tokenAmount), fee,
            price, netSold, time, block, l.transactionHash,
          );
          this.sql.exec(
            `UPDATE tokens SET price = ?, net_sold = ?, pool_eth = MAX(0, pool_eth + ?), volume = volume + ?,
             trade_count = trade_count + 1, last_trade_ts = ?, route_fees = route_fees + ?, platform_fees = platform_fees + ?
             WHERE address = ?`,
            price, netSold, poolDelta, eth, time, unit(a.creatorFee), unit(a.platformFee), token,
          );
        } else if (l.eventName === "Burned") {
          const a = l.args as { token: string; tokensBurned: bigint };
          const n = wei(a.tokensBurned);
          this.sql.exec("UPDATE tokens SET burned = burned + ?, buyback_burned = buyback_burned + ? WHERE address = ?", n, n, lc(a.token));
        } else if (l.eventName === "MetadataUpdated") {
          const a = l.args as { token: string; metadataURI: string };
          const m = metas.get(a.metadataURI);
          if (m) {
            this.sql.exec(
              "UPDATE tokens SET metadata_uri = ?, description = ?, image = ?, website = ?, x = ?, telegram = ?, discord = ? WHERE address = ?",
              a.metadataURI, str(m.description), str(m.image), str(m.website), str(m.x), str(m.telegram), str(m.discord), lc(a.token),
            );
          }
        } else if (l.eventName === "MetadataFrozen") {
          this.sql.exec("UPDATE tokens SET editable = 0 WHERE address = ?", lc((l.args as { token: string }).token));
        } else if (l.eventName === "RouteSet") {
          const a = l.args as { token: string; recipients: string[]; shares: number[] };
          const route = a.recipients.map((r, i) => ({ address: lc(r), bps: Number(a.shares[i]) }));
          this.sql.exec("UPDATE tokens SET recipients = ? WHERE address = ?", JSON.stringify(route), lc(a.token));
        } else if (l.eventName === "RecipientChanged") {
          const a = l.args as { token: string; from: string; to: string };
          const r = this.sql.exec("SELECT recipients FROM tokens WHERE address = ?", lc(a.token)).toArray()[0];
          if (r) {
            const route = (safeParseArr(String(r.recipients)) as { address: string; bps: number }[]).map((x) =>
              x.address === lc(a.from) ? { ...x, address: lc(a.to) } : x,
            );
            this.sql.exec("UPDATE tokens SET recipients = ? WHERE address = ?", JSON.stringify(route), lc(a.token));
          }
        }
      }
    });
  }

  private addBalance(token: string, holder: string, delta: bigint) {
    const r = this.sql.exec("SELECT amount FROM balances WHERE token = ? AND holder = ?", token, holder).toArray()[0];
    const next = BigInt(r ? String(r.amount) : "0") + delta;
    this.sql.exec(
      "INSERT INTO balances (token, holder, amount) VALUES (?, ?, ?) ON CONFLICT(token, holder) DO UPDATE SET amount = excluded.amount",
      token, holder, (next < 0n ? 0n : next).toString(),
    );
  }

  private async resolveMetadata(uri: string): Promise<Row | null> {
    const local = uri.match(/\/metadata\/([0-9a-f]{64})$/);
    if (local) {
      const r = this.sql.exec("SELECT body FROM metadata WHERE id = ?", local[1]).toArray()[0];
      if (r) return safeParse(String(r.body));
    }
    if (!/^https?:\/\//.test(uri) && !uri.startsWith("ipfs://")) return null;
    try {
      const url = uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      return res.ok ? safeParse(await res.text()) : null;
    } catch {
      return null;
    }
  }

  // ---------- HTTP API ----------

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (Date.now() - this.lastSync > SYNC_MS) void this.sync();
    try {
      if (req.method === "POST") {
        if (parts[0] === "sync") return await this.sync().then(() => json({ ok: true }));
        if (parts[0] === "upload") return await this.upload(req, url);
        if (parts[0] === "metadata") return await this.saveMetadata(req, url);
        if (parts[0] === "builders") return await this.registerBuilder(req);
        return json({ error: "not found" }, 404);
      }
      switch (parts[0]) {
        case undefined:
        case "stats":
          return json(this.stats());
        case "tokens":
          if (!parts[1]) return json(this.listTokens(url.searchParams));
          return this.tokenRoute(lc(parts[1]), parts[2], url.searchParams);
        case "portfolio":
          return json(this.portfolio(lc(parts[1] ?? "")));
        case "builders":
          return json(this.builders());
        case "images":
          return this.image(parts[1] ?? "");
        case "metadata": {
          const r = this.sql.exec("SELECT body FROM metadata WHERE id = ?", parts[1] ?? "").toArray()[0];
          return r ? new Response(String(r.body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=31536000, immutable" } }) : json({ error: "not found" }, 404);
        }
      }
      return json({ error: "not found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  }

  private ethUsd() {
    return Number(this.meta("eth_usd") ?? 0);
  }

  private stats() {
    const c = { tokens: 0, volume: 0, trades: 0, pfees: 0 };
    for (const r of this.sql
      .exec("SELECT pair, COUNT(*) AS n, SUM(volume) AS v, SUM(trade_count) AS t, SUM(platform_fees) AS f FROM tokens GROUP BY pair")
      .toArray()) {
      const k = this.pairEth(r.pair);
      c.tokens += Number(r.n);
      c.trades += Number(r.t);
      c.volume += Number(r.v) * k;
      c.pfees += Number(r.f) * k;
    }
    return {
      chainId: Number(this.env.CHAIN_ID),
      factory: this.env.FACTORY,
      hook: this.env.HOOK,
      cursor: Number(this.meta("cursor") ?? 0),
      head: Number(this.meta("head") ?? 0),
      ethUsd: this.ethUsd(),
      btcUsd: Number(this.meta("btc_usd") ?? 0),
      tokens: Number(c.tokens),
      platformFeesEth: Number(c.pfees),
      volumeEth: Number(c.volume),
      trades: Number(c.trades),
      lastError: this.meta("last_error") || undefined,
    };
  }

  private tokenSelect(where: string) {
    const ex = this.excluded.map(() => "?").join(",");
    return {
      sql: `SELECT t.*,
        (SELECT price FROM trades WHERE token = t.address AND ts <= ?1 ORDER BY ts DESC, block DESC LIMIT 1) AS price_24h,
        (SELECT COALESCE(SUM(eth), 0) FROM trades WHERE token = t.address AND ts > ?1) AS vol_24h,
        (SELECT COUNT(*) FROM balances b WHERE b.token = t.address AND b.amount != '0' AND b.holder NOT IN (${ex})) AS holders
        FROM tokens t ${where}`,
      binds: [Math.floor(Date.now() / 1000) - 86_400, ...this.excluded] as SqlStorageValue[],
    };
  }

  private listTokens(q: URLSearchParams) {
    const sort = q.get("sort") ?? "trending";
    const search = (q.get("q") ?? "").trim();
    const limit = Math.min(100, Math.max(1, Number(q.get("limit") ?? 48)));
    const offset = Math.max(0, Number(q.get("offset") ?? 0));
    const conds: string[] = [];
    const extra: SqlStorageValue[] = [];
    if (search) {
      conds.push("(t.name LIKE ? OR t.symbol LIKE ? OR t.address = ?)");
      extra.push(`%${search}%`, `%${search}%`, lc(search));
    }
    if (q.get("creator")) {
      conds.push("t.creator = ?");
      extra.push(lc(q.get("creator")!));
    }
    const orderBy: Record<string, string> = {
      trending: "vol_24h DESC, t.last_trade_ts DESC, t.launch_ts DESC",
      new: "t.launch_ts DESC",
      top: "t.price * t.supply DESC",
      holders: "holders DESC",
      volume: "t.volume DESC",
    };
    const base = this.tokenSelect(conds.length ? `WHERE ${conds.join(" AND ")}` : "");
    const rows = this.sql
      .exec(`${base.sql} ORDER BY ${orderBy[sort] ?? orderBy.trending} LIMIT ${limit} OFFSET ${offset}`, ...base.binds, ...extra)
      .toArray();
    return { tokens: rows.map((r) => this.formatToken(r)), ethUsd: this.ethUsd() };
  }

  private formatToken(r: Row) {
    const usd = this.ethUsd();
    const k = this.pairEth(r.pair);
    const pair = pairOf(r.pair);
    const supply = Number(r.supply);
    const start = this.startPriceFor(supply, r.pair) * k;
    const pairPrice = Number(r.price ?? this.startPriceFor(supply, r.pair));
    const price = pairPrice * k;
    const launchTs = Number(r.launch_ts);
    const ref = r.price_24h != null ? Number(r.price_24h) * k : launchTs > Date.now() / 1000 - 86_400 ? start : price;
    const netSold = Number(r.net_sold);
    const poolTokens = Math.max(0, supply - Number(r.burned) - netSold);
    const liquidityEth = Number(r.pool_eth) * k + poolTokens * price;
    const fdvEth = price * supply;
    return {
      address: r.address,
      name: r.name,
      symbol: r.symbol,
      creator: r.creator,
      poolId: r.pool_id,
      metadataUri: r.metadata_uri,
      description: r.description,
      image: r.image,
      website: r.website,
      x: r.x,
      telegram: r.telegram,
      discord: r.discord,
      supply,
      feeBps: Number(r.fee_bps),
      pair: String(r.pair ?? ZERO),
      pairSymbol: pair.symbol,
      pairDecimals: pair.decimals,
      pairEth: k,
      priceInPair: pairPrice,
      buyBps: Number(r.buy_bps),
      sellBps: Number(r.sell_bps),
      creatorBps: Number(r.creator_bps),
      holdersBps: Number(r.holders_bps),
      burnBps: Number(r.burn_bps),
      editable: Boolean(r.editable),
      buybackBurned: Number(r.buyback_burned ?? 0),
      holdersRoute: Boolean(r.holders_route),
      antiSnipe: Boolean(r.anti_snipe),
      recipients: safeParseArr(String(r.recipients ?? "[]")),
      routeFeesEth: Number(r.route_fees) * k,
      platformFeesEth: Number(r.platform_fees) * k,
      createdAt: launchTs,
      launchBlock: Number(r.launch_block),
      launchTx: r.launch_tx,
      startPriceEth: start,
      netSold,
      burned: Number(r.burned),
      priceEth: price,
      priceUsd: price * usd,
      fdvEth,
      fdvUsd: fdvEth * usd,
      change24h: ref > 0 ? (price - ref) / ref : 0,
      volume24hEth: Number(r.vol_24h ?? 0) * k,
      volume24hUsd: Number(r.vol_24h ?? 0) * k * usd,
      volumeEth: Number(r.volume) * k,
      liquidityEth,
      liquidityUsd: liquidityEth * usd,
      poolEth: Number(r.pool_eth) * k,
      holders: Number(r.holders ?? 0),
      trades: Number(r.trade_count),
      lastTradeAt: Number(r.last_trade_ts),
    };
  }

  private tokenRoute(addr: string, sub: string | undefined, q: URLSearchParams): Response {
    const base = this.tokenSelect("WHERE t.address = ?");
    const row = this.sql.exec(base.sql, ...base.binds, addr).toArray()[0];
    if (!row) return json({ error: "token not found" }, 404);
    if (!sub) return json({ token: this.formatToken(row), ethUsd: this.ethUsd() });
    const k = this.pairEth(row.pair);
    if (sub === "trades") {
      const limit = Math.min(200, Number(q.get("limit") ?? 50));
      const rows = this.sql.exec(`SELECT * FROM trades WHERE token = ? ORDER BY block DESC, id DESC LIMIT ${limit}`, addr).toArray();
      return json({
        trades: rows.map((t) => ({
          id: t.id, trader: t.trader, isBuy: Boolean(t.is_buy), eth: Number(t.eth) * k, tokens: t.tokens, fee: Number(t.fee) * k,
          priceEth: Number(t.price) * k, pairAmount: t.eth, ts: t.ts, tx: t.tx, block: t.block,
        })),
      });
    }
    if (sub === "holders") {
      const rows = this.sql
        .exec("SELECT holder, amount FROM balances WHERE token = ? AND amount != '0'", addr)
        .toArray()
        .map((h) => ({ holder: String(h.holder), amount: wei(BigInt(String(h.amount))) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 100)
        .map((h) => ({
          ...h,
          pct: h.amount / Number(row.supply),
          label: h.holder === this.poolManager ? "pool" : h.holder === DEAD ? "burn" : h.holder === row.creator ? "creator" : null,
        }));
      return json({ holders: rows });
    }
    if (sub === "candles") return json({ candles: this.candles(addr, Number(row.launch_ts), q, this.startPriceFor(Number(row.supply), row.pair), k) });
    return json({ error: "not found" }, 404);
  }

  private candles(addr: string, launchTs: number, q: URLSearchParams, startPrice: number, k: number) {
    const res = [15, 60, 300, 900, 3600, 14400, 86400].includes(Number(q.get("res"))) ? Number(q.get("res")) : 60;
    const rows = this.sql.exec("SELECT ts, price, eth FROM trades WHERE token = ? ORDER BY ts, block, id", addr).toArray();
    type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
    const out: Candle[] = [];
    let prev = startPrice;
    if (rows.length === 0 || Number(rows[0].ts) > launchTs) {
      const t = launchTs - (launchTs % res);
      out.push({ time: t, open: prev, high: prev, low: prev, close: prev, volume: 0 });
    }
    for (const r of rows) {
      const t = Number(r.ts) - (Number(r.ts) % res);
      const p = Number(r.price);
      let c = out[out.length - 1];
      if (!c || c.time !== t) {
        c = { time: t, open: prev, high: Math.max(prev, p), low: Math.min(prev, p), close: p, volume: 0 };
        out.push(c);
      }
      c.high = Math.max(c.high, p);
      c.low = Math.min(c.low, p);
      c.close = p;
      c.volume += Number(r.eth);
      prev = p;
    }
    return out.map((c) => ({ ...c, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k, volume: c.volume * k }));
  }

  private portfolio(wallet: string) {
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) return { error: "bad wallet" };
    const base = this.tokenSelect("WHERE t.address IN (SELECT token FROM balances WHERE holder = ? AND amount != '0')");
    const held = this.sql.exec(base.sql, ...base.binds, wallet).toArray().map((r) => this.formatToken(r));
    const bal = new Map(
      this.sql
        .exec("SELECT token, amount FROM balances WHERE holder = ? AND amount != '0'", wallet)
        .toArray()
        .map((r) => [String(r.token), wei(BigInt(String(r.amount)))]),
    );
    const created = this.listTokens(new URLSearchParams({ creator: wallet, sort: "new", limit: "100" })).tokens;
    const holdings = held
      .map((t) => {
        const amount = bal.get(String(t.address)) ?? 0;
        return { token: t, amount, valueEth: amount * t.priceEth, valueUsd: amount * t.priceUsd };
      })
      .sort((a, b) => b.valueEth - a.valueEth);
    const trades = this.sql
      .exec(
        `SELECT tr.*, t.symbol, t.name, t.image, t.pair FROM trades tr JOIN tokens t ON t.address = tr.token
         WHERE tr.trader = ? ORDER BY tr.block DESC LIMIT 50`,
        wallet,
      )
      .toArray()
      .map((t) => ({
        id: t.id, token: t.token, symbol: t.symbol, name: t.name, image: t.image, isBuy: Boolean(t.is_buy),
        eth: Number(t.eth) * this.pairEth(t.pair), tokens: t.tokens, priceEth: Number(t.price) * this.pairEth(t.pair), ts: t.ts, tx: t.tx,
      }));
    return { holdings, created, trades, ethUsd: this.ethUsd() };
  }

  private async upload(req: Request, url: URL) {
    const mime = (req.headers.get("content-type") ?? "").split(";")[0];
    if (!/^image\/(png|jpeg|gif|webp)$/.test(mime)) return json({ error: "png, jpeg, gif or webp only" }, 400);
    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_UPLOAD) return json({ error: "image must be under 1 MB" }, 400);
    const id = await sha256(buf);
    this.sql.exec("INSERT OR IGNORE INTO uploads (id, mime, data, created) VALUES (?, ?, ?, ?)", id, mime, buf, Date.now());
    return json({ url: `${url.origin}/images/${id}` });
  }

  private image(id: string) {
    const r = this.sql.exec("SELECT mime, data FROM uploads WHERE id = ?", id).toArray()[0];
    if (!r) return json({ error: "not found" }, 404);
    return new Response(r.data as ArrayBuffer, {
      headers: { "content-type": String(r.mime), "cache-control": "public, max-age=31536000, immutable" },
    });
  }

  private builders() {
    this.sql.exec(
      `UPDATE tokens SET builder = (SELECT json_extract(body, '$.builder') FROM metadata WHERE metadata.id = substr(tokens.metadata_uri, -64))
       WHERE builder IS NULL AND metadata_uri LIKE '%/metadata/%'`,
    );
    const rows = this.sql
      .exec(
        `SELECT b.code, b.name, b.url, b.kind, b.description, b.approved, b.created,
           COUNT(t.address) AS tokens, COALESCE(SUM(t.volume), 0) AS volume, COALESCE(SUM(t.platform_fees), 0) AS pfees
         FROM builders b LEFT JOIN tokens t ON t.builder = b.code
         GROUP BY b.code ORDER BY volume DESC, tokens DESC, b.created ASC LIMIT 200`,
      )
      .toArray();
    return {
      builders: rows.map((r) => ({
        code: r.code, name: r.name, url: r.url, kind: r.kind, description: r.description, approved: Boolean(r.approved),
        tokens: Number(r.tokens), volumeEth: Number(r.volume), shareEth: Number(r.pfees) * BUILDER_SHARE,
      })),
      ethUsd: this.ethUsd(),
    };
  }

  private async registerBuilder(req: Request) {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return json({ error: "invalid json" }, 400);
    const s = (k: string, max: number) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
    const code = s("code", 24).toLowerCase();
    const payout = s("payout", 42);
    const name = s("name", 40);
    if (!BUILDER_CODE.test(code)) return json({ error: "Code: 3-24 letters, numbers or dashes" }, 400);
    if (!/^0x[0-9a-fA-F]{40}$/.test(payout)) return json({ error: "Invalid payout wallet" }, 400);
    if (!name) return json({ error: "Name your product" }, 400);
    const ok = await verifyMessage({
      address: payout as `0x${string}`,
      message: builderMessage(code, payout),
      signature: s("signature", 300) as `0x${string}`,
    }).catch(() => false);
    if (!ok) return json({ error: "Signature doesn't match the payout wallet" }, 400);
    const ex = this.sql.exec("SELECT payout FROM builders WHERE code = ?", code).toArray()[0];
    if (ex && lc(String(ex.payout)) !== lc(payout)) return json({ error: "That code is taken" }, 409);
    this.sql.exec(
      `INSERT INTO builders (code, name, url, kind, description, payout, signature, approved, created) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(code) DO UPDATE SET name = excluded.name, url = excluded.url, kind = excluded.kind,
         description = excluded.description, signature = excluded.signature`,
      code, name, str(s("url", 200)), str(s("kind", 24)), str(s("description", 280)), lc(payout), s("signature", 300), Date.now(),
    );
    return json({ ok: true, code });
  }

  private async saveMetadata(req: Request, url: URL) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "invalid json" }, 400);
    const clean: Record<string, string> = {};
    for (const k of ["description", "image", "website", "x", "telegram", "discord", "builder"]) {
      const v = body[k];
      if (typeof v === "string" && v.trim()) clean[k] = v.trim().slice(0, k === "description" ? 600 : 300);
    }
    if (clean.builder) {
      clean.builder = clean.builder.toLowerCase();
      if (!BUILDER_CODE.test(clean.builder)) delete clean.builder;
    }
    const text = JSON.stringify(clean);
    const id = await sha256(new TextEncoder().encode(text));
    this.sql.exec("INSERT OR IGNORE INTO metadata (id, body, created) VALUES (?, ?, ?)", id, text, Date.now());
    return json({ uri: `${url.origin}/metadata/${id}` });
  }
}

function toViemLog(l: RpcLog) {
  return {
    address: l.address,
    topics: l.topics,
    data: l.data,
    blockNumber: BigInt(l.blockNumber),
    transactionHash: l.transactionHash,
    logIndex: Number(l.logIndex),
    blockHash: null,
    transactionIndex: null,
    removed: false,
  } as const;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function safeParse(s: string): Row | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Row) : null;
  } catch {
    return null;
  }
}

function safeParseArr(s: string): unknown[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const BUILDER_CODE = /^[a-z0-9-]{3,24}$/;
const BUILDER_SHARE = 0.25;

export function builderMessage(code: string, payout: string) {
  return `Keel Builders\n\nCode: ${code}\nPayout wallet: ${payout.toLowerCase()}\n\nI accept the Keel Builders terms. This signature costs no gas and moves no funds.`;
}
