/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly HEARTH_WEB_API_BASE?: string;
  readonly HEARTH_WEB_MAX_HIGHLIGHT_CHARS?: string;
  readonly HEARTH_WEB_PARALLEL_UPLOADS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
