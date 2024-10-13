# Claude API 和 OpenAI API 代理服务

    在VPS中部署代理服务，避免意外情况......

## 功能

-   支持 Claude API 和 OpenAI API 的代理
-   IP 黑名单
-   请求速率限制
-   日志记录
-   OpenAI realtime Api 支持

## 配置

配置选项可以通过环境变量、命令行参数或默认值设置。优先级顺序为：环境变量 > 命令行参数 > 默认值。

主要配置项包括：

-   `BASE_PATH`: 基础路径，用于存储日志和黑名单文件
-   `PROXY_PORT`: 代理服务器监听的端口，默认：6543
-   `IP_ERROR_THRESHOLD`: IP 错误阈值，默认：10
-   `ERROR_WINDOW`: 错误窗口时间（毫秒），默认：1 天
-   `RATE_LIMIT_REQUESTS`: 速率限制配置-允许的请求数，默认：100
-   `RATE_LIMIT_INTERVAL`: 速率限制配置-时间间隔（毫秒），默认：1 分钟
-   `CLAUDE_API_HOST`: Claude API 的主机地址，默认：api.anthropic.com
-   `OPENAI_API_HOST`: OpenAI API 的主机地址，默认：api.openai.com

## 运行

### 方法 1: 直接运行

1. 克隆项目：`git clone https://github.com/danger-dream/ai-proxy.git`
2. 安装依赖：`cd ai-proxy && npm install`
3. 启动服务器：`npm start`

### 方法 2: 使用 Docker

1. 克隆项目：`git clone https://github.com/danger-dream/ai-proxy.git`
2. 进入项目目录：`cd ai-proxy`
3. 构建 Docker 镜像：`docker build -t ai-proxy .`
4. 运行 Docker 容器：

    ```bash
    docker run -d \
    	-p 6543:6543 \
    	-e BASE_PATH=/app/data \
    	-v /path/to/your/data:/app/data \
    	--name ai-proxy \
    	ai-proxy
    ```

    注意：将 `/path/to/your/data` 替换为您想要存储日志和黑名单文件的实际路径。

5. 如需自定义配置，可以在 `docker run` 命令中添加环境变量，例如：
    ```bash
    docker run -d \
    	-p 8080:8080 \
    	-e BASE_PATH=/app/data \
    	-e PROXY_PORT=8080 \
    	-e RATE_LIMIT_REQUESTS=200 \
    	-v /path/to/your/data:/app/data \
    	--name ai-proxy \
    	ai-proxy
    ```

## 使用方法

需有一台 VPS，一个域名，将"claude.api.your-domain"、"openai.api.your-domain"映射至 VPS，本项目依赖与 hostname 进行请求区分

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

日志记录包括请求详情、响应时间和令牌使用情况。日志文件存储在 `BASE_PATH/logs` 文件夹中。

## 贡献

欢迎提交 Pull Requests 来改进这个项目。对于重大更改，请先开一个 issue 讨论您想要改变的内容。

## 许可证

[MIT](https://choosealicense.com/licenses/mit/)
