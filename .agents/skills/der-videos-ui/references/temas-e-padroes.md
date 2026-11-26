# Guia de Temas (Escuro / Claro) e Padrões Visuais

Referência técnica para o agente `der-videos-ui` ao implementar ou ajustar temas, paletas de cores e componentes no projeto DER Vídeos.

---

## 1. Paleta Implementada para Modo Claro (`[data-theme="light"]` — *Daylight Glass*)

O projeto utiliza o tema escuro **Obsidian Glass** como padrão no `:root` e suporta nativamente o **Modo Claro (Daylight Glass)** através do seletor `[data-theme="light"]` em `styles/globals.css`:

```css
[data-theme="light"] {
  --bg-base:           #F5F5F7;
  --bg-surface:        rgba(255, 255, 255, 0.76);
  --bg-card:           rgba(255, 255, 255, 0.72);
  --bg-card-hover:     rgba(255, 255, 255, 0.96);
  --bg-glass-strong:   rgba(255, 255, 255, 0.88);
  --bg-overlay:        rgba(15, 23, 42, 0.58);

  --border:            rgba(15, 23, 42, 0.08);
  --border-highlight:  rgba(15, 23, 42, 0.16);
  --border-accent:     rgba(37, 99, 235, 0.42);
  --specular-top:      rgba(255, 255, 255, 0.9);

  --text-primary:      #0F172A;
  --text-secondary:    #475569;
  --text-muted:        #64748B;

  --accent:            #2563EB;
  --accent-glow:       rgba(37, 99, 235, 0.14);
  --accent-hover:      #1D4ED8;

  --success:           #16A34A;
  --danger:            #DC2626;
  --warning:           #D97706;
}
```

### Pontos de Atenção no CSS ao Ativar Modo Claro
Algumas regras em `styles/globals.css` usam cores translúcidas que foram pensadas para fundo escuro e merecem ajuste ou variável dedicada quando o modo claro for ativado:
1. **`.header-search-clear:hover`**: Usa `rgba(255, 255, 255, 0.08)`, que fica invisível no fundo branco. No tema claro (ou via variável), prefira `var(--bg-base)` ou `rgba(0, 0, 0, 0.06)`.
2. **`.item-card:hover`**: A sombra `0 8px 24px rgba(0,0,0,0.3)` pode ficar pesada no tema claro; em `[data-theme="light"] .item-card:hover`, uma sombra `0 6px 18px rgba(15, 23, 42, 0.08)` fica mais elegante.
3. **`.error-banner`**: O texto `#FCA5A5` (vermelho claro) tem ótimo contraste no escuro, mas baixo contraste no claro. No tema claro, use `color: var(--danger)`.
4. **`.login-btn-ms`**: O botão "Entrar com conta Microsoft" é branco (`#fff`) com texto escuro (`#1a1a1a`). No tema claro, adicione `border: 1px solid var(--border)` e sombra sutil para destacá-lo do fundo claro.

---

## 2. Padrão de Implementação do Theme Toggle em `pages/index.js`

Como o estado de tema é puramente visual e local ao navegador do usuário:

```jsx
const [theme, setTheme] = useState("dark");

useEffect(() => {
  const saved = window.localStorage.getItem("der-videos-theme");
  if (saved === "light" || saved === "dark") {
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }
}, []);

function toggleTheme() {
  const next = theme === "dark" ? "light" : "dark";
  setTheme(next);
  document.documentElement.setAttribute("data-theme", next);
  window.localStorage.setItem("der-videos-theme", next);
}
```

---

## 3. Regras Estruturais que Nunca Devem Ser Removidas

Ao refatorar o `styles/globals.css`, certifique-se de preservar as propriedades estruturais abaixo:

- **`.header`**: `position: sticky; top: 0; z-index: 100;` (mantém a busca e ações acessíveis durante a rolagem).
- **`.items-grid`**: `display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));` (e `minmax(150px, 1fr)` no mobile).
- **`.item-card-name` e `.item-card-path`**: `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;` (impede que nomes longos de arquivos deformem os cards).
- **`.modal-overlay`**: `position: fixed; inset: 0; z-index: 200;` (garante que o player de vídeo sobreponha toda a interface).
- **`.video-wrapper`**: `aspect-ratio: 16/9; width: 100%; background: #000;` (evita *layout shift* enquanto o stream do vídeo inicia).
