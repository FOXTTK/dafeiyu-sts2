/**
 * 把 STS2-Agent 的 agent_view 摊平成工具返回的文本。
 *
 * agent_view 是 mod 专门给 AI 准备的紧凑视图:
 *   hand[]    { i, card_id, line, energy_cost, playable, target, targets }
 *   enemies[] { i, name, hp:"45/45", block, intents[{ intent_type, label, damage, hits }] }
 *   player    { hp:"80/80", block, energy }
 *   options[] { i, line }   地图/奖励/事件/商店/选牌都用它
 *
 * 这里除了排版,还负责一件事:在动作回执里提醒模型说句话。实测光靠环境提示词
 * 不够——模型会把"说完再打"当成建议,连着出三张牌一句不说。回执是每步都会读的
 * 东西,把提醒放在这里才压得住。
 */
import type { Sts2View } from './protocol.ts';

const SCREEN_LABEL: Record<string, string> = {
  MAIN_MENU: '主菜单',
  CHARACTER_SELECT: '选角色',
  MAP: '地图',
  COMBAT: '战斗',
  REWARD: '战斗奖励',
  CARD_REWARD: '选牌',
  SHOP: '商店',
  REST: '篝火',
  EVENT: '事件',
  CHEST: '宝箱',
  GAME_OVER: '结算',
  BOSS_RELIC: 'Boss 遗物',
  SELECTION: '选择',
  MODAL: '弹窗',
  PAUSE_MENU: '暂停菜单',
};

export function screenName(screen: string): string {
  return SCREEN_LABEL[screen] ?? screen;
}

/** 一次观察的正文。 */
export function renderView(view: Sts2View, detail: 'decision' | 'full', fromCache: boolean): string {
  const out: string[] = [];
  const label = screenName(view.screen);
  out.push(fromCache ? `【${label}】(刚读过,没变)` : `【${label}】`);

  if (view.paused) out.push('(游戏暂停中,先让人点继续)');

  const run = view.run;
  if (run) {
    const bits: string[] = [];
    if (run.character) bits.push(run.character);
    if (run.act != null) bits.push(`第${run.act}层`);
    if (run.floor != null) bits.push(`#${run.floor}`);
    if (run.hp) bits.push(`血 ${run.hp}`);
    if (run.gold != null && run.gold !== 0) bits.push(`金 ${run.gold}`);
    if (bits.length) out.push(bits.join(' · '));
  }

  const c = view.combat;
  if (c) {
    const res: string[] = [];
    if (c.hp) res.push(`血 ${c.hp}`);
    if (c.energy != null) res.push(`能量 ${c.energy}`);
    if (c.block != null && c.block > 0) res.push(`格挡 ${c.block}`);
    if (res.length) out.push(res.join(' · '));

    if (c.enemies.length) {
      out.push('');
      out.push('敌人:');
      for (const e of c.enemies) {
        const parts = [`[${e.i}] ${e.name}`, e.hp ?? '', e.block ? `甲${e.block}` : ''];
        if (e.intents.length) {
          parts.push(`意图:${e.intents.map((it) => (it.total != null ? `${it.type} ${it.total}` : (it.label || it.type))).join('+')}`);
        }
        out.push(`  ${parts.filter(Boolean).join('  ')}`);
      }
    }
    if (c.hand.length) {
      out.push('');
      out.push('手牌:');
      for (const card of c.hand) {
        const flags: string[] = [];
        if (!card.playable) flags.push(`打不出${card.reason ? `:${card.reason}` : ''}`);
        else if (card.target) flags.push('需选目标');
        out.push(`  [${card.i}] ${card.line}${flags.length ? `  (${flags.join(' ')})` : ''}`);
      }
    }
    if (detail === 'full') {
      if (c.draw.length) out.push(`抽牌堆: ${c.draw.map((d) => d.line).join(' / ')}`);
      if (c.discard.length) out.push(`弃牌堆: ${c.discard.map((d) => d.line).join(' / ')}`);
      if (c.exhaust.length) out.push(`消耗堆: ${c.exhaust.map((d) => d.line).join(' / ')}`);
    }
    if (!c.canAct && c.blockReason) out.push(`(现在动不了:${c.blockReason})`);
  }

  if (view.options.length) {
    out.push('');
    out.push('选项:');
    for (const o of view.options) out.push(`  [${o.i}] ${o.line}`);
  }

  if (view.actions.length) {
    out.push('');
    out.push(`动作:${view.actions.join(' / ')}`);
  }
  return out.join('\n');
}

/**
 * 一次动作的回执。
 *
 * `nudge` 决定末尾要不要催一句"下个动作之前先说句话"。什么时候催由 world.ts 判断
 * (出了牌却一直没吭声、或者正站在选牌/奖励/商店这类该讲想法的地方)。
 */
export function renderActionResult(
  payload: Record<string, unknown>,
  ok: boolean,
  message: string,
  view: Sts2View | null,
  nudge: string | null,
): string {
  const action = describeAction(payload);
  const out: string[] = [ok ? `做了:${action}` : `被拒:${action}`];
  if (message && message !== 'ok' && message !== 'Action completed.') out.push(`说明:${message}`);
  if (view) {
    out.push('');
    out.push(renderView(view, 'decision', false));
  } else {
    out.push('');
    out.push('(没带回新状态,需要时用 sts2_observe 读一次)');
  }
  if (nudge) {
    out.push('');
    out.push(`→ ${nudge}`);
  }
  return out.join('\n');
}

function describeAction(payload: Record<string, unknown>): string {
  const bits = [String(payload.action ?? '?')];
  if (payload.card_index != null) bits.push(`牌#${payload.card_index}`);
  if (payload.target_index != null) bits.push(`目标#${payload.target_index}`);
  if (payload.option_index != null) bits.push(`选项#${payload.option_index}`);
  if (payload.x != null && payload.y != null) bits.push(`(${payload.x},${payload.y})`);
  if (payload.tool) bits.push(String(payload.tool));
  const reason = payload.reason == null ? '' : String(payload.reason);
  const head = bits.join(' ');
  return reason ? `${head} — ${reason}` : head;
}
