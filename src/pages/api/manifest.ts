import { createManifestHandler } from "@saleor/app-sdk/handlers/next";
import { type AppManifest } from "@saleor/app-sdk/types";

import packageJson from "../../../package.json";
import { paymentGatewayInitializeSessionSyncWebhook } from "./webhooks/saleor/payment-gateway-initialize-session";
import { transactionInitializeSessionSyncWebhook } from "./webhooks/saleor/transaction-initialize-session";
import { transactionCancelationRequestedSyncWebhook } from "./webhooks/saleor/transaction-cancelation-requested";
import { transactionChargeRequestedSyncWebhook } from "./webhooks/saleor/transaction-charge-requested";
import { transactionProcessSessionSyncWebhook } from "./webhooks/saleor/transaction-process-session";
import { transactionRefundRequestedSyncWebhook } from "./webhooks/saleor/transaction-refund-requested";

export default createManifestHandler({
  async manifestFactory(context) {
    const manifest: AppManifest = {
      id: "app.saleor.openweb3",
      name: "Openweb3",
      about: packageJson.description,
      tokenTargetUrl: `${context.appBaseUrl}/api/register`,
      appUrl: `${context.appBaseUrl}`,
      permissions: ["HANDLE_PAYMENTS"],
      version: packageJson.version,
      requiredSaleorVersion: ">=3.14.0",
      homepageUrl: "https://github.com/saleor/saleor-app-payment-openweb3",
      supportUrl: "https://github.com/saleor/saleor-app-payment-openweb3/issues",
      brand: {
        logo: {
          default: `${context.appBaseUrl}/logo.png`,
        },
      },
      webhooks: [
        paymentGatewayInitializeSessionSyncWebhook.getWebhookManifest(context.appBaseUrl),
        transactionInitializeSessionSyncWebhook.getWebhookManifest(context.appBaseUrl),
        transactionProcessSessionSyncWebhook.getWebhookManifest(context.appBaseUrl),
        transactionCancelationRequestedSyncWebhook.getWebhookManifest(context.appBaseUrl),
        transactionChargeRequestedSyncWebhook.getWebhookManifest(context.appBaseUrl),
        transactionRefundRequestedSyncWebhook.getWebhookManifest(context.appBaseUrl),
      ],
      extensions: [],
    };

    return manifest;
  },
});
