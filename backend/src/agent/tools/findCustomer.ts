import type { AppTool } from "./types";
import { resolveCustomerByName } from "../resolves/customerResolver";

type FindCustomerArgs = {
  query: string;
};

export const findCustomerTool: AppTool<FindCustomerArgs> = {
  name: "find_customer",
  description: "Find a customer by name or phone number",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Customer name or phone number"
      }
    },
    required: ["query"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const query = args.query?.trim();

    if (!query) {
      return {
        success: false,
        message: "Customer query is required."
      };
    }

    const result = await resolveCustomerByName({
      userId: ctx.userId,
      query
    });

    if (result.type === "not_found") {
      return {
        success: false,
        message: `No customer found for "${query}".`
      };
    }

    if (result.type === "single") {
      return {
        success: true,
        data: {
          matchType: "single",
          customer: result.customer
        }
      };
    }

    return {
      success: true,
      data: {
        matchType: "multiple",
        customers: result.customers
      }
    };
  }
};
