# Design System

## Tokens CSS (`styles/globals.css`)

A aplicação utiliza o sistema visual **Obsidian Glass** como tema escuro padrão em `:root` e **Daylight Glass** como Modo Claro em `[data-theme="light"]`, inspirados em minimalismo corporativo de alta precisão (Apple / Tesla / Antigravity) com camadas translúcidas (`backdrop-filter`), bordas especulares de `1px` e curvas de desaceleração física (`cubic-bezier(0.16, 1, 0.3, 1)`).

```css
:root {
  /* Fundos & Vidro (Obsidian Glass) */
  --bg-base:           #060608;
  --bg-surface:        rgba(12, 12, 16, 0.72);
  --bg-card:           rgba(255, 255, 255, 0.032);
  --bg-card-hover:     rgba(255, 255, 255, 0.064);
  --bg-glass-strong:   rgba(18, 18, 24, 0.78);
  --bg-overlay:        rgba(4, 4, 7, 0.84);
  --bg-ambient:        radial-gradient(ellipse 85% 45% at 50% -12%, rgba(59, 130, 246, 0.13), rgba(99, 102, 241, 0.04) 45%, transparent 75%);

  /* Bordas Especulares */
  --border:            rgba(255, 255, 255, 0.075);
  --border-highlight:  rgba(255, 255, 255, 0.16);
  --border-accent:     rgba(79, 142, 255, 0.45);
  --specular-top:      rgba(255, 255, 255, 0.07);

  /* Textos */
  --text-primary:      #F5F5F7;
  --text-secondary:    #9494A3;
  --text-muted:        #5E5E6E;

  /* Accent */
  --accent:            #3B82F6;
  --accent-glow:       rgba(59, 130, 246, 0.18);
  --accent-hover:      #60A5FA;

  /* Semânticas */
  --success:           #22C55E;
  --danger:            #EF4444;
  --warning:           #F59E0B;

  /* Blur, Raios & Transições */
  --blur-sm:           blur(10px) saturate(160%);
  --blur-md:           blur(18px) saturate(180%);
  --blur-lg:           blur(28px) saturate(190%);
  --radius-sm:         8px;
  --radius-md:         14px;
  --radius-lg:         20px;
  --radius-pill:       999px;
  --ease-out-expo:     cubic-bezier(0.16, 1, 0.3, 1);
  --transition:        0.28s cubic-bezier(0.16, 1, 0.3, 1);
  --font:              'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}
```

O seletor `[data-theme="light"]` sobrescreve esses tokens para a paleta **Daylight Glass** (`--bg-base: #F5F5F7`, `--bg-surface: rgba(255, 255, 255, 0.76)`, `--bg-card: rgba(255, 255, 255, 0.72)`, `--text-primary: #0F172A`, `--accent: #2563EB`).

---

## Componentes e Classes

### Layout, Tema e Busca no Header
- `.app-container` — flex column, `min-height: 100vh`
- `.header` — sticky top, `64px` de altura, vidro translúcido com `backdrop-filter: var(--blur-md)`
- `.header-logo` — emblema vetorial `.header-logo-icon` + título + pílula discreta `.header-logo-tag` (`DER/MG`)
- `.header-search` — container flexível da barra de busca no header (`max-width: 460px`; ocupa 100% da largura na segunda linha em telas ≤640px)
- `.header-search-input` — cápsula (`--radius-pill`) em vidro translúcido com `backdrop-filter: var(--blur-sm)` e anel de foco `--accent-glow`
- `.header-search-clear` — botão circular com ícone SVG (`CloseSvgIcon`) para limpar a busca
- `.btn-theme-toggle` — botão discreto `36x36px` no header (presente tanto no login quanto na tela principal) que alterna entre Modo Escuro (`SunSvgIcon`) e Modo Claro (`MoonSvgIcon`), persistindo em `localStorage` (`der-videos-theme`)
- `.main-content` — padding `36px 36px 56px`, `max-width: 1320px`, centralizado

