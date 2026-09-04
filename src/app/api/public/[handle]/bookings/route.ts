import {
  getDB,
  saveDB,
  newId,
  nextRef,
  jsonOk,
  jsonError,
  readBody,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

interface BookingBody {
  sessionType?: string;
  serviceId?: string;
  date?: string;
  time?: string;
  clientName?: string;
  clientContact?: string;
  note?: string;
}

export async function POST(request: Request, { params }: Params) {
  const { handle } = await params;
  const body = await readBody<BookingBody>(request);
  const db = getDB();

  const creator = db.users.find((u) => u.handle === handle);
  if (!creator) return jsonError("Creator not found.", 404);

  if (!body?.sessionType || !body?.date || !body?.time || !body?.clientName || !body?.clientContact) {
    return jsonError("Session type, date, time, your name and contact are required.");
  }

  const booking = {
    id: newId("bk"),
    ref: nextRef("BKG", db.bookings),
    creatorId: creator.id,
    serviceId: body.serviceId,
    sessionType: body.sessionType,
    clientName: body.clientName.trim(),
    clientContact: body.clientContact.trim(),
    date: body.date,
    time: body.time,
    note: body.note?.trim() ?? "",
    status: "requested" as const,
    createdAt: new Date().toISOString(),
  };

  db.bookings.push(booking);
  saveDB();

  return jsonOk({ booking }, 201);
}
