# 部署交接

- GitHub：Elernal/survival-demo，Public，main。
- 静态入口：根目录 index.html；资源目录 assets/；不需要服务端或 npm 构建。
- GitHub Pages 已启用：main → /(root)。地址 https://elernal.github.io/survival-demo/ 。
- 早期 API 和 Git 推送曾返回 403；之后 Git 写入已恢复。无需为此重复调整插件身份授权。

## 更新

```sh
python tests/browser_smoke.py
python tests/visual_qa.py
git add .
git commit -m "Update survival demo"
git push origin main
```

等待 Pages deployment 构建完成，然后实际打开公开地址验证版本。
本次视觉迭代 HTML 含 `<meta name="build" content="art-02">`，脚本与 CSS 带版本参数以降低旧缓存影响。

## 不使用 Git 的上传方法

解压项目包，在 GitHub 的 Add file → Upload files 中上传 index.html 和完整 assets 文件夹。
不要只上传 index.html；写实场景与人物均依赖随包资源。

## 验证范围

本地真实 Chromium 的 1280×720、844×390、390×844、1024×768 四种视口；完整流程、触屏取消、重试、加载回退见 tests/。
浏览器模拟不能替代真实移动设备与 iOS Safari 的性能、触感及内存验收。
