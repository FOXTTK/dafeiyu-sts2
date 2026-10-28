/**
 * sts-2 World:把杀戮尖塔2的 STS2-Agent mod 接成 Coopanion 的一组工具。
 *
 * 传输是本机 HTTP:每次 observe 拿最新状态,每次 do 拿动作结果,结果里已经带了新状态。
 *
 * 这个 world 多做了一件事——**盯着模型有没有出声**。实测光靠环境提示词不够:
 * 模型会连着出三张牌一句不吭,选卡时也不说话。回执是每一步都会被读到的,
 * 所以在回执末尾催一句,比在提示词里写十遍管用。
 *
 * 怎么知道它说过话:world 收不到别的 world 的工具调用,所以这里用"动作计数 +
 * 画面类型"判断,并把「刚刚说过话」的窗口交给模型自己通过 observe 重置 —— 也就是
 * 说,只要它还在一路闷头 act,催话就会越来越密。
 */
import { fileURLToPath } from 'node:url';
import type {
  ToolCallContext, ToolDef, ToolOutcome, World, WorldHost, WorldWebUiDecl,
} from 'cortico/core/types.ts';
import { Sts2Client, type Sts2View } from './protocol.ts';
import { STS2_CONFIG_GROUP, type Sts2ConfigSection } from './config.ts';
import { renderActionResult, renderView } from './render.ts';
import { STS2_TOOL_DECLS } from './tools.ts';

export interface Sts2WorldOptions {
  cfg: Sts2ConfigSection;
  timezone: string;
  dataDir: string;
}

type Conn = 'offline' | 'online' | 'error';

/** 连着这么多动作没被 observe 打断,就当它一直没说话。 */
const SILENT_LIMIT = 2;

/** 这些画面是在做选择,值得讲一句为什么。 */
const CHOICE_SCREENS = new Set([
  'CARD_REWARD', 'REWARD', 'SHOP', 'EVENT', 'REST', 'MAP', 'CHEST',
  'BOSS_RELIC', 'SELECTION', 'CHARACTER_SELECT',
]);

const SCREEN_ZH: Record<string, string> = {
  CARD_REWARD: '选牌', REWARD: '战斗奖励', SHOP: '商店', EVENT: '事件',
  REST: '篝火', MAP: '地图', CHEST: '宝箱', BOSS_RELIC: 'Boss 遗物',
  SELECTION: '选择', CHARACTER_SELECT: '选角色', COMBAT: '战斗',
};

export class Sts2World implements World {
  readonly id = 'sts-2';

  private client: Sts2Client;
  private host: WorldHost | null = null;
  private conn: Conn = 'offline';
  private detail = '';
  private lastView: Sts2View | null = null;
  private lastObserveAt = 0;
  private busy = false;
  /**
   * 连续动作计数。observe 会把它清零——模型每回合开新决策时都会先看局面,
   * 那正是它已经"想过一遍"的时刻;一路 act 不清零就说明它在闷头打。
   */
  private actsSinceRead = 0;

  constructor(private readonly opts: Sts2WorldOptions) {
    this.client = new Sts2Client(baseUrlOf(opts.cfg));
  }

  envPromptVars(): Record<string, string> {
    return { 'sts2.baseUrl': this.client.baseUrl };
  }

  tools(): ToolDef[] {
    return STS2_TOOL_DECLS.map((decl) => ({
      ...decl,
      handler: (args, ctx) => this.call(decl.name, args, ctx),
    }));
  }

