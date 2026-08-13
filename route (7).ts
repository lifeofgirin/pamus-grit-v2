import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentSession();

    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          message: "로그인이 필요합니다.",
        },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    if (session.role === "admin") {
      const { data, error } = await supabase
        .from("classes")
        .select("id, class_code, class_name")
        .order("class_code", {
          ascending: true,
        });

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        classes: data || [],
      });
    }

    if (!session.teacherId) {
      return NextResponse.json({
        ok: true,
        classes: [],
      });
    }

    const { data: schedules, error } =
      await supabase
        .from("schedules")
        .select(`
          class_id,
          classes (
            id,
            class_code,
            class_name
          )
        `)
        .eq("teacher_id", session.teacherId)
        .eq("is_active", true);

    if (error) throw error;

    const map = new Map<string, any>();

    for (const row of schedules || []) {
      const classInfo: any = row.classes;

      if (classInfo?.id) {
        map.set(
          classInfo.id,
          classInfo
        );
      }
    }

    const classes = [
      ...map.values(),
    ].sort((a: any, b: any) =>
      String(a.class_code).localeCompare(
        String(b.class_code)
      )
    );

    return NextResponse.json({
      ok: true,
      classes,
    });
  } catch (error) {
    console.error(
      "class-options:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "반 목록을 불러오지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
