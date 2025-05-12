import { validate, parse } from "@telegram-apps/init-data-node";
import { type NextApiRequest, type NextApiResponse } from "next";
import jwt from "jsonwebtoken";

// 定义白名单数组
const WHITELIST_PLATFORMS = ["app.saleor.openweb3"];

// 设置 CORS 头信息
const setCorsHeaders = (res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, platform");
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 设置 CORS 头信息
  setCorsHeaders(res);

  // 处理 OPTIONS 请求
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    setCorsHeaders(res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 检查 platform 是否在白名单中
    const platform = req.headers["platform"] as string;
    if (!platform || !WHITELIST_PLATFORMS.includes(platform)) {
      return res.status(403).json({ error: "Invalid platform" });
    }

    const { initDataRaw } = req.body;

    if (!initDataRaw) {
      return res.status(400).json({ error: "Missing initDataRaw parameter" });
    }

    // 验证 Telegram 参数
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN || "");

    // 解析数据
    const parsedData = parse(initDataRaw);
    const { user, startParam } = parsedData;

    // 创建 JWT token
    const token = jwt.sign(
      {
        id: user?.id.toString(),
        username: user?.username,
        first_name: user?.firstName,
        last_name: user?.lastName,
        photo_url: user?.photoUrl,
        startParam,
      },
      process.env.TELEGRAM_BOT_TOKEN!,
      { expiresIn: "1d" },
    );

    // 设置 cookie
    res.setHeader(
      "Set-Cookie",
      `openweb3-walletpay=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`,
    );

    return res.status(200).json({
      code: 0,
      message: "success",
      data: parsedData,
    });
  } catch (error) {
    console.error("Telegram validation error:", error);
    return res.status(500).json({ error: "Validate initData error" });
  }
}
