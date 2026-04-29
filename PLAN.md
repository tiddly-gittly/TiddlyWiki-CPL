# TiddlyWiki-CPL 服务器模式改造计划

## 现状分析

### 当前架构
- **静态构建模式**: 使用GitHub Actions构建静态HTML和JSON文件
- **部署方式**: GitHub Pages + Netlify
- **插件存储**: `dist/library/plugins/*.json` 文件
- **无服务器端逻辑**: 纯客户端通过iframe/postMessage通信

### 目标架构
- **服务器模式**: Node.js + TiddlyWiki内置服务器
- **动态API**: 自定义server routes提供下载统计、评分功能
- **数据持久化**: JSON文件存储统计数据
- **IP限流**: 防止刷下载量和评分

---

## 技术方案

### 1. TiddlyWiki Server Route 实现模式

根据TiddlyWiki官方文档和实践，自定义路由通过创建`module-type: route`的tiddler实现：

```javascript
exports.method = "GET"; // HTTP方法
exports.path = /^\/api\/stats\/([^\/]+)$/; // URL路径正则
exports.handler = function(request, response, state) {
  // request: HTTP请求对象
  // response: HTTP响应对象
  // state: TiddlyWiki状态对象
};
```

### 2. 数据存储方案

**方案A: JSON文件存储** (推荐)
- 优点: 简单、无需额外依赖、与现有架构一致
- 位置: `data/stats.json`, `data/ratings.json`
- 结构: 按插件名索引，包含下载量、评分列表

**方案B: SQLite存储**
- 优点: 更好的查询性能和数据完整性
- 缺点: 增加依赖复杂度

### 3. API设计

#### 下载统计API
```
POST /cpl/api/download/:pluginTitle
- 记录一次下载
- IP限流：同一IP 1小时内只计一次
- 返回: { success: true, downloadCount: number }

GET /cpl/api/stats/:pluginTitle
- 获取插件统计信息
- 返回: { downloadCount: number, rating: number, ratingCount: number }
```

#### 评分API
```
POST /cpl/api/rate/:pluginTitle
Body: { rating: number(1-5), comment?: string }
- 提交评分
- IP限流：同一IP对同一插件只能评分一次
- 返回: { success: true, averageRating: number }
```

#### Changelog API
```
GET /cpl/api/changelog/:pluginTitle
- 返回插件的changelog内容
```

### 4. 前端UI修改

1. **插件详情页**展示:
   - 下载量 (从服务器API获取)
   - 平均评分和评价数
   - Changelog内容

2. **安装按钮**:
   - 点击时触发下载统计API

3. **评分组件**:
   - 星级评分输入
   - 评价列表展示

---

## 项目结构

```
TiddlyWiki-CPL/
├── package.json                    # 添加服务器启动脚本
├── tiddlywiki.info                 # 添加服务器插件
├── data/                           # 数据存储目录
│   ├── .gitignore                  # 忽略数据文件但保留目录
│   └── README.md                   # 数据目录说明
├── plugins/
│   └── CPLServer/                  # 服务器端插件
│       ├── plugin.info
│       ├── routes/
│       │   ├── download.js         # POST /cpl/api/download/*
│       │   ├── stats.js            # GET /cpl/api/stats/*
│       │   ├── rate.js             # POST /cpl/api/rate/*
│       │   └── changelog.js        # GET /cpl/api/changelog/*
│       └── utils/
│           ├── data-store.js       # 数据存储工具
│           └── rate-limiter.js     # IP限流工具
├── tiddlers/
│   └── CPLPlugin/
│       └── ...                     # 修改现有UI模板
├── tests/
│   ├── unit/                       # 单元测试
│   ├── api/                        # API测试
│   └── e2e/                        # Playwright E2E测试
└── scripts/
    └── server.js                   # 服务器启动脚本
```

---

## 实施步骤

### Phase 1: 基础服务器插件 (Day 1-2)
1. 创建 `plugins/CPLServer` 插件结构
2. 实现数据存储工具 (JSON文件读写)
3. 实现IP限流工具

### Phase 2: API路由实现 (Day 3-4)
1. 实现下载统计路由
2. 实现评分路由
3. 实现Changelog路由
4. 实现查询统计路由

### Phase 3: 前端UI修改 (Day 5-6)
1. 修改插件详情模板展示统计信息
2. 添加下载计数触发
3. 添加评分组件

### Phase 4: 测试 (Day 7-8)
1. 单元测试
2. API集成测试
3. Playwright E2E测试

### Phase 5: 文档和部署 (Day 9-10)
1. 编写README文档
2. 创建启动脚本
3. 编写部署指南

---

## 技术细节

### IP限流实现

```javascript
// 简单的内存限流器
const rateLimiter = {
  // pluginTitle -> { ip -> { count, lastReset } }
  downloads: new Map(),
  // pluginTitle -> { ip -> boolean }
  ratings: new Map(),
  
  canDownload(pluginTitle, ip) {
    // 1小时内只允许一次下载计数
  },
  
  canRate(pluginTitle, ip) {
    // 只允许评分一次
  }
};
```

### 数据存储结构

```javascript
// data/stats.json
{
  "$:/plugins/author/plugin-name": {
    "downloadCount": 1234,
    "lastUpdated": "2024-01-15T10:30:00Z",
    "downloadsByIp": {
      "192.168.1.1": "2024-01-15T10:00:00Z"
    }
  }
}

// data/ratings.json
{
  "$:/plugins/author/plugin-name": {
    "ratings": [
      { "ip": "192.168.1.1", "rating": 5, "timestamp": "2024-01-15T10:00:00Z" }
    ],
    "averageRating": 4.5,
    "totalRatings": 10
  }
}
```

### 服务器启动配置

```bash
# 生产环境（只读模式）
tiddlywiki . --listen port=8080 writers=(anon)

# 开发环境（可写）
tiddlywiki . --listen port=8080
```

---

## 风险评估

### 技术风险
1. **IP伪造**: 需要信任X-Forwarded-For头，部署时需要配置反向代理
2. **数据丢失**: JSON文件存储，需要定期备份
3. **性能问题**: 大量并发时内存限流器可能成为瓶颈

### 缓解措施
1. 使用反向代理（Nginx/Cloudflare）获取真实IP
2. 定期备份data目录
3. 监控内存使用，必要时实现持久化限流存储

---

## 下一步行动

1. 创建项目结构和基础文件
2. 实现数据存储和限流工具
3. 实现第一个API路由（下载统计）
4. 编写测试用例

