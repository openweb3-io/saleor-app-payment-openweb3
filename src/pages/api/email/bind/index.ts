import { validate, parse } from "@telegram-apps/init-data-node";
import { type NextApiRequest, type NextApiResponse } from "next";
import { createAdminSaleorClient } from "@/modules/saleor";
import { ACCOUNT_REGISTER_MUTATION, USER_QUERY } from "@/modules/saleor/graphql";
import { emailVerificationStore } from "@/utils/emailVerification";

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

  if (req.method !== "POST") {
    setCorsHeaders(res);
    return res.status(200).json({ message: "Method not allowed", code: -1 });
  }

  try {
    // Check if platform is in whitelist
    const platform = req.headers["platform"] as string;
    if (!platform || !WHITELIST_PLATFORMS.includes(platform)) {
      return res.status(200).json({ message: "Invalid platform", code: -1 });
    }

    const { initDataRaw, email, code } = req.body as {
      initDataRaw: string;
      email: string;
      code: string;
    };

    if (!initDataRaw) {
      return res.status(200).json({ message: "Missing initDataRaw parameter", code: -1 });
    }

    if (!email || !code) {
      return res.status(200).json({ message: "Missing email or verification code", code: -1 });
    }

    // Verify Telegram parameters
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN || "");

    // Parse data
    const parsedData = parse(initDataRaw);
    const { user } = parsedData;

    if (!user?.id) {
      return res.status(200).json({ message: "Invalid user data", code: -1 });
    }

    const userId = user.id.toString();

    // 验证验证码
    const isValid = emailVerificationStore.verifyCode(email, code, userId);

    if (!isValid) {
      return res.status(200).json({
        message: "Invalid or expired verification code, please request a new one",
        code: -1,
      });
    }

    // 验证成功后从内存中移除该邮箱
    emailVerificationStore.removeEmail(email);

    // Create Saleor GraphQL client
    const adminSaleorClient = await createAdminSaleorClient();

    const password = `${process.env.SALEOR_USER_PASSWORD}${user?.id}`;

    // Check if user exists
    const { data: userData } = await adminSaleorClient
      .query(USER_QUERY, {
        email: email,
      })
      .toPromise();

    const saleorUser = userData?.user;

    console.log("saleorUser=", saleorUser);

    // If user doesn't exist, create new user
    if (saleorUser) {
      return res.status(200).json({
        code: -1,
        message: "User already exists",
      });
    }

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
      return res.status(200).json({ message: "Failed to create user", code: -1 });
    }

    const accountRegister = createData?.accountRegister;
    if (!accountRegister || accountRegister.errors?.length) {
      console.error("Create user error:", accountRegister?.errors);
      return res.status(200).json({ message: "Failed to create user", code: -1 });
    }

    return res.status(200).json({
      code: 0,
      message: "success",
    });
  } catch (error) {
    console.log("----- process.env start-----");
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
    console.error("Bind email error:", error);
    return res.status(200).json({ message: "Bind email failed", code: -1 });
  }
}
