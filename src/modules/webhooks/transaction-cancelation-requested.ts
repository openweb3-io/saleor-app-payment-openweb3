import { getWebhookPaymentAppConfigurator } from "../payment-app-configuration/payment-app-configuration-factory";
import { paymentAppFullyConfiguredEntrySchema } from "../payment-app-configuration/config-entry";
import { getConfigurationForChannel } from "../payment-app-configuration/payment-app-configuration";
import { type TransactionCancelationRequestedResponse } from "@/schemas/TransactionCancelationRequested/TransactionCancelationRequestedResponse.mjs";
import {
  type TransactionCancelationRequestedEventFragment,
  TransactionActionEnum,
} from "generated/graphql";
import { invariant } from "@/lib/invariant";

export const TransactionCancelationRequestedWebhookHandler = async (
  event: TransactionCancelationRequestedEventFragment,
  saleorApiUrl: string,
): Promise<TransactionCancelationRequestedResponse> => {
  const app = event.recipient;
  invariant(app, "Missing event.recipient!");
  invariant(
    event.action.actionType === TransactionActionEnum.Cancel,
    `Incorrect action.actionType: ${event.action.actionType}`,
  );
  invariant(event.action.amount, "Missing action.amount");
  invariant(event.transaction, "Missing transaction");

  const { privateMetadata } = app;
  const configurator = getWebhookPaymentAppConfigurator({ privateMetadata }, saleorApiUrl);
  const appConfig = await configurator.getConfig();
  const openweb3Config = paymentAppFullyConfiguredEntrySchema.parse(
    getConfigurationForChannel(appConfig, event.transaction.sourceObject?.channel.id),
  );

  return {
    pspReference: "1237",
    result: "CANCEL_FAILURE",
    amount: 20,
  };

  // const openweb3PaymentIntentCancelResponse = await processOpenweb3PaymentIntentCancelRequest({
  //   paymentIntentId: event.transaction.pspReference,
  //   secretKey: openweb3Config.secretKey,
  //   publishableKey: openweb3Config.publishableKey,
  // });

  // const transactionCancelationRequestedResponse: TransactionCancelationRequestedResponse =
  //   openweb3PaymentIntentCancelResponse.status === "canceled"
  //     ? // Sync flow
  //       {
  //         pspReference: openweb3PaymentIntentCancelResponse.id,
  //         amount: getSaleorAmountFromOpenweb3Amount({
  //           amount: openweb3PaymentIntentCancelResponse.amount,
  //           currency: openweb3PaymentIntentCancelResponse.currency,
  //         }),
  //         result: TransactionEventTypeEnum.CancelSuccess,
  //         externalUrl: getOpenweb3ExternalUrlForIntentId(openweb3PaymentIntentCancelResponse.id),
  //       }
  //     : // Async flow; waiting for confirmation
  //       {
  //         pspReference: openweb3PaymentIntentCancelResponse.id,
  //       };

  // return transactionCancelationRequestedResponse;
};
