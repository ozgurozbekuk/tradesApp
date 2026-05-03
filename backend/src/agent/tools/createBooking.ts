import { BookingsService } from "../../services/bookings.service";
import { resolveCustomerByName } from "../resolves/customerResolver";
import type { AppTool } from "./types";

type CreateBookingArgs = {
  customerQuery: string;
  startsAt: string;
  title?: string | null;
  notes?: string | null;
};

const bookingsService = new BookingsService();

export const createBookingTool: AppTool<CreateBookingArgs> = {
  name: "create_booking",
  description: "Create a booking for an existing customer using the customer's name or phone number.",
  inputSchema: {
    type: "object",
    properties: {
      customerQuery: {
        type: "string",
        description: "Existing customer name or phone number"
      },
      startsAt: {
        type: "string",
        description: "Booking start datetime in ISO format"
      },
      title: {
        type: ["string", "null"],
        description: "Optional booking title"
      },
      notes: {
        type: ["string", "null"],
        description: "Optional booking notes"
      }
    },
    required: ["customerQuery", "startsAt", "title", "notes"],
    additionalProperties: false
  },

  async execute(args, ctx) {
    const customerQuery = args.customerQuery?.trim();
    const startsAtRaw = args.startsAt?.trim();
    const title = args.title?.trim();
    const notes = args.notes?.trim();

    if (!customerQuery || !startsAtRaw) {
      return {
        success: false,
        message: "Customer and booking time are required."
      };
    }

    const startsAt = new Date(startsAtRaw);
    if (Number.isNaN(startsAt.getTime())) {
      return {
        success: false,
        message: "Booking time must be a valid date."
      };
    }

    const match = await resolveCustomerByName({
      userId: ctx.userId,
      query: customerQuery
    });

    if (match.type === "not_found") {
      return {
        success: false,
        message: `No customer found for "${customerQuery}".`
      };
    }

    if (match.type === "multiple") {
      return {
        success: false,
        message: `Multiple customers matched "${customerQuery}".`,
        data: {
          matchType: "multiple",
          customers: match.customers
        }
      };
    }

    try {
      const { booking, customer } = await bookingsService.createBookingForCustomerId({
        userId: ctx.userId,
        customerId: match.customer.id,
        startsAt,
        title,
        notes
      });

      return {
        success: true,
        data: {
          customer: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone
          },
          booking: {
            id: booking.id,
            title: booking.title ?? null,
            startsAt: booking.startsAt.toISOString(),
            notes: booking.notes ?? null,
            status: booking.status
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Could not create the booking."
      };
    }
  }
};
