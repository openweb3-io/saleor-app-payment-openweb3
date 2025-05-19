import { validate, parse } from "@telegram-apps/init-data-node";
import { type NextApiRequest, type NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { createClient } from "@/lib/create-graphq-client";

// 定义白名单数组
const WHITELIST_PLATFORMS = ["app.saleor.openweb3"];

// 设置 CORS 头信息
const setCorsHeaders = (res: NextApiResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, platform");
};

// Saleor GraphQL 创建用户 mutation
const ACCOUNT_REGISTER_MUTATION = `
  mutation AccountRegisterInput($input: AccountRegisterInput!) {
    accountRegister(input: $input) {
      requiresConfirmation
      errors {
        field
        message
        addressType
      }
      user {
        id
        isActive
        isConfirmed
      }
    }
  }
`;

// Saleor GraphQL 查询用户 mutation
const USER_QUERY = `
  query User($email: String) {
    user(email: $email) {
      id
      email
    }
  }
`;

// Saleor GraphQL 获取用户 token mutation
const TOKEN_CREATE_MUTATION = `
  mutation TokenCreate($email: String!, $password: String!) {
    tokenCreate(email: $email, password: $password) {
      token
      refreshToken
      csrfToken
      user {
        id
        email
      }
      errors {
        field
        message
        code
      }
    }
  }
`;

const SET_PASSWORD_MUTATION = `
  mutation SetCustomerPassword($id: ID!, $password: String!) {
    customerSetPassword(id: $id, password: $password) {
      errors {
        field
        message
      }
    }
  }
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 设置 CORS 头信息
  setCorsHeaders(res);

  // 处理 OPTIONS 请求
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    setCorsHeaders(res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 检查 platform 是否在白名单中
    const platform = req.headers["platform"] as string;
    if (!platform || !WHITELIST_PLATFORMS.includes(platform)) {
      return res.status(403).json({ error: "Invalid platform" });
    }

    const { initDataRaw } = req.body;

    if (!initDataRaw) {
      return res.status(400).json({ error: "Missing initDataRaw parameter" });
    }

    // 验证 Telegram 参数
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN || "");

    // 解析数据
    const parsedData = parse(initDataRaw);
    const { user, startParam } = parsedData;

    // 创建 Saleor GraphQL 客户端
    const saleorClient = createClient(process.env.SALEOR_API_URL!, async () =>
      Promise.resolve({ token: "" }),
    );

    const adminSaleorClient = createClient(process.env.SALEOR_API_URL!, async () => {
      // 使用管理员凭证获取新 token
      const { data } = await saleorClient
        .mutation(TOKEN_CREATE_MUTATION, {
          email: process.env.SALEOR_ADMIN_EMAIL,
          password: process.env.SALEOR_ADMIN_PASSWORD,
        })
        .toPromise();
      return Promise.resolve({ token: data?.tokenCreate.token });
    });

    const email = `${user?.id}@openweb3.com`;

    const password = `${process.env.SALEOR_USER_PASSWORD}${user?.id}`;

    // 检查用户是否已存在
    const { data: userData } = await adminSaleorClient
      .query(USER_QUERY, {
        email: email,
      })
      .toPromise();

    let saleorUser = userData?.user;

    console.log("saleorUser=", saleorUser);

    // 如果用户不存在，创建新用户
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

    console.log("TOKEN_CREATE_MUTATION start");

    // 获取用户 token
    const { data: tokenData, error: tokenError } = await adminSaleorClient
      .mutation(TOKEN_CREATE_MUTATION, {
        email: email,
        password: password,
      })
      .toPromise();

    console.log("TOKEN_CREATE_MUTATION end");

    if (tokenError) {
      console.error("Create token error:", tokenError);
      return res.status(500).json({ error: "Failed to create token" });
    }

    const tokenCreate = tokenData?.tokenCreate;
    if (!tokenCreate || tokenCreate.errors?.length) {
      console.error("Create token error:", tokenCreate?.errors);
      return res.status(500).json({ error: "Failed to create token" });
    }

    // 创建 JWT token
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

    // 设置 cookie
    const expires = new Date(Date.now() + 86400 * 1000).toUTCString();

    res.setHeader("Set-Cookie", [
      `openweb3-walletpay=${token}; Path=/; HttpOnly; SameSite=Lax; Domain=${process.env.SALEOR_SESSION_DOMAIN}; Secure; Expires=${expires}`,
      `${process.env.SALEOR_API_URL}+saleor_auth_access_token=${tokenCreate.token}; Path=/; Secure; HttpOnly; SameSite=Lax; Domain=${process.env.SALEOR_SESSION_DOMAIN}; Expires=${expires}`,
      `${process.env.SALEOR_API_URL}+saleor_auth_module_refresh_token=${tokenCreate.refreshToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Domain=${process.env.SALEOR_SESSION_DOMAIN}; Expires=${expires}`,
      `${process.env.SALEOR_API_URL}+saleor_auth_module_auth_state=signedIn; Path=/; Secure; HttpOnly; SameSite=Lax; Domain=${process.env.SALEOR_SESSION_DOMAIN}; Expires=${expires}`,
    ]);

    return res.status(200).json({
      code: 0,
      message: "success",
      data: {
        ...parsedData,
      },
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}
