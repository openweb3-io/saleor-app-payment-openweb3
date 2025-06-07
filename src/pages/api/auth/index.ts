import { validate, parse } from "@telegram-apps/init-data-node";
import { type NextApiRequest, type NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { createAdminSaleorClient } from "@/modules/saleor";
import { TOKEN_CREATE_MUTATION, CUSTOMER_QUERY } from "@/modules/saleor/graphql";

// Define whitelist array
const WHITELIST_PLATFORMS = ["app.saleor.openweb3"];

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

  // 注册页面地址
  const REGISTER_URL = `https://${process.env.SALEOR_SESSION_DOMAIN}/register`;

  // 检查请求来源
  const origin = req.headers.origin;
  if (origin === REGISTER_URL) {
    return res.status(200).json({
      code: 0,
      message: "Success from register page",
      data: {
        isRegisterPage: true,
      },
    });
  }

  try {
    // Check if platform is in whitelist
    const platform = req.headers["platform"] as string;
    if (!platform || !WHITELIST_PLATFORMS.includes(platform)) {
      return res.status(403).json({ error: "Invalid platform" });
    }

    const { initDataRaw } = req.body;

    if (!initDataRaw) {
      return res.status(400).json({ error: "Missing initDataRaw parameter" });
    }

    // Verify Telegram parameters
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN || "");

    // Parse data
    const parsedData = parse(initDataRaw);
    const { user, startParam } = parsedData;

    // Create Saleor GraphQL client
    const adminSaleorClient = await createAdminSaleorClient();

    const password = `${process.env.SALEOR_USER_PASSWORD}${user?.id}`;

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
      [`${process.env.SALEOR_API_URL}+saleor_auth_module_refresh_token`, tokenCreate.refreshToken],
      [`${process.env.SALEOR_API_URL}+saleor_auth_access_token`, tokenCreate.token],
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
    console.error("Authentication error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}
