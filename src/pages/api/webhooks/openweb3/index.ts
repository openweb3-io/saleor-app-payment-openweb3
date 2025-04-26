import { type NextApiRequest, type NextApiResponse } from "next";
import * as Sentry from "@sentry/nextjs";
import { createLogger, redactError } from "@/lib/logger";
import { BaseError, MissingSaleorApiUrlError, MissingAuthDataError } from "@/errors";
import {
  MissingSignatureError,
  UnexpectedTransactionEventReportError,
} from "@/modules/webhooks/openweb3-webhook.errors";
import { openweb3WebhookHandler } from "@/modules/webhooks/openweb3-webhook";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function Openweb3WebhookHandler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method Not Allowed");
    return;
  }

  if (req.headers["content-type"] !== "application/json") {
    return res.status(400).json({
      code: 1,
      message: "Invalid content type",
    });
  }

  const logger = createLogger({}, { msgPrefix: "[Openweb3WebhookHandler] " });
  logger.info("Handler was called");

  try {
    await openweb3WebhookHandler(req);
  } catch (err) {
    if (err instanceof BaseError) {
      Sentry.captureException(err, { extra: { errors: err.errors } });
    } else {
      Sentry.captureException(err);
    }
    logger.error(redactError(err), "openweb3WebhookHandler failed");

    if (err instanceof MissingSaleorApiUrlError) {
      return res.status(400).json(MissingSaleorApiUrlError.serialize(err));
    }
    if (err instanceof MissingAuthDataError) {
      return res.status(412).json(MissingAuthDataError.serialize(err));
    }
    if (err instanceof MissingSignatureError) {
      return res.status(400).json(MissingSignatureError.serialize(err));
    }
    if (err instanceof UnexpectedTransactionEventReportError) {
      return res.status(500).json(UnexpectedTransactionEventReportError.serialize(err));
    }
    return res.status(500).json(BaseError.serialize(err));
  }

  logger.info("Openweb3WebhookHandler finished OK");
  res.status(200).json({
    code: 0,
    message: "success",
  });
  return;
}
