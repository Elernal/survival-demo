# 余烬：最后一趟

浏览器横版生存游戏原型。当前美术是 Canvas 程序化绘制，尚未达到目标商业游戏的视觉品质。

## 本地运行

```sh
python3 -m http.server 8000
```

打开 http://localhost:8000 。无 npm 依赖，无需构建，无 CDN 依赖。

## 操作

电脑：A/D 移动、Shift 跑、Ctrl 蹲、J 近战、K 射击、F 搜刮/撤离、R 换弹、H 治疗、Esc 暂停。
触屏：左侧摇杆、右侧动作按钮，建议横屏。支持移动与射击同时进行。
找到诊室医疗箱后返回左侧入口，交互撤离。

## 初始化与架构

- `index.html`：页面与 UI；`assets/game.css`：布局与触屏样式。
- `assets/lifecycle.js`：Boot → Loading → Ready → Playing → Paused / GameOver / Completed；单一动画调度器。
- `assets/input.js`：动作指针捕获、释放与取消。
- `assets/game.js`：当前场景、AI、战斗、任务与 Canvas 渲染；后续继续拆分这些系统。

页面先绘制加载状态，然后预先创建角色、敌人、物资与背景缓存；Ready 后才启用开始按钮。
开始与继续只切换状态；重试仅重置任务数据，不重建背景。失焦、切后台和暂停释放输入。
稳定版关闭可选 Three.js 路径，避免联网后中途切换渲染器以及独立的后台动画循环。

## GitHub Pages

仓库根目录含 index.html 和 assets。Settings → Pages → Deploy from a branch → main → /(root) → Save。
预期地址：https://elernal.github.io/survival-demo/ （部署完成后需单独验证）。

## 自动化测试

环境需 Python Playwright 与 Chromium。运行 `python tests/browser_smoke.py`。
测试通过真实键盘和 Chromium 触屏事件操作 UI，不修改游戏内部状态。
测试不能替代真实 iPhone / iPad / Android 设备验收。
