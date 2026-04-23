# CPL Server - TiddlyWiki Community Plugin Library Server Mode

CPL Server 是 TiddlyWiki 社区插件库的服务器模式扩展，提供下载统计、用户评分和Changelog展示功能。

## 功能特性

### 1. 下载统计
- 自动记录每个插件的下载次数
- IP限流：同一IP在1小时内只计一次下载
- 实时统计信息API

### 2. 用户评分
- 1-5星评分系统
- IP限流：同一IP对同一插件只能评分一次
- 自动计算平均评分

### 3. Changelog展示
- 自动提取插件的changelog内容
- 在插件详情页展示

### 4. 数据持久化
- 数据存储在 `data/` 目录
- `stats.json` - 下载统计数据
- `ratings.json` - 用户评分数据

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式启动（可写）

```bash
npm run server:dev
```

### 生产模式启动（只读）

```bash
npm run server:prod
```

服务器将在 http://localhost:8080 启动

## API文档

### 记录下载

```http
POST /cpl/api/download/:pluginTitle
```

**响应示例：**
```json
{
  "success": true,
  "message": "Download recorded",
  "pluginTitle": "$:/plugins/author/plugin-name",
  "downloadCount": 123
}
```

### 获取统计信息

```http
GET /cpl/api/stats/:pluginTitle
```

**响应示例：**
```json
{
  "pluginTitle": "$:/plugins/author/plugin-name",
  "downloadCount": 123,
  "downloadLastUpdated": "2024-01-15T10:30:00Z",
  "averageRating": 4.5,
  "totalRatings": 10
}
```

### 获取所有统计

```http
GET /cpl/api/stats
```

### 提交评分

```http
POST /cpl/api/rate/:pluginTitle
Content-Type: application/json

{
  "rating": 5
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "Rating submitted successfully",
  "pluginTitle": "$:/plugins/author/plugin-name",
  "averageRating": 4.6,
  "totalRatings": 11
}
```

### 获取Changelog

```http
GET /cpl/api/changelog/:pluginTitle
```

**响应示例：**
```json
{
  "pluginTitle": "$:/plugins/author/plugin-name",
  "hasChangelog": true,
  "changelog": "v1.0.0 - Initial release...",
  "tiddlerTitle": "$:/plugins/author/plugin-name/changelog",
  "modified": "2024-01-15T10:30:00Z"
}
```

## 客户端API

浏览器端可通过 `window.CPL_API` 访问API：

```javascript
// 获取插件统计
const stats = await CPL_API.getStats('$:/plugins/author/plugin-name');
console.log(stats.downloadCount, stats.averageRating);

// 记录下载
await CPL_API.recordDownload('$:/plugins/author/plugin-name');

// 提交评分
await CPL_API.submitRating('$:/plugins/author/plugin-name', 5);

// 获取Changelog
const changelog = await CPL_API.getChangelog('$:/plugins/author/plugin-name');
```

## 测试

### 运行单元测试

```bash
npm run test:unit
```

### 运行API测试

```bash
npm run test:api
```

### 运行E2E测试

```bash
# 确保服务器已在8080端口运行
npm run test:e2e
```

### 运行所有测试

```bash
npm test
```

## 部署

### 使用PM2部署

```bash
npm install -g pm2
pm2 start npm --name "cpl-server" -- run server:prod
```

### 使用Docker

创建 `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["npm", "run", "server:prod"]
```

构建并运行：

```bash
docker build -t cpl-server .
docker run -d -p 8080:8080 -v $(pwd)/data:/app/data cpl-server
```

### 使用Nginx反向代理

```nginx
server {
    listen 80;
    server_name cpl.example.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**注意：** 使用反向代理时，必须设置 `X-Forwarded-For` 或 `X-Real-IP` 头，以便正确获取客户端IP进行限流。

## 数据备份

定期备份 `data/` 目录：

```bash
# 备份脚本
#!/bin/bash
tar -czf "cpl-data-$(date +%Y%m%d).tar.gz" data/
```

## 安全配置

### 只读模式

生产环境建议使用只读模式，防止未授权的wiki修改：

```bash
tiddlywiki . --listen port=8080 writers=(anon)
```

### IP限流配置

当前配置：
- 下载统计：同一IP每小时只计一次
- 评分：同一IP对同一插件只能评分一次

## 项目结构

```
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

## 贡献

欢迎提交Issue和Pull Request！

## 许可证

MIT
