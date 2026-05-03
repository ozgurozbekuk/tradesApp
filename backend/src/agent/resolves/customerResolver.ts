import { CustomersService } from "../../services/customers.service";

const customersService = new CustomersService();

export type CustomerMatchResult =
  | { type: "not_found" }
  | {
      type: "single";
      customer: {
        id: string;
        name: string;
        phone: string | null;
      };
    }
  | {
      type: "multiple";
      customers: Array<{
        id: string;
        name: string;
        phone: string | null;
      }>;
    };

export const resolveCustomerByName = async (input: {
  userId: string;
  query: string;
}): Promise<CustomerMatchResult> => {
  const matches = await customersService.findRecordsByName({
    userId: input.userId,
    query: input.query
  });

  if (matches.length === 0) {
    return { type: "not_found" };
  }

  if (matches.length === 1) {
    const customer = matches[0];
    return {
      type: "single",
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone
      }
    };
  }

  return {
    type: "multiple",
    customers: matches.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone
    }))
  };
};
