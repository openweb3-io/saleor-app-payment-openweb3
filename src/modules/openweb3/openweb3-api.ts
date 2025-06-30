import { ApiClient, type Order } from "@openweb3-io/wallet-pay";
import { getSaleorAmountFromOpenweb3Amount } from "./currencies";
import {
  TransactionFlowStrategyEnum,
  type TransactionProcessSessionEventFragment,
  type TransactionInitializeSessionEventFragment,
} from "generated/graphql";
import { invariant } from "@/lib/invariant";
import type { TransactionInitializeSessionResponse } from "@/schemas/TransactionInitializeSession/TransactionInitializeSessionResponse.mjs";
import { createLogger } from "@/lib/logger";
import { InvalidSecretKeyError, RestrictedKeyNotSupportedError } from "@/errors";

export const getOpenweb3ApiClient = (secretKey: string, publishableKey: string): ApiClient => {
  return new ApiClient(publishableKey, secretKey, {});
};

export const validateOpenweb3Keys = async (secretKey: string, publishableKey: string) => {
  createLogger({}, { msgPrefix: "[validateOpenweb3Keys] " });

  if (!secretKey || !publishableKey) {
    // @todo remove this once restricted keys are supported
    // validate that restricted keys have required permissions
    throw new RestrictedKeyNotSupportedError("Restricted keys are not supported");
  }

  {
    const openweb3 = getOpenweb3ApiClient(secretKey, publishableKey);
    if (!openweb3) {
      new InvalidSecretKeyError("There was an error while checking secretkey and publishablekey");
    }
  }
};

export const getEnvironmentFromKey = (secretKeyOrPublishableKey: string) => {
  const nodeEnv = process?.env?.NODE_ENV;
  return nodeEnv;
};

export const transactionSessionInitializeEventToOepnweb3Create = (
  event: TransactionInitializeSessionEventFragment,
): Partial<PaymentIntentCommonParams> => {
  const data = event.data as Partial<PaymentIntentCommonParams>;

  return {
    ...data,
    amount: event.sourceObject.total.gross.amount,
    currency: event.sourceObject.total.gross.currency,
    capture_method:
      event.action.actionType === TransactionFlowStrategyEnum.Charge ? "automatic" : "manual",
    metadata: {
      ...data.metadata,
      transactionId: event.transaction.id,
      channelId: event.sourceObject.channel.id,
      ...(event.sourceObject.__typename === "Checkout" && { checkoutId: event.sourceObject.id }),
      ...(event.sourceObject.__typename === "Order" && { orderId: event.sourceObject.id }),
    },
  };
};

export const transactionSessionProcessEventToOpenweb3Update = (
  event: TransactionInitializeSessionEventFragment | TransactionProcessSessionEventFragment,
): Partial<PaymentIntentCommonParams> => {
  const data = event.data as Partial<PaymentIntentCommonParams>;

  return {
    ...data,
    amount: event.sourceObject.total.gross.amount,
    currency: event.sourceObject.total.gross.currency,
    capture_method:
      event.action.actionType === TransactionFlowStrategyEnum.Charge ? "automatic" : "manual",
    metadata: {
      ...data.metadata,
      transactionId: event.transaction.id,
      channelId: event.sourceObject.channel.id,
      ...(event.sourceObject.__typename === "Checkout" && { checkoutId: event.sourceObject.id }),
      ...(event.sourceObject.__typename === "Order" && { orderId: event.sourceObject.id }),
    },
  };
};

