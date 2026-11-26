/**
 * pages/index.js
 *
 * Página principal do OneDrive Video Viewer.
 * Gerencia autenticação, navegação por pastas e reprodução de vídeos.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";

// ─── Utilitários ────────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// ─── Iconografia SVG Monolinear (1.5px stroke) ──────────────────────────────

function BrandPlayIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.25 9.35L15.25 12L10.25 14.65V9.35Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function FolderSvgIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M3.5 6.75C3.5 5.64543 4.39543 4.75 5.5 4.75H9.17157C9.70201 4.75 10.2107 4.96071 10.5858 5.33579L12.1642 6.91421C12.5393 7.28929 13.048 7.5 13.5784 7.5H18.5C19.6046 7.5 20.5 8.39543 20.5 9.5V17.25C20.5 18.3546 19.6046 19.25 18.5 19.25H5.5C4.39543 19.25 3.5 18.3546 3.5 17.25V6.75Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VideoSvgIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.4 9.15L15.15 12L10.4 14.85V9.15Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function FileSvgIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M6.5 3.75H14L18.25 8V18.25C18.25 19.3546 17.3546 20.25 16.25 20.25H6.5C5.39543 20.25 4.5 19.3546 4.5 18.25V5.75C4.5 4.64543 5.39543 3.75 6.5 3.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M13.75 3.75V8.25H18.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SearchSvgIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="11" cy="11" r="6.75" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 16L20.25 20.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function HomeSvgIcon() {
  return (
    <svg width="13.5" height="13.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M4.25 10.5L12 4L19.75 10.5V18.5C19.75 19.3284 19.0784 20 18.25 20H5.75C4.92157 20 4.25 19.3284 4.25 18.5V10.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightSvgIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9.5 6.5L15 12L9.5 17.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshSvgIcon({ spinning }) {
  return (
    <svg
      className={spinning ? "icon-spin" : ""}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M19.5 12C19.5 16.1421 16.1421 19.5 12 19.5C7.85786 19.5 4.5 16.1421 4.5 12C4.5 7.85786 7.85786 4.5 12 4.5C14.7614 4.5 17.1735 5.99229 18.4721 8.21115"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M18.75 4.5V8.5H14.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseSvgIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6.75 6.75L17.25 17.25M17.25 6.75L6.75 17.25" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SunSvgIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.65" />
      <path
        d="M12 3V5M12 19V21M3 12H5M19 12H21M5.636 5.636L7.05 7.05M16.95 16.95L18.364 18.364M18.364 5.636L16.95 7.05M7.05 16.95L5.636 18.364"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonSvgIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M20.2 14.6C19.2 15.05 18.1 15.3 16.9 15.3C12.37 15.3 8.7 11.63 8.7 7.1C8.7 5.9 8.95 4.8 9.4 3.8C5.92 4.78 3.4 7.98 3.4 11.78C3.4 16.38 7.12 20.1 11.72 20.1C15.52 20.1 18.72 17.58 20.2 14.6Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertSvgIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="8.75" stroke="currentColor" strokeWidth="1.65" />
      <path d="M12 8.25V12.75" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      <circle cx="12" cy="15.75" r="0.9" fill="currentColor" />
    </svg>
  );
}

function ArrowRightSvgIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M5.5 12H18.5M18.5 12L13.25 6.75M18.5 12L13.25 17.25" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getItemIcon(type) {
  if (type === "folder") return <FolderSvgIcon />;
  if (type === "video")  return <VideoSvgIcon />;
  return <FileSvgIcon />;
}

// ─── Componente: Ícone Microsoft ─────────────────────────────────────────────

function MicrosoftLogo() {
  return (
    <svg className="ms-logo" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
      <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}

// ─── Componente: Botão Discreto de Alternância de Tema ───────────────────────

function ThemeToggleButton({ theme, onToggle }) {
  const isLight = theme === "light";
  return (
    <button
      type="button"
      className="btn-theme-toggle"
      onClick={onToggle}
      aria-label={isLight ? "Ativar modo escuro" : "Ativar modo claro"}
      title={isLight ? "Modo escuro" : "Modo claro"}
    >
      {isLight ? <MoonSvgIcon /> : <SunSvgIcon />}
    </button>
  );
}

// ─── Componente: VideoPlayer Modal ───────────────────────────────────────────

function VideoModal({ video, onClose }) {
  // Fecha ao pressionar Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!video) return null;

  // Monta a rota da sua API. O próprio player de vídeo do navegador
  // vai acessar esse link, receber o redirecionamento 302 e rodar o vídeo.
  const videoSrc = `/api/video-url?driveId=${encodeURIComponent(video.driveId)}&itemId=${encodeURIComponent(video.id)}`;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Reproduzindo: ${video.name}`}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">{video.name}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Fechar player"
          >
            <CloseSvgIcon size={15} />
          </button>
        </div>

        <div className="video-wrapper">
          <video
            src={videoSrc}
            controls
            autoPlay
            width="100%"
            preload="metadata"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Componente: Item Card ────────────────────────────────────────────────────

function ItemCard({ item, index = 0, onClick }) {
  const staggerIndex = Math.min(index, 18);
  const metaText =
    item.type === "folder" && item.childCount != null
      ? `${item.childCount} ite${item.childCount === 1 ? "m" : "ns"}`
      : formatSize(item.size);

  return (
    <button
      className={`item-card card-${item.type}`}
      style={{ "--stagger": staggerIndex }}
      onClick={() => onClick(item)}
      aria-label={`${item.type === "folder" ? "Abrir pasta" : item.type === "video" ? "Reproduzir vídeo" : "Arquivo"}: ${item.name}`}
    >
      <div className="item-card-top">
        <div className={`item-card-icon ${item.type}`}>
          {getItemIcon(item.type)}
        </div>

        <div className={`item-type-badge badge-${item.type}`}>
          {item.type === "folder"
            ? "PASTA"
            : item.type === "video"
            ? "VÍDEO"
            : "ARQUIVO"}
        </div>
      </div>

      <div className="item-card-body">
        <div className="item-card-name">{item.name}</div>
        {item.parentPath && (
          <div className="item-card-path" title={item.parentPath}>
            ↳ {item.parentPath}
          </div>
        )}
      </div>

      <div className="item-card-footer">
        <div className="item-card-meta">
          {metaText || (item.type === "folder" ? "Diretório" : "Mídia")}
        </div>
        <span className="item-card-arrow" aria-hidden="true">
          <ArrowRightSvgIcon />
        </span>
      </div>
    </button>
  );
}

// ─── Componente Principal ────────────────────────────────────────────────────

export default function Home() {
  const [authenticated, setAuthenticated] = useState(null); // null = verificando
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null);

  // Estado visual de tema (Escuro padrão "Obsidian Glass" / Claro "Daylight Glass")
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

  // Pilha de navegação: cada entrada é { id, driveId, name }
  // Raiz = [], entrada compartilhada = [{ id: "root", driveId: null, name: "Compartilhados" }]
  const [navStack, setNavStack] = useState([]);

  // Estado da barra de busca com debounce (300ms)
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Verificação de autenticação ──────────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/status");
        const data = await res.json();
        setAuthenticated(data.authenticated);
      } catch {
        setAuthenticated(false);
      }
    }
    checkAuth();
  }, []);

  // ── Carrega itens quando autenticado ou navegação muda ───────────────────
  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    setItems([]);

    try {
      let res, data;

      if (navStack.length === 0) {
        // Raiz: lista compartilhados
        res = await fetch("/api/shared");
        data = await res.json();
      } else {
        // Dentro de uma pasta
        const current = navStack[navStack.length - 1];
        res = await fetch(
          `/api/children?driveId=${encodeURIComponent(current.driveId)}&itemId=${encodeURIComponent(current.id)}`
        );
        data = await res.json();
      }

      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticated(false);
          return;
        }
        throw new Error(data.error || "Erro ao carregar itens");
      }

      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [navStack]);

  useEffect(() => {
    if (authenticated) loadItems();
  }, [authenticated, loadItems]);

  // ── Executa busca profunda quando debouncedQuery muda ────────────────────
  const loadSearchResults = useCallback(async () => {
    if (!debouncedQuery) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    try {
      const params = new URLSearchParams({ q: debouncedQuery });
      if (navStack.length > 0) {
        const current = navStack[navStack.length - 1];
        params.set("driveId", current.driveId);
        params.set("itemId", current.id);
      }

      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticated(false);
          return;
        }
        throw new Error(data.error || "Erro ao realizar busca");
      }

      setSearchResults(data.items || []);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearchLoading(false);
    }
  }, [debouncedQuery, navStack]);

  useEffect(() => {
    if (authenticated) {
      loadSearchResults();
    }
  }, [authenticated, loadSearchResults]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function clearSearch() {
    setSearchInput("");
    setDebouncedQuery("");
    setSearchResults([]);
    setSearchError(null);
  }

  function handleItemClick(item) {
    if (item.type === "folder") {
      if (debouncedQuery) {
        clearSearch();
      }
      setNavStack((prev) => [
        ...prev,
        {
          id: item.remoteItemId || item.id,
          driveId: item.driveId,
          name: item.name,
        },
      ]);
    } else if (item.type === "video") {
      setPlayingVideo(item);
    }
    // Arquivos não-vídeo: ignora por ora
  }

  function handleBreadcrumbClick(index) {
    if (debouncedQuery) {
      clearSearch();
    }
    // index -1 = voltar para raiz
    setNavStack((prev) => prev.slice(0, index + 1));
  }

  // ── Render: Verificando autenticação ─────────────────────────────────────
  if (authenticated === null) {
    return (
      <>
        <Head>
          <title>ICM Vídeos</title>
        </Head>
        <div className="app-container">
          <div className="loading-state" style={{ flex: 1, height: "100vh" }}>
            <div className="spinner" />
            <span>Verificando sessão…</span>
          </div>
        </div>
      </>
    );
  }

  // ── Render: Tela de Login ────────────────────────────────────────────────
  if (!authenticated) {
    const loginError = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("error")
      : null;

    return (
      <>
        <Head>
          <title>ICM Vídeos — Login</title>
          <meta name="description" content="Acesse os vídeos do ICM de forma prática" />
        </Head>
        <div className="app-container">
          <header className="header">
            <div className="header-logo">
              <div className="header-logo-icon">
                <BrandPlayIcon size={16} />
              </div>
              <span>ICM Vídeos</span>
              <span className="header-logo-tag">DER-MG</span>
            </div>

            <div className="header-actions">
              <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
            </div>
          </header>

          <main className="login-screen">
            <div className="login-card">
              <div className="login-icon">
                <BrandPlayIcon size={26} />
              </div>
              <span className="login-eyebrow">Acervo Audiovisual</span>
              <h1 className="login-title">ICM Vídeos</h1>
              <p className="login-subtitle">
                Acesse, reproduza ou baixe vídeos do ICM
                diretamente pelo navegador, com streaming instantâneo.
              </p>

              {loginError && (
                <div className="error-banner" style={{ marginBottom: 20, width: "100%" }}>
                  <AlertSvgIcon />
                  <span>{decodeURIComponent(loginError)}</span>
                </div>
              )}

              <a href="/api/auth/login" className="login-btn-link">
                <button className="login-btn-ms">
                  <MicrosoftLogo />
                  Entrar com conta Microsoft
                </button>
              </a>

              <p className="login-footnote">
                Autenticação corporativa gerenciada via Microsoft Entra ID.
                Acesso restrito a leitura de diretórios autorizados.
              </p>
            </div>
          </main>
        </div>
      </>
    );
  }

  // ── Render: App Principal ────────────────────────────────────────────────
  const currentName =
    navStack.length === 0
      ? "Compartilhados comigo"
      : navStack[navStack.length - 1].name;

  const isSearching = debouncedQuery.length > 0;
  const activeItems = isSearching ? searchResults : items;
  const activeLoading = isSearching ? searchLoading : loading;
  const activeError = isSearching ? searchError : error;

  const videoCount = activeItems.filter((i) => i.type === "video").length;
  const folderCount = activeItems.filter((i) => i.type === "folder").length;

  return (
    <>
      <Head>
        <title>
          {isSearching
            ? `Busca: ${debouncedQuery} — OneDrive Vídeos`
            : navStack.length > 0
            ? `${currentName} — OneDrive Vídeos`
            : "OneDrive Vídeos"}
        </title>
      </Head>

      <div className="app-container">
        {/* Header */}
        <header className="header">
          <div className="header-logo">
            <div className="header-logo-icon">
              <BrandPlayIcon size={16} />
            </div>
            <span>ICM Vídeos</span>
            <span className="header-logo-tag">DER-MG</span>
          </div>

          <div className="header-search" role="search">
            <span className="header-search-icon" aria-hidden="true">
              <SearchSvgIcon />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              className="header-search-input"
              placeholder={
                navStack.length === 0
                  ? "Buscar vídeos ou pastas em todos os lotes…"
                  : `Buscar em "${currentName}"…`
              }
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && searchInput) {
                  e.stopPropagation();
                  clearSearch();
                }
              }}
              aria-label="Buscar vídeos ou pastas"
            />
            {searchInput && (
              <button
                type="button"
                className="header-search-clear"
                onClick={() => {
                  clearSearch();
                  searchInputRef.current?.focus();
                }}
                aria-label="Limpar busca"
              >
                <CloseSvgIcon size={13} />
              </button>
            )}
          </div>

          <div className="header-actions">
            <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
            <button
              className="btn btn-ghost"
              onClick={isSearching ? loadSearchResults : loadItems}
              disabled={activeLoading}
              aria-label="Atualizar lista"
            >
              <RefreshSvgIcon spinning={activeLoading} />
              <span>Atualizar</span>
            </button>
            <a href="/api/auth/logout">
              <button className="btn btn-danger">Sair</button>
            </a>
          </div>
        </header>

        {/* Conteúdo */}
        <main className="main-content">

          {/* Breadcrumb */}
          <nav className="breadcrumb" aria-label="Navegação de pastas">
            <div className={`breadcrumb-item ${navStack.length === 0 && !isSearching ? "active" : ""}`}>
              {navStack.length === 0 && !isSearching ? (
                <span>
                  <HomeSvgIcon />
                  Início
                </span>
              ) : (
                <button onClick={() => handleBreadcrumbClick(-1)}>
                  <HomeSvgIcon />
                  Início
                </button>
              )}
            </div>

            {navStack.map((entry, i) => {
              const isLastAndNotSearching = i === navStack.length - 1 && !isSearching;
              return (
                <div key={`${entry.id}-${i}`} className="breadcrumb-group">
                  <span className="breadcrumb-sep" aria-hidden="true">
                    <ChevronRightSvgIcon />
                  </span>
                  <div className={`breadcrumb-item ${isLastAndNotSearching ? "active" : ""}`}>
                    {!isLastAndNotSearching ? (
                      <button onClick={() => handleBreadcrumbClick(i)}>
                        {entry.name}
                      </button>
                    ) : (
                      <span>{entry.name}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {isSearching && (
              <div className="breadcrumb-group">
                <span className="breadcrumb-sep" aria-hidden="true">
                  <ChevronRightSvgIcon />
                </span>
                <div className="breadcrumb-item active">
                  <span>
                    <SearchSvgIcon />
                    Busca: &ldquo;{debouncedQuery}&rdquo;
                  </span>
                </div>
              </div>
            )}
          </nav>

          {/* Erro */}
          {activeError && !activeLoading && (
            <div className="error-banner">
              <AlertSvgIcon />
              <span>{activeError}</span>
              <button
                className="btn btn-ghost"
                onClick={isSearching ? loadSearchResults : loadItems}
                style={{ marginLeft: "auto", flexShrink: 0 }}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Loading */}
          {activeLoading && (
            <div className="loading-state">
              <div className="spinner" />
              <span>
                {isSearching
                  ? `Buscando "${debouncedQuery}" em ${navStack.length === 0 ? "todos os lotes" : `"${currentName}"`}…`
                  : `Carregando ${navStack.length === 0 ? "itens compartilhados" : `"${currentName}"`}…`}
              </span>
            </div>
          )}

          {/* Itens (Modo Busca ou Modo Navegação Pasta a Pasta) */}
          {!activeLoading && !activeError && (
            <>
              {activeItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    {isSearching ? <SearchSvgIcon /> : <FolderSvgIcon />}
                  </div>
                  <div className="empty-title">
                    {isSearching
                      ? `Nenhum resultado para "${debouncedQuery}"`
                      : "Nenhum item encontrado"}
                  </div>
                  <div className="empty-sub">
                    {isSearching
                      ? navStack.length > 0
                        ? `Nenhum vídeo ou pasta encontrado dentro de "${currentName}".`
                        : "Tente buscar por outro nome de vídeo, trecho, rodovia ou lote."
                      : navStack.length === 0
                      ? "Não há arquivos ou pastas compartilhados com você ainda."
                      : "Esta pasta está vazia."}
                  </div>
                  {isSearching && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={clearSearch}
                      style={{ marginTop: 8 }}
                    >
                      Limpar busca e voltar
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="section-header">
                    <span className="section-title">
                      {isSearching
                        ? `Resultados para "${debouncedQuery}" ${
                            navStack.length > 0 ? `em ${currentName}` : "(todos os lotes)"
                          }`
                        : navStack.length === 0
                        ? "Compartilhados comigo"
                        : currentName}
                    </span>
                    <div className="section-header-right">
                      {isSearching && (
                        <button
                          type="button"
                          className="btn-clear-inline"
                          onClick={clearSearch}
                        >
                          <span>Limpar busca</span>
                          <CloseSvgIcon size={11} />
                        </button>
                      )}
                      <span className="item-count">
                        {folderCount > 0 && `${folderCount} pasta${folderCount !== 1 ? "s" : ""}`}
                        {folderCount > 0 && videoCount > 0 && " · "}
                        {videoCount > 0 && `${videoCount} vídeo${videoCount !== 1 ? "s" : ""}`}
                        {folderCount === 0 && videoCount === 0 && `${activeItems.length} ite${activeItems.length !== 1 ? "ns" : "m"}`}
                      </span>
                    </div>
                  </div>

                  <div className="items-grid">
                    {activeItems.map((item, idx) => (
                      <ItemCard
                        key={`${item.driveId}:${item.id}`}
                        item={item}
                        index={idx}
                        onClick={handleItemClick}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>

      {/* Modal de vídeo */}
      {playingVideo && (
        <VideoModal
          video={playingVideo}
          onClose={() => setPlayingVideo(null)}
        />
      )}
    </>
  );
}
