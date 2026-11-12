# 余烬：最后一趟

浏览器横版生存游戏原型。3D 人物迭代 02：写实建筑剖面、双层避难所、实时骨骼人物、冷暖照明与电影感 HUD。

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
- 人物优先使用真正的 GLB 蒙皮网格和骨骼动画，由 Three.js/WebGL 实时绘制。
- 行走使用 `Walk_Brisk` 骨骼动画，按实际移动速度匹配步频；起步、停步、转身与蹲伏都有连续过渡。
- 修正了源模型独立脚部控制骨骼的 IK，脚掌和小腿共同求解，避免停步、蹲伏与倒地时穿地。
- 双手举枪、短刀近战、呼吸和倒地由附加姿态实现；枪口光和弹道采样当前 3D 枪口位置。
- 背包增加圆角、卷毯、绑带与扣具，并在最终姿态之后更新挂点。衣物污渍与感染者肤色为稳定的程序化材质，保留原贴图。
- 感染者当前复用通用模型并改变材质、步速和姿态；这不是已完成的专属感染者美术。
- 无 WebGL、模型加载失败或初始化超时时回退原有四帧序列人物。
- 动态雨尘、接触阴影、枪口闪光、前景遮挡和轻微视差。
- 极简任务 HUD、电影感标题与重绘触屏图标。
- 四张 WebP 合计约 1.60 MB；详见 `assets/art/README.md`。

当前是实时 3D 人物与预渲染 2.5D 场景的混合原型。人物可受实时灯光影响，但背景不是真正的 3D 场景。通用角色模型、专用动作及环境光照交互仍与参考游戏有明显差距。

模型与骨骼动画采用可再分发的 CC0 资源，优化后约 5.65 MB；Three.js 及加载器为本地静态文件。来源及许可见 `assets/models/README.md` 与 `assets/vendor/LICENSE-three.txt`。

## 初始化与架构

- `index.html`：页面与 UI；`assets/game.css`：布局与触屏样式。
- `assets/lifecycle.js`：Boot → Loading → Ready → Playing → Paused / GameOver / Completed；单一动画调度器。
- `assets/input.js`：动作指针捕获、释放与取消。
- `assets/scene.js`：场景资源解码、地面标定、拼接与前景。
- `assets/characters-3d.js`：模型预加载、8 角色实例池、骨骼混合与姿态、正交摄像机、透明 WebGL 合成、资源释放。
- `assets/characters.js`：角色序列渲染、姿态及无图像时的关节绘制回退。
- `assets/game.js`：场景缓存、AI、战斗、任务与主渲染；后续继续拆分这些系统。

页面先显示加载状态，在标题界面准备角色、敌人、物资、图像解码和背景缓存；完成后才启用开始按钮。
图像失败或 12 秒超时回退基础画面；3D 模型初始化有 15 秒超时，整个模块启动最多 20 秒，不阻止后续试玩。开始和重试不重新加载图像，复用背景缓存；仅渲染视口内的角色。
3D 角色在 Ready 前完成克隆、材质与着色器预热；不额外启动 RAF。只绘制视口内角色，预分配角色上限为 8，共享几何与贴图，3D 画布像素比封顶为 1.5。
暂停或切后台停止帧循环并释放输入。

## GitHub Pages

Settings → Pages → Deploy from a branch → main → /(root) → Save。
保持 `index.html`、`assets/` 和 `.nojekyll` 在仓库根目录。

## 自动化测试

环境需 Python Playwright 与 Chromium：

```sh
python tests/browser_smoke.py
python tests/visual_qa.py
python tests/characters_3d_test.py
python tests/character_polish_test.py
```

测试使用真实 Chromium、正常键盘和触屏事件，不修改内部游戏状态。
包含四种视口、避难所建设、日夜门禁、暂停继续、双指操作、夜间探索与清晨归来、预加载、资源失败回退和截图。
任务使用虚拟时钟加速；帧间隔来自桌面无头 Chromium，不代表手机硬件性能。
3D 专项测试验证真实骨骼变换、加载预热、池容量、动作与资源释放，以及模型失败和禁用 WebGL 的回退。软件 WebGL 仅用于正确性测试，不代表真实手机 GPU 性能。
仍需真实 iPhone / iPad / Android 设备验收。
