# 本地验证记录

## 已完成

- 通过普通 Git 获取仓库；全程未调用 GitHub REST、GraphQL、GitHub MCP 或 `gh`。
- 源码改动已同步到根目录 `index.html` 与匹配的哈希 `assets/`，不是仅修改源码或仅改压缩包。
- `cd source && npm test`：**96 passed，0 failed，0 skipped**。覆盖客户端生命周期、恶意 ID / 增量合并、匿名配置、会话验证凭证、只读 HTTP、UTC 月界、计费口径及缺失值格式。
- `npm run build:theme`：Vite 生产构建通过，发布目录同步成功。
- 本地浏览器：总览、节点详情、实际格式的模拟 batchUpdate 更新、直达详情只请求单节点、同节点重试、隐藏恢复、401/403 可操作提示、后台显示开关、UTC 部分覆盖、上传计费超额、缺失 CPU/内存/磁盘、手机无横向溢出。
- Pixel 深色点阵总览、详情及手机截图已更新。
- 额外生命周期检查：WS 失效回退保留 REST、时限暂停不可通过路由解除、显式恢复加载当前详情、完整快照移除撤销字段、待返回详情请求不会污染总览。
- 浏览器检查使用本地模拟数据和模拟 WebSocket，未请求外站；API 请求仅 GET。

## 可复现命令

```sh
cd source
npm ci --ignore-scripts
npm test
npm run build:theme
npm run demo
```

演示默认 `http://127.0.0.1:4179/`，仅本机访问，数据标为模拟，不是实际服务器。

## 结果附件

- [浏览器回归记录](browser-check.json)
- [生命周期回归记录](lifecycle-check.json)
- [本次构建截图](screenshots/)

## 尚未执行

- 没有在真实 Cloudflare / D1 / 探针站点进行端到端部署验收。
- 仓库发布与实际站点部署分开：本次仅发布主题代码、文档和截图，不修改监控站点、数据库或探针配置。

真实环境仍需确认 Cookie/Turnstile、CSP、探针实际重置设置和历史访问权限。截图和本地测试不能替代这些检查。
