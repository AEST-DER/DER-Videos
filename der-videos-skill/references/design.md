# Design System

## Tokens CSS (globals.css)

```css
:root {
  /* Fundos */
  --bg-base:        #0D0D0F;   /* fundo da página */
  --bg-surface:     #141417;   /* header */
  --bg-card:        #1A1A1F;   /* cards */
  --bg-card-hover:  #21212A;   /* cards hover */
  --bg-overlay:     rgba(13, 13, 15, 0.92); /* modal backdrop */

  /* Bordas */
  --border:         #2A2A35;
  --border-accent:  #3B7EF6;   /* borda de card em hover */

  /* Textos */
  --text-primary:   #F0F0F5;
  --text-secondary: #8888A0;
  --text-muted:     #55556A;

  /* Accent */
  --accent:         #3B7EF6;   /* azul-cobalto */
  --accent-glow:    rgba(59, 126, 246, 0.25);
  --accent-hover:   #5A97FF;

  /* Semânticas */
  --success:        #22C55E;
  --danger:         #EF4444;
  --warning:        #F59E0B;   /* cor de pasta/folder */

  /* Misc */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --transition: 0.18s ease;
  --font: 'Inter', system-ui, -apple-system, sans-serif;
}
```

---

## Componentes e Classes

### Layout
- `.app-container` — flex column, min-height 100vh
- `.header` — sticky top, 60px altura, blur backdrop
- `.main-content` — padding 32px, max-width 1280px, centralizado

### Cards de Item
- `.items-grid` — CSS grid, auto-fill, minmax(200px, 1fr), gap 14px
- `.item-card` — fundo `--bg-card`, borda `--border`, radius md, cursor pointer
  - hover: sobe 2px, borda accent, box-shadow glow
- `.item-card-icon` — 44px, ícone emoji, fundo colorido por tipo:
  - `.folder` → fundo amarelo-âmbar translúcido
  - `.video` → fundo azul accent translúcido
  - `.file` → fundo cinza translúcido
- `.item-card-name` — 13px, font-weight 500, 2 linhas máx com `line-clamp`
- `.item-card-meta` — 11px, cor muted
- `.item-type-badge` — badge pequeno com tipo em maiúsculas
  - `.badge-folder` → texto warning
  - `.badge-video` → texto accent
  - `.badge-file` → texto muted

### Breadcrumb
- `.breadcrumb` — flex row, gap 6px, animação fadeSlideIn
- `.breadcrumb-item` — botão clicável para níveis anteriores, span para atual
- `.breadcrumb-sep` — caractere `›` em cor muted

### Modal de Vídeo
- `.modal-overlay` — fixed inset 0, blur backdrop, flex center
- `.modal-content` — max-width 960px, animação scaleIn
- `.modal-header` — flex, título à esquerda, botão × à direita
- `.video-wrapper` — aspect-ratio 16/9, fundo #000
- `.modal-close` — círculo 36px, fica vermelho no hover

### Botões
- `.btn` — base, flex, gap 8px, padding 8px 16px
- `.btn-primary` — fundo accent, branco
- `.btn-ghost` — transparente, borda, fica accent no hover
- `.btn-danger` — transparente, texto danger, borda danger

### Estados
- `.loading-state` — flex column center, spinner + texto
- `.error-state` — flex column center, ícone + título + mensagem
- `.empty-state` — flex column center, ícone opaco + textos
- `.error-banner` — fundo danger translúcido, borda danger, flex row
- `.spinner` — 36px, border top accent, animação spin 0.7s

### Login
- `.login-screen` — flex column center, text-align center
- `.login-icon` — 72px, gradiente accent→roxo, box-shadow glow
- `.login-btn-ms` — fundo branco, texto escuro, logo MS inline

---

## Animações

```css
@keyframes fadeSlideIn { from { opacity:0; transform:translateX(-6px) } }
@keyframes fadeIn      { from { opacity:0 } }
@keyframes scaleIn     { from { transform:scale(0.95); opacity:0 } }
@keyframes spin        { to { transform:rotate(360deg) } }
```

---

## Responsividade

Breakpoint em 640px:
- Header padding reduzido para 16px
- Main content padding reduzido para 20px 16px
- Grid muda para minmax(150px, 1fr)
- Modal se ancora na parte inferior da tela (`align-items: flex-end`)
