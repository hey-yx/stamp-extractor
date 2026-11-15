<div align="center">
  <img src="assets/cover.png" alt="印章提取：把盖章图片抠成透明底 PNG" width="100%">

  # 印章提取

  把纸面盖章照片抠成透明底 PNG，纯前端、本地处理，图片不上传。

  ![零依赖](https://img.shields.io/badge/dependencies-0-2f6f44?style=flat-square)
  ![浏览器内运行](https://img.shields.io/badge/runs%20in-the%20browser-b42318?style=flat-square)
  ![不上传](https://img.shields.io/badge/network-none-6f6a5f?style=flat-square)
  ![许可证](https://img.shields.io/badge/license-MIT-2f6f44?style=flat-square)

  [快速开始][quick-start] • [选项][options] • [怎么抠的][how] • [案例][cases] • [限制][limits]
</div>

> [!WARNING]
> 章面含公司名和统一社会信用代码，属于敏感信息。导出的图别传公开图床，用之前确认你有权使用这枚章。处理全在浏览器里完成，不会上传任何图片。

## 快速开始

直接双击 `index.html` 就能用，不用构建，断网也能跑。也可以起一个本地静态服务：

```bash
git clone https://github.com/hey-yx/stamp-extractor.git
cd stamp-extractor
python3 -m http.server 8131
```

打开 <http://127.0.0.1:8131/>，拖入图片、点「选择图片」，或直接 ⌘V 粘贴。

想一步看结果：载入 `cases/02-contract-official/input.png`，按钮下方的状态行会显示 `284×284 px`。

## 它能做什么

- 从照片里找出红色印章，丢掉纸面，只留章体。
- 纸纹、光照不均、被黑字压断的笔画都能接回来。
- 导出透明底和白底两张 PNG，按章体实际像素裁紧，不补白、不放大。
- 纯静态页面：没有依赖，不用构建，断网也能跑。

## 选项

| 控件 | 默认 | 改的是什么 |
| --- | --- | --- |
| 自动增强对比度 | 开 | 先把偏黄偏灰的纸面校回白色；门槛再放宽 8%，淡墨能多留一些。 |
| 提取灵敏度 | 50 | 调高留更多淡章，调低压掉背景杂点。 |
| 印章颜色 | `#FF0000` | 默认纯红，屏幕显示鲜亮。也可以换标准红 `#DA251D`（深圳市地方标准 DB4403/T 383.6-2023 第 5.3 条的印模色 RGB 218/37/29）。 |

边缘只有「留着」和「全透明」两种，不做柔化，放大后弧线会有台阶。输出两种 PNG，透明底直接拖进 WPS，按实物直径设 4.2cm 或 4.0cm。

## 怎么抠的

1. 先缩到最长边 1800px，大图也不卡页面。
2. 每个像素算一个「有多红」的分值：`(R - (G+B)/2) / (R+G+B)`。白纸接近 0，红墨明显为正，光线亮一点暗一点都影响不大。
3. 定一条线，把像素分成「要」和「不要」，再把靠得近的小块拼回最大的那块，相距不超过短边 4% 就算同一枚。被黑字切断的弧线这样接回来，画面里别的红色标题和 logo 拼不进来。
4. 沿章体边缘裁紧，只留 1px 透明边，章以外全部透明。
5. 导出透明底 PNG，另存一张白底预览。

门槛和各项数值的来历写在 [`docs/算法说明.md`](docs/算法说明.md)。

## 案例

四组都是默认设置：自动增强开、灵敏度 50、纯红。左边输入，右边透明底输出。

<p align="center">
  <img src="cases/01-phone-photo/compare.png" alt="手机拍的纸面章，字号和编码已打码，右侧是提取结果" width="48%"><img src="cases/02-contract-official/compare.png" alt="合同专用章样张与提取结果" width="48%">
</p>
<p align="center">
  <img src="cases/03-finance-official/compare.png" alt="财务专用章样张与提取结果" width="48%"><img src="cases/04-oval-contract/compare.png" alt="椭圆合同专用章与提取结果" width="48%">
</p>

| 案例 | 输入 | 输出 |
| --- | --- | --- |
| 手机拍的纸面章 | 1280×582 | 406×404 |
| 合同专用章 | 305×306 | 284×284 |
| 财务专用章 | 305×306 | 284×284 |
| 外资合同专用章 | 433×290 | 428×286 |

第一组是真实照片：提取跑的是未打码原图，导出后再把字号和编码打码，所以两边打码位置一致。另外三组来自 DB4403/T 383.6-2023 附录 A，用的是占位名称。逐组说明见 [`cases/README.md`](cases/README.md)。

## 实测结果

四组案例都在 Chrome 里走页面自己的上传流程跑过，输出尺寸与上表一致。导出的 PNG 四角透明，边缘没有半透明像素，只有「留着」和「全透明」两种。

## 限制

- 黑字压在章上的位置会在结果里留缺口。这是纸面遮挡，不做自动补笔。
- 淡到接近纸色、或者小于 300px 的章，边缘会碎，调高灵敏度能多留一些。
- 边缘只有「留着」和「全透明」两种，放大后弧线有台阶。
- 结果是一张图片，不具备法律效力。正式用途要用备案实物章或合规的电子签名平台。

## 文件

- `index.html`、`styles.css`：页面
- `extract.js`：提取算法
- `app.js`：上传、预览、下载
- `cases/`：四组输入、输出和对比图
- `docs/算法说明.md`：门槛、拼块、裁切的实现细节和实测数据

[quick-start]: #快速开始
[options]: #选项
[how]: #怎么抠的
[cases]: #案例
[limits]: #限制
