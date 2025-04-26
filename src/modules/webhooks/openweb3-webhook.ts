import { type NextApiRequest } from "next";
import { WebhookClient } from "@openweb3-io/wallet-pay";
import { processTransaction } from "../saleor/transaction";
import { MissingSignatureError } from "./openweb3-webhook.errors";
import { createLogger } from "@/lib/logger";
import { __do } from "@/lib/utils";

export enum OrderEventNameType {
  ORDER_PAID = "order.paid",
  ORDER_EXPIRED = "order.expired",
  ORDER_FAILED = "order.failed",
}

export interface OrderPaidEvent {
  type: OrderEventNameType.ORDER_PAID;
  payload: {
    id: string;
    uid: string;
    user_id: string;
    wallet_id: string;
    amount: {
      currency: string;
      amount: string;
    };
    metadata: {
      custom_key: string;
    };
    created_at: string;
    updated_at: string;
  };
}

export interface OrderExpiredEvent {
  type: OrderEventNameType.ORDER_EXPIRED;
  payload: {
    id: string;
    uid: string;
    user_id: string;
    amount: {
      currency: string;
      amount: string;
    };
    metadata: {
      custom_key: string;
    };
    created_at: string;
    updated_at: string;
  };
}

export interface OrderFailedEvent {
  type: OrderEventNameType.ORDER_FAILED;
  payload: {
    id: string;
    uid: string;
    user_id: string;
    amount: {
      currency: string;
      amount: string;
    };
    metadata: {
      custom_key: string;
    };
    failed_message: string;
    created_at: string;
    updated_at: string;
  };
}

type OrderEvent = OrderPaidEvent | OrderExpiredEvent | OrderFailedEvent;

interface Openweb3WebhookRequest extends NextApiRequest {
  body: OrderEvent;
}

export const openweb3WebhookHandler = async (req: Openweb3WebhookRequest) => {
  // // 获取公钥（这里需要从配置中获取）
  // const authData = await getAuthDataForRequest(req);
  // const client = createClient(authData.saleorApiUrl, async () => ({ token: authData.token }));
  // const configurator = getPaymentAppConfigurator(client, authData.saleorApiUrl);
  // const appConfig = await configurator.getConfig();

  const logger = createLogger({}, { msgPrefix: "[openweb3WebhookHandler] " });

  // Check X-Signature header
  const signature = req.headers["x-signature"];
  console.log("signature=", signature);

  // Get raw request body (for debugging non-JSON data)
  const body = await new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });

  console.log("body=", body);

  if (!signature) {
    throw new MissingSignatureError("Missing X-Signature header");
  }

  const publicKey = process.env.WALLET_PAY_WEBHOOK_PUBLIC_KEY;

  const webhookClient = new WebhookClient(publicKey!);
  const isValid = await webhookClient.verify(body as string, signature as string);

  if (!isValid) {
    throw new Error("Invalid signature");
  }

  logger.info("Signature verification successful");

  // Parse request body
  const event = JSON.parse(body as string) as OrderEvent;

  // Handle events based on type
  switch (event.type) {
    case OrderEventNameType.ORDER_PAID:
      logger.info("Processing ORDER_PAID event", {
        orderId: event.payload.id,
        amount: event.payload.amount,
        walletId: event.payload.wallet_id,
      });

      const uid = event.payload.uid;
      const [, transactionId] = uid.split("-");

      console.log("Processing ORDER_PAID event", uid);

      try {
        const result = await processTransaction(transactionId, uid);

        if (result.orderId) {
          logger.info("Order processed successfully", {
            orderId: String(result.orderId),
            checkoutId: String(result.checkoutId),
            transactionId: String(transactionId),
            status: "success",
          });
        } else if (result.errors?.length) {
          logger.error("Order processing failed", {
            checkoutId: String(result.checkoutId),
            transactionId: String(transactionId),
            errors: result.errors.map((e) => `${e.field}: ${e.message}`).join(", "),
            status: "error",
          });
        }
      } catch (error) {
        logger.error("Error occurred during order processing", {
          transactionId: String(transactionId),
          error: error instanceof Error ? error.message : "Unknown error",
          status: "error",
        });
      }

      break;

    case OrderEventNameType.ORDER_EXPIRED:
      logger.info("Processing ORDER_EXPIRED event", {
        orderId: event.payload.id,
        amount: event.payload.amount,
      });
      // TODO: Handle order expired event
      break;

    case OrderEventNameType.ORDER_FAILED:
      logger.info("Processing ORDER_FAILED event", {
        orderId: event.payload.id,
        amount: event.payload.amount,
        failedMessage: event.payload.failed_message,
      });
      // TODO: Handle payment failed event
      break;

    default:
      logger.warn("Unknown event type", { type: event });
  }

  return "Hello openweb3";
};
