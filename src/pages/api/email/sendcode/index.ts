import { type NextApiRequest, type NextApiResponse } from "next";
import nodemailer from "nodemailer";
import { validate, parse } from "@telegram-apps/init-data-node";
import { emailVerificationStore } from "@/utils/emailVerification";
import { createAdminSaleorClient } from "@/modules/saleor";
import { USER_QUERY } from "@/modules/saleor/graphql";
import { setCorsHeaders, WHITELIST_PLATFORMS } from "@/lib/openweb3";

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN || "");
    // 创建 Saleor GraphQL client
    const adminSaleorClient = await createAdminSaleorClient();

    // Parse data
    const { user } = parse(initDataRaw);
    const userId = user?.id?.toString();
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
    const verificationCode = emailVerificationStore.addVerificationCode(email, userId!);

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
