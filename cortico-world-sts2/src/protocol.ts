/**
 * STS2-Agent 的 HTTP 契约(实测版)。
 *
 * 端点:
 *   GET  /health   服务信息
 *   GET  /state    当前局面
 *   POST /action   {"action":"<名字>", <参数>}  参数名用 option_index / card_index / target_index
 *
 * 动作返回的 data.state 就是执行后的新局面,所以做完不必再读一次。
 *
 * 所有字段形状按实机抓包定:agent_view 是 mod 给 AI 的紧凑视图,
 *   hand[]    { i, card_id, line, energy_cost, playable, target, targets[] }
 *   enemies[] { i, name, hp:"45/45", block, intents[{ intent_type, label, damage, hits, total_damage }] }
 *   player    { hp:"80/80", block, energy }
 *   options[] { i, line }   地图节点 / 奖励 / 事件 / 商店 / 选牌 都用它
 *   map       { current, boss_node, options[] }
 */

export interface Sts2Health {
  service: string;
  modVersion: string;
  gameVersion: string;
  status: string;
  apiPort: number;
  instanceRole: string;
  playRunning: boolean;
  playPhase: string;
  mcpEnabled: boolean;
}

export interface Sts2Card {
  i: number;
  cardId: string;
  /** 一整行现成的描述,如 "打击 [1费]:造成6点伤害。" */
  line: string;
  cost: number | null;
  playable: boolean;
  /** 'enemies' 表示要选目标,null 表示不需要。 */
  target: string | null;
  targets: number[];
  reason: string | null;
}

export interface Sts2Enemy {
  i: number;
  name: string;
  hp: string | null;
  block: number | null;
  intents: { type: string; label: string; damage: number | null; hits: number | null; total: number | null }[];
  alive: boolean;
  hittable: boolean;
}

export interface Sts2Option {
  i: number;
  line: string;
}

export interface Sts2Combat {
  hp: string | null;
  energy: number | null;
  block: number | null;
  hand: Sts2Card[];
  enemies: Sts2Enemy[];
  draw: { line: string }[];
  discard: { line: string }[];
  exhaust: { line: string }[];
  /** 动作能不能做,以及为什么不能。 */
  canAct: boolean;
  blockReason: string | null;
}

export interface Sts2Run {
  floor: number | null;
  act: number | null;
  character: string | null;
  hp: string | null;
  gold: number | null;
}

export interface Sts2View {
  screen: string;
  inCombat: boolean;
  turn: number | null;
  actions: string[];
  combat: Sts2Combat | null;
  run: Sts2Run | null;
  options: Sts2Option[];
  paused: boolean;
  raw: Record<string, unknown>;
}

export interface Sts2ActionResult {
  ok: boolean;
  message: string;
  view: Sts2View | null;
}

const DEFAULT_TIMEOUT_MS = 15000;

export class Sts2Client {
  private base: string;

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  setBase(baseUrl: string): void {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  get baseUrl(): string {
    return this.base;
  }

  private async request(path: string, init?: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.base + path, {
        ...init,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init?.headers ?? {}) },
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`返回的不是 JSON:${text.slice(0, 200)}`);
      }
      if (!response.ok) {
        // mod 的拒绝里带 error.message,那才是要读的东西。
        const err = (parsed as { error?: { message?: string; code?: string } })?.error;
        const detail = err?.message ?? JSON.stringify(parsed).slice(0, 300);
        throw new Error(`${err?.code ? `${err.code}: ` : ''}${detail}`);
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  async health(timeoutMs = 4000): Promise<Sts2Health> {
    const body = await this.request('/health', { method: 'GET' }, timeoutMs) as {
      ok?: boolean; data?: Record<string, unknown>;
    };
    const d = (body.data ?? {}) as Record<string, unknown>;
    return {
      service: String(d.service ?? ''),
      modVersion: String(d.mod_version ?? ''),
      gameVersion: String(d.game_version ?? ''),
      status: String(d.status ?? ''),
      apiPort: Number(d.api_port ?? 0),
      instanceRole: String(d.instance_role ?? ''),
      playRunning: d.play_running === true,
      playPhase: String(d.play_phase ?? ''),
      mcpEnabled: d.mcp_enabled === true,
    };
  }

  async state(timeoutMs = 10000): Promise<Sts2View> {
    const body = await this.request('/state', { method: 'GET' }, timeoutMs) as {
      ok?: boolean; data?: Record<string, unknown>;
    };
    if (body.ok === false) throw new Error('mod 报 state 不可用');
    return normalize((body.data ?? {}) as Record<string, unknown>);
  }

  async act(payload: Record<string, unknown>, timeoutMs = 20000): Promise<Sts2ActionResult> {
    const body = await this.request('/action', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, timeoutMs) as {
      ok?: boolean;
      data?: Record<string, unknown>;
      error?: { message?: string; code?: string };
    };
    const data = (body.data ?? {}) as Record<string, unknown>;
    const ok = body.ok !== false;
    const stateRaw = data.state as Record<string, unknown> | undefined;
    return {
      ok,
      message: String(
        body.error?.message
        ?? data.message
        ?? (ok ? '动作完成' : '动作被拒绝'),
      ),
      view: ok && stateRaw ? normalize(stateRaw) : null,
    };
  }
}

