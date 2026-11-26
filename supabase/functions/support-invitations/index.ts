import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = "https://connectcompanny-droid.github.io";

function corsHeaders(origin: string | null) {
  return {
    ...(origin === allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json"
    }
  });
}

function hashToken(token: string) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
    .then(digest => [...new Uint8Array(digest)]
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join(""));
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

Deno.serve(async request => {
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    if (origin && origin !== allowedOrigin) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST for this endpoint." }, 405, origin);
  }
  if (origin && origin !== allowedOrigin) {
    return jsonResponse({ error: "This site is not allowed to use this endpoint." }, 403, origin);
  }

  let payload: { action?: unknown; email?: unknown; token?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "The request body must be valid JSON." }, 400, origin);
  }

  const authorization = request.headers.get("authorization");
  const tokenMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return jsonResponse({ error: "Sign in before using support invitations." }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Support invitation function is missing Supabase server credentials.");
    return jsonResponse({ error: "The support invitation service is not configured." }, 500, origin);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: userData, error: userError } = await serviceClient.auth.getUser(tokenMatch[1]);
  if (userError || !userData.user) {
    return jsonResponse({ error: "Your session is invalid or expired. Sign in again." }, 401, origin);
  }

  if (payload.action === "create") {
    if (userData.user.app_metadata?.trustgift_admin !== true) {
      return jsonResponse({ error: "Only a TrustGift administrator can create support invitations." }, 403, origin);
    }

    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Enter a valid e-mail address." }, 400, origin);
    }

    const { error: revokeError } = await serviceClient
      .from("support_agent_invitations")
      .update({ status: "revoked" })
      .eq("email", email)
      .eq("status", "pending");
    if (revokeError) {
      console.error("Could not replace the previous support invitation.", revokeError.message);
      return jsonResponse({ error: "Could not create the support invitation. Check the invitation migration." }, 500, origin);
    }

    const rawToken = createToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: insertError } = await serviceClient
      .from("support_agent_invitations")
      .insert({
        email,
        token_hash: tokenHash,
        invited_by: userData.user.id,
        expires_at: expiresAt
      });
    if (insertError) {
      console.error("Could not store a support invitation.", insertError.message);
      return jsonResponse({ error: "Could not create the support invitation. Check the invitation migration." }, 500, origin);
    }

    return jsonResponse({ token: rawToken, expiresAt }, 201, origin);
  }

  if (payload.action === "redeem") {
    const rawToken = typeof payload.token === "string" ? payload.token.trim() : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(rawToken)) {
      return jsonResponse({ error: "This support invitation is invalid." }, 400, origin);
    }

    const user = userData.user;
    if (!user.email || !user.email_confirmed_at) {
      return jsonResponse({ error: "Confirm your e-mail address before accepting this invitation." }, 403, origin);
    }

    const tokenHash = await hashToken(rawToken);
    const { data: invitation, error: invitationError } = await serviceClient
      .from("support_agent_invitations")
      .select("id, email, status, expires_at, accepted_by")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (invitationError) {
      console.error("Could not look up a support invitation.", invitationError.message);
      return jsonResponse({ error: "Could not verify the support invitation." }, 500, origin);
    }
    if (!invitation || invitation.email !== user.email.trim().toLowerCase()) {
      return jsonResponse({ error: "This invitation does not match your signed-in e-mail address." }, 403, origin);
    }

    const alreadyAcceptedByUser =
      invitation.status === "accepted" && invitation.accepted_by === user.id;
    if (!alreadyAcceptedByUser && invitation.status !== "pending") {
      return jsonResponse({ error: "This support invitation has already been used or revoked." }, 410, origin);
    }
    if (!alreadyAcceptedByUser && new Date(invitation.expires_at).getTime() <= Date.now()) {
      const { error: revokeError } = await serviceClient
        .from("support_agent_invitations")
        .update({ status: "revoked" })
        .eq("id", invitation.id)
        .eq("status", "pending");
      if (revokeError) {
        console.error("Could not revoke an expired support invitation.", revokeError.message);
        return jsonResponse({ error: "Could not update the expired support invitation. Try again." }, 500, origin);
      }
      return jsonResponse({ error: "This support invitation has expired. Ask an administrator for a new link." }, 410, origin);
    }

    if (!alreadyAcceptedByUser) {
      const { data: claimedInvitation, error: claimError } = await serviceClient
        .from("support_agent_invitations")
        .update({
          status: "accepted",
          accepted_by: user.id,
          accepted_at: new Date().toISOString()
        })
        .eq("id", invitation.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (claimError) {
        console.error("Could not redeem the support invitation.", claimError.message);
        return jsonResponse({ error: "Could not redeem the support invitation. Try again." }, 500, origin);
      }
      if (!claimedInvitation) {
        return jsonResponse({ error: "This support invitation has already been used or revoked." }, 410, origin);
      }
    }

    const appMetadata = { ...user.app_metadata, support_agent: true };
    const { error: roleError } = await serviceClient.auth.admin.updateUserById(user.id, {
      app_metadata: appMetadata
    });
    if (roleError) {
      console.error("Could not grant the support-agent role.", roleError.message);
      return jsonResponse({ error: "The invitation was accepted, but Support access could not be activated. Ask an administrator to retry." }, 500, origin);
    }

    return jsonResponse({ ok: true, supportAgent: true }, 200, origin);
  }

  return jsonResponse({ error: "Choose the create or redeem invitation action." }, 400, origin);
});
