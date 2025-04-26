import { TOKEN_CREATE_MUTATION } from "./graphql";
import { createClient } from "@/lib/create-graphq-client";

// Create admin Saleor client
export const createAdminSaleorClient = async () => {
  const saleorClient = createClient(process.env.SALEOR_API_URL!, async () =>
    Promise.resolve({ token: "" }),
  );

  return createClient(process.env.SALEOR_API_URL!, async () => {
    // Get new token using admin credentials
    const { data } = await saleorClient
      .mutation(TOKEN_CREATE_MUTATION, {
        email: process.env.SALEOR_ADMIN_EMAIL,
        password: process.env.SALEOR_ADMIN_PASSWORD,
      })
      .toPromise();
    return Promise.resolve({ token: data?.tokenCreate.token });
  });
};
