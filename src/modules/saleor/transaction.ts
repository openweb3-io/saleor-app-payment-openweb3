import {
  TRANSACTION_QUERY,
  TRANSACTION_PROCESS_MUTATION,
  CHECKOUT_COMPLETE_MUTATION,
} from "./graphql";
import { createAdminSaleorClient } from "./index";
import { createLogger } from "@/lib/logger";

const logger = createLogger({}, { msgPrefix: "[saleor-transaction] " });

interface ProcessTransactionResult {
  checkoutId?: string;
  transactionStatus?: string;
  orderId?: string;
  errors?: Array<{ field: string; message: string }>;
}

export async function processTransaction(
  transactionId: string,
  userId: string,
): Promise<ProcessTransactionResult> {
  try {
    const adminClient = await createAdminSaleorClient();

    // Query transaction information
    const transactionResult = await adminClient
      .query(TRANSACTION_QUERY, {
        transactionId,
      })
      .toPromise();

    // Process transaction
    const processResult = await adminClient
      .mutation(TRANSACTION_PROCESS_MUTATION, {
        id: transactionId,
        data: {
          userId,
        },
      })
      .toPromise();

    const checkoutId = transactionResult?.data?.transaction?.checkout?.id;
    const transactionStatus = processResult?.data?.transactionProcess?.transactionEvent.type;

    // If transaction is successful and has checkout ID, complete order conversion
    if (transactionStatus === "SUCCESS" && checkoutId) {
      const checkoutCompleteResult = await adminClient
        .mutation(CHECKOUT_COMPLETE_MUTATION, {
          id: checkoutId,
        })
        .toPromise();

      return {
        checkoutId,
        transactionStatus,
        orderId: checkoutCompleteResult?.data?.checkoutComplete?.order?.id,
        errors: checkoutCompleteResult?.data?.checkoutComplete?.errors,
      };
    }

    return {
      checkoutId,
      transactionStatus,
    };
  } catch (error) {
    logger.error("Error occurred while processing transaction", {
      transactionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
