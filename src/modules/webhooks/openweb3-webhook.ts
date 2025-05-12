import crypto from "crypto";
import { type NextApiRequest } from "next";
import { getPaymentAppConfigurator } from "../payment-app-configuration/payment-app-configuration-factory";
import { MissingSignatureError } from "./openweb3-webhook.errors";
import { createClient } from "@/lib/create-graphq-client";
import { getAuthDataForRequest } from "@/backend-lib/api-route-utils";
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

  // 检查X-Signature头
  const signature = req.headers["x-signature"];
  if (!signature) {
    throw new MissingSignatureError("Missing X-Signature header");
  }

  // 获取原始请求体
  const body = JSON.stringify(req.body);

  // 验证签名
  const publicKey = process.env.WALLET_PAY_WEBHOOK_PUBLIC_KEY;
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(body);

  const isValid = verifier.verify(publicKey!, signature as string, "base64");

  if (!isValid) {
    throw new Error("Invalid signature");
  }

  logger.info("Signature verification successful");

  // 解析请求体
  const event = JSON.parse(body) as OrderEvent;

  // 根据事件类型处理
  switch (event.type) {
    case OrderEventNameType.ORDER_PAID:
      logger.info("Processing ORDER_PAID event", {
        orderId: event.payload.id,
        amount: event.payload.amount,
        walletId: event.payload.wallet_id,
      });
      // TODO: 处理支付成功事件
      break;

    case OrderEventNameType.ORDER_EXPIRED:
      logger.info("Processing ORDER_EXPIRED event", {
        orderId: event.payload.id,
        amount: event.payload.amount,
      });
      // TODO: 处理订单过期事件
      break;

    case OrderEventNameType.ORDER_FAILED:
      logger.info("Processing ORDER_FAILED event", {
        orderId: event.payload.id,
        amount: event.payload.amount,
        failedMessage: event.payload.failed_message,
      });
      // TODO: 处理支付失败事件
      break;

    default:
      logger.warn("Unknown event type", { type: event });
  }

  return "Hello openweb3";
};
