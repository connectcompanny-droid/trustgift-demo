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

  if (payload.action === "list") {
    if (userData.user.app_metadata?.trustgift_admin !== true) {
      return jsonResponse({ error: "Only a TrustGift administrator can manage support access." }, 403, origin);
    }

    const { data: invitations, error: invitationsError } = await serviceClient
      .from("support_agent_invitations")
      .select("id, email, status, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (invitationsError) {
      console.error("Could not list support invitations.", invitationsError.message);
      return jsonResponse({ error: "Could not load support invitations." }, 500, origin);
    }

    const { data: agents, error: agentsError } = await serviceClient
      .from("support_agents")
      .select("user_id, created_at")
      .order("created_at", { ascending: false });
    if (agentsError) {
      console.error("Could not list support agents.", agentsError.message);
      return jsonResponse({ error: "Could not load support agents. Apply the access-management migration." }, 500, origin);
    }

    const emailsById = new Map<string, string>();
    for (let page = 1; ; page += 1) {
      const { data: users, error: usersError } = await serviceClient.auth.admin.listUsers({
        page,
        perPage: 1000
      });
      if (usersError) {
        console.error("Could not load support agent accounts.", usersError.message);
        return jsonResponse({ error: "Could not load support agent accounts." }, 500, origin);
      }
      users.users.forEach(agentUser => emailsById.set(agentUser.id, agentUser.email ?? ""));
      if (users.users.length < 1000) break;
    }

    return jsonResponse({
      invitations: invitations ?? [],
      agents: (agents ?? []).map(agent => ({
        userId: agent.user_id,
        email: emailsById.get(agent.user_id) ?? ""
      }))
    }, 200, origin);
  }

  if (payload.action === "revoke") {
    if (userData.user.app_metadata?.trustgift_admin !== true) {
      return jsonResponse({ error: "Only a TrustGift administrator can manage support access." }, 403, origin);
    }
    const invitationId = typeof payload.invitationId === "string" ? payload.invitationId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitationId)) {
      return jsonResponse({ error: "Choose a valid pending invitation." }, 400, origin);
    }
    const { data: revoked, error: revokeError } = await serviceClient
      .from("support_agent_invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (revokeError) {
      console.error("Could not revoke a support invitation.", revokeError.message);
      return jsonResponse({ error: "Could not revoke the support invitation." }, 500, origin);
    }
    if (!revoked) {
      return jsonResponse({ error: "This invitation is no longer pending." }, 409, origin);
    }
    return jsonResponse({ ok: true }, 200, origin);
  }

  if (payload.action === "remove_agent") {
    if (userData.user.app_metadata?.trustgift_admin !== true) {
      return jsonResponse({ error: "Only a TrustGift administrator can manage support access." }, 403, origin);
    }
    const userId = typeof payload.userId === "string" ? payload.userId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return jsonResponse({ error: "Choose a valid support agent." }, 400, origin);
    }
    if (userId === userData.user.id) {
      return jsonResponse({ error: "You cannot remove your own support access from this panel." }, 400, origin);
    }
    const { data: targetData, error: targetError } = await serviceClient.auth.admin.getUserById(userId);
    if (targetError || !targetData.user) {
      console.error("Could not find the support agent account.", targetError?.message);
      return jsonResponse({ error: "Could not find that support agent." }, 404, origin);
    }
    if (targetData.user.app_metadata?.trustgift_admin === true) {
      return jsonResponse({ error: "Administrator access cannot be changed from this panel." }, 403, origin);
    }

    const { error: accessError } = await serviceClient
      .from("support_agents")
      .delete()
      .eq("user_id", userId);
    if (accessError) {
      console.error("Could not remove support access.", accessError.message);
      return jsonResponse({ error: "Could not remove support access. Apply the access-management migration." }, 500, origin);
    }
    const appMetadata = { ...targetData.user.app_metadata };
    delete appMetadata.support_agent;
    const { error: metadataError } = await serviceClient.auth.admin.updateUserById(userId, {
      app_metadata: appMetadata
    });
    if (metadataError) {
      console.error("Could not update support agent metadata.", metadataError.message);
      return jsonResponse({ error: "Support access was removed, but the account metadata could not be updated." }, 500, origin);
    }
    return jsonResponse({ ok: true }, 200, origin);
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

    if (invitation.status !== "pending") {
      return jsonResponse({ error: "This support invitation has already been used or revoked." }, 410, origin);
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
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

    const { data: claimedInvitation, error: claimError } = await serviceClient
      .from("support_agent_invitations")
      .update({
        status: "accepted",
        accepted_by: user.id,
        accepted_at: new Date().toISOString()
      })
      .eq("id", invitation.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error("Could not redeem the support invitation.", claimError.message);
      return jsonResponse({ error: "Could not redeem the support invitation. Try again." }, 500, origin);
    }
    if (!claimedInvitation) {
      return jsonResponse({ error: "This support invitation has already been used, revoked, or expired." }, 410, origin);
    }

    const { data: latestUserData, error: latestUserError } =
      await serviceClient.auth.admin.getUserById(user.id);
    if (latestUserError || !latestUserData.user) {
      console.error("Could not reload the invited account before granting access.", latestUserError?.message);
      return jsonResponse({ error: "Could not activate Support access. Ask an administrator to create a new invitation." }, 500, origin);
    }

    const appMetadata = { ...latestUserData.user.app_metadata, support_agent: true };
    const { error: roleError } = await serviceClient.auth.admin.updateUserById(user.id, {
      app_metadata: appMetadata
    });
    if (roleError) {
      console.error("Could not grant the support-agent role.", roleError.message);
      return jsonResponse({ error: "The invitation was accepted, but Support access could not be activated. Ask an administrator to create a new invitation." }, 500, origin);
    }

    const { error: accessError } = await serviceClient
      .from("support_agents")
      .upsert({ user_id: user.id }, { onConflict: "user_id" });
    if (accessError) {
      console.error("Could not add the support-agent access record.", accessError.message);
      return jsonResponse({ error: "The invitation was accepted, but Support access could not be activated. Ask an administrator to create a new invitation." }, 500, origin);
    }

    return jsonResponse({ ok: true, supportAgent: true }, 200, origin);
  }

  return jsonResponse({ error: "Choose a valid support invitation action." }, 400, origin);
});
