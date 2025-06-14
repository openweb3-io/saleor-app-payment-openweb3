import { type NextApiRequest, type NextApiResponse } from "next";
import { validate, parse } from "@telegram-apps/init-data-node";
import { createAdminSaleorClient } from "@/modules/saleor";
import { ACCOUNT_REGISTER_MUTATION, USER_QUERY } from "@/modules/saleor/graphql";
import { emailVerificationStore } from "@/utils/emailVerification";
import { setCorsHeaders, WHITELIST_PLATFORMS } from "@/lib/openweb3";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers
  setCorsHeaders(res);

  // Handle OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(200).json({ message: "Method not allowed", code: -1 });
  }

  // Check if platform is in whitelist
  const platform = req.headers["platform"] as string;
  if (!platform || !WHITELIST_PLATFORMS.includes(platform)) {
    return res.status(200).json({ message: "Invalid platform", code: -1 });
  }

  try {
    const { initDataRaw, email, code } = req.body as {
      initDataRaw: string;
      email: string;
      code: string;
    };

    if (!initDataRaw) {
      return res.status(200).json({ message: "Missing initDataRaw parameter", code: -1 });
    }
    if (!email) {
      return res.status(200).json({ message: "Missing email parameter", code: -1 });
    }
    // Verify Telegram parameters
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN || "");

    // Parse data
    const { user } = parse(initDataRaw);
    const userId = user?.id?.toString();
    console.log("email=", emailVerificationStore);
    // 验证验证码
    const isValid = emailVerificationStore.verifyCode(email, code, userId!);
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
    const password = `${process.env.SALEOR_USER_PASSWORD}${userId}`;
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
              value: userId,
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

    console.log("createData=", createData);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    console.error("Bind email error:", error);
    return res.status(200).json({ message: "Bind email failed", code: -1 });
  }
}
