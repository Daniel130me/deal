import { getDB, saveDB, jsonOk, jsonError, readBody } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

interface ActionBody {
  action?: "confirm" | "decline" | "complete" | "cancel";
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await readBody<ActionBody>(request);
  const db = getDB();
  const booking = db.bookings.find((b) => b.id === id);
  if (!booking) return jsonError("Booking not found.", 404);

  switch (body?.action) {
    case "confirm": {
      if (booking.status !== "requested") {
        return jsonError("Only requested bookings can be confirmed.", 409);
      }
      booking.status = "confirmed";
      break;
    }
    case "decline": {
      if (booking.status !== "requested") {
        return jsonError("Only requested bookings can be declined.", 409);
      }
      booking.status = "declined";
      break;
    }
    case "complete": {
      if (booking.status !== "confirmed") {
        return jsonError("Only confirmed bookings can be completed.", 409);
      }
      booking.status = "completed";
      break;
    }
    case "cancel": {
      if (booking.status !== "confirmed" && booking.status !== "requested") {
        return jsonError("This booking can no longer be cancelled.", 409);
      }
      booking.status = "cancelled";
      break;
    }
    default:
      return jsonError("Unknown action.");
  }

  saveDB();
  return jsonOk({ booking });
}
