import { type NextApiRequest, type NextApiResponse } from "next";
import nodemailer from "nodemailer";
import { validate, parse } from "@telegram-apps/init-data-node";
import { emailVerificationStore } from "@/utils/emailVerification";
import { createAdminSaleorClient } from "@/modules/saleor";
import { USER_QUERY } from "@/modules/saleor/graphql";

// Define whitelist array
const WHITELIST_PLATFORMS = ["app.saleor.openweb3"];

// Set CORS headers
const setCorsHeaders = (res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", `https://${process.env.SALEOR_SESSION_DOMAIN}`);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, platform");
  res.setHeader("Access-Control-Allow-Credentials", "true");
};

// 创建邮件传输器
const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVER,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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

    const { initDataRaw, email } = req.body as {
      initDataRaw: string;
      email: string;
    };

    if (!initDataRaw) {
      return res.status(200).json({ message: "Missing initDataRaw parameter", code: -1 });
    }

    if (!email) {
      return res.status(200).json({ message: "Missing email parameter", code: -1 });
    }

    // Verify Telegram parameters
    validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN || "");

    // Parse data
    const parsedData = parse(initDataRaw);
    const { user } = parsedData;

    if (!user?.id) {
      return res.status(200).json({ message: "Invalid user data", code: -1 });
    }

    const userId = user.id.toString();

    // 创建 Saleor GraphQL client
    const adminSaleorClient = await createAdminSaleorClient();

    // 检查邮箱是否已被绑定
    const { data: userData } = await adminSaleorClient
      .query(USER_QUERY, {
        email: email,
      })
      .toPromise();

    const saleorUser = userData?.user;

    if (saleorUser) {
      return res.status(200).json({
        code: -1,
        message: "The email address has been bound",
      });
    }

    // 生成并存储验证码
    const verificationCode = emailVerificationStore.addVerificationCode(email, userId);

    // 发送邮件
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: "Saleor User Verification",
      html: `
        <h1>Saleor User Verification</h1>
        <p>Your verification code is: <strong>${verificationCode}</strong></p>
        <p>The verification code will expire in 10 minutes.</p>
      `,
    });

    console.log(`send email to ${email} with code ${verificationCode}`);

    res.status(200).json({ message: null, code: 0 });
  } catch (error) {
    console.error("Failed to send email:", error);
    res.status(200).json({ message: "Failed to send email", code: -1 });
  }
}
