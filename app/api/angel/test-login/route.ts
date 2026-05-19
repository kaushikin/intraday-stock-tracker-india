import { NextResponse } from "next/server";
import { getAngelSession } from "@/lib/angel";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAngelSession();

    return NextResponse.json({
      success: true,
      message: "Angel login successful",
      hasJwtToken: Boolean(session.jwtToken),
      hasFeedToken: Boolean(session.feedToken),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Angel login failed",
      },
      {
        status: 500,
      }
    );
  }
}