# 🎮 小游戏大厅 (mini-game-hub)

和朋友随时开玩的小游戏大厅。纯静态网页、零依赖、零构建，双击即可在浏览器运行。

## 游戏清单

| 游戏 | 关卡 | 最佳纪录 | 说明 |
|------|------|----------|------|
| 🧪 瓶子倒水 | 50 | — | 把相同颜色的水倒回同一瓶 |
| 🧩 数独 | 10 | 最快用时 | 填入 1-9，每行每列每宫不重复 |
| 🎮 2048 | 里程碑 10 级 | 最高分 | 滑动数字方块，两两合并成更大的数 |
| 💣 扫雷 | 30 | 最快用时 | 翻开方块，避开地雷，用数字推理 |
| 💡 熄灯 | 10 | 相对最优 | 点击方格翻转十字灯，把所有灯熄灭 |
| 🔢 15 拼图 | 10 | 相对最优 | 滑动方块，把数字按顺序排好 |
| 🎯 猜数字 | 10 | 最少猜次 | 根据黑白反馈破译隐藏的颜色密码 |
| 🖼️ 数织 | 12 | — | 按行列数字提示，推理涂出隐藏图案 |
| 🔧 水管连接 | 12 | — | 旋转管道，让所有水路接通成一个网络 |
| 🚗 华容道·塞车 | 12 | 相对最优 | 滑动车辆腾出通道，让红色小车驶出 |

> "相对最优" = 实际步数 − 最优步数（0 或更小即达成最优）。

## 目录结构

```
mini-game-hub/
├── index.html              # 游戏大厅（卡片列表 + 每游戏最佳纪录）
├── save.js                 # 公共存档模块（版本化 localStorage 封装）
├── games/                  # 每个游戏一个零依赖单文件 HTML
│   ├── water-sort.html     # 瓶子倒水 · 50 关
│   ├── sudoku.html         # 数独 · 10 关
│   ├── 2048.html           # 2048 · 里程碑 10 级
│   ├── minesweeper.html    # 扫雷 · 30 关
│   ├── lights-out.html     # 熄灯 · 10 关
│   ├── puzzle-15.html      # 15 拼图 · 10 关
│   ├── mastermind.html     # 猜数字 · 10 关
│   ├── nonogram.html       # 数织 · 12 关
│   ├── pipes.html          # 水管连接 · 12 关
│   └── rush-hour.html      # 华容道·塞车 · 12 关
└── tools/
    ├── _dom_stub.js              # verify 共享 DOM/Canvas 桩
    ├── gen-water-sort-levels.js  # 瓶子倒水关卡离线生成器
    ├── gen-lights-out.js         # 熄灯生成器（GF(2) 求最优）
    ├── gen-puzzle15.js           # 15 拼图生成器（A* 求最优）
    ├── gen-mastermind.js         # 猜数字生成器（贪心 minimax 验证）
    ├── gen-nonogram.js           # 数织生成器（回溯唯一解验证）
    ├── gen-pipes.js              # 水管连接生成器（生成树构造可解）
    ├── gen-rush-hour.js          # 华容道生成器（后向游走 + BFS）
    ├── verify-*.js               # 各游戏关卡全量校验（读 HTML 抠内联脚本跑原逻辑）
    ├── solve-water-sort.js       # 求解工具：输出指定关卡解法步骤
    └── _levels_out.js            # 生成器输出（人工粘贴进对应 HTML）
```

## 生成流水线

每游戏关卡离线生成 → 验证 → 固化：

```
node tools/gen-<game>.js      # 生成 tools/_levels_out.js（const LEVELS = [...]）
# 把 LEVELS 粘贴进 games/<game>.html 的 const LEVELS = [...]
node tools/verify-<game>.js   # 从 HTML 抠内联脚本跑游戏原逻辑，逐关校验可解/最优/结构
```

## 本地运行

直接用浏览器打开 `index.html` 即可。或起一个本地静态服务器：

```
npx serve .
```

## 存档

- 全部保存在浏览器 localStorage，key 格式 `game-hub:<游戏id>:v1`
- 数据只在本地，不出浏览器
- 换浏览器 / 清浏览器数据会丢失（后续如需跨设备可接账号体系，暂不做）

## 版本号与缓存

- 版本格式：`vYYYY.MM.DD.N`（日期 + 同日序号），如 `v2026.08.10.1`
- **发版时只改 `index.html` 顶部的 `var VERSION`**（写日期+序号，不带 `v` 前缀），页脚展示与游戏链接 `?v=` 自动跟随，避免版本号多处方漂移
- 同一天多次发版：递增末位数字（`.1` → `.2` → …）；跨天发版：日期更新、序号重置为 `1`
- **缓存失效**：大厅卡片链接会带上 `?v=<版本号>`。版本号一变，游戏 URL 全部变化，浏览器必然重新拉取，朋友拿到的就是最新版
- **强制刷新按钮**：页脚「🔄 强制刷新」会清掉 Cache API / service worker 缓存，并加时间戳参数强制重新拉取最新 `index.html`。朋友反馈"打开还是旧版"时，让他点一下即可

## 新增游戏

1. 在 `games/` 下新建 `xxx.html`，顶部引入 `<script src="../save.js"></script>`
2. 存档对象顶层提供 `completed`（通关数）；需要在大厅展示最佳纪录的游戏再加 `best`（数值越小越好）
3. 在 `index.html` 的 `GAMES` 数组中登记卡片信息（id / 名称 / 图标 / 描述 / 格式化函数）
4. 若关卡离线生成：写 `tools/gen-xxx.js` 生成器 + `tools/verify-xxx.js` 校验（用 `_dom_stub.js` 抠游戏内联脚本跑原逻辑）
5. 游戏脚本保持单一内联 `<script>` 块，末尾 `window.__game = {...}` 导出纯函数与 `LEVELS`（供 verify 复用）

## 部署到 GitHub Pages

1. 建远程仓库，把整个 mini-game-hub 目录推送上去
2. 仓库 Settings → Pages → Source 选分支根目录
3. 访问 `https://<用户名>.github.io/<仓库名>/`
