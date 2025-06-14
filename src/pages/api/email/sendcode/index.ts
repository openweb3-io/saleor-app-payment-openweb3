import { type NextApiRequest, type NextApiResponse } from "next";
import nodemailer from "nodemailer";
import { emailVerificationStore } from "@/utils/emailVerification";
import { createAdminSaleorClient } from "@/modules/saleor";
import { USER_QUERY } from "@/modules/saleor/graphql";
import { handleOptions, handleParseInitData, setCorsHeaders } from "@/lib/openweb3";

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
  handleOptions(req, res);

  try {
    const parsedData = await handleParseInitData(req, res)!;
    const { user } = parsedData || {};

    const { email } = req.body as {
      email: string;
    };

    if (!email) {
      return res.status(200).json({ message: "Missing email parameter", code: -1 });
    }

    // 创建 Saleor GraphQL client
    const adminSaleorClient = await createAdminSaleorClient();

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