/** 把 mod 的 state 压成固定形状。agent_view 优先——它本来就是给 AI 裁剪过的。 */
export function normalize(data: Record<string, unknown>): Sts2View {
  const av = (data.agent_view ?? data) as Record<string, unknown>;
  const combatRaw = (av.combat ?? data.combat ?? null) as Record<string, unknown> | null;
  const runRaw = (av.run ?? data.run ?? null) as Record<string, unknown> | null;
  const readiness = (combatRaw?.action_readiness ?? {}) as Record<string, unknown>;

  return {
    screen: String(av.screen ?? data.screen ?? 'UNKNOWN'),
    inCombat: av.in_combat === true || data.in_combat === true,
    turn: numOrNull(av.turn ?? data.turn),
    actions: asStringArray(av.available_actions ?? data.available_actions),
    combat: combatRaw ? normalizeCombat(combatRaw, readiness) : null,
    run: runRaw ? normalizeRun(runRaw) : null,
    options: normalizeOptions(av.options ?? (av.map as Record<string, unknown> | undefined)?.options),
    paused: readiness.is_paused === true || String(av.screen ?? '') === 'PAUSE_MENU',
    raw: data,
  };
}

function normalizeCombat(raw: Record<string, unknown>, readiness: Record<string, unknown>): Sts2Combat {
  const player = (raw.player ?? {}) as Record<string, unknown>;
  const canUse = readiness.can_use_combat_actions;
  return {
    hp: strOrNull(player.hp),
    energy: numOrNull(player.energy),
    block: numOrNull(player.block),
    hand: asArray(raw.hand).map((c) => normalizeCard(c as Record<string, unknown>)),
    enemies: asArray(raw.enemies).map((e) => normalizeEnemy(e as Record<string, unknown>)),
    draw: asArray(raw.draw).map((d) => ({ line: String((d as Record<string, unknown>).line ?? '') })),
    discard: asArray(raw.discard).map((d) => ({ line: String((d as Record<string, unknown>).line ?? '') })),
    exhaust: asArray(raw.exhaust).map((d) => ({ line: String((d as Record<string, unknown>).line ?? '') })),
    canAct: canUse !== false,
    blockReason: canUse === false ? strOrNull(readiness.reason) : null,
  };
}

function normalizeCard(raw: Record<string, unknown>): Sts2Card {
  return {
    i: Number(raw.i ?? 0),
    cardId: String(raw.card_id ?? ''),
    line: String(raw.line ?? ''),
    cost: numOrNull(raw.energy_cost),
    playable: raw.playable !== false && raw.can_play_result !== false,
    target: raw.target == null ? null : String(raw.target),
    targets: asArray(raw.targets).map((t) => Number(t)).filter((n) => Number.isFinite(n)),
    reason: strOrNull(raw.unplayable_reason),
  };
}

function normalizeEnemy(raw: Record<string, unknown>): Sts2Enemy {
  return {
    i: Number(raw.i ?? 0),
    name: String(raw.name ?? ''),
    hp: strOrNull(raw.hp),
    block: numOrNull(raw.block),
    intents: asArray(raw.intents).map((it) => {
      const o = it as Record<string, unknown>;
      return {
        type: String(o.intent_type ?? ''),
        label: String(o.label ?? ''),
        damage: numOrNull(o.damage),
        hits: numOrNull(o.hits),
        total: numOrNull(o.total_damage),
      };
    }),
    alive: raw.alive !== false,
    hittable: raw.hittable !== false,
  };
}

function normalizeRun(raw: Record<string, unknown>): Sts2Run {
  return {
    floor: numOrNull(raw.floor),
    act: numOrNull(raw.act),
    character: strOrNull(raw.character_name ?? raw.character),
    hp: strOrNull(raw.hp ?? (raw.current_hp != null && raw.max_hp != null
      ? `${raw.current_hp}/${raw.max_hp}` : raw.current_hp)),
    gold: numOrNull(raw.gold),
  };
}

function normalizeOptions(value: unknown): Sts2Option[] {
  return asArray(value).map((o) => {
    const obj = o as Record<string, unknown>;
    return { i: Number(obj.i ?? 0), line: String(obj.line ?? '') };
  });
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map((v) => String(v));
}

function strOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function numOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
