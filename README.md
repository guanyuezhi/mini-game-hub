# 🎮 轻量游戏合集 (game-hub)

和朋友随时开玩的小游戏合集。纯静态网页、零依赖、零构建，双击即可在浏览器运行。

## 目录结构

```
game-hub/
├── index.html              # 游戏大厅（卡片列表 + 每游戏最佳纪录）
├── save.js                 # 公共存档模块（版本化 localStorage 封装）
├── games/
│   ├── water-sort.html     # 分离流沙（瓶子倒水）· 50 关
│   └── sudoku.html         # 数独 · 10 关
├── tools/
│   ├── gen-water-sort-levels.js   # 分离流沙关卡离线生成器（50→500 关扩展入口）
│   └── verify-water-sort.js       # 分离流沙关卡全量校验
└── README.md
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

## 新增游戏

1. 在 `games/` 下新建 `xxx.html`，顶部引入 `<script src="../save.js"></script>`
2. 存档对象顶层提供 `best`（最佳表现，数值越小越好）和 `completed`（通关数）
3. 在 `index.html` 的 `GAMES` 数组中登记卡片信息（id / 名称 / 图标 / 描述 / 格式化函数）

## 部署到 GitHub Pages

1. 建远程仓库，把整个 game-hub 目录推送上去
2. 仓库 Settings → Pages → Source 选分支根目录
3. 访问 `https://<用户名>.github.io/<仓库名>/`
