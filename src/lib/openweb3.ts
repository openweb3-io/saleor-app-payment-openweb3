import { type InitData, validate, parse } from "@telegram-apps/init-data-node";
import { type NextApiRequest, type NextApiResponse } from "next";

// Set CORS headers
export const setCorsHeaders = (res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", `https://${process.env.SALEOR_SESSION_DOMAIN}`);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, platform");
  res.setHeader("Access-Control-Allow-Credentials", "true");
};

export const handleOptions = (req: NextApiRequest, res: NextApiResponse) => {
  // Handle OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  console.log("req.method=", req.method);
  if (req.method !== "POST") {
    return res.status(200).json({ message: "Method not allowed", code: -1 });
  }
};

export const handleParseInitData = async (
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<InitData | void> => {
  const initDataRaw = req.body.initDataRaw;
  if (!initDataRaw) {
    return res.status(200).json({ message: "Missing initDataRaw parameter", code: -1 });
  }
  // Verify Telegram parameters
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN || "");
  // Parse data
  const parsedData = parse(initDataRaw);

  return parsedData;
};

export const handlePlatform = (req: NextApiRequest, res: NextApiResponse) => {
  // Define whitelist array
  const WHITELIST_PLATFORMS = ["app.saleor.openweb3"];
  // Check if platform is in whitelist
  const platform = req.headers["platform"] as string;
  if (!platform || !WHITELIST_PLATFORMS.includes(platform)) {
    return res.status(200).json({ message: "Invalid platform", code: -1 });
  }

  return platform;
};
