import { validate, parse } from "@telegram-apps/init-data-node";
import { type NextApiRequest, type NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { createAdminSaleorClient } from "@/modules/saleor";
import {
  TOKEN_CREATE_MUTATION,
  CUSTOMER_QUERY,
  TOKEN_VERIFY_MUTATION,
} from "@/modules/saleor/graphql";

// Define whitelist array
const WHITELIST_PLATFORMS = ["app.saleor.openweb3"];

const ACCESS_TOKEN = `${process.env.SALEOR_API_URL}+saleor_auth_access_token`;
const REFRESH_TOKEN = `${process.env.SALEOR_API_URL}+saleor_auth_module_refresh_token`;

// Set CORS headers
const setCorsHeaders = (res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", `https://${process.env.SALEOR_SESSION_DOMAIN}`);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, platform");
  res.setHeader("Access-Control-Allow-Credentials", "true");
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers
  setCorsHeaders(res);

  // Handle OPTIONS request
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    return res.status(200).end();
  }
  console.log("req.method=", req.method);
  if (req.method !== "POST") {
    setCorsHeaders(res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Check if platform is in whitelist
    const platform = req.headers["platform"] as string;
    if (!platform || !WHITELIST_PLATFORMS.includes(platform)) {
      return res.status(403).json({ error: "Invalid platform" });
    }

    const initDataRaw = req.body.initDataRaw;

    if (!initDataRaw) {
      return res.status(400).json({ error: "Missing initDataRaw parameter" });
    }
    // Verify Telegram parameters
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN || "");
    // Parse data
    const parsedData = parse(initDataRaw);

    // 检查是否存在 refresh token
    const refreshToken = req.cookies[REFRESH_TOKEN];
    const accessToken = req.cookies[ACCESS_TOKEN];

    if (refreshToken && accessToken) {
      // 创建 Saleor GraphQL client
      const adminSaleorClient = await createAdminSaleorClient();

      // 验证 refresh token
      const { data: verifyData, error: verifyError } = await adminSaleorClient
        .mutation(TOKEN_VERIFY_MUTATION, {
          token: refreshToken,
        })
        .toPromise();

      console.log("verifyData=", verifyData);

      if (!verifyError && verifyData?.tokenVerify?.payload) {
        // token 有效，返回成功信息
        return res.status(200).json({
          code: 0,
          message: "success",
          data: {
            isValid: true,
          },
        });
      }
    }

    // Create Saleor GraphQL client
    const adminSaleorClient = await createAdminSaleorClient();

    // Checkout user
    const { user, startParam } = parsedData;
    const { data: customerData } = await adminSaleorClient
      .query(CUSTOMER_QUERY, {
        first: 20,
        filter: {
          metadata: [
            {
              key: "userId",
              value: `${user?.id}`,
            },
          ],
        },
        PERMISSION_MANAGE_ORDERS: true,
      })
      .toPromise();
    const saleorUser = customerData.customers.edges[0]?.node;

    // If user doesn't exist, create new user
    if (!saleorUser) {
      return res.status(200).json({
        code: 301,
        message: "User not found, redirect to register page",
        data: {
          isRedirect: true,
        },
      });
    }

    const password = `${process.env.SALEOR_USER_PASSWORD}${user?.id}`;
    // Get user token
    const { data: tokenData, error: tokenError } = await adminSaleorClient
      .mutation(TOKEN_CREATE_MUTATION, {
        email: saleorUser?.email,
        password: password,
      })
      .toPromise();

    if (tokenError) {
      console.error("Create token error:", tokenError);
      return res.status(500).json({ error: "Failed to create token" });
    }

    const tokenCreate = tokenData?.tokenCreate;
    if (!tokenCreate || tokenCreate.errors?.length) {
      console.error("Create token error:", tokenCreate?.errors);
      return res.status(500).json({ error: "Failed to create token" });
    }

    // Create JWT token
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

    console.log("token=", tokenCreate);

    // Set cookie
    const expires = new Date(Date.now() + 86400 * 1000).toUTCString();

    const formatCookie = (name: string, value: string) =>
      `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Domain=${process.env.SALEOR_SESSION_DOMAIN}; Secure; Expires=${expires}`;

    type CookieEntry = [string, string];

    const cookies: CookieEntry[] = [
      ["openweb3-walletpay", token],
      [`${process.env.SALEOR_API_URL}+saleor_auth_module_auth_state`, "signedIn"],
      [ACCESS_TOKEN, tokenCreate.token],
      [REFRESH_TOKEN, tokenCreate.refreshToken],
    ];

    res.setHeader(
      "Set-Cookie",
      cookies.map(([name, value]) => formatCookie(name, value)),
    );

    return res.status(200).json({
      code: 0,
      message: "success",
      data: {
        detail: parsedData,
        localStorage: cookies,
      },
    });
  } catch (error) {
    console.log("----- process.env start------");
    console.log("debug print")
    console.log("DEJAY_MINIAPP_URL: ", process.env.DEJAY_MINIAPP_URL);
    console.log("TELEGRAM_MINIAPP_URL: ", process.env.TELEGRAM_MINIAPP_URL);
    console.log("TELEGRAM_BOT_TOKEN: ", process.env.TELEGRAM_BOT_TOKEN);
    console.log("SALEOR_API_URL: ", process.env.SALEOR_API_URL);
    console.log("SALEOR_ADMIN_EMAIL: ", process.env.SALEOR_ADMIN_EMAIL);
    console.log("SALEOR_ADMIN_PASSWORD: ", process.env.SALEOR_ADMIN_PASSWORD);
    console.log("SALEOR_SESSION_DOMAIN: ", process.env.SALEOR_SESSION_DOMAIN);
    console.log("SALEOR_USER_PASSWORD: ", process.env.SALEOR_USER_PASSWORD);
    console.log("WALLET_PAY_WEBHOOK_PUBLIC_KEY: ", process.env.WALLET_PAY_WEBHOOK_PUBLIC_KEY);
    console.log("----- process.env end -----");
    console.error("Authentication error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}
