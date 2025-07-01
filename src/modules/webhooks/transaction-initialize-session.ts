import {
  getEnvironmentFromKey,
  getOpenweb3ApiClient,
  getOpenweb3ExternalUrlForIntentId,
  initializeOpenweb3PaymentIntent,
  openweb3PaymentIntentToTransactionResult,
  PLATFORM,
  transactionSessionInitializeEventToOepnweb3Create,
} from "../openweb3/openweb3-api";
import { getWebhookPaymentAppConfigurator } from "../payment-app-configuration/payment-app-configuration-factory";
import { paymentAppFullyConfiguredEntrySchema } from "../payment-app-configuration/config-entry";
import { obfuscateConfig } from "../app-configuration/utils";
import { getConfigurationForChannel } from "../payment-app-configuration/payment-app-configuration";
import { safeParse } from "../payment-app-configuration/utils";
import { type TransactionInitializeSessionResponse } from "@/schemas/TransactionInitializeSession/TransactionInitializeSessionResponse.mjs";
import { type TransactionInitializeSessionEventFragment } from "generated/graphql";
import { invariant } from "@/lib/invariant";
import { createLogger } from "@/lib/logger";
import { type JSONObject } from "@/types";

export const TransactionInitializeSessionWebhookHandler = async (
  event: TransactionInitializeSessionEventFragment,
  saleorApiUrl: string,
): Promise<TransactionInitializeSessionResponse> => {
  const logger = createLogger(
    { saleorApiUrl },
    { msgPrefix: "[TransactionInitializeSessionWebhookHandler] " },
  );
  logger.debug(
    {
      transaction: event.transaction,
      action: event.action,
      sourceObject: {
        id: event.sourceObject.id,
        channel: event.sourceObject.channel,
        __typename: event.sourceObject.__typename,
      },
      merchantReference: event.merchantReference,
    },
    "Received event",
  );

  try {
    const app = event.recipient;
    invariant(app, "Missing event.recipient!");

    const { privateMetadata } = app;
    const configurator = getWebhookPaymentAppConfigurator({ privateMetadata }, saleorApiUrl);
    const appConfig = await configurator.getConfig();

    const openweb3Config = paymentAppFullyConfiguredEntrySchema.parse(
      getConfigurationForChannel(appConfig, event.sourceObject.channel.id),
    );

    logger.info({}, "Processing Transaction Initialize request");
    console.log("event=", event);
    const paymentIntentCreateParams = transactionSessionInitializeEventToOepnweb3Create(event);

    logger.debug({
      paymentIntentCreateParams: obfuscateConfig(paymentIntentCreateParams),
      environment: getEnvironmentFromKey(openweb3Config.publishableKey),
    });

    const openweb3PaymentIntent = await initializeOpenweb3PaymentIntent({
      paymentIntentCreateParams,
      secretKey: openweb3Config.secretKey,
      publishableKey: openweb3Config.publishableKey,
    });

    const data = {
      paymentIntent: safeParse(openweb3PaymentIntent) as JSONObject,
      publishableKey: openweb3Config.publishableKey,
    };

    const result = openweb3PaymentIntentToTransactionResult(
      event.action.actionType,
      openweb3PaymentIntent,
    );

    logger.debug(result, "Openweb3 -> Transaction result");

    const platformURL =
      process.env[
        openweb3PaymentIntent.metadata?.platform === PLATFORM.TELEGRAM
          ? "TELEGRAM_MINIAPP_URL"
          : "DEJOY_MINIAPP_URL"
      ];
    console.log("process.env.TELEGRAM_MINIAPP_URL=", process.env.TELEGRAM_MINIAPP_URL);
    console.log("process.env.DEJOY_MINIAPP_URL=", process.env.DEJOY_MINIAPP_URL);
    console.log("platformURL=", platformURL);
    const redirectUrl = `${platformURL}?startapp=Pay_${openweb3PaymentIntent.id}`;

    const transactionInitializeSessionResponse: TransactionInitializeSessionResponse = {
      data: {
        ...data,
        redirectUrl,
      },
      result,
      pspReference: redirectUrl,
      amount: paymentIntentCreateParams.amount || 0,
      time: openweb3PaymentIntent.createdAt,
      message: openweb3PaymentIntent.walletId || "",
      externalUrl: openweb3PaymentIntent.id
        ? getOpenweb3ExternalUrlForIntentId(openweb3PaymentIntent.id)
        : undefined,
    };

    return transactionInitializeSessionResponse;
  } catch (err) {
    console.log(err);
    throw err;
  }
};
