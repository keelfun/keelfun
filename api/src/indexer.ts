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
  "0x85e90a5430af45776548adb82ee4cd9e33b08077": { symbol: "DINO", decimals: 18, tick: 33200 },
  "0x532f27101965dd16442e59d40670faf5ebb142e4": { symbol: "BRETT", decimals: 18, tick: 68400 },
  "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4": { symbol: "TOSHI", decimals: 18, tick: 31000 },
  "0x6921b130d297cc43754afba22e5eac0fbf8db75b": { symbol: "DOGINME", decimals: 18, tick: 27800 },
  "0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2": { symbol: "DRB", decimals: 18, tick: 31000 },
  "0x9a26f5433671751c3276a065f57e5a02d2817973": { symbol: "KEYCAT", decimals: 18, tick: 46600 },
  "0x4ed4e862860bed51a9570b96d89af5e1b0efefed": { symbol: "DEGEN", decimals: 18, tick: 52800 },
  "0xb2000000000000000000004c27f6523082f41d01": { symbol: "BASECAT", decimals: 18, tick: 70600 },
  "0x768be13e1680b5ebe0024c42c896e3db59ec0149": { symbol: "SKI", decimals: 9, tick: 269200 },
  "0x15ac90165f8b45a80534228bdcb124a011f62fee": { symbol: "MOEW", decimals: 18, tick: 36800 },
  "0xb1a03eda10342529bbf8eb700a06c60441fef25d": { symbol: "MIGGLES", decimals: 18, tick: 55600 },
  "0x0c5142bc58f9a61ab8c3d2085dd2f4e550c5ce0b": { symbol: "RUSSELL", decimals: 18, tick: 55400 },
  "0xb8d98a102b0079b69ffbc760c8d857a31653e56e": { symbol: "TOBY", decimals: 18, tick: -76000 },
  "0x4a0c64af541439898448659aedcec8e8e819fc53": { symbol: "PONKE", decimals: 18, tick: 82800 },
  "0xb095274743941e953c746f9c228da9c18bb6ec29": { symbol: "LAPTOP", decimals: 18, tick: 87000 },
  "0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf": { symbol: "VVV", decimals: 18, tick: 156000 },
  "0xcbd06e5a2b0c65597161de254aa074e489deb510": { symbol: "cbDOGE", decimals: 8, tick: 327400 },
  "0xcb17c9db87b595717c857a08468793f5bab6445f": { symbol: "cbLTC", decimals: 8, tick: 393200 },
  "0xcbada732173e39521cdbe8bf59a6dc85a9fc7b8c": { symbol: "cbADA", decimals: 6, tick: 383000 },
  "0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196": { symbol: "LINK", decimals: 18, tick: 147400 },
  "0xb2000000000000000000006f944897540579d3f2": { symbol: "HOODC", decimals: 8, tick: 398000 },
  "0xb200000000000000000000ffef181db6dc5ed6a3": { symbol: "KOC", decimals: 8, tick: 401600 },
  "0xb200000000000000000000d2f4cf2f7debb244bb": { symbol: "MCDC", decimals: 8, tick: 412000 },
  "0xcb585250f852c6c6bf90434ab21a00f02833a4af": { symbol: "cbXRP", decimals: 6, tick: 401400 },
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": { symbol: "cbETH", decimals: 18, tick: 201600 },
  "0x940181a94a35a4569e4529a3cdfb74e38fd98631": { symbol: "AERO", decimals: 18, tick: 116800 },
  "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842": { symbol: "MORPHO", decimals: 18, tick: 130200 },
  "0x1bc0c42215582d5a085795f4badbac3ff36d1bcb": { symbol: "CLANKER", decimals: 18, tick: 149800 },
  "0x22af33fe49fd1fa80c7149773dde5890d3c76f3b": { symbol: "BNKR", decimals: 18, tick: 41200 },
  "0xb200000000000000000000cfbdf64a8706a94a01": { symbol: "BLUECHIP", decimals: 18, tick: 61800 },
  "0x1197e6fa778c4d13e47875bd1761c68c22c928e0": { symbol: "WTGRND", decimals: 18, tick: 152000 },
  "0x58538e6a46e07434d7e7375bc268d3cb839c0133": { symbol: "ENA", decimals: 18, tick: 102800 },
  "0xb200000000000000000000cf36d05963a3e2205c": { symbol: "AAOIC", decimals: 8, tick: 392600 },
  "0xb20000000000000000000026215d755356e5043f": { symbol: "ARMC", decimals: 8, tick: 407600 },
  "0xb200000000000000000000b1a29cf17a1819288a": { symbol: "ASTSC", decimals: 8, tick: 394800 },
  "0xb200000000000000000000d2b7d9aee52f6c6bef": { symbol: "BIDUC", decimals: 8, tick: 397800 },
  "0xb200000000000000000000ca7c6d1438e7245eb6": { symbol: "BILIC", decimals: 8, tick: 379800 },
  "0xb200000000000000000000ea2df44a307cab279c": { symbol: "BMNRC", decimals: 8, tick: 386600 },
  "0xb200000000000000000000c36ce081dd09e86ca2": { symbol: "BUDC", decimals: 8, tick: 399800 },
  "0xb200000000000000000000f215e4c890cfb7176b": { symbol: "CAKEC", decimals: 8, tick: 441600 },
  "0xb200000000000000000000f111184a74720787e6": { symbol: "CRWVC", decimals: 8, tick: 394000 },
  "0xb200000000000000000000428e3a3eebbb20692b": { symbol: "DJTC", decimals: 8, tick: 375000 },
  "0xb200000000000000000000a613d12deafbbb1db7": { symbol: "DUOLC", decimals: 8, tick: 408800 },
  "0xb2000000000000000000007790ed6e48e06ed935": { symbol: "GMEC", decimals: 8, tick: 388400 },
  "0xb20000000000000000000043a599976181bcf336": { symbol: "HIMSC", decimals: 8, tick: 383600 },
  "0xb200000000000000000000f3049f4aa834b23b64": { symbol: "HSAIC", decimals: 8, tick: 381800 },
  "0xb2000000000000000000002601c5c94f435da168": { symbol: "HTZC", decimals: 8, tick: 376200 },
  "0xb200000000000000000000f6b0417af5f52341fc": { symbol: "INFYC", decimals: 8, tick: 380600 },
  "0xb2000000000000000000004aff16039ba04bdfbc": { symbol: "INTCC", decimals: 8, tick: 395800 },
  "0xb200000000000000000000d61efd9f54a23ef9eb": { symbol: "LIC", decimals: 8, tick: 380000 },
  "0xb200000000000000000000eda6c2c6f11e0f838f": { symbol: "LITEC", decimals: 8, tick: 418600 },
  "0xb200000000000000000000e215e9b76ecba02468": { symbol: "MRNAC", decimals: 8, tick: 408800 },
  "0xb200000000000000000000ec3c4c7395cc609813": { symbol: "MRVLC", decimals: 8, tick: 405000 },
  "0xb2000000000000000000002d2b5dc53c61f1ba06": { symbol: "NIOC", decimals: 8, tick: 366400 },
  "0xb2000000000000000000005ac674f707e357409c": { symbol: "NOKC", decimals: 8, tick: 376000 },
  "0xb200000000000000000000c597c476fcf9aed3a8": { symbol: "NVAXC", decimals: 8, tick: 408000 },
  "0xb2000000000000000000008d5328e9208773dc58": { symbol: "NVOC", decimals: 8, tick: 392400 },
  "0xb200000000000000000000c8a7223510467d8563": { symbol: "PDDC", decimals: 8, tick: 400400 },
  "0xb20000000000000000000018fe7ec7d6dfeeb528": { symbol: "PFEC", decimals: 8, tick: 405600 },
  "0xb2000000000000000000008fc2a8c23cf5937b66": { symbol: "PMC", decimals: 8, tick: 439000 },
  "0xb2000000000000000000009272a491812842aa84": { symbol: "PTONC", decimals: 8, tick: 401800 },
  "0xb200000000000000000000450ad3abe5d4846c6e": { symbol: "PYPLC", decimals: 8, tick: 395600 },
  "0xb200000000000000000000ca425ab42e07c35bc3": { symbol: "QUBTC", decimals: 8, tick: 376000 },
  "0xb2000000000000000000005bd7ae89b9e6189bb5": { symbol: "RBLXC", decimals: 8, tick: 400400 },
  "0xb20000000000000000000066242d4067724cb7a1": { symbol: "RDDTC", decimals: 8, tick: 400800 },
  "0xb200000000000000000000e8e50cbbb9a3861a3c": { symbol: "RKLBC", decimals: 8, tick: 395200 },
  "0xb20000000000000000000017bb66e9301e913a99": { symbol: "SANC", decimals: 8, tick: 380400 },
  "0xb200000000000000000000da6f64c306234127e0": { symbol: "SAPC", decimals: 8, tick: 409000 },
  "0xb2000000000000000000003088798f6d0722aaac": { symbol: "SEC", decimals: 8, tick: 397800 },
  "0xb200000000000000000000a26326a922ffa87f6c": { symbol: "SONYC", decimals: 8, tick: 389000 },
  "0xb2000000000000000000002137743d4a01fe4e88": { symbol: "SOUNC", decimals: 8, tick: 415000 },
  "0xb200000000000000000000349ef3aa93a0897476": { symbol: "ULC", decimals: 8, tick: 397400 },
  "0xb20000000000000000000063376b142c0764b489": { symbol: "VALEC", decimals: 8, tick: 378800 },
  "0xb20000000000000000000044e3cd7a0e1028e57a": { symbol: "WENC", decimals: 8, tick: 377000 },
  "0xb200000000000000000000e88efe88d8ade3f0da": { symbol: "WRDC", decimals: 8, tick: 367800 },
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
      CREATE TABLE IF NOT EXISTS fee_events (id TEXT PRIMARY KEY, token TEXT, kind TEXT, who TEXT, amount REAL, tokens REAL, ts INTEGER, block INTEGER, tx TEXT);
      CREATE INDEX IF NOT EXISTS fee_events_token ON fee_events(token, block);
      CREATE TABLE IF NOT EXISTS balances (token TEXT, holder TEXT, amount TEXT, PRIMARY KEY (token, holder));
      CREATE INDEX IF NOT EXISTS balances_holder ON balances(holder);
      CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, mime TEXT, data BLOB, created INTEGER);
      CREATE TABLE IF NOT EXISTS metadata (id TEXT PRIMARY KEY, body TEXT, created INTEGER);
      CREATE TABLE IF NOT EXISTS builders (
        code TEXT PRIMARY KEY, name TEXT, url TEXT, kind TEXT, description TEXT, payout TEXT, signature TEXT,
        approved INTEGER DEFAULT 0, created INTEGER
      );
      CREATE TABLE IF NOT EXISTS vaults (owner TEXT PRIMARY KEY, blob TEXT, updated INTEGER);
      CREATE TABLE IF NOT EXISTS scheduled (
        id TEXT PRIMARY KEY, creator TEXT, name TEXT, symbol TEXT, description TEXT, image TEXT, pair TEXT,
        website TEXT, x TEXT, telegram TEXT, launch_at INTEGER, created INTEGER, signature TEXT
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
        const j = { pairs: (await get(`https://api.dexscreener.com/tokens/v1/base/${chunk.join(",")}`)) as {
          chainId: string; baseToken: { address: string }; priceUsd?: string; liquidity?: { usd?: number } }[] };
        const best = new Map<string, { px: number; liq: number }>();
        for (const pr of j.pairs ?? []) {
          const a = lc(pr.baseToken.address);
          const liq = pr.liquidity?.usd ?? 0;
          if (pr.chainId !== "base" || !chunk.includes(a) || !(Number(pr.priceUsd) > 0)) continue;
          if (!best.has(a) || best.get(a)!.liq < liq) best.set(a, { px: Number(pr.priceUsd), liq });
        }
        for (const [a, v] of best) this.setMeta(`px_${a}`, String(v.px));
        const miss = chunk.filter((a) => !best.has(a));
        if (miss.length) {
          const g = (await get(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${miss.join(",")}`)) as {
            data?: { attributes?: { token_prices?: Record<string, string> } };
          };
          for (const [a, v] of Object.entries(g.data?.attributes?.token_prices ?? {})) if (Number(v) > 0) this.setMeta(`px_${lc(a)}`, String(Number(v)));
        }
      } catch (e) {
        this.setMeta("px_err", `${new Date().toISOString()} ${(e as Error).message}`.slice(0, 200));
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

    const timed = core.filter((l) => ["TokenLaunched", "Trade", "FeesClaimed", "HoldersFlushed", "Burned"].includes(String(l.eventName)));
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
        } else if (l.eventName === "FeesClaimed" || l.eventName === "HoldersFlushed") {
          const a = l.args as { token: string; recipient?: string; amount: bigint };
          const token = lc(a.token);
          const pd = pairOf(this.sql.exec("SELECT pair FROM tokens WHERE address = ?", token).toArray()[0]?.pair).decimals;
          this.sql.exec(
            "INSERT OR IGNORE INTO fee_events (id, token, kind, who, amount, tokens, ts, block, tx) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
            `${l.transactionHash}:${l.logIndex}`, token, l.eventName === "FeesClaimed" ? "claim" : "holders", a.recipient ? lc(a.recipient) : "",
            Number(a.amount) / 10 ** pd, time, block, l.transactionHash,
          );
        } else if (l.eventName === "Burned") {
          const a = l.args as { token: string; tokensBurned: bigint; pairAmount: bigint };
          const n = wei(a.tokensBurned);
          {
            const pd = pairOf(this.sql.exec("SELECT pair FROM tokens WHERE address = ?", lc(a.token)).toArray()[0]?.pair).decimals;
            this.sql.exec(
              "INSERT OR IGNORE INTO fee_events (id, token, kind, who, amount, tokens, ts, block, tx) VALUES (?, ?, 'burn', '', ?, ?, ?, ?, ?)",
              `${l.transactionHash}:${l.logIndex}`, lc(a.token), Number(a.pairAmount) / 10 ** pd, n, time, block, l.transactionHash,
            );
          }
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
        if (parts[0] === "scheduled") return await this.schedule(req);
        if (parts[0] === "vault") return await this.vault(req, parts[1]);
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
        case "traders":
          return json(this.traders(url.searchParams));
        case "builders":
          return json(this.builders());
        case "scheduled":
          return json(this.scheduled(parts[1]));
        case "revenue":
          return json(this.revenue());
        case "flywheel":
          return json(this.flywheel());
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
      pricedPairs: Number(this.sql.exec("SELECT COUNT(*) AS n FROM meta WHERE key LIKE 'px\\_0x%' ESCAPE '\\'").toArray()[0]?.n ?? 0),
      priceError: this.meta("px_err"),
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

  private revenue() {
    const toks = this.sql.exec("SELECT address, pair, volume, platform_fees, route_fees FROM tokens").toArray();
    const kOf = new Map<string, number>();
    let volume = 0, platform = 0, creator = 0;
    const byPair: Record<string, { symbol: string; amount: number; eth: number }> = {};
    for (const t of toks) {
      const k = this.pairEth(t.pair);
      kOf.set(String(t.address), k);
      volume += Number(t.volume) * k;
      platform += Number(t.platform_fees) * k;
      creator += Number(t.route_fees) * k;
      const sym = pairOf(t.pair).symbol;
      const e = (byPair[sym] ??= { symbol: sym, amount: 0, eth: 0 });
      e.amount += Number(t.platform_fees);
      e.eth += Number(t.platform_fees) * k;
    }
    let holders = 0, burns = 0, claims = 0, burnCount = 0;
    for (const e of this.sql.exec("SELECT token, kind, SUM(amount) AS a, COUNT(*) AS c FROM fee_events GROUP BY token, kind").toArray()) {
      const v = Number(e.a) * (kOf.get(String(e.token)) ?? 0);
      if (e.kind === "holders") holders += v;
      else if (e.kind === "claim") claims += v;
      else if (e.kind === "burn") { burns += v; burnCount += Number(e.c); }
    }
    const days = new Map<number, { day: number; volumeEth: number; feesEth: number; trades: number }>();
    for (const r of this.sql.exec("SELECT token, CAST(ts / 86400 AS INTEGER) AS d, SUM(eth) AS v, SUM(fee) AS f, COUNT(*) AS c FROM trades WHERE ts > 0 GROUP BY token, d").toArray()) {
      const k = kOf.get(String(r.token)) ?? 0;
      const d = Number(r.d);
      const x = days.get(d) ?? { day: d * 86400, volumeEth: 0, feesEth: 0, trades: 0 };
      x.volumeEth += Number(r.v) * k;
      x.feesEth += Number(r.f) * k;
      x.trades += Number(r.c);
      days.set(d, x);
    }
    return {
      ethUsd: this.ethUsd(), volumeEth: volume, platformFeesEth: platform, creatorFeesEth: creator, holdersEth: holders, burnsEth: burns,
      claimsEth: claims, burnCount, byPair: Object.values(byPair).filter((p) => p.amount > 0).sort((a, b) => b.eth - a.eth),
      daily: [...days.values()].sort((a, b) => a.day - b.day).slice(-90),
    };
  }

  private flywheel() {
    const top = this.listTokens(new URLSearchParams("sort=top&limit=10")).tokens.slice(0, 10);
    const total = top.reduce((sum, t) => sum + (Number(t.fdvEth) || 0), 0);
    let burnedEth = 0;
    for (const r of this.sql.exec("SELECT f.token, t.pair, SUM(f.amount) AS a FROM fee_events f JOIN tokens t ON t.address = f.token WHERE f.kind = 'burn' GROUP BY f.token").toArray())
      burnedEth += Number(r.a) * this.pairEth(r.pair);
    const agg = this.sql.exec("SELECT COUNT(*) AS c, COUNT(DISTINCT token) AS n FROM fee_events WHERE kind = 'burn'").toArray()[0];
    const recent = this.sql
      .exec("SELECT f.token, f.amount, f.tokens, f.ts, f.tx, t.symbol, t.image, t.pair FROM fee_events f JOIN tokens t ON t.address = f.token WHERE f.kind = 'burn' ORDER BY f.block DESC LIMIT 30")
      .toArray()
      .map((r) => ({
        token: r.token, symbol: r.symbol, image: r.image, pairSymbol: pairOf(r.pair).symbol, amount: Number(r.amount),
        eth: Number(r.amount) * this.pairEth(r.pair), tokens: Number(r.tokens), ts: Number(r.ts), tx: r.tx,
      }));
    return {
      ethUsd: this.ethUsd(), burnedEth, burns: Number(agg?.c ?? 0), tokensReached: Number(agg?.n ?? 0),
      rankings: top.map((t) => ({ ...t, weight: total ? Number(t.fdvEth) / total : 0 })), recent,
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
    if (q.get("pair")) {
      conds.push("t.pair = ?");
      extra.push(lc(q.get("pair")!));
    }
    const orderBy: Record<string, string> = {
      trending: "vol_24h DESC, t.last_trade_ts DESC, t.launch_ts DESC",
      new: "t.launch_ts DESC",
      top: "t.price * t.supply DESC",
      holders: "holders DESC",
      volume: "t.volume DESC",
      active: "t.last_trade_ts DESC, t.launch_ts DESC",
    };
    const base = this.tokenSelect(conds.length ? `WHERE ${conds.join(" AND ")}` : "");
    if (sort === "top" || sort === "volume") {
      const all = this.sql.exec(base.sql, ...base.binds, ...extra).toArray().map((r) => this.formatToken(r));
      const key = sort === "top" ? "fdvEth" : "volume24hEth";
      all.sort((a, b) => Number(b[key]) - Number(a[key]) || Number(b.fdvEth) - Number(a.fdvEth));
      return { tokens: all.slice(offset, offset + limit), ethUsd: this.ethUsd() };
    }
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
    if (sub === "fees") {
      const ev = this.sql.exec("SELECT * FROM fee_events WHERE token = ? ORDER BY block DESC LIMIT 100", addr).toArray();
      const tf = this.sql.exec("SELECT id, trader, is_buy, fee, ts, block, tx FROM trades WHERE token = ? AND fee > 0 ORDER BY block DESC, id DESC LIMIT 100", addr).toArray();
      const fees = [
        ...ev.map((e) => ({ id: e.id, kind: e.kind, who: e.who, amount: Number(e.amount), tokens: Number(e.tokens), ts: e.ts, block: Number(e.block), tx: e.tx })),
        ...tf.map((t) => ({ id: t.id, kind: t.is_buy ? "buy_tax" : "sell_tax", who: t.trader, amount: Number(t.fee), tokens: 0, ts: t.ts, block: Number(t.block), tx: t.tx })),
      ]
        .sort((a, b) => b.block - a.block)
        .slice(0, 100);
      return json({ fees, pairEth: k });
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

  private traders(q: URLSearchParams) {
    const win: Record<string, number> = { "1d": 86_400, "7d": 604_800, "30d": 2_592_000 };
    const span = win[q.get("window") ?? "7d"] ?? 0;
    const since = span ? Math.floor(Date.now() / 1000) - span : 0;
    const rows = this.sql
      .exec(
        `SELECT tr.trader, tr.token, tr.is_buy, tr.eth, tr.tokens, tr.ts, t.pair, t.symbol, t.image, t.price, t.creator
         FROM trades tr JOIN tokens t ON t.address = tr.token WHERE tr.ts >= ? ORDER BY tr.ts`,
        since,
      )
      .toArray();
    type Pos = { buyEth: number; sellEth: number; buyTok: number; sellTok: number; symbol: string; image: string | null; price: number };
    const by = new Map<string, { pos: Map<string, Pos>; buys: number; sells: number; first: number; last: number; dev: boolean; cum: number; peak: number; dd: number; flips: number; lastSide: Map<string, [number, number]> }>();
    const devs = new Set(this.sql.exec("SELECT DISTINCT creator FROM tokens").toArray().map((r) => String(r.creator)));
    for (const r of rows) {
      const k = this.pairEth(r.pair);
      const w = String(r.trader);
      let a = by.get(w);
      if (!a) by.set(w, (a = { pos: new Map(), buys: 0, sells: 0, first: Number(r.ts), last: 0, dev: devs.has(w), cum: 0, peak: 0, dd: 0, flips: 0, lastSide: new Map() }));
      let p = a.pos.get(String(r.token));
      if (!p) a.pos.set(String(r.token), (p = { buyEth: 0, sellEth: 0, buyTok: 0, sellTok: 0, symbol: String(r.symbol), image: (r.image as string) ?? null, price: Number(r.price ?? 0) * k }));
      const eth = Number(r.eth) * k;
      if (r.is_buy) {
        p.buyEth += eth;
        p.buyTok += Number(r.tokens);
        a.buys++;
      } else {
        const held = p.buyTok - p.sellTok;
        if (p.buyTok > 0 && held > 0) {
          a.cum += eth - (p.buyEth / p.buyTok) * Math.min(Number(r.tokens), held);
          a.peak = Math.max(a.peak, a.cum);
          a.dd = Math.max(a.dd, a.peak - a.cum);
        }
        p.sellEth += eth;
        p.sellTok += Number(r.tokens);
        a.sells++;
      }
      const ls = a.lastSide.get(String(r.token));
      if (ls && ls[0] !== Number(r.is_buy) && Number(r.ts) - ls[1] <= 4) a.flips++;
      a.lastSide.set(String(r.token), [Number(r.is_buy), Number(r.ts)]);
      a.last = Math.max(a.last, Number(r.ts));
    }
    const out = [...by.entries()].map(([wallet, a]) => {
      let realized = 0, unrealized = 0, cost = 0, volume = 0, wins = 0, losses = 0, open = 0;
      let best: { symbol: string; image: string | null; pnl: number } | null = null;
      for (const p of a.pos.values()) {
        const avg = p.buyTok > 0 ? p.buyEth / p.buyTok : 0;
        const sold = Math.min(p.sellTok, p.buyTok);
        const held = Math.max(0, p.buyTok - p.sellTok);
        const r = p.sellEth - (p.buyTok > 0 ? avg * sold : 0) - (p.buyTok > 0 ? 0 : 0);
        const u = held * p.price - avg * held;
        const pnl = (p.buyTok > 0 ? r : 0) + u;
        realized += p.buyTok > 0 ? r : 0;
        unrealized += u;
        cost += p.buyEth;
        volume += p.buyEth + p.sellEth;
        if (held > 0 && held * p.price > 1e-7) open++;
        if (pnl > 0) wins++;
        else if (pnl < 0) losses++;
        if (!best || pnl > best.pnl) best = { symbol: p.symbol, image: p.image, pnl };
      }
      const pnl = realized + unrealized;
      return { wallet, pnlEth: pnl, pnlPct: cost > 0 ? pnl / cost : 0, unrealizedEth: unrealized, open, volumeEth: volume, wins, losses, buys: a.buys, sells: a.sells, best, lastTs: a.last, dev: a.dev, maxDd: cost > 0 ? Math.min(1, a.dd / cost) : 0, bot: a.flips >= 3 || (a.buys + a.sells >= 40 && (a.last - a.first) / (a.buys + a.sells) < 12) };
    });
    out.sort((x, y) => y.pnlEth - x.pnlEth);
    return { traders: out.slice(0, 100), ethUsd: this.ethUsd() };
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
        eth: Number(t.eth) * this.pairEth(t.pair), tokens: t.tokens, priceEth: Number(t.price) * this.pairEth(t.pair), ts: t.ts, tx: t.tx, pair: t.pair, pairAmount: Number(t.eth),
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

  private async vault(req: Request, op?: string) {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b || (op !== "save" && op !== "load")) return json({ error: "bad request" }, 400);
    const owner = lc(String(b.owner ?? ""));
    const ts = Math.floor(Number(b.ts));
    if (!/^0x[0-9a-f]{40}$/.test(owner)) return json({ error: "Invalid owner" }, 400);
    if (!(Math.abs(Date.now() / 1000 - ts) < 600)) return json({ error: "Signature expired, try again" }, 400);
    const ok = await verifyMessage({ address: owner as `0x${string}`, message: vaultCloudMessage(op === "save" ? "backup" : "restore", owner, ts), signature: String(b.signature ?? "").slice(0, 300) as `0x${string}` }).catch(() => false);
    if (!ok) return json({ error: "Signature doesn't match the wallet" }, 400);
    if (op === "load") {
      const r = this.sql.exec("SELECT blob, updated FROM vaults WHERE owner = ?", owner).toArray()[0];
      return r ? json({ blob: String(r.blob), updated: Number(r.updated) }) : json({ error: "No cloud backup for this wallet" }, 404);
    }
    const blob = String(b.blob ?? "");
    const v = safeParse(blob) as Record<string, unknown> | null;
    if (blob.length > 300_000 || !v || v.v !== 1 || !v.ct || !v.iv || !v.salt) return json({ error: "Invalid vault" }, 400);
    this.sql.exec("INSERT INTO vaults (owner, blob, updated) VALUES (?, ?, ?) ON CONFLICT(owner) DO UPDATE SET blob = excluded.blob, updated = excluded.updated", owner, blob, Date.now());
    return json({ ok: true });
  }

  private scheduled(id?: string) {
    const now = Math.floor(Date.now() / 1000);
    const rows = id
      ? this.sql.exec("SELECT * FROM scheduled WHERE id = ?", id).toArray()
      : this.sql.exec("SELECT * FROM scheduled WHERE launch_at > ? ORDER BY launch_at LIMIT 100", now - 7 * 86_400).toArray();
    const out = rows.map((r) => {
      const t = this.sql
        .exec("SELECT address FROM tokens WHERE creator = ? AND UPPER(symbol) = ? AND launch_ts >= ? ORDER BY launch_ts LIMIT 1", String(r.creator), String(r.symbol), Number(r.launch_at) - 86_400)
        .toArray()[0];
      const { signature: _s, ...rest } = r;
      return { ...rest, launch_at: Number(r.launch_at), token: t ? String(t.address) : null };
    });
    return id ? (out[0] ?? { error: "not found" }) : { scheduled: out.filter((x) => x.token || Number(x.launch_at) > now - 86_400) };
  }

  private async schedule(req: Request) {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return json({ error: "invalid json" }, 400);
    const s = (k: string, max: number) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
    const creator = lc(s("creator", 42));
    const symbol = s("symbol", 10).toUpperCase();
    const name = s("name", 32);
    const at = Math.floor(Number(b.launchAt));
    const now = Math.floor(Date.now() / 1000);
    if (!/^0x[0-9a-f]{40}$/.test(creator)) return json({ error: "Invalid creator" }, 400);
    if (!name || !/^[A-Z0-9]{1,10}$/.test(symbol)) return json({ error: "Name and ticker (1-10 letters/numbers) required" }, 400);
    if (!(at > now + 60 && at < now + 30 * 86_400)) return json({ error: "Pick a time between 1 minute and 30 days from now" }, 400);
    const pair = s("pair", 42);
    if (pair && !/^0x[0-9a-fA-F]{40}$/.test(pair)) return json({ error: "Invalid pair" }, 400);
    const ok = await verifyMessage({ address: creator as `0x${string}`, message: scheduleMessage(symbol, at, creator), signature: s("signature", 300) as `0x${string}` }).catch(() => false);
    if (!ok) return json({ error: "Signature doesn't match the creator wallet" }, 400);
    const n = Number(this.sql.exec("SELECT COUNT(*) AS n FROM scheduled WHERE creator = ? AND launch_at > ?", creator, now).toArray()[0]?.n ?? 0);
    if (n >= 3) return json({ error: "Max 3 upcoming launches per wallet" }, 429);
    const image = s("image", 300);
    if (image && !/^https:\/\//.test(image)) return json({ error: "Invalid image" }, 400);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    this.sql.exec(
      "INSERT INTO scheduled (id, creator, name, symbol, description, image, pair, website, x, telegram, launch_at, created, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, creator, name, symbol, str(s("description", 500)), str(image), str(lc(pair)), str(s("website", 200)), str(s("x", 200)), str(s("telegram", 200)), at, Date.now(), s("signature", 300),
    );
    return json({ ok: true, id });
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

export function vaultCloudMessage(kind: "backup" | "restore", owner: string, ts: number) {
  return `Keelfun vault ${kind}\nOwner: ${owner.toLowerCase()}\nTime: ${ts}\nThe vault stays encrypted. Keelfun cannot read your keys.`;
}

export function scheduleMessage(symbol: string, at: number, creator: string) {
  return `Keelfun scheduled launch\nTicker: $${symbol}\nTime: ${new Date(at * 1000).toISOString()}\nCreator: ${creator.toLowerCase()}`;
}

export function builderMessage(code: string, payout: string) {
  return `Keel Builders\n\nCode: ${code}\nPayout wallet: ${payout.toLowerCase()}\n\nI accept the Keel Builders terms. This signature costs no gas and moves no funds.`;
}