export const openweb3PaymentIntentToTransactionResult = (
  transactionFlowStrategy: TransactionFlowStrategyEnum,
  openweb3PaymentIntent: Order,
): TransactionInitializeSessionResponse["result"] => {
  console.log("openweb3PaymentIntent=", openweb3PaymentIntent);
  // "PENDING" | "PAID" | "EXPIRED" | "FAILED" | "COMPLETED"
  const openweb3Result = openweb3PaymentIntent.status;

  const prefix =
    transactionFlowStrategy === TransactionFlowStrategyEnum.Authorization
      ? "AUTHORIZATION"
      : transactionFlowStrategy === TransactionFlowStrategyEnum.Charge
        ? "CHARGE"
        : /* c8 ignore next */
          null;
  invariant(prefix, `Unsupported transactionFlowStrategy: ${transactionFlowStrategy}`);

  const logger = createLogger({}, { msgPrefix: "[openweb3PaymentIntentToTransactionResult] " });

  logger.info({ openweb3Result });

  switch (openweb3Result) {
    case "PENDING":
      return `${prefix}_ACTION_REQUIRED`;
    case "EXPIRED":
      return `${prefix}_FAILURE`;
    case "FAILED":
      return `${prefix}_FAILURE`;
    case "PAID":
      return `${prefix}_SUCCESS`;
    case "COMPLETED":
      return `${prefix}_SUCCESS`;
    default:
      return `${prefix}_ACTION_REQUIRED`;
  }
};

export enum PLATFORM {
  TELEGRAM = "TELEGRAM",
  DEJOY = "DEJOY",
}

export interface PaymentIntentCommonParams {
  uid?: string;
  metadata: {
    transactionId: string;
    channelId: string;
    userId?: string;
    checkoutId?: string;
    orderId?: string;
    platform?: keyof typeof PLATFORM;
  };
  amount: number;
  currency: string;
  checkoutId: string;
  transactionId: string;
  channelId: string;
  capture_method?: "manual" | "automatic";
}

export const initializeOpenweb3PaymentIntent = async ({
  paymentIntentCreateParams,
  secretKey,
  publishableKey,
}: {
  paymentIntentCreateParams: Partial<PaymentIntentCommonParams>;
  secretKey: string;
  publishableKey: string;
}): Promise<Order> => {
  const metadata = paymentIntentCreateParams.metadata;
  const uid = `${metadata?.userId}-${metadata?.transactionId}`;
  const openweb3 = getOpenweb3ApiClient(secretKey, publishableKey);

  try {
    const res = await openweb3.orders.retrieve(uid);
    return res;
  } catch {
    const amount = await getSaleorAmountFromOpenweb3Amount(
      {
        amount: paymentIntentCreateParams.amount!,
        currency: "USDT",
      },
      {
        secretKey,
        publishableKey,
      },
    );

    const res = await openweb3.orders.create({
      amount: `${amount}`,
      currency: "USDT",
      uid,
      metadata: metadata as {
        [key: string]: string;
      },
    });

    return res;
  }
};

export const updateOpenweb3PaymentIntent = async ({
  paymentIntentUpdateParams,
  secretKey,
  publishableKey,
}: {
  paymentIntentUpdateParams: Partial<PaymentIntentCommonParams>;
  secretKey: string;
  publishableKey: string;
}): Promise<Order> => {
  const uid = paymentIntentUpdateParams.uid;
  const openweb3 = getOpenweb3ApiClient(secretKey, publishableKey);

  try {
    const res = await openweb3.orders.retrieve(uid!);
    return res;
  } catch {
    throw new Error("Payment intent not found");
  }
};

export async function processOpenweb3PaymentIntentRefundRequest({
  secretKey,
  publishableKey,
}: {
  paymentIntentId: string;
  openweb3Amount: number | null | undefined;
  secretKey: string;
  publishableKey: string;
}) {
  const openweb3 = getOpenweb3ApiClient(secretKey, publishableKey);
  return openweb3;
}

export async function processOpenweb3PaymentIntentCancelRequest({
  secretKey,
  publishableKey,
}: {
  paymentIntentId: string;
  secretKey: string;
  publishableKey: string;
}) {
  const openweb3 = getOpenweb3ApiClient(secretKey, publishableKey);
  return openweb3;
}

export async function processOpenweb3PaymentIntentCaptureRequest({
  secretKey,
  publishableKey,
}: {
  paymentIntentId: string;
  openweb3Amount: number | null | undefined;
  secretKey: string;
  publishableKey: string;
}) {
  const openweb3 = getOpenweb3ApiClient(secretKey, publishableKey);
  return openweb3;
}

export const getOpenweb3ExternalUrlForIntentId = (intentId: string) => {
  const externalUrl = `https://dashboard.openweb3.com/payments/${encodeURIComponent(intentId)}`;
  return externalUrl;
};
