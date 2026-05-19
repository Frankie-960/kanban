import axios, { AxiosInstance } from 'axios';

export type Ctx = { baseUrl: string; token: string };

function client(ctx: Ctx): AxiosInstance {
  return axios.create({
    baseURL: `${ctx.baseUrl.replace(/\/+$/, '')}/api`,
    headers: { Authorization: `Bearer ${ctx.token}` },
    timeout: 15000,
    validateStatus: () => true,
  });
}

async function unwrap(p: Promise<any>): Promise<any> {
  try {
    const r = await p;
    if (r.status >= 200 && r.status < 300) return r.data;
    return { error: r.status, detail: r.data };
  } catch (e: any) {
    return { error: 'NETWORK', detail: e?.message ?? String(e) };
  }
}

export const kanbanGet   = (ctx: Ctx, path: string, params?: Record<string, unknown>) =>
  unwrap(client(ctx).get(path, { params }));
export const kanbanPost  = (ctx: Ctx, path: string, body?: unknown) =>
  unwrap(client(ctx).post(path, body));
export const kanbanPut   = (ctx: Ctx, path: string, body?: unknown) =>
  unwrap(client(ctx).put(path, body));
export const kanbanPatch = (ctx: Ctx, path: string, body?: unknown) =>
  unwrap(client(ctx).patch(path, body));
