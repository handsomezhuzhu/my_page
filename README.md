# Simon 个人主页 · Simon 個人主頁

[简体中文](#简体中文) | [繁體中文](#繁體中文)

---

## 简体中文

一个简约高级风格的个人主页，基于 Next.js 构建，滚动驱动粒子形态变换。

本仓库通过分支维护两个语言版本，除字体、文案与页脚备案信息外完全一致：

| 分支 | 语言 | 字体 | 页脚备案 | 部署方式 |
| --- | --- | --- | --- | --- |
| `main` | 简体（zh-CN） | Noto Serif SC | 显示 ICP / 公安备案 | 手动构建后上传 `out` 目录到服务器 |
| `traditional` | 繁体（zh-HK） | Noto Serif TC | 不显示备案 | 推送后由 Cloudflare Pages 自动构建部署 |

### 功能特点

- 纯色简约设计，深色衬线美学
- 滚动驱动的粒子形态变换（无限回廊 / 墨环 / 点阵地球）
- 自建像素光栅器渲染数万粒子，自适应画质
- 光标光晕效果、按钮悬停微交互
- 响应式布局
- 备案信息可通过配置显示/隐藏

### 本地开发

```bash
npm install
npm run dev
```

打开 http://localhost:3000 查看效果。

### 构建静态页面

```bash
npm run build
```

构建完成后，静态文件会生成在 `out` 目录中。可使用 `npx serve out` 本地预览。

### 部署

#### 简体版（main）→ 自有服务器

```bash
npm run build
scp -r out/* 用户名@服务器IP:/var/www/html/
# 或使用 rsync（推荐，只上传变化部分）
rsync -avz --delete out/ 用户名@服务器IP:/var/www/html/
```

Nginx 配置示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

#### 繁体版（traditional）→ Cloudflare Pages

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 选择本仓库，构建设置：
   - **Production branch**: `traditional`
   - **Framework preset**: `Next.js (Static HTML Export)`（或 None + 手动配置）
   - **Build command**: `npm run build`
   - **Build output directory**: `out`
4. 点击 **Save and Deploy**，之后每次推送 `traditional` 分支即自动更新

### 切换语言版本

```bash
git checkout main         # 简体版
git checkout traditional  # 繁体版
```

修改公共代码时建议：先在 `main` 上提交，再 `git checkout traditional && git merge main` 同步，繁体分支只保留语言相关的差异提交。

### 配置说明

- 备案信息：编辑 `lib/config.ts`，`showBeian` 控制是否显示备案
- 导航链接：编辑 `components/navigation-links.tsx`
- 座右铭与文案：编辑 `components/hero-section.tsx`、`components/motto-section.tsx`

### 目录结构

```
├── app/
│   ├── globals.css          # 全局样式和动画
│   ├── layout.tsx           # 页面布局（字体 / lang / metadata）
│   └── page.tsx             # 首页
├── components/
│   ├── home-shell.tsx       # 滚动驱动粒子形态切换
│   ├── particle-field.tsx   # 粒子形态变换场（像素光栅器）
│   ├── site-header.tsx      # 顶部栏
│   ├── hero-section.tsx     # 首屏
│   ├── motto-section.tsx    # 座右铭
│   ├── navigation-links.tsx # 导航链接
│   ├── footer.tsx           # 页脚（备案）
│   └── reveal.tsx           # 滚动淡入容器
├── lib/
│   └── config.ts            # 站点配置
└── public/                  # 静态资源
```

---

## 繁體中文

一個簡約高級風格的個人主頁，基於 Next.js 構建，捲動驅動粒子形態變換。

本倉庫透過分支維護兩個語言版本，除字體、文案與頁尾備案資訊外完全一致：

| 分支 | 語言 | 字體 | 頁尾備案 | 部署方式 |
| --- | --- | --- | --- | --- |
| `main` | 簡體（zh-CN） | Noto Serif SC | 顯示 ICP / 公安備案 | 手動構建後上傳 `out` 目錄到伺服器 |
| `traditional` | 繁體（zh-HK） | Noto Serif TC | 不顯示備案 | 推送後由 Cloudflare Pages 自動構建部署 |

### 功能特點

- 純色簡約設計，深色襯線美學
- 捲動驅動的粒子形態變換（無限迴廊 / 墨環 / 點陣地球）
- 自建像素光柵器渲染數萬粒子，自適應畫質
- 游標光暈效果、按鈕懸停微互動
- 響應式佈局
- 備案資訊可透過設定顯示/隱藏

### 本地開發

```bash
npm install
npm run dev
```

開啟 http://localhost:3000 檢視效果。

### 構建靜態頁面

```bash
npm run build
```

構建完成後，靜態檔案會產生在 `out` 目錄中。可使用 `npx serve out` 本地預覽。

### 部署

#### 簡體版（main）→ 自有伺服器

```bash
npm run build
scp -r out/* 使用者名稱@伺服器IP:/var/www/html/
# 或使用 rsync（推薦，只上傳變化部分）
rsync -avz --delete out/ 使用者名稱@伺服器IP:/var/www/html/
```

Nginx 設定範例：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

#### 繁體版（traditional）→ Cloudflare Pages

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 進入 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 選擇本倉庫，構建設定：
   - **Production branch**: `traditional`
   - **Framework preset**: `Next.js (Static HTML Export)`（或 None + 手動設定）
   - **Build command**: `npm run build`
   - **Build output directory**: `out`
4. 點擊 **Save and Deploy**，之後每次推送 `traditional` 分支即自動更新

### 切換語言版本

```bash
git checkout main         # 簡體版
git checkout traditional  # 繁體版
```

修改公共程式碼時建議：先在 `main` 上提交，再 `git checkout traditional && git merge main` 同步，繁體分支只保留語言相關的差異提交。

### 設定說明

- 備案資訊：編輯 `lib/config.ts`，`showBeian` 控制是否顯示備案
- 導覽連結：編輯 `components/navigation-links.tsx`
- 座右銘與文案：編輯 `components/hero-section.tsx`、`components/motto-section.tsx`

### 目錄結構

```
├── app/
│   ├── globals.css          # 全域樣式和動畫
│   ├── layout.tsx           # 頁面佈局（字體 / lang / metadata）
│   └── page.tsx             # 首頁
├── components/
│   ├── home-shell.tsx       # 捲動驅動粒子形態切換
│   ├── particle-field.tsx   # 粒子形態變換場（像素光柵器）
│   ├── site-header.tsx      # 頂部欄
│   ├── hero-section.tsx     # 首屏
│   ├── motto-section.tsx    # 座右銘
│   ├── navigation-links.tsx # 導覽連結
│   ├── footer.tsx           # 頁尾（備案）
│   └── reveal.tsx           # 捲動淡入容器
├── lib/
│   └── config.ts            # 站點設定
└── public/                  # 靜態資源
```

---

© 2025 Simon. All rights reserved.
