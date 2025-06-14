import { type NextApiRequest, type NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { createAdminSaleorClient } from "@/modules/saleor";
import {
  TOKEN_CREATE_MUTATION,
  CUSTOMER_QUERY,
  TOKEN_VERIFY_MUTATION,
} from "@/modules/saleor/graphql";
import { handleOptions, handleParseInitData, handlePlatform, setCorsHeaders } from "@/lib/openweb3";

const OPENWEB3_TOKEN = "openweb3-walletpay";
const ACCESS_TOKEN = `${process.env.SALEOR_API_URL}+saleor_auth_access_token`;
const REFRESH_TOKEN = `${process.env.SALEOR_API_URL}+saleor_auth_module_refresh_token`;
const AUTH_STATE = `${process.env.SALEOR_API_URL}+saleor_auth_module_auth_state`;

const formatRemoveCookie = (name: string) =>
  `${name}=; Path=/; HttpOnly; SameSite=Lax; Domain=${process.env.SALEOR_SESSION_DOMAIN}; Secure; Max-Age=0;`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers
  setCorsHeaders(res);

  // Handle OPTIONS request
  handleOptions(req, res);

  try {
    void handlePlatform(req, res);

    const parsedData = await handleParseInitData(req, res)!;

    // Create Saleor GraphQL client
    const adminSaleorClient = await createAdminSaleorClient();

    // Checkout user
    const { user, startParam } = parsedData || {};

    const userId = user?.id?.toString();

    const { data: customerData } = await adminSaleorClient
      .query(CUSTOMER_QUERY, {
        first: 20,
        filter: {
          metadata: [
            {
              key: "userId",
              value: userId,
            },
          ],
        },
        PERMISSION_MANAGE_ORDERS: true,
      })
      .toPromise();
    const saleorUser = customerData.customers.edges[0]?.node;
    // If user doesn't exist, create new user
    if (!saleorUser) {
      const cookies: string[] = [OPENWEB3_TOKEN, AUTH_STATE, ACCESS_TOKEN, REFRESH_TOKEN];
      res.setHeader(
        "Set-Cookie",
        cookies.map((name) => formatRemoveCookie(name)),
      );
      return res.status(200).json({
        code: 200,
        message: "Anonymous user login",
      });
    }

    // 检查是否存在 refresh token
    const refreshToken = req.cookies[REFRESH_TOKEN];
    const accessToken = req.cookies[ACCESS_TOKEN];
    if (refreshToken && accessToken) {
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

    // If the refresh token does not exist, a new token is created
    const password = `${process.env.SALEOR_USER_PASSWORD}${user?.id}`;
    // Get user token
    const { data: tokenData, error: tokenError } = await adminSaleorClient
      .mutation(TOKEN_CREATE_MUTATION, {
        email: saleorUser?.email,
        password: password,
      })
      .toPromise();

    const tokenCreate = tokenData?.tokenCreate;
    if (tokenError || !tokenCreate || tokenCreate.errors?.length) {
      console.error("Create token error:", tokenError);
      return res.status(200).json({ message: "Failed to create token", code: -1 });
    }

    // Create JWT token
    const token = jwt.sign(
      {
        id: userId,
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
      [OPENWEB3_TOKEN, token],
      [AUTH_STATE, "signedIn"],
      [ACCESS_TOKEN, tokenCreate.token],
      [REFRESH_TOKEN, tokenCreate.refreshToken],
    ];

    res.setHeader(
      "Set-Cookie",
      cookies.map(([name, value]) => formatCookie(name, value)),
    );

    return res.status(200).json({
      code: 0,
      message: null,
      data: {
        detail: parsedData,
        localStorage: cookies,
      },
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(200).json({ message: "Authentication failed", code: -1 });
  }
}
