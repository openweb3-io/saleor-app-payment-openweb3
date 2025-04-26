import { paymentAppFullyConfiguredEntrySchema } from "../payment-app-configuration/config-entry";
import { getConfigurationForChannel } from "../payment-app-configuration/payment-app-configuration";
import { getWebhookPaymentAppConfigurator } from "../payment-app-configuration/payment-app-configuration-factory";
import { type TransactionChargeRequestedResponse } from "@/schemas/TransactionChargeRequested/TransactionChargeRequestedResponse.mjs";
import {
  type TransactionChargeRequestedEventFragment,
  TransactionActionEnum,
} from "generated/graphql";
import { invariant } from "@/lib/invariant";

export const TransactionChargeRequestedWebhookHandler = async (
  event: TransactionChargeRequestedEventFragment,
  saleorApiUrl: string,
): Promise<TransactionChargeRequestedResponse> => {
  const app = event.recipient;
  invariant(app, "Missing event.recipient!");
  invariant(
    event.action.actionType === TransactionActionEnum.Charge,
    `Incorrect action.actionType: ${event.action.actionType}`,
  );
  invariant(event.transaction, "Missing transaction");
  invariant(event.action.amount, "Missing action.amount");
  invariant(event.transaction.sourceObject, "Missing transaction.sourceObject");

  const { privateMetadata } = app;
  const configurator = getWebhookPaymentAppConfigurator({ privateMetadata }, saleorApiUrl);
  const appConfig = await configurator.getConfig();
  const openweb3Config = paymentAppFullyConfiguredEntrySchema.parse(
    getConfigurationForChannel(appConfig, event.transaction.sourceObject?.channel.id),
  );

  return {
    pspReference: "",
    result: "CHARGE_FAILURE",
    amount: 0,
  };
};
