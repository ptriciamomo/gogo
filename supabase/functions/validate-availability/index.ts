// Deno Edge Function.
// VS Code TypeScript errors about URL imports and Deno globals are expected.
// DO NOT refactor to Node style.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { canRunnerBeAvailable } from "../_shared/geofence.logic.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// 🧪 TEMPORARY TESTING FLAG
const DISABLE_GEOFENCING_FOR_TESTING = true;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("📥 validate-availability invoked");

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Use POST." }),
        { status: 405, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { runner_id, latitude, longitude } = body;

    console.log("📦 Request body:", body);

    if (!runner_id) {
      return new Response(
        JSON.stringify({ error: "runner_id is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined
    ) {
      return new Response(
        JSON.stringify({
          error: "Invalid GPS coordinates",
          details:
            "latitude and longitude are required and cannot be null or undefined",
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    const lat =
      typeof latitude === "number" ? latitude : parseFloat(String(latitude));
    const lon =
      typeof longitude === "number" ? longitude : parseFloat(String(longitude));

    if (isNaN(lat) || isNaN(lon)) {
      return new Response(
        JSON.stringify({
          error: "Invalid GPS coordinates",
          details: "latitude and longitude must be valid numbers",
        }),
        { status: 400, headers: corsHeaders }
      );
    }
    // Checks the academic calendar
    console.log("📍 Coordinates received:", { lat, lon });

    const utcNow = new Date();
    const phNow = new Date(utcNow.getTime() + 8 * 60 * 60 * 1000);
    const today = phNow.toISOString().split("T")[0];

    const { data: calendar, error: calendarError } = await supabase
      .from("academic_calendar")
      .select("semester, term")
      .lte("start_date", today)
      .gte("end_date", today)
      .limit(1)
      .single();

    if (calendarError) {
      console.log("⚠️ Academic calendar fetch error:", calendarError);
    }

    const currentSemester = calendar?.semester;
    const currentTerm = calendar?.term;

    console.log("📅 Current semester:", currentSemester);
    console.log("📅 Current term:", currentTerm);

    if (!currentSemester) {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "No active academic semester.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("📚 Checking runner schedule...");
    // Checks the runner's schedule
    const { data: userData } = await supabase
      .from("users")
      .select("student_id_number")
      .eq("id", runner_id)
      .single();

    if (userData?.student_id_number) {
      const studentId = userData.student_id_number;

      const { data: studentData } = await supabase
        .from("students")
        .select("semester")
        .eq("student_id", studentId)
        .single();

      const studentSemester = studentData?.semester || "";

      const normalizeSemester = (sem: string) => {
        const s = sem.toLowerCase();
        if (s.includes("first") || s.includes("1")) return 1;
        if (s.includes("second") || s.includes("2")) return 2;
        if (s.includes("third") || s.includes("3")) return 3;
        return null;
      };

      const studentSemNumber = normalizeSemester(studentSemester);
      const currentSemNumber = normalizeSemester(currentSemester || "");

      console.log("📚 Student semester:", studentSemester);
      console.log("📚 Student semester number:", studentSemNumber);
      console.log("📚 Current semester:", currentSemester);
      console.log("📚 Current semester number:", currentSemNumber);

      if (!studentSemNumber || studentSemNumber !== currentSemNumber) {
        console.log("⛔ Student semester mismatch:", studentSemester);

        return new Response(
          JSON.stringify({
            allowed: false,
            reason:
              "You cannot go Active because your schedule is not within the current semester.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: schedules } = await supabase
        .from("student_subjects")
        .select("day, term, time")
        .eq("student_id", studentId);

      if (schedules && schedules.length > 0) {

        const now = phNow;
        const currentDayFull = now.toLocaleString("en-US", { weekday: "short" });
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        console.log("🕒 Current PH day:", currentDayFull);
        console.log("🕒 Current PH minutes:", currentMinutes);

        const convertToMinutes = (timeStr: string) => {
          const letter = timeStr.slice(-1);
          const number = timeStr.slice(0, -1);

          const hour = parseInt(number.slice(0, number.length - 2));
          const minute = parseInt(number.slice(-2));

          let h = hour;

          if (letter === "E") h += 12;
          if (letter === "A" && hour !== 12) h += 12;

          return h * 60 + minute;
        };

        const dayMap: Record<string,string> = {
          Mon:"M",
          Tue:"Tu",
          Wed:"W",
          Thu:"Th",
          Fri:"F",
          Sat:"Sa",
          Sun:"Su"
        };

        const todayCode = dayMap[currentDayFull];

        for (const subject of schedules) {
          const { day, time, term } = subject;

          if (!(term === currentTerm || term === "Sem")) {
            console.log("⏭ Skipping subject (term mismatch):", term);
            continue;
          }

          if (!time || time === "Consultation") continue;

          console.log("📖 Checking subject schedule:", day, time);

          if (day && day.includes(todayCode)) {

            const [startRaw, endRaw] = time.split("-");

            const startMinutes = convertToMinutes(startRaw);
            const endMinutes = convertToMinutes(endRaw);

            console.log(
              "🕒 Class time range:",
              startMinutes,
              "to",
              endMinutes
            );

            if (
              currentMinutes >= startMinutes &&
              currentMinutes <= endMinutes
            ) {
              console.log("⛔ Runner has a class right now");

              return new Response(
                JSON.stringify({
                  allowed: false,
                  reason:
                    "You cannot go Active because you have a scheduled class.",
                }),
                {
                  status: 200,
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                }
              );
            }
          }
        }
      }
    }
    // change to false para ma on
    if (DISABLE_GEOFENCING_FOR_TESTING) {
      console.log("⚠️ GEOFENCING BYPASSED FOR TESTING - Returning allowed: true");

      return new Response(
        JSON.stringify({ allowed: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const validation = canRunnerBeAvailable(lat, lon, true);

    console.log("✅ Validation result:", validation);

    if (validation.allowed) {
      return new Response(
        JSON.stringify({ allowed: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason:
            validation.reason ||
            "You must be inside UM Matina campus to go online.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "Unhandled exception",
        details: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});