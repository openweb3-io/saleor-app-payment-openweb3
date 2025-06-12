interface VerificationCode {
  code: string;
  userId: string;
  expiresAt: number;
}

class EmailVerificationStore {
  private store: Map<string, VerificationCode> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 启动定时清理任务
    this.startCleanupTask();
  }

  // 生成6位数字验证码
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // 添加新的验证码
  public addVerificationCode(email: string, userId: string): string {
    // 移除旧的验证码
    this.store.delete(email);

    const code = this.generateCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10分钟后过期

    this.store.set(email, {
      code,
      userId,
      expiresAt,
    });

    return code;
  }

  // 验证验证码
  public verifyCode(email: string, code: string, userId: string): boolean {
    const verification = this.store.get(email);
    if (!verification) return false;

    // 验证userId和验证码是否匹配，以及是否过期
    if (
      verification.userId !== userId ||
      verification.code !== code ||
      Date.now() > verification.expiresAt
    ) {
      this.store.delete(email);
      return false;
    }

    return true;
  }

  // 获取用户ID
  public getUserId(email: string): string | null {
    const verification = this.store.get(email);
    return verification ? verification.userId : null;
  }

  // 移除邮箱验证码
  public removeEmail(email: string): void {
    this.store.delete(email);
  }

  // 清理过期验证码
  private cleanupExpiredCodes() {
    const now = Date.now();
    for (const [email, verification] of this.store.entries()) {
      if (now > verification.expiresAt) {
        this.store.delete(email);
      }
    }
  }

  // 启动定时清理任务
  private startCleanupTask() {
    console.log("startCleanupTask");
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCodes();
    }, 60 * 1000); // 每60秒清理一次
  }

  // 停止定时清理任务
  public stopCleanupTask() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// 创建单例实例
let instance: EmailVerificationStore | null = null;

export const emailVerificationStore = (() => {
  if (!instance) {
    instance = new EmailVerificationStore();
  }
  return instance;
})();
