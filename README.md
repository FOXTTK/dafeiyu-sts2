# 大肥鱼 · 杀戮尖塔2 AI 陪玩

让一只圆滚滚的蓝色鲸鱼娘（DeepSeek 拟人「大肥鱼」）自己玩《杀戮尖塔2》，边打边用头顶气泡嘀咕思路。

她住在一只叫 **Coopanion** 的桌面宠物壳里，靠一个叫 **cortico-world-sts2** 的插件观察牌局、下决定、出牌，全程自己说、自己玩，不需要人插手。

---

## 这是什么 / 不是什么

**是**：
- 一个「AI 自己打牌」的配置包：桌面宠物 + 打牌插件 + 角色人设 + 游戏 mod + 模型接入
- 她会在出牌前自言自语思路（「这只先点掉」「先叠个甲」），像真人边打边嘀咕

**不是**：
- 不含 Coopanion 本体（那是第三方 Electron 程序，请到官方渠道下载）
- 不含可用的 API key（模型 key 需要你自己填）

---

## 你需要准备（3 样）

| 序号 | 东西 | 说明 |
|---|---|---|
| 1 | **Coopanion** 桌面宠物（便携版） | 下载地址见下文；建议 `0.2.x` |
| 2 | **《杀戮尖塔2》** | Steam 正版即可，含本仓库 `game-mod/` 里的 STS2-Agent mod |
| 3 | **DeepSeek 官方 API key** | 到 [platform.deepseek.com](https://platform.deepseek.com) 申请，模型用 `deepseek-v4-pro` |

---

## 安装步骤

### 第 1 步：装 Coopanion

1. 下载 Coopanion 便携版并解压到一个目录，例如 `D:\Coopanion`。
   - 项目/下载地址见官方渠道（GitHub `Pal-AI-Lab/Coopanion`）。
2. 启动一次让它在 `data\` 下生成默认目录结构，然后**完全退出**。

### 第 2 步：装打牌插件

把本仓库的 `cortico-world-sts2/` 整个目录拷到：

```
D:\Coopanion\data\extensions\node_modules\cortico-world-sts2\
```

然后在 `D:\Coopanion\data\extensions\package.json` 的 `dependencies` 里加一行：

```json
"cortico-world-sts2": "file:./node_modules/cortico-world-sts2"
```

（如果 `extensions/package.json` 不存在，就新建一个，内容是：

```json
{
  "name": "cortico-extensions",
  "private": true,
  "dependencies": {
    "cortico-world-sts2": "file:./node_modules/cortico-world-sts2"
  }
}
```

）

### 第 3 步：装角色人设

把本仓库的 `persona/CONSTITUTION.md` 和 `persona/PARTNER.md` 放进桌宠的工作区目录：

```
D:\Coopanion\data\home\companion\workspace\
```

`CONSTITUTION.md` 是她的「底层人格」（损友、白饭、被抓包嘴硬那套），`PARTNER.md` 是搭档画像模板，把里面的「搭档」改成你自己的称呼。

### 第 4 步：配桌宠

把本仓库 `config/companion-config.example.json` 的内容合并进：

```
D:\Coopanion\data\home\companion\config.json
```

要点：
- `worlds.sts-2.enabled = true`（打开打牌世界）
- `tick.intervalMinutes = 2`（每 2 分钟自动唤醒她一次，这是她「自己玩」的关键）

### 第 5 步：配模型（官方 DeepSeek 直连）

编辑 `D:\Coopanion\data\home\providers\deepseek\config.json`（没有这个目录就按 Coopanion 的 provider 管理界面新建一个 deepseek provider）：

```json
{
  "kind": "coo",
  "baseUrl": "https://api.deepseek.com",
  "secret": "你的API key",
  "spec": {
    "model": "deepseek-v4-pro",
    "thinking": true,
    "reasoningEffort": "high",
    "maxTokens": 8192
  },
  "options": {
    "protocol": "chat"
  }
}
```

- `baseUrl` 用官方 `https://api.deepseek.com`（OpenAI 格式，走 `/chat/completions`）
- `secret` 填你自己的 DeepSeek key（**不要提交到公开仓库**）
- `model` 是 `deepseek-v4-pro`（官方模型名，详见官方定价页）

### 第 6 步：装游戏 mod

把本仓库 `game-mod/` 里的三个文件拷到游戏 mods 目录：

```
D:\steam\steamapps\common\Slay the Spire 2\mods\
├── STS2AIAgent.dll
├── STS2AIAgent.pck
└── mod_id.json
```

### 第 7 步：启动并开玩

1. 启动 `Coopanion.exe`（Windows 上注意：如果环境里有 `ELECTRON_RUN_AS_NODE`，先清掉它再启动，否则 Electron 秒退）。
2. 启动《杀戮尖塔2》，进游戏后按 mod 的悬浮窗提示打开它的 HTTP/MCP 接口（默认端口 `8081`）。
3. 回桌宠界面，确认「杀戮尖塔2」世界在线。
4. 跟她说一句「玩一局杀戮尖塔2」，她会自己选角色、自己出牌、边打边嘀咕。

---

## 目录结构

```
dafeiyu-sts2/
├── README.md                  # 本文
├── cortico-world-sts2/        # 打牌插件（World API 6）
│   ├── package.json
│   ├── describe.json
│   └── src/*.ts
├── persona/                   # 角色人设
│   ├── CONSTITUTION.md        # 底层人格
│   └── PARTNER.md             # 搭档画像（模板）
├── game-mod/                  # 游戏内 STS2-Agent mod
│   ├── STS2AIAgent.dll
│   ├── STS2AIAgent.pck
│   └── mod_id.json
├── config/
│   └── companion-config.example.json
├── .gitignore
└── LICENSE
```

---

## 常见问题

**她只会在第一轮说话，之后不吭声？**
检查 `config.json` 里的 `tick.intervalMinutes` 是不是被设成了 `null`。她「自己玩」靠这个心跳定时唤醒，改成 `2` 之类的正数。

**她连不上游戏（fetch failed）？**
确认：游戏开着、mod 悬浮窗显示 ready、桌宠插件端口填对（默认 `8081`，以悬浮窗上写的为准）。

**模型报 429 / 限流？**
换模型或换 key。官方直连的 `deepseek-v4-pro` 不会被本地中转站限流。

**想换角色 / 换性格？**
改 `persona/CONSTITUTION.md`，保存后下一次 session 生效。

---

## 许可

- 插件 `cortico-world-sts2`：MIT（见其 `package.json`）
- 大肥鱼形象：社区二创「DeepSeek 大肥鱼」形象，CC BY-NC-SA 4.0（非官方形象，不可商用）
- STS2-Agent mod：作者 CharTyr，详见 `game-mod/mod_id.json`
