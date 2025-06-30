import { obfuscateConfig } from "../app-configuration/utils";
import { paymentAppFullyConfiguredEntrySchema } from "../payment-app-configuration/config-entry";
import { getConfigurationForChannel } from "../payment-app-configuration/payment-app-configuration";
import { getWebhookPaymentAppConfigurator } from "../payment-app-configuration/payment-app-configuration-factory";
import {
  transactionSessionProcessEventToOpenweb3Update,
  getEnvironmentFromKey,
  openweb3PaymentIntentToTransactionResult,
  getOpenweb3ExternalUrlForIntentId,
  updateOpenweb3PaymentIntent,
  PLATFORM,
} from "../openweb3/openweb3-api";
import { safeParse } from "../payment-app-configuration/utils";
import { type TransactionProcessSessionEventFragment } from "generated/graphql";
import { type TransactionProcessSessionResponse } from "@/schemas/TransactionProcessSession/TransactionProcessSessionResponse.mjs";
import { createLogger } from "@/lib/logger";
import { invariant } from "@/lib/invariant";
import { type JSONObject } from "@/types";

export const TransactionProcessSessionWebhookHandler = async (
  event: TransactionProcessSessionEventFragment,
  saleorApiUrl: string,
): Promise<TransactionProcessSessionResponse> => {
  const logger = createLogger({}, { msgPrefix: "[TransactionProcessSessionWebhookHandler] " });
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

    logger.info({}, "Processing Transaction Process request");

    const paymentIntentUpdateParams = transactionSessionProcessEventToOpenweb3Update(event);

    logger.debug({
      paymentIntentUpdateParams: obfuscateConfig(paymentIntentUpdateParams),
      environment: getEnvironmentFromKey(openweb3Config.publishableKey),
    });

    const openweb3PaymentIntent = await updateOpenweb3PaymentIntent({
      paymentIntentUpdateParams,
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

    const redirectUrl = `${platformURL}?startapp=Pay_${openweb3PaymentIntent.id}`;

    const transactionProcessSessionResponse: TransactionProcessSessionResponse = {
      data: {
        ...data,
        redirectUrl,
      },
      result,
      pspReference: redirectUrl,
      amount: paymentIntentUpdateParams.amount || 0,
      time: openweb3PaymentIntent.createdAt,
      message: openweb3PaymentIntent.walletId || "",
      externalUrl: openweb3PaymentIntent.id
        ? getOpenweb3ExternalUrlForIntentId(openweb3PaymentIntent.id)
        : undefined,
    };
    return transactionProcessSessionResponse;
  } catch (err) {
    console.log(err);
    throw err;
  }
};
