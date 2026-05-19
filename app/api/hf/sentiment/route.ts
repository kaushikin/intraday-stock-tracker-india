import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HF_MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/ProsusAI/finbert";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json(
        {
          success: false,
          error: "Text is required",
        },
        {
          status: 400,
        }
      );
    }

    const token = process.env.HUGGINGFACE_API_KEY;

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing HUGGINGFACE_API_KEY",
        },
        {
          status: 500,
        }
      );
    }

    const response = await fetch(HF_MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
      }),
      cache: "no-store",
    });

    const raw = await response.text();

    let data: any;

    try {
      data = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Hugging Face returned non-JSON response",
          status: response.status,
          raw: raw.slice(0, 500),
        },
        {
          status: 500,
        }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data?.error || "Hugging Face request failed",
          details: data,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      result: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to analyze sentiment",
      },
      {
        status: 500,
      }
    );
  }
}