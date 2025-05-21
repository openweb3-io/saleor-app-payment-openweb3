import { validate, parse } from "@telegram-apps/init-data-node";
import { type NextApiRequest, type NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { createAdminSaleorClient } from "@/modules/saleor";
import {
  ACCOUNT_REGISTER_MUTATION,
  USER_QUERY,
  TOKEN_CREATE_MUTATION,
} from "@/modules/saleor/graphql";

// Define whitelist array
const WHITELIST_PLATFORMS = ["app.saleor.openweb3"];

// Set CORS headers
const setCorsHeaders = (res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.SALEOR_HEADER_ORIGIN! || "*");
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

    const email = `${user?.id}@openweb3.com`;

    const password = `${process.env.SALEOR_USER_PASSWORD}${user?.id}`;

    // Check if user exists
    const { data: userData } = await adminSaleorClient
      .query(USER_QUERY, {
        email: email,
      })
      .toPromise();

    let saleorUser = userData?.user;

    console.log("saleorUser=", saleorUser);

    // If user doesn't exist, create new user
    if (!saleorUser) {
      console.log("createData start");

      const { data: createData, error: createError } = await adminSaleorClient
        .mutation(ACCOUNT_REGISTER_MUTATION, {
          input: {
            email: email,
            firstName: user?.firstName || "",
            lastName: user?.lastName || "",
            password: password,
            metadata: [
              {
                key: "userId",
                value: user?.id.toString(),
              },
              {
                key: "userName",
                value: user?.username || "",
              },
              {
                key: "platform",
                value: platform,
              },
            ],
          },
        })
        .toPromise();

      console.log("createData end", createData);

      if (createError) {
        console.error("Create user error:", createError);
        return res.status(500).json({ error: "Failed to create user" });
      }

      const accountRegister = createData?.accountRegister;
      if (!accountRegister || accountRegister.errors?.length) {
        console.error("Create user error:", accountRegister?.errors);
        return res.status(500).json({ error: "Failed to create user" });
      }

      saleorUser = accountRegister.user;
    }

    // Get user token
    const { data: tokenData, error: tokenError } = await adminSaleorClient
      .mutation(TOKEN_CREATE_MUTATION, {
        email: email,
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
