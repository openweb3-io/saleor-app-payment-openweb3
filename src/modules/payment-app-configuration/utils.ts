import { obfuscateConfig } from "../app-configuration/utils";
import {
  type PaymentAppConfigEntry,
  type PaymentAppEncryptedConfig,
  type PaymentAppUserVisibleConfigEntry,
  paymentAppUserVisibleConfigEntrySchema,
} from "./config-entry";

export const obfuscateConfigEntry = (
  entry: PaymentAppConfigEntry | PaymentAppUserVisibleConfigEntry,
): PaymentAppUserVisibleConfigEntry => {
  const { secretKey, publishableKey, configurationName, configurationId } = entry;

  const configValuesToObfuscate = {
    secretKey,
  } satisfies PaymentAppEncryptedConfig;

  return paymentAppUserVisibleConfigEntrySchema.parse({
    publishableKey,
    configurationId,
    configurationName,
    ...obfuscateConfig(configValuesToObfuscate),
  } satisfies PaymentAppUserVisibleConfigEntry);
};

export function safeParse(objects: any) {
  let jsonString = JSON.stringify(objects);
  if (typeof jsonString === "string" && jsonString.includes("undefined")) {
    jsonString = jsonString.replace(/undefined/g, "null");
  }
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Error parsing JSON:", error);
    return null;
  }
}
