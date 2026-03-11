import { BookingStatus } from "@prisma/client";
import { prisma } from "../db/prisma";
import { CustomersService } from "./customers.service";

const customersService = new CustomersService();

export class BookingsService {
  async createBookingForCustomerId(input: {
    userId: string;
    customerId: string;
    startsAt: Date;
    title?: string;
    notes?: string;
  }) {
    const customer = await prisma.customer.findFirst({
      where: {
        id: input.customerId,
        userId: input.userId
      }
    });

    if (!customer) {
      throw new Error("Customer not found");
    }

    const booking = await prisma.booking.create({
      data: {
        userId: input.userId,
        customerId: customer.id,
        startsAt: input.startsAt,
        title: input.title,
        notes: input.notes,
        status: BookingStatus.scheduled
      }
    });

    return { booking, customer };
  }

  async createBooking(input: {
    userId: string;
    customerName: string;
    startsAt: Date;
    title?: string;
    notes?: string;
  }) {
    const customer = await customersService.upsertByPhoneOrName({
      userId: input.userId,
      name: input.customerName
    });

    const booking = await prisma.booking.create({
      data: {
        userId: input.userId,
        customerId: customer.id,
        startsAt: input.startsAt,
        title: input.title,
        notes: input.notes,
        status: BookingStatus.scheduled
      }
    });

    return { booking, customer };
  }
}