  webUi(): WorldWebUiDecl {
    return {
      lamps: [{ label: '游戏', state: this.conn, hint: this.detail || undefined }],
      badges: [
        { label: '画面', value: this.lastView ? this.lastView.screen : '—' },
        { label: '连动', value: String(this.actsSinceRead) },
      ],
      panels: [{ id: 'game', title: '游戏', description: '查看连接状态与最近的局面。' }],
      invoke: (panel, method) => this.invoke(panel, method),
      config: [STS2_CONFIG_GROUP],
      promptDocs: [{
        key: 'worlds.sts-2.envPrompt',
        title: '杀戮尖塔2 · 环境提示词',
        description: '观察与动作回执怎么读。',
        path: fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url)),
        role: 'envPrompt',
      }],
    };
  }

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    this.conn = 'offline';
    this.detail = '';
    this.actsSinceRead = 0;
    await this.probe();
  }

  async stop(): Promise<void> {
    this.host = null;
    this.conn = 'offline';
  }

  onTurnEnded(): void {
    this.lastObserveAt = 0;
  }

  private async probe(): Promise<boolean> {
    try {
      const health = await this.client.health();
      if (!health.service) throw new Error('这个端口上不是 STS2-Agent');
      this.conn = 'online';
      this.detail = `${health.modVersion} · 游戏 ${health.gameVersion}`;
      return true;
    } catch (error) {
      this.conn = 'error';
      this.detail = describe(error);
      return false;
    }
  }

  private async call(name: string, args: Record<string, unknown>, ctx: ToolCallContext): Promise<string | ToolOutcome> {
    void ctx;
    if (name === 'sts2_observe') return this.observe(args);
    if (name === 'sts2_do') return this.doAct(args);
    throw new Error(`未知工具:${name}`);
  }

  private async observe(args: Record<string, unknown>): Promise<string> {
    const detail = args.detail === 'full' ? 'full' : 'decision';
    const now = Date.now();
    if (detail === 'decision' && this.lastView && now - this.lastObserveAt < 2000) {
      return renderView(this.lastView, 'decision', true);
    }
    try {
      const view = await this.client.state();
      this.lastView = view;
      this.lastObserveAt = now;
      this.actsSinceRead = 0;
      this.conn = 'online';
      this.detail = `画面 ${view.screen}`;
      return renderView(view, detail, false);
    } catch (error) {
      this.conn = 'error';
      this.detail = describe(error);
      throw new Error(
        `读不到游戏状态:${describe(error)}。`
        + '确认游戏开着、STS2 AI Agent 悬浮窗是 ready,'
        + `端口填对了(当前 ${this.client.baseUrl})。`,
      );
    }
  }

  private async doAct(args: Record<string, unknown>): Promise<string | ToolOutcome> {
    if (this.busy) throw new Error('上一个动作还没回来,等它结束再发下一个');
    const payload = buildActionPayload(args);
    this.busy = true;
    try {
      const result = await this.client.act(payload);
      if (result.view) {
        this.lastView = result.view;
        this.lastObserveAt = 0;
        this.conn = 'online';
      }
      this.actsSinceRead += 1;
      const nudge = this.nudgeFor(payload, result.ok);
      return renderActionResult(payload, result.ok, result.message, result.view, nudge);
    } catch (error) {
      this.conn = 'error';
      this.detail = describe(error);
      throw new Error(`动作失败:${describe(error)}`);
    } finally {
      this.busy = false;
    }
  }

  /**
   * 要不要催一句,催什么。
   *
   * 选择类的动作必须催(选牌、选路、买东西、事件)——这种决定本来就有理由,
   * 不说是纯损失。连着两个动作没重读过局面也催一句。出牌本身不催,
   * 不然每张牌都催一遍会变成噪音。
   */
  private nudgeFor(payload: Record<string, unknown>, ok: boolean): string | null {
    if (!ok) return null;
    const action = String(payload.action ?? '');
    const wasChoice = payload.option_index != null
      || /choose|select|reward|buy|confirm_shop/.test(action);
    if (wasChoice) {
      return '这是选择。用 pet_say 说一句你为什么选它,一句话,然后再往下。';
    }
    if (this.actsSinceRead >= SILENT_LIMIT) {
      this.actsSinceRead = 0;
      return '你连着走了几步没出声。下次动手前用 pet_say 说一句在想什么,一两句就够。';
    }
    const nextScreen = this.lastView?.screen ?? '';
    if (CHOICE_SCREENS.has(nextScreen)) {
      return `现在是${SCREEN_ZH[nextScreen] ?? nextScreen},先说说你打算怎么选,再动手。`;
    }
    return null;
  }

  private async invoke(panel: string, method: string): Promise<unknown> {
    if (panel !== 'game') throw new Error(`未知面板:${panel}`);
    if (method === 'refresh') {
      const ok = await this.probe();
      return { ok, connection: this.conn, detail: this.detail };
    }
    if (method === 'state') {
      return { view: this.lastView, connection: this.conn, detail: this.detail };
    }
    throw new Error(`未知方法:${method}`);
  }
}

export function baseUrlOf(cfg: Sts2ConfigSection): string {
  const host = String(cfg.host || '127.0.0.1').trim();
  const port = Number(cfg.port) || 8081;
  const withScheme = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  if (/:\d+\/?$/.test(withScheme)) return withScheme.replace(/\/+$/, '');
  return `${withScheme.replace(/\/+$/, '')}:${port}`;
}

export function buildActionPayload(args: Record<string, unknown>): Record<string, unknown> {
  const action = String(args.action ?? '').trim();
  if (!action) throw new Error('要给一个 action,名字从观察结果的「动作」里挑');
  const payload: Record<string, unknown> = { action };
  for (const key of ['card_index', 'target_index', 'option_index', 'x', 'y', 'tool']) {
    const value = args[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'string' && /^-?\d+$/.test(value)) payload[key] = Number(value);
    else payload[key] = value;
  }
  const reason = args.reason;
  if (typeof reason === 'string' && reason.trim()) payload.reason = reason.trim();
  return payload;
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return '等太久没有回应';
    return error.message;
  }
  return String(error);
}
