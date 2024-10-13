# Claude API 和 OpenAI API 代理服务

## 功能

-   支持 Claude API 和 OpenAI API 的代理
-   IP 黑名单和错误计数
-   请求速率限制
-   OpenAI WebSocket、文件上传和下载处理支持
-   日志记录

## 配置

配置选项在 `config.js` 文件中。您可以根据需要调整以下参数：

-   `PROXY_PORT`: 代理服务器监听的端口
-   `IP_ERROR_THRESHOLD`: IP 错误阈值
-   `ERROR_WINDOW`: 错误窗口时间（毫秒）
-   `RATE_LIMIT`: 速率限制配置
    -   `REQUESTS`: 允许的请求数
    -   `INTERVAL`: 时间间隔（毫秒）
-   `CLAUDE_API_HOST`: Claude API 的主机地址
-   `OPENAI_API_HOST`: OpenAI API 的主机地址

## 运行

1. 克隆项目：`git clone https://github.com/danger-dream/ai-proxy.git`
2. 安装依赖：`cd ai-proxy && npm install`
3. 启动服务器：`npm start`

## 使用方法

1. Claude API 代理：

    - 将请求发送到 `http[s]://claude.api.your-domain.com:PROXY_PORT`
    - 确保包含 `x-api-key` 头部

2. OpenAI API 代理：

    - 将请求发送到 `http[s]://openai.api.your-domain.com:PROXY_PORT`
    - 确保包含 `authorization` 头部

3. 文件上传（仅 OpenAI）：

    - 使用 multipart/form-data 格式
    - 支持多文件上传

4. WebSocket 连接（仅 OpenAI）：
    - 通过 `ws[s]://openai.api.your-domain.com:PROXY_PORT` 建立连接

## 安全性

-   IP 黑名单：多次错误请求的 IP 将被自动加入黑名单
-   速率限制：防止单个 IP 发送过多请求

## 日志

日志记录包括请求详情、响应时间和令牌使用情况。日志文件存储在项目根目录下的 `logs` 文件夹中。

## 贡献

欢迎提交 Pull Requests 来改进这个项目。对于重大更改，请先开一个 issue 讨论您想要改变的内容。

## 许可证

[MIT](https://choosealicense.com/licenses/mit/)
