// Cloudflare Pages 环境变量类型声明
// 参考：https://developers.cloudflare.com/pages/platform/functions/bindings/

interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<string | null>;
  get(key: string, type: 'text'): Promise<string | null>;
  get(key: string, type: 'json'): Promise<any>;
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer>;
  get(key: string, type: 'stream'): Promise<ReadableStream>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expiration?: number; expirationTtl?: number; metadata?: any }): Promise<void>;
  delete(key: string): Promise<void>;
  delete(keys: string[]): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string; expiration?: number; metadata?: any }[]; cursor: string; list_complete: boolean }>;
}

interface PagesFunctionEnv {
  MOONTV_KV: KVNamespace;
}

// 声明 @cloudflare/next-on-pages 的 getRequestContext 返回类型
declare module '@cloudflare/next-on-pages' {
  interface RequestContext {
    env: PagesFunctionEnv;
    ctx: {
      waitUntil: (promise: Promise<void>) => void;
      passThroughOnException: () => void;
    };
    request: Request;
    next: (request: Request) => Promise<Response>;
  }

  export function getRequestContext(): RequestContext;
}