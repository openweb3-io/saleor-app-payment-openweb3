import { Text } from "@saleor/macaw-ui/next";
import { withAuthorization } from "@saleor/app-sdk/app-bridge";
import { useRouter } from "next/router";
import { AppLayout } from "@/modules/ui/templates/AppLayout";
import { Openweb3ConfigurationForm } from "@/modules/ui/organisms/AddOpenweb3ConfigurationForm/AddOpenweb3ConfigurationForm";

const EditConfigurationPage = () => {
  const router = useRouter();
  if (typeof router.query.configurationId !== "string" || !router.query.configurationId) {
    // TODO: Add loading
    return <div />;
  }

  return (
    <AppLayout
      title="Openweb3 > Edit configuration"
      description={
        <>
          <Text as="p" variant="body" size="medium">
            Edit Openweb3 configuration.
          </Text>
          <Text as="p" variant="body" size="medium">
            Note: Openweb3 Webhooks will be created automatically.
          </Text>
        </>
      }
    >
      <Openweb3ConfigurationForm configurationId={router.query.configurationId} />
    </AppLayout>
  );
};

export default withAuthorization()(EditConfigurationPage);
