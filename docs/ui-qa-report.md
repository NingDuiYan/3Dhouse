# HUD 观感改造 · 交付与复检报告

> 范围：`index.html` + `src/ui/style.css` + `src/ui/hud.ts` + `src/systems/camera.ts`（reduced-motion 单点）+ `tests/contrast.test.ts` + `docs/ui-preview.html`
> 未触碰：`data/seasons.ts`、`data/weather.ts`、`core/`、渲染管线。

## 一、问题诊断（8 位成员交叉复核后的定稿）

| # | 结论 | 证据 |
|---|---|---|
| 1 | 「控件是浏览器默认观感」**不成立** | `.tab/.chip` 本就自定义；真正裸露的只有 `#hourSlider`（原 `style.css` 仅 1 条 `accent-color`） |
| 2 | 缺设计系统**成立且量化** | 改造前：CSS 变量 0 个、字号 7 档、圆角 4 档、颜色字面量 16 种、`:focus` 0 命中、`@media` 0 条 |
| 3 | 对比度问题**方向被说反了** | 夜间场景普遍 13:1 全过；崩的是亮场景——冬·正午雪面 #f0f2f5 上 `.tablabel` 仅 2.36:1、`#brand h1` 1.01:1。同一份白字在夜/雪之间漂移近 4 倍 |
| 4 | 缺层级**成立** | 读数、三行控件同构；`#brand` 与 `#hud` 同为 `z-index:10` |
| 5 | 「通用界面」判定**成立** | `[data-season]`/`[data-weather]` 在 CSS 中 0 命中，换季换天气界面纹丝不动，与 `docs/项目方案.md:30-32` 的冷暖对抗记忆点零呼应 |
| 6 | 移动端不可用 | 无 `@media`、无 `env(safe-area-inset-*)`、`#hourSlider` 固定 `width:200px`，320px 视口必然横向溢出 |

## 二、已落地的改造

1. **设计 token 化**：39 个 `--hs-*` 变量，零未定义零未使用；字号收敛到 4 档、圆角 3 档、间距 4px 网格。
2. **可读性解耦**：面板不透明度 `0.55 → 0.86`（不是靠 blur 撑），三级文字改实色，最坏底（纯白）实测 `text-3 = 5.16:1`。
3. **视觉层级**：读数拆成 serif 大时刻（20px/600/tabular-nums）+ 小语境（12px），巡游按钮独立到读数区右侧。
4. **时刻色带**：dawn/day/dusk/night 四档 accent，取自场景自身光源色（室内灯 `0xffc97e`）。
5. **季节/天气联动**：`html[data-season]` 调面板描边色温，`html[data-weather]` 调面板不透明度；写点只在 click 回调，有跨档守卫。
6. **状态可辨**：选中态改为「色带着色 + accent 描边 + 600 字重 + 底部指示条」，指示条是 accent 实色压在面板上（四档 7.86–9.02:1）。
7. **焦点环**：`outline 2px #8ecbff + offset 2px`，offset 保证环落在面板上（7.67:1）。
8. **响应式**：`@media` 899 / 640 / 横屏三档，320px 不溢出，横屏 2 列网格，全链路 `env(safe-area-inset-*)` 左右上下齐备。
9. **动效降级**：CSS `prefers-reduced-motion` + `camera.ts` 初始化读一次 `matchMedia`，换季运镜瞬移、巡游不自动启动。
10. **无障碍**：`role=group`+`aria-labelledby`、`aria-pressed`、`aria-valuetext`、`aria-live` 仅挂语境短句、loader 用 `visibility` 退出 a11y tree。

## 三、验证证据（进程内实测，非声称）

shell 在本机不可用（`pwsh` 恒返回 `3221225794`，`vite/vitest` 内部 spawn 被拒），全部改走 Node API：

| 项 | 结果 |
|---|---|
| `tsc` 等效（`ts.createProgram` + `getPreEmitDiagnostics`） | 29 文件 **0 诊断** |
| `eslint`（`new ESLint({cwd}).lintFiles(['.'])`） | 30 文件 **0 error / 0 warning** |
| `vitest` 断言（自建 shim 跑 `tests/*.test.ts`） | **46 断言全通过**（含新增对比度 12 条） |
| CSS 结构 | 括号平衡、39 token 无未定义无未使用、6 个 `@media`、1 个 `@supports` |
| DOM 契约 | `hud.ts` 的 4 个 `getElementById` + 3 组 `querySelectorAll` 全部在 `index.html` 命中 |
| 盒模型 | 320/360/390/414 竖屏不溢出；480/568/667/844 横屏单行不折行，HUD 高约 33% |

## 四、终审提出的 P0 与处理

| 终审项 | 处理 |
|---|---|
| `#brand` 衬底几何失效（副标题有效 scrim 仅 0.25，纯白底 1.07:1） | 垂直平台 42%→62%、横向淡出 55%→88%，复算副标题升到 8.26:1 以上，并写入测试哨兵 |
| 横屏 480×320 两行折行（55.8% 屏高） | 横屏分支 `flex-wrap:nowrap`；≤560px 时隐藏行标签（仍供 `aria-labelledby`），行宽 238/252 → 184/198，全部单行，HUD 高约 33% |
| `env(safe-area-inset-left/right)` 缺失 | `#brand`、`#hud`（三档断点）全部补左右 inset |
| day 档选中态 1.4.11 不可辨 | 放弃「靠边框色差」的错误方案（暗面板上物理不可能达标，实测最好 2.2:1），改为几何指示条；day accent 换 `#9ecbff` |
| 季节/天气联动 | 已做，见上 |
| `camera.ts` 运镜降级 | 已做 |

## 五、未覆盖 / 残留风险

- **浏览器实渲染、axe-core、读屏器、真机全部未跑**（宿主无浏览器、无 `playwright/puppeteer`、shell 不可用）。所有数值是 sRGB 静态合成模型，`backdrop-filter` 在 GPU 上的取样偏差未计入。
- 相机键盘化（WCAG 2.1.1）未做：需在 `camera.ts` 自实现方向键（`OrbitControls` 因 `enablePan=false` 会直接 return，挂监听无效）。**因此本次不满足完整 WCAG 2.1 AA。**
- 命中区：桌面 44px ✓、移动 44px ✓（36→38）、横屏 44px ✓（34→38）；滑杆在横屏仍 38px，属 AA 无条款项。
- `tests/contrast.test.ts` 的常量与 CSS token 是手工同步，改 token 不会自动让测试失败（已在文件头注明）。

## 六、怎么自己看效果

1. 直接双击 `docs/ui-preview.html`（不启动 3D，`file://` 即可），右上角切换晨/正午/暮/夜/雪地五种底，Tab 走一遍看焦点环与选中指示条。
2. 完整场景：`npm run dev`。
3. 回归：`npm run test && npm run lint && npm run build`。
