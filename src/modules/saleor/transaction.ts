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
  uid: string,
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
          uid,
        },
      })
      .toPromise();

    const checkoutId = transactionResult?.data?.transaction?.checkout?.id;
    const transactionStatus = processResult?.data?.transactionProcess?.transactionEvent.type;

    console.log("Processed transactionResult", JSON.stringify(transactionResult?.data, null, 2));

    console.log("Processed processResult", JSON.stringify(processResult?.data, null, 2));

    if (transactionStatus === "CHARGE_SUCCESS" && checkoutId) {
      const checkoutCompleteResult = await adminClient
        .mutation(CHECKOUT_COMPLETE_MUTATION, {
          id: checkoutId,
          metadata: [
            {
              key: "transactionId",
              value: transactionId,
            },
            {
              key: "checkoutId",
              value: checkoutId,
            },
          ],
        })
        .toPromise();

      console.log(
        "Processed checkoutCompleteResult",
        JSON.stringify(checkoutCompleteResult?.data, null, 2),
      );

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
