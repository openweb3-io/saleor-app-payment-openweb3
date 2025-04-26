import { Box } from "@saleor/macaw-ui/next";
import { ChipSuccess, ChipOpenweb3Orange, ChipInfo } from "@/modules/ui/atoms/Chip/Chip";
import { type PaymentAppUserVisibleConfigEntry } from "@/modules/payment-app-configuration/config-entry";
import { getEnvironmentFromKey } from "@/modules/openweb3/openweb3-api";
import { appBridgeInstance } from "@/app-bridge-instance";

export const ConfigurationSummary = ({ config }: { config: PaymentAppUserVisibleConfigEntry }) => {
  return (
    <Box
      as="dl"
      display="grid"
      __gridTemplateColumns="max-content 1fr"
      rowGap={2}
      columnGap={2}
      alignItems="center"
      margin={0}
    >
      <Box as="dt" margin={0} fontSize="captionSmall" color="textNeutralSubdued">
        Environment
      </Box>
      <Box as="dd" margin={0} textAlign="right">
        {getEnvironmentFromKey(config.publishableKey) === "production" ? (
          <ChipSuccess>PRODUCTION</ChipSuccess>
        ) : (
          <ChipOpenweb3Orange>DEVELOPMENT</ChipOpenweb3Orange>
        )}
      </Box>
      <Box as="dt" margin={0} fontSize="captionSmall" color="textNeutralSubdued">
        Webhook ID
      </Box>
      <Box as="dd" margin={0} textAlign="right">
        <a
          onClick={() =>
            void appBridgeInstance?.dispatch({
              type: "redirect",
              payload: {
                actionId: "",
                to: "",
                newContext: true,
              },
            })
          }
          target="_blank"
        ></a>
      </Box>
    </Box>
  );
};
