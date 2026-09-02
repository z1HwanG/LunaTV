/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { getRequestContext } from '@cloudflare/next-on-pages';

import { AdminConfig } from './admin.types';
import { hashPassword, isHashed, verifyPassword } from './password';
import { Favorite, IStorage, PlayRecord, SkipConfig } from './types';

// 搜索历史最大条数
const SEARCH_HISTORY_LIMIT = 20;

// KV 键前缀常量
const KV_PREFIX = {
  userPassword: (username: string) => `user:${username}:password`,
  searchHistory: (username: string) => `user:${username}:search_history`,
  playRecord: (username: string, key: string) =>
    `user:${username}:play_record:${key}`,
  allPlayRecords: (username: string) => `user:${username}:play_record:`,
  favorite: (username: string, key: string) =>
    `user:${username}:favorite:${key}`,
  allFavorites: (username: string) => `user:${username}:favorite:`,
  skipConfig: (username: string, source: string, id: string) =>
    `user:${username}:skip_config:${source}:${id}`,
  allSkipConfigs: (username: string) => `user:${username}:skip_config:`,
  adminConfig: 'admin_config',
  users: 'users',
};

// 获取 KV 命名空间
function getKV(): KVNamespace | null {
  try {
    const ctx = getRequestContext();
    return (ctx.env as any).MOONTV_KV as KVNamespace;
  } catch {
    // 在构建环境或非请求上下文时返回 null
    return null;
  }
}

// 确保 KV 可用
function ensureKV(): KVNamespace {
  const kv = getKV();
  if (!kv) {
    throw new Error('KV namespace not available (not in request context)');
  }
  return kv;
}

