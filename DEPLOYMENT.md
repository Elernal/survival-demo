# 部署交接

## 当前状态

- GitHub 目标仓库：Elernal/survival-demo，main，Public，当前为空。
- Contents API 实际写入：403 Resource not accessible by integration。
- Git HTTPS 实际推送：403 Permission denied。
- GitHub Pages API：404；公开地址 https://elernal.github.io/survival-demo/ ：404。
- 以上是当前集成的实际写入限制，仓库元数据中的 push/admin=true 不代表调用可成功。

## 最短上传方法

1. 解压完整项目包。
2. 在仓库网页点击 Add file → Upload files，将 index.html、assets 文件夹、README.md 等拖入；确认 assets 下有三个 JS 文件和一个 CSS 文件。
3. Commit changes 到 main。
4. Settings → Pages → Source: Deploy from a branch；Branch: main；Folder: /(root)；Save。
5. 等待 Pages 构建完成，再打开 https://elernal.github.io/survival-demo/ ，确认开始按钮显示“开始探索”。

不要只上传模块版 index.html；它需要 assets 文件夹。也可将单文件离线版重命名为 index.html 后单独上传。

## 有仓库写权限的本机命令

```sh
git clone https://github.com/Elernal/survival-demo.git
# 将项目包内容复制到克隆目录（不复制任何 .git）
cd survival-demo
git add .
git commit -m "Fix and deploy playable survival demo"
git push origin main
```

## 测试范围

真实 Chromium 自动化：1280×720 桌面、844×390 手机横屏、390×844 手机竖屏、1024×768 平板。
桌面完成开始、多次暂停继续、搜刮、射击、换弹、获取医疗箱、返回入口撤离、重试及失焦暂停。
触屏验证移动、双指移动+射击、touchCancel 后释放；页面未捕获 JS 异常。
使用虚拟时钟加速模拟，不修改游戏内部状态。
未完成真实 iOS Safari、Android 或实机性能验收；未验证公开 Pages 上的游戏流程，因为上传受限。
