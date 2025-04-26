import { Text } from "@saleor/macaw-ui/next";
import { withAuthorization } from "@saleor/app-sdk/app-bridge";
import { AppLayout } from "@/modules/ui/templates/AppLayout";
import { Openweb3ConfigurationForm } from "@/modules/ui/organisms/AddOpenweb3ConfigurationForm/AddOpenweb3ConfigurationForm";

const AddConfigurationPage = () => {
  return (
    <AppLayout
      title="Openweb3 > Add configuration"
      description={
        <>
          <Text as="p" variant="body" size="medium">
            Create new Openweb3 configuration.
          </Text>
          <Text as="p" variant="body" size="medium">
            Openweb3 Webhooks will be created automatically.
          </Text>
        </>
      }
    >
      <Openweb3ConfigurationForm configurationId={undefined} />
    </AppLayout>
  );
};

export default withAuthorization()(AddConfigurationPage);