// 带重试的 KV 操作包装器
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      const isLastAttempt = i === maxRetries - 1;
      const isConnectionError =
        err.message?.includes('Connection') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('timeout') ||
        err.message?.includes('TIMEOUT') ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('5300');

      if (isLastAttempt || !isConnectionError) {
        throw err;
      }

      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      console.warn(
        `KV operation failed, retrying in ${delay}ms... (attempt ${i + 1}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unexpected: retry loop exited without returning');
}

export class KVStorage implements IStorage {
  // ==================== 播放记录 ====================

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const kv = ensureKV();
    const data = await withRetry(() =>
      kv.get(KV_PREFIX.playRecord(userName, key), 'json')
    );
    return data as PlayRecord | null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    const kv = ensureKV();
    await withRetry(() =>
      kv.put(KV_PREFIX.playRecord(userName, key), JSON.stringify(record))
    );
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<{ [key: string]: PlayRecord }> {
    const kv = ensureKV();
    const prefix = KV_PREFIX.allPlayRecords(userName);
    const result: { [key: string]: PlayRecord } = {};

    let cursor: string | undefined;
    do {
      const listResult = await withRetry(() =>
        kv.list({ prefix, cursor })
      );
      for (const key of listResult.keys) {
        const value = await withRetry(() =>
          kv.get(key.name, 'json')
        );
        if (value) {
          // 从 key 中提取原始标识符（去掉前缀部分）
          const recordKey = key.name.substring(prefix.length);
          result[recordKey] = value as PlayRecord;
        }
      }
      cursor = listResult.cursor;
    } while (cursor);

    return result;
  }

  async deletePlayRecord(
    userName: string,
    key: string
  ): Promise<void> {
    const kv = ensureKV();
    await withRetry(() =>
      kv.delete(KV_PREFIX.playRecord(userName, key))
    );
  }

  async deleteAllPlayRecords(userName: string): Promise<void> {
    const kv = ensureKV();
    const prefix = KV_PREFIX.allPlayRecords(userName);

    let cursor: string | undefined;
    do {
      const listResult = await withRetry(() =>
        kv.list({ prefix, cursor })
      );
      if (listResult.keys.length > 0) {
        await withRetry(() =>
          kv.delete(listResult.keys.map((k) => k.name))
        );
      }
      cursor = listResult.cursor;
    } while (cursor);
  }

  // ==================== 收藏 ====================

  async getFavorite(
    userName: string,
    key: string
  ): Promise<Favorite | null> {
    const kv = ensureKV();
    const data = await withRetry(() =>
      kv.get(KV_PREFIX.favorite(userName, key), 'json')
    );
    return data as Favorite | null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    const kv = ensureKV();
    await withRetry(() =>
      kv.put(KV_PREFIX.favorite(userName, key), JSON.stringify(favorite))
    );
  }

  async getAllFavorites(
    userName: string
  ): Promise<{ [key: string]: Favorite }> {
    const kv = ensureKV();
    const prefix = KV_PREFIX.allFavorites(userName);
    const result: { [key: string]: Favorite } = {};

    let cursor: string | undefined;
    do {
      const listResult = await withRetry(() =>
        kv.list({ prefix, cursor })
      );
      for (const key of listResult.keys) {
        const value = await withRetry(() =>
          kv.get(key.name, 'json')
        );
        if (value) {
          const recordKey = key.name.substring(prefix.length);
          result[recordKey] = value as Favorite;
        }
      }
      cursor = listResult.cursor;
    } while (cursor);

    return result;
  }

  async deleteFavorite(
    userName: string,
    key: string
  ): Promise<void> {
    const kv = ensureKV();
    await withRetry(() =>
      kv.delete(KV_PREFIX.favorite(userName, key))
    );
  }

  async deleteAllFavorites(userName: string): Promise<void> {
    const kv = ensureKV();
    const prefix = KV_PREFIX.allFavorites(userName);

    let cursor: string | undefined;
    do {
      const listResult = await withRetry(() =>
        kv.list({ prefix, cursor })
      );
      if (listResult.keys.length > 0) {
        await withRetry(() =>
          kv.delete(listResult.keys.map((k) => k.name))
        );
      }
      cursor = listResult.cursor;
    } while (cursor);
  }

  // ==================== 用户管理 ====================

  async registerUser(
    userName: string,
    password: string
  ): Promise<void> {
    const kv = ensureKV();
    const hashed = hashPassword(password);
    await withRetry(() =>
      kv.put(KV_PREFIX.userPassword(userName), hashed)
    );
    // 添加到用户列表
    const users = await this.getAllUsers();
    if (!users.includes(userName)) {
      users.push(userName);
      await withRetry(() =>
        kv.put(KV_PREFIX.users, JSON.stringify(users))
      );
    }
  }

  async verifyUser(
    userName: string,
    password: string
  ): Promise<boolean> {
    const kv = ensureKV();
    const stored = await withRetry(() =>
      kv.get(KV_PREFIX.userPassword(userName))
    );
    if (!stored) return false;
    return verifyPassword(password, stored);
  }

  async checkUserExist(userName: string): Promise<boolean> {
    const kv = ensureKV();
    const stored = await withRetry(() =>
      kv.get(KV_PREFIX.userPassword(userName))
    );
    return stored !== null;
  }

  async changePassword(
    userName: string,
    newPassword: string
  ): Promise<void> {
    const kv = ensureKV();
    const hashed = hashPassword(newPassword);
    await withRetry(() =>
      kv.put(KV_PREFIX.userPassword(userName), hashed)
    );
  }

  async deleteUser(userName: string): Promise<void> {
    const kv = ensureKV();

    // 删除密码
    await withRetry(() =>
      kv.delete(KV_PREFIX.userPassword(userName))
    );

    // 删除搜索历史
    await withRetry(() =>
      kv.delete(KV_PREFIX.searchHistory(userName))
    );

    // 删除所有播放记录
    await this.deleteAllPlayRecords(userName);

    // 删除所有收藏
    await this.deleteAllFavorites(userName);

    // 从用户列表中移除
    const users = await this.getAllUsers();
    const filtered = users.filter((u) => u !== userName);
    if (filtered.length !== users.length) {
      await withRetry(() =>
        kv.put(KV_PREFIX.users, JSON.stringify(filtered))
      );
    }
  }

  // ==================== 搜索历史 ====================

  async getSearchHistory(userName: string): Promise<string[]> {
    const kv = ensureKV();
    const data = await withRetry(() =>
      kv.get(KV_PREFIX.searchHistory(userName), 'json')
    );
    return (data as string[]) || [];
  }

  async addSearchHistory(
    userName: string,
    keyword: string
  ): Promise<void> {
    const kv = ensureKV();
    const history = await this.getSearchHistory(userName);
    // 去重：如果已存在相同关键词，先移除
    const filtered = history.filter((item) => item !== keyword);
    filtered.unshift(keyword);
    // 限制数量
    if (filtered.length > SEARCH_HISTORY_LIMIT) {
      filtered.length = SEARCH_HISTORY_LIMIT;
    }
    await withRetry(() =>
      kv.put(KV_PREFIX.searchHistory(userName), JSON.stringify(filtered))
    );
  }

  async deleteSearchHistory(
    userName: string,
    keyword?: string
  ): Promise<void> {
    const kv = ensureKV();
    if (keyword) {
      // 删除指定关键词
      const history = await this.getSearchHistory(userName);
      const filtered = history.filter((item) => item !== keyword);
      await withRetry(() =>
        kv.put(
          KV_PREFIX.searchHistory(userName),
          JSON.stringify(filtered)
        )
      );
    } else {
      // 清空所有搜索历史
      await withRetry(() =>
        kv.delete(KV_PREFIX.searchHistory(userName))
      );
    }
  }

  // ==================== 用户列表 ====================

  async getAllUsers(): Promise<string[]> {
    const kv = ensureKV();
    const data = await withRetry(() =>
      kv.get(KV_PREFIX.users, 'json')
    );
    return (data as string[]) || [];
  }

  // ==================== 管理员配置 ====================

  async getAdminConfig(): Promise<AdminConfig | null> {
    const kv = ensureKV();
    const data = await withRetry(() =>
      kv.get(KV_PREFIX.adminConfig, 'json')
    );
    return data as AdminConfig | null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    const kv = ensureKV();
    await withRetry(() =>
      kv.put(KV_PREFIX.adminConfig, JSON.stringify(config))
    );
  }

  // ==================== 跳过片头片尾配置 ====================

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<SkipConfig | null> {
    const kv = ensureKV();
    const data = await withRetry(() =>
      kv.get(KV_PREFIX.skipConfig(userName, source, id), 'json')
    );
    return data as SkipConfig | null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void> {
    const kv = ensureKV();
    await withRetry(() =>
      kv.put(
        KV_PREFIX.skipConfig(userName, source, id),
        JSON.stringify(config)
      )
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const kv = ensureKV();
    await withRetry(() =>
      kv.delete(KV_PREFIX.skipConfig(userName, source, id))
    );
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: SkipConfig }> {
    const kv = ensureKV();
    const prefix = KV_PREFIX.allSkipConfigs(userName);
    const result: { [key: string]: SkipConfig } = {};

    let cursor: string | undefined;
    do {
      const listResult = await withRetry(() =>
        kv.list({ prefix, cursor })
      );
      for (const key of listResult.keys) {
        const value = await withRetry(() =>
          kv.get(key.name, 'json')
        );
        if (value) {
          const recordKey = key.name.substring(prefix.length);
          result[recordKey] = value as SkipConfig;
        }
      }
      cursor = listResult.cursor;
    } while (cursor);

    return result;
  }

  // ==================== 数据清理 ====================

  async clearAllData(): Promise<void> {
    const kv = ensureKV();
    // 列出所有 key 并删除
    let cursor: string | undefined;
    do {
      const listResult = await withRetry(() =>
        kv.list({ cursor })
      );
      if (listResult.keys.length > 0) {
        await withRetry(() =>
          kv.delete(listResult.keys.map((k) => k.name))
        );
      }
      cursor = listResult.cursor;
    } while (cursor);
  }

  // ==================== 迁移（不需要） ====================

  async migrateData(): Promise<void> {
    // KV 存储不需要迁移
    console.log('KV storage: no migration needed');
  }

  async migratePasswords(): Promise<void> {
    // KV 存储直接使用哈希存储，无需迁移
    console.log('KV storage: password migration not needed');
  }
}