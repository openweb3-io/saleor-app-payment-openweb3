import { type NextApiRequest } from "next";
import { getPaymentAppConfigurator } from "../payment-app-configuration/payment-app-configuration-factory";
import { createClient } from "@/lib/create-graphq-client";
import { getAuthDataForRequest } from "@/backend-lib/api-route-utils";
import { createLogger } from "@/lib/logger";
import { __do } from "@/lib/utils";

export const openweb3WebhookHandler = async (req: NextApiRequest) => {
  createLogger({}, { msgPrefix: "[openweb3WebhookHandler] " });
  const authData = await getAuthDataForRequest(req);
  const client = createClient(authData.saleorApiUrl, async () => ({ token: authData.token }));
  const configurator = getPaymentAppConfigurator(client, authData.saleorApiUrl);
  const appConfig = await configurator.getConfig();

  return `Hello openweb3 ${appConfig.lastMigration}`;
};
