/** sts-2 World 的配置段:连哪个端口、要不要跟 World 一起拉起游戏。 */
import type { ConfigGroup } from 'cortico/core/config-schema.ts';

export interface Sts2ConfigSection {
  /** 连接状态;由 Core 依 bot 声明维护。 */
  enabled: boolean;
  /** mod 的 API 地址或主机名。 */
  host: string;
  /** mod 的 API 端口。默认 8081——游戏内悬浮窗上写的那个。 */
  port: number;
}

export const STS2_DEFAULTS: Sts2ConfigSection = {
  enabled: false,
  host: '127.0.0.1',
  port: 8081,
};

export const STS2_CONFIG_GROUP: ConfigGroup = {
  id: 'worlds.sts-2',
  owner: 'world:sts-2',
  schema: {
    type: 'object',
    properties: {
      host: {
        type: 'string',
        default: STS2_DEFAULTS.host,
        'x-hot': true,
        title: '游戏地址',
        description: 'sts2-ai-agent mod 的 API 主机。一般就是 127.0.0.1。',
      },
      port: {
        type: 'integer',
        default: STS2_DEFAULTS.port,
        minimum: 1024,
        maximum: 65535,
        'x-hot': true,
        title: '端口',
        description: '游戏内 STS2 AI Agent 悬浮窗顶部显示的端口。不是 8080 就是 8081,'
          + '以悬浮窗上写的为准。',
      },
    },
  },
};
