import { getOpenweb3ApiClient } from "./openweb3-api";
import { type Money } from "generated/graphql";
import { invariant } from "@/lib/invariant";

const getDecimalsForOpenweb3 = async (
  currency: string,
  openweb3Config: {
    secretKey: string;
    publishableKey: string;
  },
): Promise<number> => {
  const openweb3ApiClient = getOpenweb3ApiClient(
    openweb3Config.secretKey,
    openweb3Config.publishableKey,
  );

  const res = await openweb3ApiClient.currencies.findByCode(currency);

  return res.decimals;
};

// Some payment methods expect the amount to be in cents (integers)
// Saleor provides and expects the amount to be in dollars (decimal format / floats)
export const getOpenweb3AmountFromSaleorMoney = async (
  { amount: major, currency }: Money,
  openweb3Config: {
    secretKey: string;
    publishableKey: string;
  },
) => {
  const decimals = await getDecimalsForOpenweb3(currency, openweb3Config);
  const multiplier = 10 ** decimals;
  return Number.parseInt((major * multiplier).toFixed(0), 10);
};

// Some payment methods expect the amount to be in cents (integers)
// Saleor provides and expects the amount to be in dollars (decimal format / floats)
export const getSaleorAmountFromOpenweb3Amount = async (
  { amount: minor, currency }: Money,
  openweb3Config: {
    secretKey: string;
    publishableKey: string;
  },
) => {
  const decimals = await getDecimalsForOpenweb3(currency, openweb3Config);
  const multiplier = 10 ** decimals;
  return minor * multiplier;
};

// https://docs.openweb3.io/reference/v1currencieslist
const openweb3Currencies: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  MGA: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,

  BHD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};
