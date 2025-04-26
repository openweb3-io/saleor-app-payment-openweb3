import { validate, parse } from "@telegram-apps/init-data-node";
import { type NextApiRequest, type NextApiResponse } from "next";
import { createAdminSaleorClient } from "@/modules/saleor";
import { ACCOUNT_REGISTER_MUTATION, USER_QUERY } from "@/modules/saleor/graphql";

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
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Check if platform is in whitelist
    const platform = req.headers["platform"] as string;
    if (!platform || !WHITELIST_PLATFORMS.includes(platform)) {
      return res.status(403).json({ error: "Invalid platform" });
    }

    const { initDataRaw, email } = req.body;

    if (!initDataRaw) {
      return res.status(400).json({ error: "Missing initDataRaw parameter" });
    }

    // Verify Telegram parameters
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    validate(initDataRaw, process.env.TELEGRAM_BOT_TOKEN || "");

    // Parse data
    const parsedData = parse(initDataRaw);
    const { user } = parsedData;

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
      return res.status(500).json({ error: "Failed to create user" });
    }

    const accountRegister = createData?.accountRegister;
    if (!accountRegister || accountRegister.errors?.length) {
      console.error("Create user error:", accountRegister?.errors);
      return res.status(500).json({ error: "Failed to create user" });
    }

    return res.status(200).json({
      code: 0,
      message: "success",
    });
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}
