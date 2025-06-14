import { type NextApiRequest, type NextApiResponse } from "next";
import { createAdminSaleorClient } from "@/modules/saleor";
import { ACCOUNT_REGISTER_MUTATION, USER_QUERY } from "@/modules/saleor/graphql";
import { emailVerificationStore } from "@/utils/emailVerification";
import { handleOptions, handleParseInitData, handlePlatform, setCorsHeaders } from "@/lib/openweb3";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers
  setCorsHeaders(res);

  // Handle OPTIONS request
  handleOptions(req, res);

  try {
    const platform = handlePlatform(req, res);

    const parsedData = await handleParseInitData(req, res)!;
    const { user } = parsedData || {};

    const { email, code } = req.body as {
      email: string;
      code: string;
    };

    const userId = user?.id?.toString();

    if (!email) {
      return res.status(200).json({ message: "Missing email parameter", code: -1 });
    }

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
    const accountRegister = createData?.accountRegister;
    if (createError || !accountRegister || accountRegister.errors?.length) {
      console.error("Create user error:", createError);
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
