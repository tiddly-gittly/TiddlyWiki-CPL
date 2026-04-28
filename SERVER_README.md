# CPL Server Notes

The canonical server documentation now lives in README.md.

Use README.md for:

- architecture and local development
- unit, API, and E2E test commands
- production server startup
- environment variables and GitHub OAuth setup
- comment moderation and multi-server deployment

Quick reference:

```bash
pnpm server:start   # writable local server
pnpm server:prod    # read-only server mode
pnpm test:api
pnpm test:e2e
```

The browser-facing CPL server API is exposed by the client plugin as `$tw.cpl`, with `$tw.cplServerAPI` preserved as a compatibility alias.

The Node.js server launcher compiles TypeScript plugin sources into runtime plugin JSON files under `cache/runtime-plugins/` before starting TiddlyWiki, so the server remains compatible with TiddlyWiki's native boot loader.
TiddlyWiki-CPL/
├── data/                    # 数据存储目录
│   ├── stats.json          # 下载统计
│   └── ratings.json        # 用户评分
├── plugins/
│   └── CPLServer/          # 服务器插件
│       ├── routes/         # API路由
│       ├── utils/          # 工具函数
│       └── *.tid           # 前端UI组件
├── tests/
│   ├── unit/               # 单元测试
│   ├── api/                # API测试
│   └── e2e/                # E2E测试
└── package.json
```
