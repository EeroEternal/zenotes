# Agent 部署与推送指南

在多账号开发或使用 AI Agent 进行自动部署时，如果遇到 Git 推送失败，请按照以下步骤检查并切换 GitHub 账号。

## 1. 检查当前 GitHub 账号状态

使用 GitHub CLI (`gh`) 确认当前登录的活跃账号是否为 `lipish`：

```bash
gh auth status
```

如果输出中显示 `Active account: true` 且账号为 `lipish`，则可以直接进行推送。

## 2. 切换或登录 `lipish` 账号

如果当前活跃账号不是 `lipish`，请执行以下命令切换：

```bash
gh auth switch --hostname github.com --user lipish
```

如果本地尚未登录 `lipish` 账号，请运行：

```bash
gh auth login
```

在登录引导中：
1. 选择 **GitHub.com**。
2. 协议选择 **HTTPS**（推荐，可避免 SSH 22 端口被防火墙拦截的问题）。
3. 按照提示完成浏览器授权或输入 Token 登录。

## 3. 更新远程仓库地址并推送

确保项目的 Git 远程地址已更新为 HTTPS 的新仓库名称 `zenotes`：

```bash
git remote set-url origin https://github.com/lipish/zenotes.git
git push origin main
```