### Cards de Item & Iconografia SVG Monolinear
- Todos os ícones da interface são componentes SVG vetoriais monolineares (`stroke-width: 1.5px–1.75px`) declarados em `pages/index.js` (`BrandPlayIcon`, `FolderSvgIcon`, `VideoSvgIcon`, `FileSvgIcon`, `SearchSvgIcon`, `HomeSvgIcon`, `ChevronRightSvgIcon`, `RefreshSvgIcon`, `CloseSvgIcon`, `SunSvgIcon`, `MoonSvgIcon`, `AlertSvgIcon`, `ArrowRightSvgIcon`).
- `.items-grid` — CSS grid, `auto-fill`, `minmax(220px, 1fr)`, `gap: 16px`
- `.item-card` — superfície em vidro (`--bg-card`, `backdrop-filter: var(--blur-sm)`), borda especular `--border`, sombra interna superior e animação escalonada `cardFadeUp` (`--stagger`)
  - hover: eleva `-3px`, ativa brilho radial superior (`::before`), destaca borda por tipo (`.card-video` ou `.card-folder`) e revela a seta `.item-card-arrow`
- `.item-card-top` — alinha `.item-card-icon` (`42x42px`) à esquerda e `.item-type-badge` (`PASTA`, `VÍDEO`, `ARQUIVO`) à direita
- `.item-card-name` — `13.5px`, `font-weight: 500`, 2 linhas máx com `-webkit-line-clamp: 2`
- `.item-card-path` — `11px`, cor `--text-secondary`, 2 linhas máx com `-webkit-line-clamp: 2`, exibe a trilha de origem (`↳ ...`) nos resultados de busca
- `.item-card-footer` — rodapé com divisor sutil exibindo `.item-card-meta` (`tabular-nums`) e `.item-card-arrow`

### Breadcrumb
- `.breadcrumb` — cápsula translúcida com `backdrop-filter: var(--blur-sm)`, separadores `ChevronRightSvgIcon` e animação `fadeSlideIn`
- `.breadcrumb-item` — botão clicável para níveis anteriores, `span` com fundo destacado para o nível atual

### Modal de Vídeo (Cinema Glass Theater)
- `.modal-overlay` — `position: fixed; inset: 0; z-index: 200`, `backdrop-filter: var(--blur-lg)`
- `.modal-content` — moldura em vidro escuro/claro (`--bg-glass-strong`), `max-width: 980px`, animação `scaleIn`
- `.modal-header` — título à esquerda, botão circular `.modal-close` (`CloseSvgIcon`) à direita
- `.video-wrapper` — `aspect-ratio: 16/9`, fundo `#000`, `border-radius: 12px`

### Login (Monolithic Glass Portal)
- `.login-screen` — centraliza o portal de autenticação
- `.login-card` — container monolítico em vidro (`max-width: 420px`, `backdrop-filter: var(--blur-lg)`), com `.login-icon`, `.login-eyebrow`, `.login-title`, `.login-subtitle`, botão `.login-btn-ms` e rodapé `.login-footnote`

---

## Animações

```css
@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
@keyframes cardFadeUp  { from { opacity: 0; transform: translateY(10px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes fadeIn      { from { opacity: 0; } to { opacity: 1; } }
@keyframes scaleIn     { from { transform: scale(0.96) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
@keyframes spin        { to { transform: rotate(360deg); } }
```

Inclui suporte a `@media (prefers-reduced-motion: reduce)` para acessibilidade.

---

## Responsividade

Breakpoint em `640px`:
- Header com padding reduzido (`12px 16px`), `.header-logo-tag` oculta para preservar espaço e barra de busca ocupando 100% na linha inferior
- `.main-content` com padding `22px 16px 40px`
- `.items-grid` muda para `minmax(155px, 1fr)` com `gap: 12px`
- `.modal-overlay` ancora na parte inferior (`align-items: flex-end`)
