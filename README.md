# 余烬：最后一趟

浏览器横版生存游戏原型。视觉迭代 02：写实建筑剖面、双层避难所、透明人物序列、冷暖照明与电影感 HUD。

试玩：https://elernal.github.io/survival-demo/

## 本地运行

```sh
python3 -m http.server 8000
```

打开 http://localhost:8000 。无 npm 运行依赖、构建步骤或 CDN 请求。美术素材随源码提供。

## 操作

电脑：A/D 移动、Shift 跑、Ctrl 蹲、J 近战、K 射击、F 搜刮/撤离、R 换弹、H 治疗、Esc 暂停。
触屏：左侧摇杆、右侧动作按钮，建议横屏。支持移动与射击同时进行。
先在避难所建设设施；游戏内 18:00 后选择区域出行（试玩白天约 120 秒）。找到诊室医疗箱后返回左侧入口撤离，物资入库并进入下一天。

## 美术与渲染

- 原创写实住宅、临时诊室、仓储与双层避难所背景；材质与主要照明为预渲染。
- 幸存者和感染者使用透明四帧步行序列，搭配程序化武器、蹲伏、倒地和反馈。
- 动态雨尘、接触阴影、枪口闪光、前景遮挡和轻微视差。
- 极简任务 HUD、电影感标题与重绘触屏图标。
- 四张 WebP 合计约 1.60 MB；详见 `assets/art/README.md`。

当前仍是浏览器 2.5D 原型，并非实际 3D、PBR 或完整骨骼动画。动作帧数、光照交互及场景深度仍与参考游戏有明显差距。

## 初始化与架构

- `index.html`：页面与 UI；`assets/game.css`：布局与触屏样式。
- `assets/lifecycle.js`：Boot → Loading → Ready → Playing → Paused / GameOver / Completed；单一动画调度器。
- `assets/input.js`：动作指针捕获、释放与取消。
- `assets/scene.js`：场景资源解码、地面标定、拼接与前景。
- `assets/characters.js`：角色序列渲染、姿态及无图像时的关节绘制回退。
- `assets/game.js`：场景缓存、AI、战斗、任务与主渲染；后续继续拆分这些系统。

页面先显示加载状态，在标题界面准备角色、敌人、物资、图像解码和背景缓存；完成后才启用开始按钮。
资源失败或 12 秒超时回退基础画面，不阻止试玩。开始和重试不重新加载图像，复用背景缓存；仅渲染视口内的角色。
暂停或切后台停止帧循环并释放输入。

## GitHub Pages

Settings → Pages → Deploy from a branch → main → /(root) → Save。
保持 `index.html`、`assets/` 和 `.nojekyll` 在仓库根目录。

## 自动化测试

环境需 Python Playwright 与 Chromium：

```sh
python tests/browser_smoke.py
python tests/visual_qa.py
```

测试使用真实 Chromium、正常键盘和触屏事件，不修改内部游戏状态。
包含四种视口、避难所建设、日夜门禁、暂停继续、双指操作、夜间探索与清晨归来、预加载、资源失败回退和截图。
任务使用虚拟时钟加速；帧间隔来自桌面无头 Chromium，不代表手机硬件性能。
仍需真实 iPhone / iPad / Android 设备验收。
