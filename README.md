# API 代理服务器

这是一个用于代理 Claude API 和 OpenAI API 请求的服务器。

## 功能

- 支持 Claude API 和 OpenAI API 的代理
- IP 黑名单和错误计数
- 请求速率限制
- WebSocket 支持
- 文件上传和下载处理

## 配置

配置选项在 `config.js` 文件中。您可以根据需要调整以下参数：

- `PROXY_PORT`: 代理服务器监听的端口
- `IP_ERROR_THRESHOLD`: IP 错误阈值
- `ERROR_WINDOW`: 错误窗口时间
- `RATE_LIMIT`: 速率限制配置

## 运行

1. 安装依赖：`npm install`
2. 启动服务器：`node server.js`

## 测试

运行测试：`npm test`

## 注意事项

- 确保正确设置环境变量和 API 密钥
- 定期检查和更新 IP 黑名单
- 监控服务器日志以检测异常行为
