/** World 定义:把 id、默认配置、工厂与自描述拼起来。 */
import { describeTools, type WorldDefinition, type WorldDescribe } from 'cortico/world.ts';
import { STS2_CONFIG_GROUP, STS2_DEFAULTS, type Sts2ConfigSection } from './config.ts';
import { STS2_TOOL_DECLS } from './tools.ts';
import { Sts2World } from './world.ts';

const DESCRIBE: WorldDescribe = {
  tools: describeTools(STS2_TOOL_DECLS, {
    sts2_observe: {
      zh: '读取当前局面与可选动作。',
      en: 'Reads the current board and the actions available now.',
    },
    sts2_do: {
      zh: '执行一个游戏动作并等它结算。',
      en: 'Performs one game action and waits for it to settle.',
    },
  }),
  events: [],
};

export const STS2: WorldDefinition<Sts2ConfigSection> = {
  id: 'sts-2',
  label: '杀戮尖塔2',
  defaults: () => ({ ...STS2_DEFAULTS }),
  create: (ctx) => new Sts2World({
    cfg: ctx.cfg as Sts2ConfigSection,
    timezone: ctx.timezone,
    dataDir: ctx.dataDir,
  }),
  describe: DESCRIBE,
};

export { STS2_CONFIG_GROUP };
