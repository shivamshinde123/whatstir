import { connection, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCompanyProfile } from "@/lib/workspace";

export async function GET(_req: Request, ctx: RouteContext<"/api/companies/[id]">) {
  await connection();
  const raw = (await ctx.params).id;
  const id = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) {
    return NextResponse.json({ error: "Company id must be a positive integer." }, { status: 400 });
  }
  try {
    const profile = await getCompanyProfile(db(), id);
    if (!profile) return NextResponse.json({ error: "No such company." }, { status: 404 });
    return NextResponse.json(profile);
  } catch (e) {
    console.error(`GET /api/companies/${id}`, e);
    return NextResponse.json({ error: "Couldn't load this company." }, { status: 500 });
  }
}
