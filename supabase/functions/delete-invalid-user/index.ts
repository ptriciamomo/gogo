import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {

    let body: any;

    try {
      body = await req.json();
    } catch (err) {
      console.error("Failed to parse request body:", err);

      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const uid = body?.uid;

    if (!uid) {
      console.error("UID not provided in request body");

      return new Response(
        JSON.stringify({ error: "UID missing" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log("delete-invalid-user invoked. UID:", uid);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Delete user row from public.users
    console.log("Deleting record from public.users...");

    const { error: userDeleteError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", uid);

    if (userDeleteError) {
      console.error("Error deleting public.users record:", userDeleteError);
    }

    // Delete user from Supabase Auth
    console.log("Deleting user from auth.users...");

    const { error: authDeleteError } =
      await supabaseAdmin.auth.admin.deleteUser(uid);

    if (authDeleteError) {
      console.error("Error deleting auth user:", authDeleteError);
    }

    console.log("User deletion completed successfully:", uid);

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (err) {

    console.error("Edge function error:", err);

    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});